"""
mqtt_handler.py — MQTT client and sensor message processing pipeline.

Single responsibility: receive raw MQTT payloads, run AI prediction, persist
readings/alerts to the database, and fire notifications/recordings when needed.

No Flask objects are imported here — this module is framework-agnostic.
"""
import json
import threading
import time
from datetime import datetime

import paho.mqtt.client as mqtt

import ai_engine
import notifier
import recorder
from config import DB_WRITE_RETRY_ATTEMPTS, DB_WRITE_RETRY_DELAY_SECS
from db import get_db, to_db_datetime, is_db_locked
from state import latest_readings, can_record, can_alert


# ── Payload helpers ───────────────────────────────────────────────────────────

def _parse_device_id(data: dict) -> str:
    """Extract and normalise *device_id* from a sensor payload dict."""
    raw = (
        data.get('device')
        or data.get('device_id')
        or data.get('id')
        or data.get('client_id')
        or 'ESP32_Unknown'
    )
    return str(raw).strip() if raw else 'ESP32_Unknown'


# ── AI layer ──────────────────────────────────────────────────────────────────

def _run_ai(device_id: str, data: dict) -> tuple[float, str, str | None]:
    """Return *(ai_score, alert_type, severity)*.  Never raises."""
    try:
        pred       = ai_engine.predict(device_id, data)
        ai_score   = pred['score']
        alert_type = pred['type']
        severity   = (
            ai_engine.get_severity(alert_type, ai_score)
            if pred['anomaly'] and alert_type != 'NORMAL'
            else None
        )
        return ai_score, alert_type, severity
    except FileNotFoundError:
        return 0.0, 'TRAINING', None
    except Exception as exc:
        print(f"⚠️  AI prediction error: {exc}")
        return 0.0, 'NORMAL', None


# ── Persistence ───────────────────────────────────────────────────────────────

def _persist(
    device_id: str,
    data: dict,
    ai_score: float,
    alert_type: str,
    severity: str | None,
) -> None:
    """Write device heartbeat + reading + optional alert row, with retry logic."""
    now    = datetime.now()
    now_ts = time.time()

    for attempt in range(DB_WRITE_RETRY_ATTEMPTS):
        conn = None
        try:
            conn = get_db()

            # Upsert device heartbeat (preserves existing lat/lng/location/status)
            conn.execute(
                """INSERT OR REPLACE INTO devices
                       (device_id, last_seen, status, location, lat, lng)
                   VALUES (?, ?,
                       COALESCE((SELECT status   FROM devices WHERE device_id=?), 'training'),
                       COALESCE((SELECT location FROM devices WHERE device_id=?), 'Unknown'),
                       (SELECT lat FROM devices WHERE device_id=?),
                       (SELECT lng FROM devices WHERE device_id=?))""",
                (device_id, to_db_datetime(now),
                 device_id, device_id, device_id, device_id),
            )

            # Alert: only when severity is set and cooldown allows
            if severity is not None and can_alert(device_id, alert_type, now_ts):
                video_path  = None
                cam_rec     = recorder.get_recorder()
                if cam_rec.ffmpeg_available and can_record(device_id, now_ts):
                    video_path = cam_rec.record_alert(device_id, alert_type, duration=30)

                conn.execute(
                    "INSERT INTO alerts (device_id, alert_type, severity, ai_score, video_file)"
                    " VALUES (?, ?, ?, ?, ?)",
                    (device_id, alert_type, severity, ai_score, video_path),
                )
                alert_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                print(
                    f"🚨 ALERT #{alert_id}: {device_id} – {alert_type}"
                    f" (severity={severity}, score={ai_score:.3f})"
                    + (f" [rec: {video_path}]" if video_path else "")
                )

                # Telegram notification (non-blocking daemon thread)
                notif = notifier.get_notifier()
                if notif.enabled:
                    payload = {
                        'device_id':  device_id,
                        'alert_type': alert_type,
                        'severity':   severity,
                        'ai_score':   ai_score,
                        'timestamp':  now.strftime('%Y-%m-%d %H:%M:%S'),
                    }
                    threading.Thread(
                        target=notif.send_alert,
                        args=(payload, video_path),
                        daemon=True,
                    ).start()

            # Sensor reading row
            conn.execute(
                "INSERT INTO readings"
                " (device_id, temperature, humidity, gas, mic, motion, ai_score, alert_type)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    device_id,
                    data.get('temperature', 0), data.get('humidity', 0),
                    data.get('gas', 0),         data.get('mic', 0),
                    data.get('motion', 0),      ai_score, alert_type,
                ),
            )

            conn.commit()
            return  # success — exit retry loop

        except Exception as err:
            if conn:
                try:
                    conn.close()
                    conn = None
                except Exception:
                    pass
            if is_db_locked(err) and attempt < DB_WRITE_RETRY_ATTEMPTS - 1:
                time.sleep(DB_WRITE_RETRY_DELAY_SECS * (attempt + 1))
                continue
            raise   # non-lock error or final attempt: propagate

        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass


# ── MQTT callbacks ────────────────────────────────────────────────────────────

def on_message(client, userdata, msg) -> None:  # noqa: ARG001
    """MQTT message callback: parse → AI → persist → cache update."""
    try:
        data      = json.loads(msg.payload.decode())
        device_id = _parse_device_id(data)

        # Update in-memory cache immediately (read by /api/latest endpoints)
        latest_readings[device_id] = {
            **data,
            'device_id': device_id,
            'ai_score':  None,
            'timestamp': datetime.now().isoformat(),
        }
        if device_id == 'ESP32_Unknown':
            latest_readings['default'] = {
                k: data.get(k, 0)
                for k in ('temperature', 'humidity', 'gas', 'mic', 'motion')
            }

        ai_score, alert_type, severity = _run_ai(device_id, data)
        _persist(device_id, data, ai_score, alert_type, severity)

        latest_readings[device_id]['ai_score'] = ai_score

        emoji = '🚨' if alert_type not in ('NORMAL', 'TRAINING') else '📊'
        print(f"{emoji} Saved reading from {device_id} [{alert_type}]")

    except Exception as exc:
        print(f"❌ MQTT handler error: {exc}")


def mqtt_thread() -> None:
    """Connect to the broker, subscribe, and loop forever (run in daemon thread)."""
    try:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        client.on_message = on_message
        client.connect("localhost", 1883, 60)
        client.subscribe("esp32/sensors")
        print("✅ MQTT connected and subscribed")
        client.loop_forever()
    except Exception as exc:
        print(f"❌ MQTT error: {exc}")
