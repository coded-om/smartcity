
import json
import os
import pickle
import sqlite3
import threading
import time
import requests
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
from PIL import Image
from concurrent.futures import ThreadPoolExecutor

try:
    import cv2
    CV2_AVAILABLE = True
except Exception as e:
    print(f"[WARN]  OpenCV not available: {e}")
    cv2 = None
    CV2_AVAILABLE = False

try:
    import face_recognition
    FACE_RECOGNITION_AVAILABLE = True
except Exception as e:
    print(f"[WARN]  Face recognition not available: {e}")
    print("   To enable face recognition, install: pip install face-recognition")
    FACE_RECOGNITION_AVAILABLE = False
    face_recognition = None

_face_recognition_threads: Dict[int, threading.Thread] = {}
_thread_stop_flags: Dict[int, threading.Event] = {}
_encoding_cache: Dict[int, np.ndarray] = {}
_cache_lock = threading.Lock()

_FR_WORKERS = max(2, int(os.getenv('FR_WORKER_THREADS', '4')))
_frame_executor = ThreadPoolExecutor(max_workers=_FR_WORKERS, thread_name_prefix='fr_worker')
_pending_futures: Dict[int, object] = {}
_pending_futures_lock = threading.Lock()

DB_PATH = Path(__file__).parent / 'sensors.db'
DATA_DIR = Path(__file__).parent / 'data'
PERSONS_PHOTOS_DIR = DATA_DIR / 'persons' / 'photos'
PERSONS_ENCODINGS_DIR = DATA_DIR / 'persons' / 'encodings'
DETECTIONS_DIR = DATA_DIR / 'detections'

FACE_MATCH_THRESHOLD = 0.6  # Lower = stricter matching (range 0.0-1.0)
FACE_DETECTION_MODEL = 'hog'  # 'hog' (fast, CPU) or 'cnn' (accurate, GPU)

FACE_RECOGNITION_MODE = os.getenv('FACE_RECOGNITION_MODE', 'auto').strip().lower()
_HAAR_CASCADE = None

FACE_RECOGNITION_PROVIDER = os.getenv('FACE_RECOGNITION_PROVIDER', '').strip().lower()
LUXAND_API_URL = os.getenv('LUXAND_API_URL', 'https://api.luxand.cloud').rstrip('/')
LUXAND_TOKEN = os.getenv('LUXAND_TOKEN', '').strip()
LUXAND_TIMEOUT_SECS = int(os.getenv('LUXAND_TIMEOUT_SECS', '10'))

def _check_face_recognition_available():
    if not FACE_RECOGNITION_AVAILABLE:
        raise RuntimeError("Face recognition not available. Install: pip install face-recognition")

def _cloud_provider_enabled() -> bool:
    return FACE_RECOGNITION_PROVIDER == 'luxand' and bool(LUXAND_TOKEN)

def _cloud_recognition_active() -> bool:
    return FACE_RECOGNITION_AVAILABLE or _cloud_provider_enabled()

def _local_analysis_active() -> bool:
    opencv_modes = ('opencv', 'local', 'haar')
    if FACE_RECOGNITION_MODE in opencv_modes:
        return CV2_AVAILABLE
    if FACE_RECOGNITION_MODE == 'auto':
        return not FACE_RECOGNITION_AVAILABLE and CV2_AVAILABLE
    return False

def face_analysis_active() -> bool:
    return _local_analysis_active() or FACE_RECOGNITION_AVAILABLE or _cloud_provider_enabled()

def identity_analytics_active() -> bool:
    return FACE_RECOGNITION_AVAILABLE or _cloud_provider_enabled()

def _luxand_headers() -> dict:
    return {'token': LUXAND_TOKEN}

def _parse_json_response(resp: requests.Response) -> dict:
    try:
        return resp.json()
    except Exception:
        text = (resp.text or '').strip()
        raise RuntimeError(f"Cloud provider returned non-JSON response: {text[:300]}")

def _extract_cloud_candidates(payload) -> List[dict]:
    if payload is None:
        return []

    if isinstance(payload, list):
        return [p for p in payload if isinstance(p, dict)]

    if isinstance(payload, dict):
        for key in ('results', 'faces', 'matches', 'data'):
            value = payload.get(key)
            if isinstance(value, list):
                return [p for p in value if isinstance(p, dict)]
        return [payload]

    return []

def _extract_cloud_label(candidate: dict) -> Optional[str]:
    for key in ('subject', 'name', 'person', 'person_id', 'uuid', 'id'):
        value = candidate.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return None

