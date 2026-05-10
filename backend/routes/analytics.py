"""
routes/analytics.py — security analytics, sensor trends, report data,
                      and face detection history / identity analytics.

Blueprint prefix: /api
"""
from datetime import datetime

from flask import Blueprint, jsonify, request

import ai_engine
from db import get_db
from state import fre

bp = Blueprint('analytics', __name__)


# ── Security analytics ────────────────────────────────────────────────────────

@bp.route('/api/analytics/security')
def analytics_security():
    """?device_id=<id>"""
    device_id = request.args.get('device_id')
    try:
        return jsonify({'success': True, 'data': ai_engine.analyze_security_events(device_id)})
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500


@bp.route('/api/analytics/trends')
def analytics_trends():
    """?device_id=<id>&hours=<n>"""
    device_id = request.args.get('device_id')
    if not device_id:
        return jsonify({'success': False, 'error': 'device_id required'}), 400
    hours = int(request.args.get('hours', 24))
    try:
        return jsonify({'success': True, 'data': ai_engine.get_sensor_trends(device_id, hours)})
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500


@bp.route('/api/analytics/heatmap')
def analytics_heatmap():
    """?device_id=<id>"""
    device_id = request.args.get('device_id')
    try:
        result = ai_engine.analyze_security_events(device_id)
        return jsonify({'success': True, 'data': result.get('hourly_heatmap', [])})
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500


# ── Report ────────────────────────────────────────────────────────────────────

@bp.route('/api/report/data')
def report_data():
    conn = get_db()
    try:
        total_alerts    = conn.execute("SELECT COUNT(*) FROM alerts").fetchone()[0]
        critical_alerts = conn.execute(
            "SELECT COUNT(*) FROM alerts WHERE severity='CRITICAL'"
        ).fetchone()[0]
        total_readings  = conn.execute("SELECT COUNT(*) FROM readings").fetchone()[0]
        total_devices   = conn.execute("SELECT COUNT(*) FROM devices").fetchone()[0]

        alerts  = [dict(r) for r in conn.execute(
            "SELECT id,device_id,timestamp,alert_type,severity,ai_score,resolved"
            " FROM alerts ORDER BY timestamp DESC LIMIT 100"
        ).fetchall()]
        devices = [dict(r) for r in conn.execute(
            "SELECT device_id,location,lat,lng,status,trained_at,last_seen FROM devices"
        ).fetchall()]

        return jsonify({
            'success': True,
            'data': {
                'generated_at': datetime.now().isoformat(),
                'summary': {
                    'total_alerts':    total_alerts,
                    'critical_alerts': critical_alerts,
                    'total_readings':  total_readings,
                    'total_devices':   total_devices,
                },
                'alerts':    alerts,
                'devices':   devices,
                'analytics': ai_engine.analyze_security_events(),
            },
        })
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500
    finally:
        conn.close()


# ── Face detection history ────────────────────────────────────────────────────

@bp.route('/api/face-detections')
def get_face_detections():
    """?camera_id=&person_id=&hours=24&unknown_only=false&limit=100"""
    camera_id    = request.args.get('camera_id', type=int)
    person_id    = request.args.get('person_id', type=int)
    hours        = request.args.get('hours', 24, type=int)
    unknown_only = request.args.get('unknown_only', 'false').lower() == 'true'
    limit        = request.args.get('limit', 100, type=int)

    # Build query with safe integer hours (no user string interpolation)
    query = (
        "SELECT fd.*, c.name AS camera_name, c.location,"
        "       p.name AS person_name, p.employee_id AS person_employee_id,"
        "       p.authorized AS person_authorized"
        " FROM face_detections fd"
        " JOIN cameras c ON fd.camera_id = c.id"
        " LEFT JOIN persons p ON fd.person_id = p.id"
        f" WHERE fd.timestamp >= datetime('now', '-{int(hours)} hours')"
    )
    params: list = []
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

    conn = get_db()
    try:
        rows = conn.execute(query, params).fetchall()
        return jsonify({'success': True, 'data': [dict(r) for r in rows]})
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500
    finally:
        conn.close()


# ── Identity analytics (cloud / full FR mode only) ────────────────────────────

@bp.route('/api/face-analytics/unknown')
def get_unknown_faces():
    if not fre or not getattr(fre, 'identity_analytics_active', lambda: False)():
        return jsonify({'success': False, 'error': 'Identity analytics unavailable'}), 503
    hours = request.args.get('hours', 24, type=int)
    try:
        return jsonify({'success': True, 'data': fre.get_unknown_faces(hours=hours)})
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500


@bp.route('/api/face-analytics/timeline')
def get_person_timeline():
    person_id = request.args.get('person_id', type=int)
    if not person_id:
        return jsonify({'success': False, 'error': 'person_id required'}), 400
    if not fre or not getattr(fre, 'identity_analytics_active', lambda: False)():
        return jsonify({'success': False, 'error': 'Identity analytics unavailable'}), 503
    hours = request.args.get('hours', 24, type=int)
    try:
        return jsonify({'success': True, 'data': fre.get_person_detections(person_id, hours=hours)})
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500
