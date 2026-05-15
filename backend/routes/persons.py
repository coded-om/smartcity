from pathlib import Path

from flask import Blueprint, jsonify, request, send_file

from db import get_db
from state import FACE_RECOGNITION_ENABLED, fre

bp = Blueprint('persons', __name__)

_UPDATABLE_FIELDS = ('name', 'employee_id', 'role', 'department', 'notes', 'authorized')

@bp.route('/api/persons', methods=['GET'])
def get_persons():
    conn = get_db()
    try:
        rows   = conn.execute("SELECT * FROM persons ORDER BY created_at DESC").fetchall()
        result = []
        for p in rows:
            d = dict(p)
            d['photo_url'] = f"/api/persons/{d['id']}/photo" if d.get('photo_path') else None
            result.append(d)
        return jsonify({'success': True, 'data': result})
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500
    finally:
        conn.close()

@bp.route('/api/persons', methods=['POST'])
def create_person():
    try:
        name        = request.form.get('name')
        employee_id = request.form.get('employee_id')
        if not name or not employee_id:
            return jsonify({'success': False, 'error': 'name and employee_id are required'}), 400
        if 'photo' not in request.files or not request.files['photo'].filename:
            return jsonify({'success': False, 'error': 'photo file is required'}), 400

        ok, msg, person_id = fre.register_person(
            name, employee_id, request.files['photo'],
            request.form.get('role'), request.form.get('department'),
            request.form.get('notes'), int(request.form.get('authorized', 1)),
        )
        if not ok:
            return jsonify({'success': False, 'error': msg}), 400

        conn   = get_db()
        person = conn.execute("SELECT * FROM persons WHERE id=?", (person_id,)).fetchone()
        conn.close()
        d = dict(person)
        d['photo_url'] = f"/api/persons/{person_id}/photo"
        return jsonify({'success': True, 'data': d, 'message': msg}), 201
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500

@bp.route('/api/persons/<int:person_id>', methods=['PATCH'])
def update_person(person_id):
    conn = get_db()
    try:
        if 'photo' in request.files:
            conn.execute("DELETE FROM persons WHERE id=?", (person_id,))
            conn.commit()
            ok, msg, new_id = fre.register_person(
                request.form.get('name'), request.form.get('employee_id'),
                request.files['photo'], request.form.get('role'),
                request.form.get('department'), request.form.get('notes'),
                int(request.form.get('authorized', 1)),
            )
            if not ok:
                return jsonify({'success': False, 'error': msg}), 400
            person = conn.execute("SELECT * FROM persons WHERE id=?", (new_id,)).fetchone()
        else:
            data    = request.get_json(force=True) or {}
            updates = [(f, data[f]) for f in _UPDATABLE_FIELDS if f in data]
            if not updates:
                return jsonify({'success': False, 'error': 'No fields to update'}), 400
            cols   = ', '.join(f'{f}=?' for f, _ in updates) + ', updated_at=CURRENT_TIMESTAMP'
            params = [v for _, v in updates] + [person_id]
            conn.execute(f"UPDATE persons SET {cols} WHERE id=?", params)
            conn.commit()
            person = conn.execute("SELECT * FROM persons WHERE id=?", (person_id,)).fetchone()

        if not person:
            return jsonify({'success': False, 'error': 'Person not found'}), 404
        d = dict(person)
        d['photo_url'] = f"/api/persons/{d['id']}/photo"
        return jsonify({'success': True, 'data': d})
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500
    finally:
        conn.close()

@bp.route('/api/persons/<int:person_id>', methods=['DELETE'])
def delete_person(person_id):
    conn = get_db()
    try:
        person = conn.execute("SELECT * FROM persons WHERE id=?", (person_id,)).fetchone()
        if not person:
            return jsonify({'success': False, 'error': 'Person not found'}), 404

        if person['photo_path']:
            Path(person['photo_path']).unlink(missing_ok=True)
        fp = person['face_encoding_path']
        if fp and not str(fp).startswith('cloud:'):
            Path(fp).unlink(missing_ok=True)

        conn.execute("DELETE FROM persons WHERE id=?", (person_id,))
        conn.commit()

        if FACE_RECOGNITION_ENABLED:
            fre._reload_encoding_cache()

        return jsonify({'success': True, 'message': 'Person deleted'})
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500
    finally:
        conn.close()

@bp.route('/api/persons/<int:person_id>/photo')
def get_person_photo(person_id):
    conn = get_db()
    try:
        person = conn.execute(
            "SELECT photo_path FROM persons WHERE id=?", (person_id,)
        ).fetchone()
        if not person or not person['photo_path']:
            return jsonify({'success': False, 'error': 'Photo not found'}), 404
        path = Path(person['photo_path'])
        if not path.exists():
            return jsonify({'success': False, 'error': 'Photo file missing'}), 404
        return send_file(str(path), mimetype='image/jpeg')
    finally:
        conn.close()