def _extract_cloud_confidence(candidate: dict) -> float:
    for key in ('probability', 'similarity', 'confidence', 'score'):
        value = candidate.get(key)
        if value is None:
            continue
        try:
            f = float(value)
            return f / 100.0 if f > 1.0 else f
        except Exception:
            continue
    return 0.0

def _map_cloud_label_to_person(label: Optional[str]) -> Tuple[Optional[int], Optional[str]]:
    if not label:
        return None, None

    conn = get_db()
    try:
        person = conn.execute(
            """SELECT id, name FROM persons
               WHERE cloud_subject=? OR employee_id=? OR face_encoding_path=?
               LIMIT 1""",
            (label, label, f"cloud:{label}")
        ).fetchone()
        if not person:
            return None, None
        return person['id'], person['name']
    finally:
        conn.close()

def _luxand_enroll_subject(subject: str, photo_path: str) -> Tuple[bool, str, Optional[str]]:
    try:
        create_resp = requests.post(
            f"{LUXAND_API_URL}/subject",
            headers=_luxand_headers(),
            json={'name': subject},
            timeout=LUXAND_TIMEOUT_SECS,
        )
        if create_resp.status_code not in (200, 201, 409):
            data = _parse_json_response(create_resp)
            raise RuntimeError(data.get('error') or data.get('message') or str(data))

        create_data = _parse_json_response(create_resp)
        attach_id = create_data.get('id') or create_data.get('uuid') or subject

        with open(photo_path, 'rb') as photo_file:
            attach_resp = requests.post(
                f"{LUXAND_API_URL}/subject/{attach_id}",
                headers=_luxand_headers(),
                files={'photo': photo_file},
                timeout=LUXAND_TIMEOUT_SECS,
            )

        if attach_resp.status_code not in (200, 201):
            data = _parse_json_response(attach_resp)
            raise RuntimeError(data.get('error') or data.get('message') or str(data))

        data = _parse_json_response(attach_resp)
        if isinstance(data, dict) and str(data.get('status', '')).lower() == 'failure':
            raise RuntimeError(data.get('message') or data.get('error') or 'Cloud provider reported failure')

        cloud_id = create_data.get('uuid') or create_data.get('id') or data.get('uuid') or data.get('id') or str(attach_id)
        return True, 'Enrolled in cloud provider', str(cloud_id)

    except Exception as e:
        return False, f"Cloud enrollment failed: {e}", None

def _luxand_search_photo(photo_path: str) -> List[dict]:
    last_error = None
    delays = [0.1, 0.25, 0.5, 1.0]

    for attempt, delay in enumerate(delays, 1):
        try:
            with open(photo_path, 'rb') as photo_file:
                resp = requests.post(
                    f"{LUXAND_API_URL}/photo/search",
                    headers=_luxand_headers(),
                    files={'photo': photo_file},
                    timeout=LUXAND_TIMEOUT_SECS,
                )

            if resp.status_code not in (200, 201):
                data = _parse_json_response(resp)
                raise RuntimeError(data.get('error') or data.get('message') or str(data))

            payload = _parse_json_response(resp)
            if isinstance(payload, dict) and str(payload.get('status', '')).lower() == 'failure':
                raise RuntimeError(payload.get('message') or payload.get('error') or 'Cloud provider reported failure')

            return _extract_cloud_candidates(payload)
        except Exception as e:
            last_error = e
            if attempt < len(delays):
                print(f"[Retrain] Luxand search retry {attempt}/{len(delays)} after {delay*1000:.0f}ms (error: {str(e)[:60]}...)")
                time.sleep(delay)
            else:
                print(f"[ERROR] Luxand search failed after {len(delays)} retries: {str(e)[:100]}")

    raise RuntimeError(str(last_error) if last_error else 'Unknown cloud search error')

def _get_haar_cascade():
    global _HAAR_CASCADE
    if not CV2_AVAILABLE:
        return None
    if _HAAR_CASCADE is None:
        cascade_path = Path(cv2.data.haarcascades) / 'haarcascade_frontalface_default.xml'
        _HAAR_CASCADE = cv2.CascadeClassifier(str(cascade_path))
        if _HAAR_CASCADE.empty():
            raise RuntimeError(f"Failed to load Haar cascade from {cascade_path}")
    return _HAAR_CASCADE

