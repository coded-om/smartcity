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

app = Flask(__name__, template_folder='../templates')
CORS(app)

# In-memory cache for latest readings (for backward compatibility)
latest_readings = {}

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
            model_path  TEXT,
            trained_at  DATETIME,
            last_seen   DATETIME,
            status      TEXT DEFAULT 'training'
        );
        
        -- Indexes for performance
        CREATE INDEX IF NOT EXISTS idx_readings_device_time 
            ON readings(device_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_alerts_device_time 
            ON alerts(device_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_alerts_resolved 
            ON alerts(resolved);
    """)
    conn.commit()
    conn.close()
    print("✅ Database initialized successfully")

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
        
        # Update device last_seen
        conn.execute(
            """INSERT OR REPLACE INTO devices 
               (device_id, last_seen, status, location) 
               VALUES (?, ?, COALESCE((SELECT status FROM devices WHERE device_id=?), 'training'), 
                       COALESCE((SELECT location FROM devices WHERE device_id=?), 'Unknown'))""",
            (device_id, _to_db_datetime(datetime.now()), device_id, device_id)
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
    
    return jsonify({
        'success': True,
        'data': [dict(row) for row in rows]
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
        'devices_online': len([d for d in latest_readings.keys() if d != 'default']),
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

# ─── Initialization ───────────────────────────────────────────────

# Initialize database on startup
init_db()

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
