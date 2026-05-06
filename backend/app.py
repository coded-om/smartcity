from flask import Flask, jsonify, request, render_template, send_from_directory, send_file, Response
from flask_cors import CORS
import paho.mqtt.client as mqtt
import json, threading, sqlite3
import os
import time
from datetime import datetime
from pathlib import Path
import ai_engine
import notifier
import recorder

# Try to import face_recognition_engine - optional feature
try:
    import face_recognition_engine as fre
    FACE_RECOGNITION_ENABLED = True
except Exception as e:
    print(f"⚠️  Face recognition disabled: {e}")
    fre = None
    FACE_RECOGNITION_ENABLED = False

app = Flask(__name__, template_folder='../templates')
CORS(app)

# In-memory cache for latest readings (for backward compatibility)
latest_readings = {}

# A device is considered online if it sent data within this many seconds
DEVICE_TIMEOUT_SECS = 15

# Database setup
DB_PATH = Path(__file__).parent / 'sensors.db'
RECORDINGS_DIR = Path(__file__).parent / 'recordings'


def _to_db_datetime(dt: datetime) -> str:
    """Return sqlite-friendly datetime string (avoids deprecated adapter path)."""
    return dt.strftime('%Y-%m-%d %H:%M:%S')


def _serialize_alert_row(row: sqlite3.Row) -> dict:
    """Convert alert DB row to API payload with optional public video URL."""
    alert = dict(row)
    video_file = alert.get('video_file')

    if video_file:
        video_name = Path(video_file).name
        alert['video_url'] = f"/api/recordings/{video_name}"
    else:
        alert['video_url'] = None

    return alert


def get_db():
    """Get database connection with Row factory and WAL mode"""
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=10000")
    return conn