def _normalize_bbox(left: int, top: int, right: int, bottom: int, width: int, height: int) -> dict:
    if width <= 0 or height <= 0:
        return {
            'left': 0.0,
            'top': 0.0,
            'right': 0.0,
            'bottom': 0.0,
        }

    return {
        'left': round(max(0, left) / width, 4),
        'top': round(max(0, top) / height, 4),
        'right': round(min(width, right) / width, 4),
        'bottom': round(min(height, bottom) / height, 4),
    }

def _process_camera_frame_local(camera_id: int, frame_path: str) -> List[dict]:
    if not CV2_AVAILABLE:
        return []

    image = cv2.imread(frame_path)
    if image is None:
        raise RuntimeError(f"Unable to read frame image: {frame_path}")

    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)

    cascade = _get_haar_cascade()
    if cascade is None:
        return []

    faces = cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(40, 40),
    )

    if len(faces) == 0:
        return []

    camera_detections_dir = DETECTIONS_DIR / f"cam_{camera_id}"
    camera_detections_dir.mkdir(parents=True, exist_ok=True)

    annotated = image.copy()
    boxes = []
    for (x, y, w, h) in faces:
        left, top, right, bottom = int(x), int(y), int(x + w), int(y + h)
        boxes.append(_normalize_bbox(left, top, right, bottom, width, height))

        cv2.rectangle(annotated, (left, top), (right, bottom), (0, 255, 0), 3)
        label_y = max(22, top - 10)
        cv2.rectangle(annotated, (left, label_y - 18), (left + 150, label_y + 4), (0, 128, 0), -1)
        cv2.putText(
            annotated,
            'FACE DETECTED',
            (left + 8, label_y - 4),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (255, 255, 255),
            1,
            cv2.LINE_AA,
        )

    timestamp_str = datetime.now().strftime('%Y%m%d_%H%M%S')
    snapshot_filename = f"face_{timestamp_str}.jpg"
    snapshot_path = camera_detections_dir / snapshot_filename
    cv2.imwrite(str(snapshot_path), annotated)

    detection = {
        'person_id': None,
        'person_name': None,
        'confidence': 0.99,
        'bbox': boxes[0] if len(boxes) == 1 else boxes,
        'bbox_json': json.dumps(boxes),
        'snapshot_path': str(snapshot_path),
        'analysis_method': 'opencv',
        'analysis_label': 'Face detected',
        'face_count': len(boxes),
        'frame_width': width,
        'frame_height': height,
    }

    conn = get_db()
    try:
        conn.execute(
            """INSERT INTO face_detections
               (camera_id, person_id, confidence, snapshot_path, bbox_json,
                frame_width, frame_height, analysis_method, face_count, timestamp)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
            (
                camera_id,
                detection['person_id'],
                detection['confidence'],
                detection['snapshot_path'],
                detection['bbox_json'],
                detection['frame_width'],
                detection['frame_height'],
                detection['analysis_method'],
                detection['face_count'],
            )
        )
        conn.commit()
    finally:
        conn.close()

    return [detection]

def get_db():
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn

def _to_db_datetime(dt: datetime) -> str:
    return dt.strftime('%Y-%m-%d %H:%M:%S')

def extract_face_encoding(image_path: str) -> Optional[Tuple[np.ndarray, dict]]:
    _check_face_recognition_available()

    try:
        image = face_recognition.load_image_file(image_path)
        face_locations = face_recognition.face_locations(image, model=FACE_DETECTION_MODEL)

        if not face_locations:
            return None

        if len(face_locations) > 1:
            print(f"[WARN]  {len(face_locations)} faces in {image_path}, using first")

        encodings = face_recognition.face_encodings(image, face_locations)
        if not encodings:
            return None

        metadata = {
            'num_faces': len(face_locations),
            'face_locations': face_locations,
            'resolution': image.shape[:2],
        }
        return encodings[0], metadata

    except Exception as e:
        print(f"[ERROR] Error extracting face encoding from {image_path}: {e}")
        return None

def save_encoding(encoding: np.ndarray, file_path: str) -> None:
    Path(file_path).parent.mkdir(parents=True, exist_ok=True)
    with open(file_path, 'wb') as f:
        pickle.dump(encoding, f)

def load_encoding(file_path: str) -> Optional[np.ndarray]:
    try:
        with open(file_path, 'rb') as f:
            return pickle.load(f)
    except Exception as e:
        print(f"[ERROR] Error loading encoding from {file_path}: {e}")
        return None

def register_person(name: str, employee_id: str, photo_file,
                   role: str = None, department: str = None,
                   notes: str = None, authorized: int = 1) -> Tuple[bool, str, Optional[int]]:
    """
    Register a new person with face encoding.

    Args:
        name: Full name
        employee_id: Unique employee ID
        photo_file: File object or path to photo
        role: Job role
        department: Department name
        notes: Additional notes
        authorized: 1=authorized, 0=unauthorized

    Returns:
        (success, message, person_id) tuple
    """
    try:
        conn = get_db()

        existing = conn.execute(
            "SELECT id FROM persons WHERE employee_id=?", (employee_id,)
        ).fetchone()

        if existing:
            conn.close()
            return False, f"Employee ID '{employee_id}' already exists", None

        cursor = conn.execute(
            """INSERT INTO persons (name, employee_id, role, department, notes, authorized)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (name, employee_id, role, department, notes, authorized)
        )
        person_id = cursor.lastrowid
        conn.commit()

        photo_path = PERSONS_PHOTOS_DIR / f"person_{person_id}.jpg"

        if hasattr(photo_file, 'save'):
            photo_file.save(str(photo_path))
        elif isinstance(photo_file, (str, Path)):
            import shutil
            shutil.copy(photo_file, photo_path)
        else:
            with open(photo_path, 'wb') as f:
                f.write(photo_file.read())

        if _local_analysis_active():
            conn.execute(
                """UPDATE persons
                   SET photo_path=?, face_encoding_path=NULL, cloud_subject=NULL, updated_at=CURRENT_TIMESTAMP
                   WHERE id=?""",
                (str(photo_path), person_id)
            )
            conn.commit()
            conn.close()
            print(
                f"[OK] Registered person for local analysis: {name} "
                f"(ID: {employee_id}, person_id: {person_id})"
            )
            return True, f"Successfully registered {name} (local analysis enabled)", person_id

        if not FACE_RECOGNITION_AVAILABLE and _cloud_provider_enabled():
            cloud_subject = employee_id
            success, cloud_msg, cloud_id = _luxand_enroll_subject(cloud_subject, str(photo_path))

            if success:
                conn.execute(
                    """UPDATE persons
                       SET photo_path=?, face_encoding_path=?, cloud_subject=?, updated_at=CURRENT_TIMESTAMP
                       WHERE id=?""",
                    (str(photo_path), f"cloud:{cloud_id}", cloud_subject, person_id)
                )
                conn.commit()
                conn.close()
                print(
                    f"[OK] Registered person with cloud recognition: {name} "
                    f"(ID: {employee_id}, person_id: {person_id}, cloud_subject: {cloud_subject})"
                )
                return True, f"Successfully registered {name} (cloud recognition enabled)", person_id

            conn.execute(
                """UPDATE persons
                   SET photo_path=?, face_encoding_path=NULL, cloud_subject=NULL, updated_at=CURRENT_TIMESTAMP
                   WHERE id=?""",
                (str(photo_path), person_id)
            )
            conn.commit()
            conn.close()
            print(
                f"[WARN]  Registered person without cloud enrollment: {name} "
                f"(ID: {employee_id}, person_id: {person_id})  {cloud_msg}"
            )
            return True, f"Successfully registered {name} (photo saved; {cloud_msg})", person_id

        if not FACE_RECOGNITION_AVAILABLE:
            conn.execute(
                """UPDATE persons
                   SET photo_path=?, face_encoding_path=NULL, cloud_subject=NULL, updated_at=CURRENT_TIMESTAMP
                   WHERE id=?""",
                (str(photo_path), person_id)
            )
            conn.commit()
            conn.close()
            print(
                f"[OK] Registered person without face recognition: {name} "
                f"(ID: {employee_id}, person_id: {person_id})"
            )
            return True, f"Successfully registered {name} (photo saved; face recognition unavailable)", person_id

        result = extract_face_encoding(str(photo_path))

        if result is None:
            conn.execute("DELETE FROM persons WHERE id=?", (person_id,))
            conn.commit()
            conn.close()
            photo_path.unlink(missing_ok=True)
            return False, "No face detected in photo. Please upload a clear face image.", None

        encoding, metadata = result

        if metadata['num_faces'] > 1:
            conn.execute("DELETE FROM persons WHERE id=?", (person_id,))
            conn.commit()
            conn.close()
            photo_path.unlink(missing_ok=True)
            return False, f"Multiple faces ({metadata['num_faces']}) detected. Please upload a photo with only one face.", None

        encoding_path = PERSONS_ENCODINGS_DIR / f"person_{person_id}.pkl"
        save_encoding(encoding, str(encoding_path))

        conn.execute(
            """UPDATE persons
               SET photo_path=?, face_encoding_path=?, cloud_subject=NULL, updated_at=CURRENT_TIMESTAMP
               WHERE id=?""",
            (str(photo_path), str(encoding_path), person_id)
        )
        conn.commit()
        conn.close()

        _reload_encoding_cache()

        print(f"[OK] Registered person: {name} (ID: {employee_id}, person_id: {person_id})")
        return True, f"Successfully registered {name}", person_id

    except Exception as e:
        print(f"[ERROR] Error registering person: {e}")
        return False, f"Error: {str(e)}", None

