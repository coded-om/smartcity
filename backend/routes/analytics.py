from datetime import datetime

from flask import Blueprint, jsonify, request

import ai_engine
from db import get_db
from state import fre

bp = Blueprint('analytics', __name__)

@bp.route('/api/analytics/security')
def analytics_security():
    device_id = request.args.get('device_id')
    try:
        return jsonify({'success': True, 'data': ai_engine.analyze_security_events(device_id)})
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500

@bp.route('/api/analytics/trends')
def analytics_trends():
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
    device_id = request.args.get('device_id')
    try:
        result = ai_engine.analyze_security_events(device_id)
        return jsonify({'success': True, 'data': result.get('hourly_heatmap', [])})
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500

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

@bp.route('/api/report/full')
def report_full():
    from_date  = request.args.get('from_date', '')
    to_date    = request.args.get('to_date', '')
    camera_id  = request.args.get('camera_id', type=int)

    dt_from = f"{from_date} 00:00:00" if from_date else '1970-01-01 00:00:00'
    dt_to   = f"{to_date} 23:59:59"   if to_date   else datetime.now().strftime('%Y-%m-%d 23:59:59')

    conn = get_db()
    try:
        total_alerts    = conn.execute(
            "SELECT COUNT(*) FROM alerts WHERE timestamp BETWEEN ? AND ?",
            (dt_from, dt_to)).fetchone()[0]
        critical_alerts = conn.execute(
            "SELECT COUNT(*) FROM alerts WHERE severity='CRITICAL' AND timestamp BETWEEN ? AND ?",
            (dt_from, dt_to)).fetchone()[0]
        high_alerts     = conn.execute(
            "SELECT COUNT(*) FROM alerts WHERE severity='HIGH' AND timestamp BETWEEN ? AND ?",
            (dt_from, dt_to)).fetchone()[0]
        total_readings  = conn.execute(
            "SELECT COUNT(*) FROM readings WHERE timestamp BETWEEN ? AND ?",
            (dt_from, dt_to)).fetchone()[0]
        total_cameras   = conn.execute("SELECT COUNT(*) FROM cameras WHERE enabled=1").fetchone()[0]
        total_persons   = conn.execute("SELECT COUNT(*) FROM persons").fetchone()[0]

        cam_filter_sql    = " AND fd.camera_id = ?"  if camera_id else ""
        cam_filter_params = [camera_id]              if camera_id else []

        total_face_detections = conn.execute(
            "SELECT COUNT(*) FROM face_detections fd"
            " WHERE fd.timestamp BETWEEN ? AND ?" + cam_filter_sql,
            [dt_from, dt_to] + cam_filter_params).fetchone()[0]

        authorized_detections = conn.execute(
            "SELECT COUNT(*) FROM face_detections fd"
            " JOIN persons p ON fd.person_id = p.id"
            " WHERE fd.timestamp BETWEEN ? AND ? AND p.authorized=1" + cam_filter_sql,
            [dt_from, dt_to] + cam_filter_params).fetchone()[0]

        unknown_detections = conn.execute(
            "SELECT COUNT(*) FROM face_detections fd"
            " WHERE fd.timestamp BETWEEN ? AND ? AND fd.person_id IS NULL" + cam_filter_sql,
            [dt_from, dt_to] + cam_filter_params).fetchone()[0]

        total_objects = conn.execute(
            "SELECT COUNT(*) FROM object_detections od"
            " WHERE od.timestamp BETWEEN ? AND ?" + (
                " AND od.camera_id = ?" if camera_id else ""),
            [dt_from, dt_to] + (cam_filter_params if camera_id else [])).fetchone()[0]

        alerts = [dict(r) for r in conn.execute(
            "SELECT id, device_id, timestamp, alert_type, severity, ai_score, resolved, notes"
            " FROM alerts WHERE timestamp BETWEEN ? AND ?"
            " ORDER BY timestamp DESC LIMIT 500",
            (dt_from, dt_to)).fetchall()]

        alert_type_rows = conn.execute(
            "SELECT alert_type, COUNT(*) as cnt FROM alerts"
            " WHERE timestamp BETWEEN ? AND ? GROUP BY alert_type ORDER BY cnt DESC",
            (dt_from, dt_to)).fetchall()
        alert_type_counts = {r['alert_type']: r['cnt'] for r in alert_type_rows}

        severity_rows = conn.execute(
            "SELECT severity, COUNT(*) as cnt FROM alerts"
            " WHERE timestamp BETWEEN ? AND ? GROUP BY severity ORDER BY cnt DESC",
            (dt_from, dt_to)).fetchall()
        severity_counts = {r['severity']: r['cnt'] for r in severity_rows}

        hourly_rows = conn.execute(
            "SELECT strftime('%H', timestamp) as hr, COUNT(*) as cnt"
            " FROM alerts WHERE timestamp BETWEEN ? AND ?"
            " GROUP BY hr ORDER BY hr",
            (dt_from, dt_to)).fetchall()
        hourly_alerts = {r['hr']: r['cnt'] for r in hourly_rows}

        cameras_raw = conn.execute(
            "SELECT id, name, location, rtsp_url, enabled, lat, lng,"
            "       face_recognition_enabled, recording_enabled, created_at"
            " FROM cameras ORDER BY id").fetchall()

        cameras_stats = []
        for cam in cameras_raw:
            cid = cam['id']
            face_cnt = conn.execute(
                "SELECT COUNT(*) FROM face_detections WHERE camera_id=? AND timestamp BETWEEN ? AND ?",
                (cid, dt_from, dt_to)).fetchone()[0]
            obj_cnt = conn.execute(
                "SELECT COUNT(*) FROM object_detections WHERE camera_id=? AND timestamp BETWEEN ? AND ?",
                (cid, dt_from, dt_to)).fetchone()[0]
            auth_cnt = conn.execute(
                "SELECT COUNT(*) FROM face_detections fd"
                " JOIN persons p ON fd.person_id=p.id"
                " WHERE fd.camera_id=? AND fd.timestamp BETWEEN ? AND ? AND p.authorized=1",
                (cid, dt_from, dt_to)).fetchone()[0]
            unk_cnt = conn.execute(
                "SELECT COUNT(*) FROM face_detections"
                " WHERE camera_id=? AND timestamp BETWEEN ? AND ? AND person_id IS NULL",
                (cid, dt_from, dt_to)).fetchone()[0]
            top_objects = conn.execute(
                "SELECT class_name, COUNT(*) as cnt FROM object_detections"
                " WHERE camera_id=? AND timestamp BETWEEN ? AND ?"
                " GROUP BY class_name ORDER BY cnt DESC LIMIT 5",
                (cid, dt_from, dt_to)).fetchall()
            cameras_stats.append({
                **dict(cam),
                'face_detections':     face_cnt,
                'object_detections':   obj_cnt,
                'authorized_persons':  auth_cnt,
                'unknown_persons':     unk_cnt,
                'top_objects':         [dict(r) for r in top_objects],
            })

        fd_query = (
            "SELECT fd.id, fd.timestamp, fd.confidence, fd.face_count,"
            "       c.name AS camera_name, c.location AS camera_location,"
            "       p.name AS person_name, p.employee_id, p.role, p.department,"
            "       p.authorized"
            " FROM face_detections fd"
            " JOIN cameras c ON fd.camera_id = c.id"
            " LEFT JOIN persons p ON fd.person_id = p.id"
            " WHERE fd.timestamp BETWEEN ? AND ?"
        )
        fd_params = [dt_from, dt_to]
        if camera_id:
            fd_query  += " AND fd.camera_id = ?"
            fd_params.append(camera_id)
        fd_query += " ORDER BY fd.timestamp DESC LIMIT 300"
        face_detections = [dict(r) for r in conn.execute(fd_query, fd_params).fetchall()]

        top_persons = [dict(r) for r in conn.execute(
            "SELECT p.name, p.employee_id, p.role, p.department, p.authorized,"
            "       COUNT(fd.id) AS appearances"
            " FROM face_detections fd JOIN persons p ON fd.person_id = p.id"
            " WHERE fd.timestamp BETWEEN ? AND ?"
            " GROUP BY fd.person_id ORDER BY appearances DESC LIMIT 20",
            (dt_from, dt_to)).fetchall()]

        od_query = (
            "SELECT od.id, od.timestamp, od.class_name, od.confidence,"
            "       c.name AS camera_name, c.location AS camera_location"
            " FROM object_detections od JOIN cameras c ON od.camera_id = c.id"
            " WHERE od.timestamp BETWEEN ? AND ?"
        )
        od_params = [dt_from, dt_to]
        if camera_id:
            od_query  += " AND od.camera_id = ?"
            od_params.append(camera_id)
        od_query += " ORDER BY od.timestamp DESC LIMIT 300"
        object_detections = [dict(r) for r in conn.execute(od_query, od_params).fetchall()]

        top_classes = [dict(r) for r in conn.execute(
            "SELECT class_name, COUNT(*) as cnt FROM object_detections od"
            " WHERE od.timestamp BETWEEN ? AND ?"
            + (" AND od.camera_id = ?" if camera_id else "")
            + " GROUP BY class_name ORDER BY cnt DESC LIMIT 10",
            od_params).fetchall()]

        sensor_summary = [dict(r) for r in conn.execute(
            "SELECT device_id,"
            "       ROUND(AVG(temperature),1) AS avg_temp,"
            "       ROUND(MIN(temperature),1) AS min_temp,"
            "       ROUND(MAX(temperature),1) AS max_temp,"
            "       ROUND(AVG(humidity),1)    AS avg_hum,"
            "       SUM(CASE WHEN motion=1 THEN 1 ELSE 0 END) AS motion_events,"
            "       COUNT(*) AS reading_count"
            " FROM readings WHERE timestamp BETWEEN ? AND ?"
            " GROUP BY device_id ORDER BY device_id",
            (dt_from, dt_to)).fetchall()]

        sensor_readings = [dict(r) for r in conn.execute(
            "SELECT id,device_id,timestamp,temperature,humidity,gas,mic,motion,ai_score,alert_type"
            " FROM readings WHERE timestamp BETWEEN ? AND ?"
            " ORDER BY timestamp DESC LIMIT 200",
            (dt_from, dt_to)).fetchall()]

        persons = [dict(r) for r in conn.execute(
            "SELECT id, name, employee_id, role, department, authorized, created_at"
            " FROM persons ORDER BY name").fetchall()]

        devices = [dict(r) for r in conn.execute(
            "SELECT device_id, location, lat, lng, status, trained_at, last_seen"
            " FROM devices").fetchall()]

        return jsonify({
            'success': True,
            'data': {
                'generated_at': datetime.now().isoformat(),
                'date_range': {'from': dt_from, 'to': dt_to},
                'camera_filter': camera_id,
                'summary': {
                    'total_alerts':           total_alerts,
                    'critical_alerts':        critical_alerts,
                    'high_alerts':            high_alerts,
                    'total_readings':         total_readings,
                    'total_cameras':          total_cameras,
                    'total_persons':          total_persons,
                    'total_face_detections':  total_face_detections,
                    'authorized_detections':  authorized_detections,
                    'unknown_detections':     unknown_detections,
                    'total_object_detections': total_objects,
                },
                'alert_type_counts':  alert_type_counts,
                'severity_counts':    severity_counts,
                'hourly_alerts':      hourly_alerts,
                'alerts':             alerts,
                'cameras':            cameras_stats,
                'face_detections':    face_detections,
                'top_persons':        top_persons,
                'object_detections':  object_detections,
                'top_classes':        top_classes,
                'sensor_summary':     sensor_summary,
                'sensor_readings':    sensor_readings,
                'persons':            persons,
                'devices':            devices,
            },
        })
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500
    finally:
        conn.close()

@bp.route('/api/face-detections')
def get_face_detections():
    camera_id    = request.args.get('camera_id', type=int)
    person_id    = request.args.get('person_id', type=int)
    hours        = request.args.get('hours', 24, type=int)
    unknown_only = request.args.get('unknown_only', 'false').lower() == 'true'
    limit        = request.args.get('limit', 100, type=int)

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