def init_db():
    """Initialize database schema"""
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS readings (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id   TEXT    NOT NULL,
            timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP,
            temperature REAL,
            humidity    REAL,
            gas         INTEGER,
            mic         INTEGER,
            motion      INTEGER,
            ai_score    REAL    DEFAULT 0.0,
            alert_type  TEXT    DEFAULT 'NORMAL'
        );
        
        CREATE TABLE IF NOT EXISTS alerts (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id   TEXT    NOT NULL,
            timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP,
            alert_type  TEXT,
            severity    TEXT,
            ai_score    REAL,
            video_file  TEXT,
            resolved    INTEGER DEFAULT 0,
            notes       TEXT
        );
        
        CREATE TABLE IF NOT EXISTS devices (
            device_id   TEXT PRIMARY KEY,
            location    TEXT,
            lat         REAL DEFAULT NULL,
            lng         REAL DEFAULT NULL,
            model_path  TEXT,
            trained_at  DATETIME,
            last_seen   DATETIME,
            status      TEXT DEFAULT 'training'
        );
        
        CREATE TABLE IF NOT EXISTS cameras (
            id                        INTEGER PRIMARY KEY AUTOINCREMENT,
            name                      TEXT NOT NULL,
            rtsp_url                  TEXT NOT NULL,
            type                      TEXT DEFAULT 'RTSP',
            device_id                 TEXT,
            location                  TEXT,
            lat                       REAL,
            lng                       REAL,
            enabled                   INTEGER DEFAULT 1,
            face_recognition_enabled  INTEGER DEFAULT 0,
            recording_enabled         INTEGER DEFAULT 1,
            created_at                DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at                DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS persons (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            name                 TEXT NOT NULL,
            employee_id          TEXT UNIQUE,
            role                 TEXT,
            department           TEXT,
            photo_path           TEXT,
            face_encoding_path   TEXT,
            authorized           INTEGER DEFAULT 1,
            notes                TEXT,
            created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS face_detections (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            camera_id      INTEGER NOT NULL,
            person_id      INTEGER,
            confidence     REAL,
            snapshot_path  TEXT,
            timestamp      DATETIME DEFAULT CURRENT_TIMESTAMP,
            alert_created  INTEGER DEFAULT 0,
            FOREIGN KEY (camera_id) REFERENCES cameras(id),
            FOREIGN KEY (person_id) REFERENCES persons(id)
        );
        
        -- Indexes for performance
        CREATE INDEX IF NOT EXISTS idx_readings_device_time 
            ON readings(device_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_alerts_device_time 
            ON alerts(device_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_alerts_resolved 
            ON alerts(resolved);
        CREATE INDEX IF NOT EXISTS idx_face_detections_timestamp
            ON face_detections(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_face_detections_camera
            ON face_detections(camera_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_face_detections_person
            ON face_detections(person_id, timestamp DESC);
    """)
    conn.commit()
    # Add lat/lng columns if upgrading from older schema
    try:
        conn.execute("ALTER TABLE devices ADD COLUMN lat REAL DEFAULT NULL")
        conn.execute("ALTER TABLE devices ADD COLUMN lng REAL DEFAULT NULL")
        conn.commit()
    except Exception:
        pass  # Columns already exist
    conn.close()
    
    # Create directories for face recognition data
    data_dir = Path(__file__).parent / 'data'
    (data_dir / 'persons' / 'photos').mkdir(parents=True, exist_ok=True)
    (data_dir / 'persons' / 'encodings').mkdir(parents=True, exist_ok=True)
    (data_dir / 'detections').mkdir(parents=True, exist_ok=True)
    
    print("✅ Database initialized successfully")


# Default device locations (Riyadh) – used when no GPS fix available
_DEFAULT_LOCATIONS = {
    'esp32_1': (24.7136, 46.6753),
    'esp32_2': (24.7140, 46.6760),
}


def _seed_device_locations():
    """Seed default lat/lng for known devices that have no location yet."""
    conn = get_db()
    for dev_id, (lat, lng) in _DEFAULT_LOCATIONS.items():
        conn.execute(
            "UPDATE devices SET lat=?, lng=? WHERE device_id=? AND lat IS NULL",
            (lat, lng, dev_id),
        )
    conn.commit()
    conn.close()


def _auto_train_all():
    """Run auto-training for every device that has enough data but no model."""
    conn = get_db()
    device_ids = [r[0] for r in conn.execute("SELECT device_id FROM devices").fetchall()]
    conn.close()
    for dev_id in device_ids:
        trained = ai_engine.auto_train_if_ready(dev_id)
        if trained:
            print(f"🤖 Auto-trained model for {dev_id}")

# MQTT Message Handler
def on_message(client, userdata, msg):
    """Handle incoming MQTT messages"""
    try:
        data = json.loads(msg.payload.decode())

        # Accept common device-id field names from different firmware/client versions
        device_id = (
            data.get('device')
            or data.get('device_id')
            or data.get('id')
            or data.get('client_id')
            or 'ESP32_Unknown'
        )
        device_id = str(device_id).strip() if device_id is not None else 'ESP32_Unknown'
        if not device_id:
            device_id = 'ESP32_Unknown'
        
        # Update in-memory cache
        latest_readings[device_id] = {
            **data,
            'device_id': device_id,
            'ai_score':  None,          # updated below after AI prediction
            'timestamp': datetime.now().isoformat()
        }
        
        # Also keep old format for backward compatibility
        if device_id == 'ESP32_Unknown':
            latest_readings['default'] = {
                'temperature': data.get('temperature', 0),
                'humidity': data.get('humidity', 0),
                'gas': data.get('gas', 0),
                'mic': data.get('mic', 0),
                'motion': data.get('motion', 0),
            }
        
        # Save to database
        conn = get_db()
        
        # Update device last_seen (preserve lat/lng if already set)
        conn.execute(
            """INSERT OR REPLACE INTO devices 
               (device_id, last_seen, status, location, lat, lng) 
               VALUES (?, ?, COALESCE((SELECT status FROM devices WHERE device_id=?), 'training'), 
                       COALESCE((SELECT location FROM devices WHERE device_id=?), 'Unknown'),
                       (SELECT lat FROM devices WHERE device_id=?),
                       (SELECT lng FROM devices WHERE device_id=?))""",
            (device_id, _to_db_datetime(datetime.now()), device_id, device_id, device_id, device_id)
        )
        
        # Try AI prediction (skip if model not trained yet)
        ai_score = 0.0
        alert_type = 'NORMAL'
        
        try:
            prediction = ai_engine.predict(device_id, data)
            ai_score = prediction['score']
            alert_type = prediction['type']
            
            # If anomaly detected, create alert entry
            if prediction['anomaly'] and alert_type != 'NORMAL':
                severity = ai_engine.get_severity(alert_type, ai_score)
                
                # Start video recording (if camera configured)
                video_path = None
                cam_recorder = recorder.get_recorder()
                if cam_recorder.ffmpeg_available:
                    video_path = cam_recorder.record_alert(device_id, alert_type, duration=30)
                
                # Insert alert with video path
                conn.execute(
                    """INSERT INTO alerts 
                       (device_id, alert_type, severity, ai_score, video_file)
                       VALUES (?, ?, ?, ?, ?)""",
                    (device_id, alert_type, severity, ai_score, video_path)
                )
                
                alert_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                
                print(f"🚨 ALERT #{alert_id}: {device_id} - {alert_type} (severity: {severity}, score: {ai_score})" + 
                      (f" [Recording: {video_path}]" if video_path else ""))
                
                # Send Telegram notification
                notif = notifier.get_notifier()
                if notif.enabled:
                    alert_data = {
                        'device_id': device_id,
                        'alert_type': alert_type,
                        'severity': severity,
                        'ai_score': ai_score,
                        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    }
                    threading.Thread(
                        target=notif.send_alert,
                        args=(alert_data, video_path),
                        daemon=True
                    ).start()
        
        except FileNotFoundError:
            # Model not trained yet - use defaults
            alert_type = 'TRAINING'
        except Exception as e:
            print(f"⚠️  AI prediction error: {e}")
        
        # Insert reading with AI results
        conn.execute(
            """INSERT INTO readings 
               (device_id, temperature, humidity, gas, mic, motion, ai_score, alert_type)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (device_id, 
             data.get('temperature', 0),
             data.get('humidity', 0),
             data.get('gas', 0),
             data.get('mic', 0),
             data.get('motion', 0),
             ai_score,
             alert_type)
        )
        
        conn.commit()
        conn.close()

        # Update cache with final ai_score after AI ran
        latest_readings[device_id]['ai_score'] = ai_score
        
        status_emoji = '🚨' if alert_type not in ('NORMAL', 'TRAINING') else '📊'
        print(f"{status_emoji} Saved reading from {device_id} [{alert_type}]")
        
    except Exception as e:
        print(f"❌ MQTT handler error: {e}")

def mqtt_thread():
    """MQTT client thread"""
    try:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        client.on_message = on_message
        client.connect("localhost", 1883, 60)
        client.subscribe("esp32/sensors")
        print("✅ MQTT client connected and subscribed")
        client.loop_forever()
    except Exception as e:
        print(f"❌ MQTT connection error: {e}")

# ─── Routes ───────────────────────────────────────────────────────

# Backward compatibility route
@app.route("/")
def index():
    """Legacy route - render old dashboard"""
    return render_template("index.html")

@app.route("/data")
def data():
    """Legacy API - return data in old format"""
    # Return default device or first available device
    if 'default' in latest_readings:
        return jsonify(latest_readings['default'])
    elif latest_readings:
        # Return first device data
        first_device = next(iter(latest_readings.values()))
        return jsonify({
            'temperature': first_device.get('temperature', 0),
            'humidity': first_device.get('humidity', 0),
            'gas': first_device.get('gas', 0),
            'mic': first_device.get('mic', 0),
            'motion': first_device.get('motion', 0),
        })
    else:
        return jsonify({
            'temperature': 0, 'humidity': 0,
            'gas': 0, 'mic': 0, 'motion': 0
        })

# ─── New API Routes ───────────────────────────────────────────────

@app.route('/api/latest')
def get_latest():
    """Get latest reading from all devices"""
    return jsonify({
        'success': True,
        'data': latest_readings
    })

@app.route('/api/latest/<device_id>')
def get_latest_device(device_id):
    """Get latest reading from specific device"""
    reading = latest_readings.get(device_id)
    if reading:
        return jsonify({'success': True, 'data': reading})
    # Fall back to database when in-memory cache is empty (e.g. after restart)
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM readings WHERE device_id = ? ORDER BY timestamp DESC LIMIT 1",
        (device_id,)
    ).fetchone()
    conn.close()
    if row:
        return jsonify({'success': True, 'data': dict(row)})
    return jsonify({'success': False, 'error': 'Device not found'}), 404

@app.route('/api/readings')
def get_readings():
    """Get historical readings
    
    Query params:
        device (str): filter by device_id
        limit (int): max number of results (default 100)
    """
    device = request.args.get('device')
    limit = int(request.args.get('limit', 100))
    
    conn = get_db()
    
    if device:
        rows = conn.execute(
            """SELECT * FROM readings 
               WHERE device_id = ? 
               ORDER BY timestamp DESC 
               LIMIT ?""",
            (device, limit)
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT * FROM readings 
               ORDER BY timestamp DESC 
               LIMIT ?""",
            (limit,)
        ).fetchall()
    
    conn.close()
    
    return jsonify({
        'success': True,
        'data': [dict(row) for row in rows]
    })

@app.route('/api/alerts')
def get_alerts():
    """Get alert history
    
    Query params:
        limit (int): max number of results (default 50)
        resolved (bool): filter by resolution status
    """
    limit = int(request.args.get('limit', 50))
    resolved = request.args.get('resolved')
    
    conn = get_db()
    
    if resolved is not None:
        resolved_int = 1 if resolved.lower() == 'true' else 0
        rows = conn.execute(
            """SELECT * FROM alerts 
               WHERE resolved = ? 
               ORDER BY timestamp DESC 
               LIMIT ?""",
            (resolved_int, limit)
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT * FROM alerts 
               ORDER BY timestamp DESC 
               LIMIT ?""",
            (limit,)
        ).fetchall()
    
    conn.close()
    
    return jsonify({
        'success': True,
        'data': [_serialize_alert_row(row) for row in rows]
    })

@app.route('/api/alerts/<int:alert_id>')
def get_alert(alert_id):
    """Get single alert details"""
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM alerts WHERE id = ?",
        (alert_id,)
    ).fetchone()
    conn.close()
    
    if row:
        return jsonify({'success': True, 'data': _serialize_alert_row(row)})
    else:
        return jsonify({'success': False, 'error': 'Alert not found'}), 404


@app.route('/api/recordings/<path:filename>')
def get_recording_file(filename):
    """Serve recorded video file by filename."""
    # Security: only serve files by basename from recordings dir
    safe_name = Path(filename).name
    file_path = RECORDINGS_DIR / safe_name

    if not file_path.exists() or not file_path.is_file():
        return jsonify({'success': False, 'error': 'Recording not found'}), 404

    return send_from_directory(str(RECORDINGS_DIR), safe_name)


@app.route('/api/cameras/<device_id>/snapshot')
def get_camera_snapshot(device_id):
    """Return a recent camera snapshot for live preview."""
    cam_recorder = recorder.get_recorder()

    if not cam_recorder.ffmpeg_available:
        return jsonify({'success': False, 'error': 'Camera preview unavailable: ffmpeg not installed'}), 503

    snapshot_path = cam_recorder.get_live_snapshot(device_id)
    if not snapshot_path:
        return jsonify({'success': False, 'error': f'No camera configured or snapshot unavailable for {device_id}'}), 404

    snapshot_file = Path(snapshot_path)
    if not snapshot_file.exists():
        return jsonify({'success': False, 'error': 'Snapshot file not found'}), 404

    return send_file(str(snapshot_file), mimetype='image/jpeg', max_age=0)


@app.route('/api/cameras/<device_id>/stream')
def get_camera_stream(device_id):
    """Return MJPEG stream for browser live camera view."""
    cam_recorder = recorder.get_recorder()

    if not cam_recorder.ffmpeg_available:
        return jsonify({'success': False, 'error': 'Camera stream unavailable: ffmpeg not installed'}), 503

    if not cam_recorder._get_rtsp_url(device_id):
        return jsonify({'success': False, 'error': f'No camera configured or stream unavailable for {device_id}'}), 404

    return Response(
        cam_recorder.mjpeg_stream(device_id),
        mimetype='multipart/x-mixed-replace; boundary=ffmpeg'
    )


@app.route('/api/cameras/<device_id>/diagnostics')
def get_camera_diagnostics(device_id):
    """Return camera connectivity and live preview diagnostics."""
    cam_recorder = recorder.get_recorder()
    diagnostics = cam_recorder.diagnose_camera(device_id)

    status_code = 200 if diagnostics.get('snapshot_success') else 503
    return jsonify({
        'success': diagnostics.get('snapshot_success', False),
        'data': diagnostics,
    }), status_code

@app.route('/api/alerts/<int:alert_id>/resolve', methods=['PATCH'])
def resolve_alert(alert_id):
    """Mark alert as resolved with optional notes"""
    data = request.get_json() or {}
    notes = data.get('notes', '')
    
    conn = get_db()
    conn.execute(
        """UPDATE alerts 
           SET resolved = 1, notes = ? 
           WHERE id = ?""",
        (notes, alert_id)
    )
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'message': 'Alert resolved'})

@app.route('/api/devices')
def get_devices():
    """Get all registered devices"""
    conn = get_db()
    rows = conn.execute(
        """SELECT *, 
           (SELECT COUNT(*) FROM readings WHERE readings.device_id = devices.device_id) as total_readings,
           (SELECT COUNT(*) FROM alerts WHERE alerts.device_id = devices.device_id) as total_alerts
           FROM devices
           ORDER BY last_seen DESC"""
    ).fetchall()
    conn.close()

    now = datetime.now()
    result = []
    for row in rows:
        d = dict(row)
        # Compute live online status from in-memory cache timestamp
        cached = latest_readings.get(d['device_id'])
        if cached and cached.get('timestamp'):
            try:
                last_ts = datetime.fromisoformat(cached['timestamp'])
                d['online'] = (now - last_ts).total_seconds() <= DEVICE_TIMEOUT_SECS
            except Exception:
                d['online'] = False
        else:
            d['online'] = False
        result.append(d)

    return jsonify({
        'success': True,
        'data': result
    })

@app.route('/api/stats')
def get_stats():
    """Get system-wide statistics"""
    conn = get_db()
    
    stats = {
        'total_readings': conn.execute(
            "SELECT COUNT(*) FROM readings"
        ).fetchone()[0],
        'total_alerts': conn.execute(
            "SELECT COUNT(*) FROM alerts"
        ).fetchone()[0],
        'open_alerts': conn.execute(
            "SELECT COUNT(*) FROM alerts WHERE resolved = 0"
        ).fetchone()[0],
        'devices_online': sum(
            1 for d, v in latest_readings.items()
            if d != 'default' and v.get('timestamp') and
            (datetime.now() - datetime.fromisoformat(v['timestamp'])).total_seconds() <= DEVICE_TIMEOUT_SECS
        ),
        'devices_total': conn.execute(
            "SELECT COUNT(*) FROM devices"
        ).fetchone()[0],
    }
    
    # Get readings by device for charts
    device_stats = conn.execute(
        """SELECT 
               device_id,
               COUNT(*) as reading_count,
               SUM(CASE WHEN alert_type != 'NORMAL' THEN 1 ELSE 0 END) as alert_count
           FROM readings
           GROUP BY device_id"""
    ).fetchall()
    
    stats['device_stats'] = [dict(row) for row in device_stats]
    
    conn.close()
    
    return jsonify({
        'success': True,
        'data': stats
    })

@app.route('/api/train/<device_id>', methods=['POST'])
def train_device(device_id):
    """
    Train AI model for specific device.
    
    Requires at least 100 normal readings in database.
    Returns training statistics on success.
    """
    try:
        stats = ai_engine.train_model(device_id)
        return jsonify({
            'success': True,
            'message': f'Model trained successfully for {device_id}',
            'data': stats
        })
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Training failed: {str(e)}'
        }), 500