def _reload_encoding_cache() -> None:
    global _encoding_cache

    with _cache_lock:
        _encoding_cache.clear()

        conn = get_db()
        persons = conn.execute(
            "SELECT id, face_encoding_path FROM persons WHERE face_encoding_path IS NOT NULL"
        ).fetchall()
        conn.close()

        for person in persons:
            encoding_path = person['face_encoding_path']
            if not encoding_path or encoding_path.startswith('cloud:'):
                continue
            encoding = load_encoding(encoding_path)
            if encoding is not None:
                _encoding_cache[person['id']] = encoding

        print(f"[Retrain] Loaded {len(_encoding_cache)} face encodings into cache")

def match_face(face_encoding: np.ndarray, threshold: float = None) -> Tuple[Optional[int], float]:
    if threshold is None:
        threshold = FACE_MATCH_THRESHOLD

    if not _encoding_cache:
        _reload_encoding_cache()

    if not _encoding_cache:
        return None, 0.0

    known_ids = list(_encoding_cache.keys())
    known_encodings = [_encoding_cache[pid] for pid in known_ids]
    distances = face_recognition.face_distance(known_encodings, face_encoding)

    min_idx = int(np.argmin(distances))
    min_dist = distances[min_idx]

    if min_dist <= threshold:
        return known_ids[min_idx], round(1.0 - float(min_dist), 4)

    return None, 0.0

