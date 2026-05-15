import base64
from pathlib import Path

from flask import Blueprint, Response, jsonify, request, send_file, send_from_directory

import recorder
from config import FR_LOOP_INTERVAL_SECS, RECORDINGS_DIR
from db import get_db
from state import FACE_RECOGNITION_ENABLED, fre

bp = Blueprint('cameras', __name__)

_UPDATABLE_FIELDS = (
    'name', 'rtsp_url', 'type', 'device_id', 'location',
    'lat', 'lng', 'enabled', 'face_recognition_enabled', 'recording_enabled',
)

@bp.route('/api/cameras', methods=['GET'])
def get_cameras():
    conn = get_db()
    try:
        cameras = conn.execute("SELECT * FROM cameras ORDER BY created_at DESC").fetchall()
        result  = [{**dict(c), 'online': bool(c['enabled'])} for c in cameras]
        return jsonify({'success': True, 'data': result})
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500
    finally:
        conn.close()

@bp.route('/api/cameras', methods=['POST'])
def create_camera():
    data = request.get_json(force=True) or {}
    name = data.get('name')
    rtsp = data.get('rtsp_url')
    if not name or not rtsp:
        return jsonify({'success': False, 'error': 'name and rtsp_url are required'}), 400

    conn = get_db()
    try:
        cur = conn.execute(
            """INSERT INTO cameras
                   (name, rtsp_url, type, device_id, location, lat, lng,
                    face_recognition_enabled, recording_enabled)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                name, rtsp,
                data.get('type', 'RTSP'), data.get('device_id'),
                data.get('location'), data.get('lat'), data.get('lng'),
                data.get('face_recognition_enabled', 0),
                data.get('recording_enabled', 1),
            ),
        )
        conn.commit()
        camera = conn.execute("SELECT * FROM cameras WHERE id=?", (cur.lastrowid,)).fetchone()
        return jsonify({'success': True, 'data': dict(camera)}), 201
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500
    finally:
        conn.close()

@bp.route('/api/cameras/<int:camera_id>', methods=['PATCH'])
def update_camera(camera_id):
    data    = request.get_json(force=True) or {}
    updates = [(f, data[f]) for f in _UPDATABLE_FIELDS if f in data]
    if not updates:
        return jsonify({'success': False, 'error': 'No fields to update'}), 400

    conn = get_db()
    try:
        cols   = ', '.join(f'{f}=?' for f, _ in updates) + ', updated_at=CURRENT_TIMESTAMP'
        params = [v for _, v in updates] + [camera_id]
        conn.execute(f"UPDATE cameras SET {cols} WHERE id=?", params)
        conn.commit()

        camera = conn.execute("SELECT * FROM cameras WHERE id=?", (camera_id,)).fetchone()
        if not camera:
            return jsonify({'success': False, 'error': 'Camera not found'}), 404

        if FACE_RECOGNITION_ENABLED and hasattr(fre, 'start_face_recognition_loop'):
            try:
                if camera['enabled'] and camera['face_recognition_enabled']:
                    fre.start_face_recognition_loop(camera_id, interval=FR_LOOP_INTERVAL_SECS)
                else:
                    fre.stop_face_recognition_loop(camera_id)
            except Exception as lp_err:
                print(f"[WARN]  FR loop update for camera {camera_id}: {lp_err}")

        return jsonify({'success': True, 'data': dict(camera)})
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500
    finally:
        conn.close()

@bp.route('/api/cameras/<int:camera_id>', methods=['DELETE'])
def delete_camera(camera_id):
    conn = get_db()
    try:
        if not conn.execute("SELECT id FROM cameras WHERE id=?", (camera_id,)).fetchone():
            return jsonify({'success': False, 'error': 'Camera not found'}), 404
        if FACE_RECOGNITION_ENABLED:
            try:
                fre.stop_face_recognition_loop(camera_id)
            except Exception:
                pass
        conn.execute("DELETE FROM cameras WHERE id=?", (camera_id,))
        conn.commit()
        return jsonify({'success': True, 'message': 'Camera deleted'})
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500
    finally:
        conn.close()

@bp.route('/api/cameras/<int:camera_id>/test')
def test_camera(camera_id):
    conn = get_db()
    try:
        if not conn.execute("SELECT id FROM cameras WHERE id=?", (camera_id,)).fetchone():
            return jsonify({'success': False, 'error': 'Camera not found'}), 404
    finally:
        conn.close()

    try:
        cam_rec = recorder.get_recorder()
        raw     = cam_rec.capture_snapshot_by_camera_id(camera_id)
        if raw:
            b64 = base64.b64encode(raw).decode()
            return jsonify({
                'success': True,
                'online':  True,
                'message': 'Camera connection successful',
                'data':    {'snapshot': f'data:image/jpeg;base64,{b64}'},
            })
        return jsonify({'success': False, 'online': False, 'error': 'Snapshot failed'})
    except Exception as exc:
        return jsonify({'success': False, 'online': False, 'error': str(exc)})

@bp.route('/api/cameras/<device_id>/diagnostics')
def get_camera_diagnostics(device_id):
    cam_rec     = recorder.get_recorder()
    diagnostics = cam_rec.diagnose_camera(device_id)
    status_code = 200 if diagnostics.get('snapshot_success') else 503
    return jsonify({
        'success': diagnostics.get('snapshot_success', False),
        'data':    diagnostics,
    }), status_code

@bp.route('/api/cameras/<device_id>/snapshot')
def get_camera_snapshot(device_id):
    cam_rec = recorder.get_recorder()
    if not cam_rec.ffmpeg_available:
        return jsonify({'success': False, 'error': 'ffmpeg not installed'}), 503
    path = cam_rec.get_live_snapshot(device_id)
    if not path or not Path(path).exists():
        return jsonify({'success': False, 'error': 'Snapshot unavailable'}), 404
    return send_file(path, mimetype='image/jpeg', max_age=0)

@bp.route('/api/cameras/<device_id>/stream')
def get_camera_stream(device_id):
    cam_rec = recorder.get_recorder()
    if not cam_rec.ffmpeg_available:
        return jsonify({'success': False, 'error': 'ffmpeg not installed'}), 503
    if not cam_rec._get_rtsp_url(device_id):
        return jsonify({'success': False, 'error': f'No stream for {device_id}'}), 404
    return Response(
        cam_rec.mjpeg_stream(device_id),
        mimetype='multipart/x-mixed-replace; boundary=ffmpeg',
    )

@bp.route('/api/cameras/<int:camera_id>/mjpeg')
def get_camera_mjpeg(camera_id):
    cam_rec = recorder.get_recorder()
    if not cam_rec.ffmpeg_available:
        return jsonify({'success': False, 'error': 'ffmpeg not installed'}), 503
    fps = max(1, min(request.args.get('fps', 5, type=int), 15))
    return Response(
        cam_rec.mjpeg_stream_by_id(camera_id, fps=fps),
        mimetype='multipart/x-mixed-replace; boundary=frame',
        headers={
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma':        'no-cache',
            'Expires':       '0',
        },
    )

@bp.route('/api/cameras/<int:camera_id>/object-detections')
def get_object_detections(camera_id):
    hours = max(0.01, min(float(request.args.get('hours', 1)), 168))
    limit = max(1, min(int(request.args.get('limit', 50)), 200))
    conn = get_db()
    rows = conn.execute(
        """SELECT od.*, c.name AS camera_name, c.location
           FROM object_detections od
           JOIN cameras c ON od.camera_id = c.id
           WHERE od.camera_id = ?
             AND od.timestamp >= datetime('now', ? || ' hours')
           ORDER BY od.timestamp DESC
           LIMIT ?""",
        (camera_id, f'-{hours}', limit)
    ).fetchall()
    conn.close()
    return jsonify({'success': True, 'data': [dict(r) for r in rows]})

@bp.route('/api/recordings/<path:filename>')
def get_recording_file(filename):
    safe      = Path(filename).name
    file_path = RECORDINGS_DIR / safe
    if not file_path.is_file():
        return jsonify({'success': False, 'error': 'Recording not found'}), 404
    return send_from_directory(str(RECORDINGS_DIR), safe)