@app.route('/api/models')
def get_models():
    """Get list of trained models"""
    trained = ai_engine.list_trained_models()
    return jsonify({
        'success': True,
        'data': {
            'trained_models': trained,
            'models_dir': str(ai_engine.MODELS_DIR)
        }
    })


# ─── Analytics Routes ─────────────────────────────────────────────

@app.route('/api/analytics/security')
def analytics_security():
    """Aggregated security event analytics (optional ?device_id=...)"""
    device_id = request.args.get('device_id')
    try:
        data = ai_engine.analyze_security_events(device_id)
        return jsonify({'success': True, 'data': data})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/analytics/trends')
def analytics_trends():
    """Time-series sensor data for a device (required ?device_id=, optional ?hours=24)"""
    device_id = request.args.get('device_id')
    if not device_id:
        return jsonify({'success': False, 'error': 'device_id required'}), 400
    hours = int(request.args.get('hours', 24))
    try:
        rows = ai_engine.get_sensor_trends(device_id, hours)
        return jsonify({'success': True, 'data': rows})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/analytics/heatmap')
def analytics_heatmap():
    """Hourly alert heatmap for the last 7 days"""
    device_id = request.args.get('device_id')
    try:
        result = ai_engine.analyze_security_events(device_id)
        return jsonify({'success': True, 'data': result.get('hourly_heatmap', [])})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/report/data')