def process_camera_frame(camera_id: int, frame_path: str) -> List[dict]:
    detections = []

    if _local_analysis_active():
        return _process_camera_frame_local(camera_id, frame_path)

    if not FACE_RECOGNITION_AVAILABLE:
        if _cloud_provider_enabled():
            return _process_camera_frame_cloud(camera_id, frame_path)
        return []

    try:
        image = face_recognition.load_image_file(frame_path)
        orig_height, orig_width = image.shape[:2]

        small = image[::2, ::2]   # stride-2 slice  no extra memory copy
        SCALE = 2                 # factor to multiply coords back up

        face_locations_small = face_recognition.face_locations(small, model=FACE_DETECTION_MODEL)

        if len(face_locations_small) == 0:
            return []  # No faces detected

        face_locations = [
            (top * SCALE, right * SCALE, bottom * SCALE, left * SCALE)
            for (top, right, bottom, left) in face_locations_small
        ]

        encodings = face_recognition.face_encodings(image, face_locations)

        boxes = [
            _normalize_bbox(left, top, right, bottom, orig_width, orig_height)
            for (top, right, bottom, left) in face_locations
        ]
        bbox_json = json.dumps(boxes)

        camera_detections_dir = DETECTIONS_DIR / f"cam_{camera_id}"
        camera_detections_dir.mkdir(parents=True, exist_ok=True)

        person_cache: Dict[int, dict] = {}

        for i, (encoding, bbox) in enumerate(zip(encodings, face_locations)):
            person_id, confidence = match_face(encoding)

            top, right, bottom, left = bbox
            face_image = image[max(0, top):bottom, max(0, left):right]
            pil_image = Image.fromarray(face_image)

            timestamp_str = datetime.now().strftime('%Y%m%d_%H%M%S_%f')
            snapshot_filename = f"face_{timestamp_str}_{i}.jpg"
            snapshot_path = camera_detections_dir / snapshot_filename
            pil_image.save(str(snapshot_path), quality=85)

            person_info: dict = {}
            if person_id:
                if person_id not in person_cache:
                    conn = get_db()
                    row = conn.execute(
                        "SELECT name, employee_id, role, department, authorized FROM persons WHERE id=?",
                        (person_id,)
                    ).fetchone()
                    conn.close()
                    person_cache[person_id] = dict(row) if row else {}
                person_info = person_cache.get(person_id, {})

            detections.append({
                'person_id': person_id,
                'person_name': person_info.get('name'),
                'person_employee_id': person_info.get('employee_id'),
                'person_role': person_info.get('role'),
                'person_department': person_info.get('department'),
                'person_authorized': person_info.get('authorized'),
                'confidence': confidence,
                'bbox': bbox,
                'bbox_json': bbox_json,
                'frame_width': orig_width,
                'frame_height': orig_height,
                'analysis_method': 'face_recognition',
                'face_count': len(face_locations),
                'snapshot_path': str(snapshot_path),
            })

        conn = get_db()
        for det in detections:
            conn.execute(
                """INSERT INTO face_detections
                   (camera_id, person_id, confidence, snapshot_path, bbox_json,
                    frame_width, frame_height, analysis_method, face_count, timestamp)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
                (
                    camera_id,
                    det['person_id'],
                    det['confidence'],
                    det['snapshot_path'],
                    det['bbox_json'],
                    det['frame_width'],
                    det['frame_height'],
                    det['analysis_method'],
                    det['face_count'],
                )
            )
        conn.commit()
        conn.close()

        return detections

    except Exception as e:
        print(f"[ERROR] Error processing frame from camera {camera_id}: {e}")
        return []

def _process_camera_frame_cloud(camera_id: int, frame_path: str) -> List[dict]:
    detections = []

    try:
        candidates = _luxand_search_photo(frame_path)
        if not candidates:
            return []

        camera_detections_dir = DETECTIONS_DIR / f"cam_{camera_id}"
        camera_detections_dir.mkdir(parents=True, exist_ok=True)

        frame_img = Image.open(frame_path)

        for i, cand in enumerate(candidates):
            label = _extract_cloud_label(cand)
            confidence = _extract_cloud_confidence(cand)
            person_id, person_name = _map_cloud_label_to_person(label)

            timestamp_str = datetime.now().strftime('%Y%m%d_%H%M%S')
            snapshot_filename = f"face_{timestamp_str}_{i}.jpg"
            snapshot_path = camera_detections_dir / snapshot_filename
            frame_img.save(str(snapshot_path))

            detections.append({
                'person_id': person_id,
                'person_name': person_name,
                'confidence': confidence,
                'bbox': None,
                'snapshot_path': str(snapshot_path),
                'cloud_label': label,
                'analysis_method': 'cloud',
                'face_count': 1,
            })

        conn = get_db()
        for det in detections:
            conn.execute(
                """INSERT INTO face_detections
                   (camera_id, person_id, confidence, snapshot_path, analysis_method, face_count, timestamp)
                   VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
                (camera_id, det['person_id'], det['confidence'], det['snapshot_path'], det.get('analysis_method'), det.get('face_count', 1))
            )
        conn.commit()
        conn.close()

        return detections

    except Exception as e:
        print(f"[ERROR] Error processing cloud frame from camera {camera_id}: {e}")
        return []

