from datetime import datetime

from flask import Blueprint, jsonify, request

import ai_engine
from config import DEVICE_TIMEOUT_SECS
from db import get_db, serialize_alert
from state import latest_readings

bp = Blueprint('sensors', __name__)

@bp.route('/api/latest')
def get_latest():
    return jsonify({'success': True, 'data': latest_readings})

@bp.route('/api/latest/<device_id>')
def get_latest_device(device_id):
    reading = latest_readings.get(device_id)
    if reading:
        return jsonify({'success': True, 'data': reading})
    conn = get_db()
    row  = conn.execute(
        "SELECT * FROM readings WHERE device_id=? ORDER BY timestamp DESC LIMIT 1",
        (device_id,),
    ).fetchone()
    conn.close()
    if row:
        return jsonify({'success': True, 'data': dict(row)})
    return jsonify({'success': False, 'error': 'Device not found'}), 404

@bp.route('/api/readings')
def get_readings():
    device = request.args.get('device')
    limit  = int(request.args.get('limit', 100))
    conn   = get_db()
    if device:
        rows = conn.execute(
            "SELECT * FROM readings WHERE device_id=? ORDER BY timestamp DESC LIMIT ?",
            (device, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM readings ORDER BY timestamp DESC LIMIT ?", (limit,)
        ).fetchall()
    conn.close()
    return jsonify({'success': True, 'data': [dict(r) for r in rows]})

@bp.route('/api/alerts')
def get_alerts():
    limit    = int(request.args.get('limit', 50))
    resolved = request.args.get('resolved')
    conn     = get_db()
    if resolved is not None:
        flag = 1 if resolved.lower() == 'true' else 0
        rows = conn.execute(
            "SELECT * FROM alerts WHERE resolved=? ORDER BY timestamp DESC LIMIT ?",
            (flag, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM alerts ORDER BY timestamp DESC LIMIT ?", (limit,)
        ).fetchall()
    conn.close()
    return jsonify({'success': True, 'data': [serialize_alert(r) for r in rows]})

@bp.route('/api/alerts/<int:alert_id>')
def get_alert(alert_id):
    conn = get_db()
    row  = conn.execute("SELECT * FROM alerts WHERE id=?", (alert_id,)).fetchone()
    conn.close()
    if row:
        return jsonify({'success': True, 'data': serialize_alert(row)})
    return jsonify({'success': False, 'error': 'Alert not found'}), 404

@bp.route('/api/alerts/<int:alert_id>/resolve', methods=['PATCH'])
def resolve_alert(alert_id):
    notes = (request.get_json(force=True) or {}).get('notes', '')
    conn  = get_db()
    conn.execute("UPDATE alerts SET resolved=1, notes=? WHERE id=?", (notes, alert_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'message': 'Alert resolved'})

@bp.route('/api/devices')
def get_devices():
    conn = get_db()
    rows = conn.execute(
        """SELECT *,
               (SELECT COUNT(*) FROM readings r WHERE r.device_id = devices.device_id) AS total_readings,
               (SELECT COUNT(*) FROM alerts   a WHERE a.device_id = devices.device_id) AS total_alerts
           FROM devices ORDER BY last_seen DESC"""
    ).fetchall()
    conn.close()

    now    = datetime.now()
    result = []
    for row in rows:
        d      = dict(row)
        cached = latest_readings.get(d['device_id'])
        d['online'] = False
        if cached and cached.get('timestamp'):
            try:
                d['online'] = (
                    (now - datetime.fromisoformat(cached['timestamp'])).total_seconds()
                    <= DEVICE_TIMEOUT_SECS
                )
            except Exception:
                pass
        result.append(d)
    return jsonify({'success': True, 'data': result})

@bp.route('/api/devices/<device_id>/location', methods=['PATCH'])
def update_device_location(device_id):
    body     = request.get_json(force=True) or {}
    lat      = body.get('lat')
    lng      = body.get('lng')
    location = body.get('location')
    conn     = get_db()
    try:
        if lat is not None and lng is not None:
            conn.execute(
                "UPDATE devices SET lat=?, lng=? WHERE device_id=?",
                (float(lat), float(lng), device_id),
            )
        if location:
            conn.execute(
                "UPDATE devices SET location=? WHERE device_id=?",
                (location, device_id),
            )
        conn.commit()
        return jsonify({'success': True})
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500
    finally:
        conn.close()

@bp.route('/api/stats')
def get_stats():
    conn = get_db()
    now  = datetime.now()
    try:
        stats = {
            'total_readings': conn.execute("SELECT COUNT(*) FROM readings").fetchone()[0],
            'total_alerts':   conn.execute("SELECT COUNT(*) FROM alerts").fetchone()[0],
            'open_alerts':    conn.execute("SELECT COUNT(*) FROM alerts WHERE resolved=0").fetchone()[0],
            'devices_total':  conn.execute("SELECT COUNT(*) FROM devices").fetchone()[0],
            'devices_online': sum(
                1 for k, v in latest_readings.items()
                if k != 'default'
                and v.get('timestamp')
                and (now - datetime.fromisoformat(v['timestamp'])).total_seconds()
                <= DEVICE_TIMEOUT_SECS
            ),
            'device_stats': [
                dict(r) for r in conn.execute(
                    """SELECT device_id,
                              COUNT(*) AS reading_count,
                              SUM(CASE WHEN alert_type != 'NORMAL' THEN 1 ELSE 0 END) AS alert_count
                       FROM readings GROUP BY device_id"""
                ).fetchall()
            ],
        }
        return jsonify({'success': True, 'data': stats})
    finally:
        conn.close()

@bp.route('/api/train/<device_id>', methods=['POST'])
def train_device(device_id):
    try:
        stats = ai_engine.train_model(device_id)
        return jsonify({'success': True, 'message': f'Model trained for {device_id}', 'data': stats})
    except ValueError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400
    except Exception as exc:
        return jsonify({'success': False, 'error': f'Training failed: {exc}'}), 500

@bp.route('/api/models')
def get_models():
    trained = ai_engine.list_trained_models()
    return jsonify({
        'success': True,
        'data': {'trained_models': trained, 'models_dir': str(ai_engine.MODELS_DIR)},
    })
