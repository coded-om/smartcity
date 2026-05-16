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

def _parse_device_id(data: dict) -> str:
    raw = (
        data.get('device')
        or data.get('device_id')
        or data.get('id')
        or data.get('client_id')
        or 'ESP32_Unknown'
    )
    return str(raw).strip() if raw else 'ESP32_Unknown'

def _run_ai(device_id: str, data: dict) -> tuple[float, str, str | None]:
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
        print(f"[WARN]  AI prediction error: {exc}")
        return 0.0, 'NORMAL', None

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
                    f"[ALERT] ALERT #{alert_id}: {device_id}  {alert_type}"
                    f" (severity={severity}, score={ai_score:.3f})"
                    + (f" [rec: {video_path}]" if video_path else "")
                )

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
            return  # success  exit retry loop

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

def on_message(client, userdata, msg) -> None:
    """MQTT message callback: parse  AI  persist  cache update."""
    try:
        data      = json.loads(msg.payload.decode())
        device_id = _parse_device_id(data)

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

        emoji = '[ALERT]' if alert_type not in ('NORMAL', 'TRAINING') else ''
        print(f"{emoji} Saved reading from {device_id} [{alert_type}]")

        # Push real-time update to all connected UI clients
        try:
            from socketio_instance import socketio as _sio
            _sio.emit('sensor_reading', latest_readings[device_id])
        except Exception:
            pass

    except Exception as exc:
        print(f"[ERROR] MQTT handler error: {exc}")

def mqtt_thread() -> None:
    try:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        client.on_message = on_message
        client.connect("localhost", 1883, 60)
        client.subscribe("esp32/sensors")
        print("[OK] MQTT connected and subscribed")
        client.loop_forever()
    except Exception as exc:
        print(f"[ERROR] MQTT error: {exc}")