def report_data():
    """Compile all data needed for PDF / print report."""
    conn = get_db()
    try:
        # Summary counts
        total_alerts = conn.execute("SELECT COUNT(*) FROM alerts").fetchone()[0]
        critical_alerts = conn.execute(
            "SELECT COUNT(*) FROM alerts WHERE severity='CRITICAL'"
        ).fetchone()[0]
        total_readings = conn.execute("SELECT COUNT(*) FROM readings").fetchone()[0]
        total_devices  = conn.execute("SELECT COUNT(*) FROM devices").fetchone()[0]

        # Recent alerts (last 100)
        alert_rows = conn.execute(
            """SELECT id, device_id, timestamp, alert_type, severity, ai_score, resolved
               FROM alerts ORDER BY timestamp DESC LIMIT 100"""
        ).fetchall()
        alerts = [dict(r) for r in alert_rows]

        # Devices with location
        dev_rows = conn.execute(
            "SELECT device_id, location, lat, lng, status, trained_at, last_seen FROM devices"
        ).fetchall()
        devices = [dict(r) for r in dev_rows]

        # Security analytics
        analytics = ai_engine.analyze_security_events()

        return jsonify({
            'success': True,
            'data': {
                'generated_at':   datetime.now().isoformat(),
                'summary': {
                    'total_alerts':    total_alerts,
                    'critical_alerts': critical_alerts,
                    'total_readings':  total_readings,
                    'total_devices':   total_devices,
                },
                'alerts':    alerts,
                'devices':   devices,
                'analytics': analytics,
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/devices/<device_id>/location', methods=['PATCH'])
def update_device_location(device_id):
    """Update device GPS coordinates and/or location name."""
    body = request.get_json(force=True) or {}
    lat      = body.get('lat')
    lng      = body.get('lng')
    location = body.get('location')
    conn = get_db()
    try:
        if lat is not None and lng is not None:
            conn.execute(
                "UPDATE devices SET lat=?, lng=? WHERE device_id=?",
                (float(lat), float(lng), device_id)
            )
        if location:
            conn.execute(
                "UPDATE devices SET location=? WHERE device_id=?",
                (location, device_id)
            )
        conn.commit()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════
# Camera Management Routes
# ═══════════════════════════════════════════════════════════════

@app.route('/api/cameras', methods=['GET'])
def get_cameras():
    """Get all cameras with status"""
    conn = get_db()
    try:
        cameras = conn.execute(
            """SELECT * FROM cameras ORDER BY created_at DESC"""
        ).fetchall()
        
        result = []
        for cam in cameras:
            cam_dict = dict(cam)
            # TODO: Check online status via recorder snapshot test
            cam_dict['online'] = cam_dict['enabled'] == 1
            result.append(cam_dict)
        
        return jsonify({'success': True, 'data': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/cameras', methods=['POST'])
def create_camera():
    """Create a new camera"""
    data = request.get_json(force=True) or {}
    
    name = data.get('name')
    rtsp_url = data.get('rtsp_url')
    cam_type = data.get('type', 'RTSP')
    device_id = data.get('device_id')
    location = data.get('location')
    lat = data.get('lat')
    lng = data.get('lng')
    face_recognition_enabled = data.get('face_recognition_enabled', 0)
    recording_enabled = data.get('recording_enabled', 1)
    
    if not name or not rtsp_url:
        return jsonify({'success': False, 'error': 'name and rtsp_url are required'}), 400
    
    conn = get_db()
    try:
        cursor = conn.execute(
            """INSERT INTO cameras 
               (name, rtsp_url, type, device_id, location, lat, lng, 
                face_recognition_enabled, recording_enabled)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (name, rtsp_url, cam_type, device_id, location, lat, lng,
             face_recognition_enabled, recording_enabled)
        )
        camera_id = cursor.lastrowid
        conn.commit()
        
        # Get created camera
        camera = conn.execute("SELECT * FROM cameras WHERE id=?", (camera_id,)).fetchone()
        
        return jsonify({'success': True, 'data': dict(camera)}), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/cameras/<int:camera_id>', methods=['PATCH'])
def update_camera(camera_id):
    """Update camera settings"""
    data = request.get_json(force=True) or {}
    
    conn = get_db()
    try:
        # Build update query dynamically
        updates = []
        params = []
        
        for field in ['name', 'rtsp_url', 'type', 'device_id', 'location', 'lat', 'lng',
                      'enabled', 'face_recognition_enabled', 'recording_enabled']:
            if field in data:
                updates.append(f"{field}=?")
                params.append(data[field])
        
        if not updates:
            return jsonify({'success': False, 'error': 'No fields to update'}), 400
        
        updates.append("updated_at=CURRENT_TIMESTAMP")
        params.append(camera_id)
        
        query = f"UPDATE cameras SET {', '.join(updates)} WHERE id=?"
        conn.execute(query, params)
        conn.commit()
        
        # Get updated camera
        camera = conn.execute("SELECT * FROM cameras WHERE id=?", (camera_id,)).fetchone()
        
        if not camera:
            return jsonify({'success': False, 'error': 'Camera not found'}), 404
        
        return jsonify({'success': True, 'data': dict(camera)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/cameras/<int:camera_id>', methods=['DELETE'])
def delete_camera(camera_id):
    """Delete camera"""
    conn = get_db()
    try:
        # Check if camera exists
        camera = conn.execute("SELECT * FROM cameras WHERE id=?", (camera_id,)).fetchone()
        
        if not camera:
            return jsonify({'success': False, 'error': 'Camera not found'}), 404
        
        # Stop face recognition if running
        if FACE_RECOGNITION_ENABLED:
            try:
                fre.stop_face_recognition_loop(camera_id)
            except Exception:
                pass
        
        # Delete camera
        conn.execute("DELETE FROM cameras WHERE id=?", (camera_id,))
        conn.commit()
        
        return jsonify({'success': True, 'message': 'Camera deleted'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/cameras/<int:camera_id>/test', methods=['GET'])
def test_camera(camera_id):
    """Test camera connectivity"""
    conn = get_db()
    try:
        camera = conn.execute("SELECT * FROM cameras WHERE id=?", (camera_id,)).fetchone()
        
        if not camera:
            return jsonify({'success': False, 'error': 'Camera not found'}), 404
        
        # Try to capture snapshot
        try:
            snapshot_data = cam_recorder.capture_snapshot_by_camera_id(camera_id)
            
            if snapshot_data:
                return jsonify({
                    'success': True,
                    'online': True,
                    'message': 'Camera connection successful'
                })
            else:
                return jsonify({
                    'success': False,
                    'online': False,
                    'error': 'Failed to capture snapshot'
                })
        except Exception as e:
            return jsonify({
                'success': False,
                'online': False,
                'error': str(e)
            })
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════
# Person Management Routes
# ═══════════════════════════════════════════════════════════════

@app.route('/api/persons', methods=['GET'])
def get_persons():
    """Get all registered persons"""
    conn = get_db()
    try:
        persons = conn.execute(
            """SELECT * FROM persons ORDER BY created_at DESC"""
        ).fetchall()
        
        result = []
        for person in persons:
            p_dict = dict(person)
            # Add photo URL
            if p_dict['photo_path']:
                p_dict['photo_url'] = f"/api/persons/{p_dict['id']}/photo"
            else:
                p_dict['photo_url'] = None
            result.append(p_dict)
        
        return jsonify({'success': True, 'data': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/persons', methods=['POST'])
def create_person():
    """Register a new person with photo"""
    try:
        # Get form data
        name = request.form.get('name')
        employee_id = request.form.get('employee_id')
        role = request.form.get('role')
        department = request.form.get('department')
        notes = request.form.get('notes')
        authorized = int(request.form.get('authorized', 1))
        
        if not name or not employee_id:
            return jsonify({'success': False, 'error': 'name and employee_id are required'}), 400
        
        # Get photo file
        if 'photo' not in request.files:
            return jsonify({'success': False, 'error': 'photo file is required'}), 400
        
        photo_file = request.files['photo']
        
        if photo_file.filename == '':
            return jsonify({'success': False, 'error': 'No photo file selected'}), 400
        
        # Register person using face recognition engine
        if not FACE_RECOGNITION_ENABLED:
            return jsonify({'success': False, 'error': 'Face recognition not available'}), 503
        
        success, message, person_id = fre.register_person(
            name, employee_id, photo_file, role, department, notes, authorized
        )
        
        if success:
            # Get created person
            conn = get_db()
            person = conn.execute("SELECT * FROM persons WHERE id=?", (person_id,)).fetchone()
            conn.close()
            
            person_dict = dict(person)
            person_dict['photo_url'] = f"/api/persons/{person_id}/photo"
            
            return jsonify({'success': True, 'data': person_dict, 'message': message}), 201
        else:
            return jsonify({'success': False, 'error': message}), 400
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/persons/<int:person_id>', methods=['PATCH'])
def update_person(person_id):
    """Update person information"""
    conn = get_db()
    try:
        # Check if updating with new photo
        if 'photo' in request.files:
            # Re-register with new photo
            photo_file = request.files['photo']
            name = request.form.get('name')
            employee_id = request.form.get('employee_id')
            role = request.form.get('role')
            department = request.form.get('department')
            notes = request.form.get('notes')
            authorized = int(request.form.get('authorized', 1))
            
            # Delete old person
            conn.execute("DELETE FROM persons WHERE id=?", (person_id,))
            conn.commit()
            
            # Re-register
            if not FACE_RECOGNITION_ENABLED:
                return jsonify({'success': False, 'error': 'Face recognition not available'}), 503
            
            success, message, new_id = fre.register_person(
                name, employee_id, photo_file, role, department, notes, authorized
            )
            
            if not success:
                return jsonify({'success': False, 'error': message}), 400
            
            person = conn.execute("SELECT * FROM persons WHERE id=?", (new_id,)).fetchone()
        else:
            # Update metadata only
            data = request.get_json(force=True) or {}
            
            updates = []
            params = []
            
            for field in ['name', 'employee_id', 'role', 'department', 'notes', 'authorized']:
                if field in data:
                    updates.append(f"{field}=?")
                    params.append(data[field])
            
            if not updates:
                return jsonify({'success': False, 'error': 'No fields to update'}), 400
            
            updates.append("updated_at=CURRENT_TIMESTAMP")
            params.append(person_id)
            
            query = f"UPDATE persons SET {', '.join(updates)} WHERE id=?"
            conn.execute(query, params)
            conn.commit()
            
            person = conn.execute("SELECT * FROM persons WHERE id=?", (person_id,)).fetchone()
        
        if not person:
            return jsonify({'success': False, 'error': 'Person not found'}), 404
        
        person_dict = dict(person)
        person_dict['photo_url'] = f"/api/persons/{person_dict['id']}/photo"
        
        return jsonify({'success': True, 'data': person_dict})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/persons/<int:person_id>', methods=['DELETE'])
def delete_person(person_id):
    """Delete a person"""
    conn = get_db()
    try:
        person = conn.execute("SELECT * FROM persons WHERE id=?", (person_id,)).fetchone()
        
        if not person:
            return jsonify({'success': False, 'error': 'Person not found'}), 404
        
        # Delete files
        if person['photo_path']:
            Path(person['photo_path']).unlink(missing_ok=True)
        if person['face_encoding_path']:
            Path(person['face_encoding_path']).unlink(missing_ok=True)
        
        # Delete from database
        conn.execute("DELETE FROM persons WHERE id=?", (person_id,))
        conn.commit()
        
        # Reload encoding cache
        if FACE_RECOGNITION_ENABLED:
            fre._reload_encoding_cache()
        
        return jsonify({'success': True, 'message': 'Person deleted'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/persons/<int:person_id>/photo', methods=['GET'])
def get_person_photo(person_id):
    """Serve person photo"""
    conn = get_db()
    try:
        person = conn.execute("SELECT photo_path FROM persons WHERE id=?", (person_id,)).fetchone()
        
        if not person or not person['photo_path']:
            return jsonify({'success': False, 'error': 'Photo not found'}), 404
        
        photo_path = Path(person['photo_path'])
        
        if not photo_path.exists():
            return jsonify({'success': False, 'error': 'Photo file not found'}), 404
        
        return send_file(str(photo_path), mimetype='image/jpeg')
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════
# Face Detection Analytics Routes
# ═══════════════════════════════════════════════════════════════

@app.route('/api/face-detections', methods=['GET'])
def get_face_detections():
    """Get face detection history with filters"""
    camera_id = request.args.get('camera_id', type=int)
    person_id = request.args.get('person_id', type=int)
    hours = request.args.get('hours', 24, type=int)
    unknown_only = request.args.get('unknown_only', 'false').lower() == 'true'
    limit = request.args.get('limit', 100, type=int)
    
    conn = get_db()
    try:
        query = """
            SELECT fd.*, c.name as camera_name, c.location, p.name as person_name
            FROM face_detections fd
            JOIN cameras c ON fd.camera_id = c.id
            LEFT JOIN persons p ON fd.person_id = p.id
            WHERE fd.timestamp >= datetime('now', '-{} hours')
        """.format(hours)
        
        params = []
        
        if camera_id:
            query += " AND fd.camera_id = ?"
            params.append(camera_id)
        
        if person_id:
            query += " AND fd.person_id = ?"
            params.append(person_id)
        
        if unknown_only:
            query += " AND fd.person_id IS NULL"
        
        query += " ORDER BY fd.timestamp DESC LIMIT ?"
        params.append(limit)
        
        detections = conn.execute(query, params).fetchall()
        
        result = [dict(d) for d in detections]
        
        return jsonify({'success': True, 'data': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/face-analytics/unknown', methods=['GET'])
def get_unknown_faces():
    """Get clustered unknown faces"""
    hours = request.args.get('hours', 24, type=int)
    
    if not FACE_RECOGNITION_ENABLED:
        return jsonify({'success': False, 'error': 'Face recognition not available'}), 503
    
    try:
        unknown_faces = fre.get_unknown_faces(hours=hours)
        
        return jsonify({'success': True, 'data': unknown_faces})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/face-analytics/timeline', methods=['GET'])
def get_person_timeline():
    """Get person movement timeline"""
    person_id = request.args.get('person_id', type=int)
    hours = request.args.get('hours', 24, type=int)
    
    if not person_id:
        return jsonify({'success': False, 'error': 'person_id is required'}), 400
    
    if not FACE_RECOGNITION_ENABLED:
        return jsonify({'success': False, 'error': 'Face recognition not available'}), 503
    
    try:
        timeline = fre.get_person_detections(person_id, hours=hours)
        
        return jsonify({'success': True, 'data': timeline})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ─── Initialization ───────────────────────────────────────────────

def _start_face_recognition_for_cameras():
    """Start face recognition loops for cameras with FR enabled"""
    if not FACE_RECOGNITION_ENABLED:
        return
    try:
        conn = get_db()
        cameras = conn.execute(
            "SELECT id FROM cameras WHERE enabled=1 AND face_recognition_enabled=1"
        ).fetchall()
        conn.close()
        
        for cam in cameras:
            fre.start_face_recognition_loop(cam['id'], interval=5)
            print(f"🔍 Started face recognition for camera {cam['id']}")
    except Exception as e:
        print(f"⚠️  Error starting face recognition: {e}")


# Initialize database on startup
init_db()
_seed_device_locations()
threading.Thread(target=_auto_train_all, daemon=True).start()

# Start face recognition for enabled cameras
threading.Thread(target=_start_face_recognition_for_cameras, daemon=True).start()

# Start MQTT client thread
threading.Thread(target=mqtt_thread, daemon=True).start()

if __name__ == '__main__':
    backend_port = int(os.getenv('BACKEND_PORT', os.getenv('PORT', '5000')))

    print("🚀 Smart City Security System - Backend Server")
    print("=" * 60)
    print(f"📁 Database: {DB_PATH}")
    print("📡 MQTT: localhost:1883")
    print(f"🌐 API: http://127.0.0.1:{backend_port}")
    print("=" * 60)
    app.run(host='0.0.0.0', port=backend_port, debug=False, threaded=True, use_reloader=False)