def _process_and_handle(camera_id: int, camera_name: str,
                         temp_frame_path: str, detect_objects_fn) -> None:
    """
    Heavy processing submitted to _frame_executor:
      - Face recognition / local analysis
      - Object detection (YOLO)
      - Threat analysis (Optical Flow + weapon check)
      - Alert triggering + WebSocket emit
    Runs in a worker thread so the capture loop is never blocked.
    The temp file is deleted when processing finishes.
    """
    try:
        try:
            from socketio_instance import socketio as _sio
        except Exception:
            _sio = None

        try:
            import threat_detector as _td
            import cv2 as _cv2
        except Exception:
            _td = None
            _cv2 = None

        method = 'opencv' if _local_analysis_active() else 'dlib'
        detections = process_camera_frame(camera_id, temp_frame_path)
        if detections:
            print(f"  cam {camera_id} [{method}]: {len(detections)} face(s) found")
        else:
            print(f" cam {camera_id} [{method}]: no face")

        weapon_detections = []
        if detect_objects_fn is not None:
            try:
                obj_results = detect_objects_fn(temp_frame_path)
                if obj_results:
                    conn = get_db()
                    for obj in obj_results:
                        conn.execute(
                            """INSERT INTO object_detections
                               (camera_id, class_name, confidence, bbox_json,
                                frame_width, frame_height, timestamp)
                               VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
                            (
                                camera_id,
                                obj['class_name'],
                                obj['confidence'],
                                obj['bbox_json'],
                                obj.get('frame_width'),
                                obj.get('frame_height'),
                            )
                        )
                        print(f" Object detected: {obj['class_name']} "
                              f"({obj['confidence']:.0%}) cam={camera_id}")
                        if obj.get('class_name', '').lower() in \
                                {'knife', 'gun', 'pistol', 'rifle', 'scissors'}:
                            weapon_detections.append(obj)
                            if _sio:
                                try:
                                    _sio.emit('weapon_detected', {
                                        'camera_id':   camera_id,
                                        'camera_name': camera_name,
                                        'class_name':  obj['class_name'],
                                        'confidence':  obj['confidence'],
                                        'bbox_json':   obj['bbox_json'],
                                        'timestamp':   datetime.now().isoformat(),
                                    })
                                except Exception:
                                    pass
                    conn.commit()
                    conn.close()
            except Exception as _oe:
                print(f"[WARN]  Object detection error cam {camera_id}: {_oe}")

        if _td is not None and _cv2 is not None:
            try:
                frame_bgr = _cv2.imread(temp_frame_path)
                if frame_bgr is not None:
                    threat = _td.analyze_frame(camera_id, frame_bgr, weapon_detections)
                    if threat:
                        print(f"[ALERT] THREAT cam {camera_id}: {threat['threat_type']} "
                              f"({threat['confidence']:.0%}) [{threat['source']}]")
                        if _sio:
                            try:
                                _sio.emit('threat_detected', {
                                    'camera_id':    camera_id,
                                    'camera_name':  camera_name,
                                    'threat_type':  threat['threat_type'],
                                    'confidence':   threat['confidence'],
                                    'severity':     threat['severity'],
                                    'source':       threat['source'],
                                    'weapon_class': threat.get('weapon_class'),
                                    'bbox_json':    threat.get('bbox_json'),
                                    'snapshot_path': threat.get('snapshot_path'),
                                    'timestamp':    threat['timestamp'],
                                })
                            except Exception:
                                pass
            except Exception as _te:
                print(f"[WARN]  Threat analysis error cam {camera_id}: {_te}")

        for det in detections:
            if det.get('analysis_method') == 'opencv':
                print(
                    f" Local face detected on camera {camera_id} "
                    f"({det.get('face_count', 1)} face(s))"
                )
                if _sio:
                    try:
                        _sio.emit('face_detected', {
                            'camera_id':   camera_id,
                            'camera_name': camera_name,
                            'person_id':   None,
                            'person_name': None,
                            'authorized':  None,
                            'confidence':  det.get('confidence', 0.99),
                            'bbox_json':   det.get('bbox_json'),
                            'face_count':  det.get('face_count', 1),
                            'method':      'opencv',
                            'timestamp':   datetime.now().isoformat(),
                        })
                    except Exception:
                        pass
                continue
            if det['person_id'] is None:
                _trigger_unknown_face_alert(camera_id, camera_name, det)
            else:
                auth = " AUTHORIZED" if det.get('person_authorized') else " UNAUTHORIZED"
                print(f" Detected: {det['person_name']} [{auth}] "
                      f"confidence={det['confidence']:.2f}")
            if _sio:
                try:
                    _sio.emit('face_detected', {
                        'camera_id':   camera_id,
                        'camera_name': camera_name,
                        'person_id':   det.get('person_id'),
                        'person_name': det.get('person_name'),
                        'authorized':  det.get('person_authorized'),
                        'confidence':  det.get('confidence', 0),
                        'bbox_json':   det.get('bbox_json'),
                        'face_count':  det.get('face_count', 1),
                        'method':      det.get('analysis_method', 'dlib'),
                        'timestamp':   datetime.now().isoformat(),
                    })
                except Exception:
                    pass

    except Exception as e:
        print(f"[ERROR] Error in frame processing for camera {camera_id}: {e}")
    finally:
        try:
            Path(temp_frame_path).unlink(missing_ok=True)
        except Exception:
            pass

def start_face_recognition_loop(camera_id: int, interval: int = 5):
    stop_face_recognition_loop(camera_id)

    stop_flag = threading.Event()
    _thread_stop_flags[camera_id] = stop_flag

    def recognition_loop():
        if _local_analysis_active():
            print(f"[FR] Started local face analysis for camera {camera_id} (interval: {interval}s)")
        else:
            print(f"[FR] Started face recognition for camera {camera_id} (interval: {interval}s)")

        try:
            from recorder import CameraRecorder
            recorder = CameraRecorder()
        except Exception as e:
            print(f"[ERROR] Cannot start face recognition for camera {camera_id}: {e}")
            return

        try:
            from object_detector import detect_objects as _detect_objects
        except Exception:
            _detect_objects = None

        while not stop_flag.is_set():
            try:
                conn = get_db()
                camera = conn.execute(
                    "SELECT id, name, rtsp_url, type FROM cameras WHERE id=? AND enabled=1",
                    (camera_id,)
                ).fetchone()
                conn.close()

                if not camera:
                    print(f"[WARN]  Camera {camera_id} not found or disabled, stopping recognition")
                    break

                with _pending_futures_lock:
                    prev = _pending_futures.get(camera_id)
                    if prev is not None and not prev.done():
                        stop_flag.wait(interval)
                        continue

                snapshot_data = recorder.capture_snapshot_by_camera_id(camera_id)

                if snapshot_data:
                    temp_frame_path = DETECTIONS_DIR / f"temp_cam_{camera_id}_{time.monotonic_ns()}.jpg"
                    with open(temp_frame_path, 'wb') as f:
                        f.write(snapshot_data)

                    with _pending_futures_lock:
                        future = _frame_executor.submit(
                            _process_and_handle,
                            camera_id,
                            camera['name'],
                            str(temp_frame_path),
                            _detect_objects,
                        )
                        _pending_futures[camera_id] = future

            except Exception as e:
                print(f"[ERROR] Error in face recognition loop for camera {camera_id}: {e}")

            stop_flag.wait(interval)

        print(f" Stopped face recognition for camera {camera_id}")

    thread = threading.Thread(target=recognition_loop, daemon=True)
    thread.start()
    _face_recognition_threads[camera_id] = thread

def stop_face_recognition_loop(camera_id: int) -> None:
    if camera_id in _thread_stop_flags:
        _thread_stop_flags[camera_id].set()
        if camera_id in _face_recognition_threads:
            _face_recognition_threads[camera_id].join(timeout=2.0)
            del _face_recognition_threads[camera_id]
        del _thread_stop_flags[camera_id]
        print(f" Stopped face recognition for camera {camera_id}")

def _trigger_unknown_face_alert(camera_id: int, camera_name: str, detection: dict):
    try:
        conn = get_db()

        conn.execute(
            """INSERT INTO alerts
               (device_id, alert_type, severity, ai_score, video_file, timestamp)
               VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
            (f"camera_{camera_id}", "UNKNOWN_FACE", "MEDIUM", detection['confidence'],
             detection['snapshot_path'])
        )

        conn.execute(
            """UPDATE face_detections
               SET alert_created=1
               WHERE snapshot_path=?""",
            (detection['snapshot_path'],)
        )

        conn.commit()
        conn.close()

        print(f"[WARN]  ALERT: Unknown face detected at {camera_name}")

    except Exception as e:
        print(f"[ERROR] Error triggering alert: {e}")

