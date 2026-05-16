from gevent import monkey
monkey.patch_all()

import os
import socket
import sys
import threading
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from apscheduler.schedulers.background import BackgroundScheduler

import config
import db
import ai_engine
import mqtt_handler
import object_detector
from socketio_instance import socketio
from state import FACE_RECOGNITION_ENABLED, fre, latest_readings
from routes.sensors   import bp as sensors_bp
from routes.cameras   import bp as cameras_bp
from routes.persons   import bp as persons_bp
from routes.analytics import bp as analytics_bp

app = Flask(__name__, template_folder='../templates',
            static_folder='../frontend/build', static_url_path='')
CORS(app)
socketio.init_app(app)

app.register_blueprint(sensors_bp)
app.register_blueprint(cameras_bp)
app.register_blueprint(persons_bp)
app.register_blueprint(analytics_bp)

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_react(path):
    full = os.path.join(app.static_folder, path)
    if os.path.exists(full):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/data')
def data():
    if 'default' in latest_readings:
        return jsonify(latest_readings['default'])
    if latest_readings:
        first = next(iter(latest_readings.values()))
        return jsonify({k: first.get(k, 0) for k in ('temperature', 'humidity', 'gas', 'mic', 'motion')})
    return jsonify({'temperature': 0, 'humidity': 0, 'gas': 0, 'mic': 0, 'motion': 0})

_DEFAULT_LOCATIONS = {
    'esp32_1': (24.7136, 46.6753),
    'esp32_2': (24.7140, 46.6760),
}

def _seed_device_locations() -> None:
    try:
        conn = db.get_db()
        conn.execute("PRAGMA busy_timeout = 3000")
        for dev_id, (lat, lng) in _DEFAULT_LOCATIONS.items():
            conn.execute(
                "UPDATE devices SET lat=?, lng=? WHERE device_id=? AND lat IS NULL",
                (lat, lng, dev_id),
            )
        conn.commit()
        conn.close()
    except Exception as exc:
        print(f"[WARN] _seed_device_locations skipped: {exc}")

def _auto_train_all() -> None:
    conn    = db.get_db()
    dev_ids = [r[0] for r in conn.execute("SELECT device_id FROM devices").fetchall()]
    conn.close()
    for dev_id in dev_ids:
        if ai_engine.auto_train_if_ready(dev_id):
            print(f"[AI] Auto-trained model for {dev_id}")

def _start_face_recognition_for_cameras() -> None:
    if not FACE_RECOGNITION_ENABLED:
        return
    conn    = db.get_db()
    cameras = conn.execute(
        "SELECT id FROM cameras WHERE enabled=1 AND face_recognition_enabled=1"
    ).fetchall()
    conn.close()
    for cam in cameras:
        try:
            fre.start_face_recognition_loop(cam['id'], interval=config.FR_LOOP_INTERVAL_SECS)
            print(f"[FR] FR loop started for camera {cam['id']}")
        except Exception as exc:
            print(f"[WARN]  FR loop error for camera {cam['id']}: {exc}")

db.init_db()

# Fail fast if port is already in use (avoids misleading DB-lock errors)
_port = int(os.environ.get('PORT', 5000))
_is_gunicorn = os.environ.get('SERVER_SOFTWARE', '').lower().startswith('gunicorn')
if not _is_gunicorn:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as _s:
        if _s.connect_ex(('127.0.0.1', _port)) == 0:
            print(f"[ERROR] Port {_port} is already in use. Run: fuser -k {_port}/tcp")
            sys.exit(1)

_seed_device_locations()
threading.Thread(target=_auto_train_all,                     daemon=True).start()
threading.Thread(target=_start_face_recognition_for_cameras, daemon=True).start()
threading.Thread(target=mqtt_handler.mqtt_thread,             daemon=True).start()

threading.Thread(target=object_detector.warmup, daemon=True).start()

_RETRAIN_INTERVAL_HOURS = max(1, int(os.getenv('RETRAIN_INTERVAL_HOURS', '6')))
_scheduler = BackgroundScheduler(timezone='UTC', job_defaults={'max_instances': 1})
_scheduler.add_job(
    func=ai_engine.retrain_all_devices,
    trigger='interval',
    hours=_RETRAIN_INTERVAL_HOURS,
    id='periodic_retrain',
    replace_existing=True,
)
_scheduler.start()
print(f"[Scheduler] Periodic retrain scheduler started (every {_RETRAIN_INTERVAL_HOURS}h)")

if __name__ == '__main__':
    port = int(os.getenv('BACKEND_PORT', os.getenv('PORT', '5000')))
    print(" Smart City Security System")
    print(f"   DB   {config.DB_PATH}")
    print(f"   API  http://127.0.0.1:{port}")
    print(f"   WS   ws://0.0.0.0:{port}/socket.io")
    socketio.run(app, host='0.0.0.0', port=port, debug=False, use_reloader=False, allow_unsafe_werkzeug=True)