def get_person_detections(person_id: int, hours: int = 24) -> List[dict]:
    conn = get_db()
    cutoff = datetime.now() - timedelta(hours=hours)

    detections = conn.execute(
        """SELECT fd.*, c.name as camera_name, c.location
           FROM face_detections fd
           JOIN cameras c ON fd.camera_id = c.id
           WHERE fd.person_id=? AND fd.timestamp >= ?
           ORDER BY fd.timestamp DESC""",
        (person_id, _to_db_datetime(cutoff))
    ).fetchall()

    conn.close()
    return [dict(d) for d in detections]

def get_unknown_faces(hours: int = 24, limit: int = 50) -> List[dict]:
    conn = get_db()
    cutoff = datetime.now() - timedelta(hours=hours)

    detections = conn.execute(
        """SELECT fd.*, c.name as camera_name, c.location
           FROM face_detections fd
           JOIN cameras c ON fd.camera_id = c.id
           WHERE fd.person_id IS NULL AND fd.timestamp >= ?
           ORDER BY fd.timestamp DESC
           LIMIT ?""",
        (_to_db_datetime(cutoff), limit)
    ).fetchall()

    conn.close()
    return [dict(d) for d in detections]

if FACE_RECOGNITION_AVAILABLE:
    _reload_encoding_cache()
    print("[OK] Face recognition engine initialized")
elif _cloud_provider_enabled():
    print("  Cloud face recognition provider enabled (Luxand)")
else:
    print("[WARN]  Face recognition engine disabled (library not available)")
