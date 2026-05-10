"""
Face Recognition Engine
=======================

Real-time face detection and recognition for security monitoring.

Features:
- Face detection from camera frames
- Face encoding extraction (128-d vectors)
- Person registration and matching
- Unknown face detection and alerting
- Background processing per camera
- Multi-camera support

Uses face_recognition library (dlib-based) for high accuracy.
"""

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

# Try to import face_recognition - gracefully handle if not available
try:
    import face_recognition
    FACE_RECOGNITION_AVAILABLE = True
except Exception as e:
    print(f"⚠️  Face recognition not available: {e}")
    print("   To enable face recognition, install: pip install face-recognition")
    FACE_RECOGNITION_AVAILABLE = False
    face_recognition = None

# Global storage for background threads
_face_recognition_threads: Dict[int, threading.Thread] = {}
_thread_stop_flags: Dict[int, threading.Event] = {}
_encoding_cache: Dict[int, np.ndarray] = {}
_cache_lock = threading.Lock()


# ═══════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════

DB_PATH = Path(__file__).parent / 'sensors.db'
DATA_DIR = Path(__file__).parent / 'data'
PERSONS_PHOTOS_DIR = DATA_DIR / 'persons' / 'photos'
PERSONS_ENCODINGS_DIR = DATA_DIR / 'persons' / 'encodings'
DETECTIONS_DIR = DATA_DIR / 'detections'

FACE_MATCH_THRESHOLD = 0.6  # Lower = stricter matching (range 0.0-1.0)
FACE_DETECTION_MODEL = 'hog'  # 'hog' (fast, CPU) or 'cnn' (accurate, GPU)

# Cloud provider configuration (Luxand)
FACE_RECOGNITION_PROVIDER = os.getenv('FACE_RECOGNITION_PROVIDER', '').strip().lower()
LUXAND_API_URL = os.getenv('LUXAND_API_URL', 'https://api.luxand.cloud').rstrip('/')
LUXAND_TOKEN = os.getenv('LUXAND_TOKEN', '').strip()
LUXAND_TIMEOUT_SECS = int(os.getenv('LUXAND_TIMEOUT_SECS', '10'))


# ═══════════════════════════════════════════════════════════════
# Database Helpers
# ═══════════════════════════════════════════════════════════════

def _check_face_recognition_available():
    """Check if face recognition is available, raise error if not"""
    if not FACE_RECOGNITION_AVAILABLE:
        raise RuntimeError("Face recognition not available. Install: pip install face-recognition")


def _cloud_provider_enabled() -> bool:
    """Whether cloud recognition provider is enabled and configured."""
    return FACE_RECOGNITION_PROVIDER == 'luxand' and bool(LUXAND_TOKEN)


def _cloud_recognition_active() -> bool:
    """True if either local or cloud recognition can run."""
    return FACE_RECOGNITION_AVAILABLE or _cloud_provider_enabled()


def _luxand_headers() -> dict:
    return {'token': LUXAND_TOKEN}


def _parse_json_response(resp: requests.Response) -> dict:
    """Best-effort JSON parse with readable errors."""
    try:
        return resp.json()
    except Exception:
        text = (resp.text or '').strip()
        raise RuntimeError(f"Cloud provider returned non-JSON response: {text[:300]}")


def _extract_cloud_candidates(payload) -> List[dict]:
    """Normalize multiple possible cloud response shapes into a candidate list."""
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
            # Handle percentage-like values
            return f / 100.0 if f > 1.0 else f
        except Exception:
            continue
    return 0.0


def _map_cloud_label_to_person(label: Optional[str]) -> Tuple[Optional[int], Optional[str]]:
    """Map cloud returned label to local person record."""
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
    """
    Enroll a person photo in Luxand.

    Returns:
        (success, message, cloud_id_or_subject)
    """
    # Luxand flow: create subject, then upload photo to /subject/{id-or-uuid}
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

        # On success, prefer stable subject UUID if available from create response.
        cloud_id = create_data.get('uuid') or create_data.get('id') or data.get('uuid') or data.get('id') or str(attach_id)
        return True, 'Enrolled in cloud provider', str(cloud_id)

    except Exception as e:
        return False, f"Cloud enrollment failed: {e}", None


def _luxand_search_photo(photo_path: str) -> List[dict]:
    """Search for known faces in photo using Luxand cloud with exponential backoff retry."""
    last_error = None
    backoff_delays = [0.1, 0.25, 0.5, 1.0]  # Exponential backoff: 100ms, 250ms, 500ms, 1s
    
    for attempt, delay in enumerate(backoff_delays, 1):
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
            if attempt < len(backoff_delays):
                print(f"🔄 Luxand search retry {attempt}/{len(backoff_delays)} after {delay*1000:.0f}ms (error: {str(e)[:60]}...)")
                time.sleep(delay)
            else:
                print(f"❌ Luxand search failed after {len(backoff_delays)} retries: {str(e)[:100]}")

    raise RuntimeError(str(last_error) if last_error else 'Unknown cloud search error')


def get_db():
    """Get database connection"""
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _to_db_datetime(dt: datetime) -> str:
    """Convert datetime to SQLite format"""
    return dt.strftime('%Y-%m-%d %H:%M:%S')


# ═══════════════════════════════════════════════════════════════
# Face Encoding Functions
# ═══════════════════════════════════════════════════════════════

def extract_face_encoding(image_path: str) -> Optional[Tuple[np.ndarray, dict]]:
    """
    Extract face encoding from image file.
    
    Args:
        image_path: Path to image file
        
    Returns:
        (encoding, metadata) tuple or None if no face detected
        metadata: {'num_faces', 'face_locations', 'resolution'}
    """
    _check_face_recognition_available()
    
    try:
        # Load image
        image = face_recognition.load_image_file(image_path)
        
        # Detect face locations
        face_locations = face_recognition.face_locations(image, model=FACE_DETECTION_MODEL)
        
        if len(face_locations) == 0:
            return None  # No face detected
        
        if len(face_locations) > 1:
            print(f"⚠️  Warning: {len(face_locations)} faces detected in {image_path}, using first")
        
        # Extract encodings
        encodings = face_recognition.face_encodings(image, face_locations)
        
        if len(encodings) == 0:
            return None
        
        metadata = {
            'num_faces': len(face_locations),
            'face_locations': face_locations,
            'resolution': image.shape[:2]
        }
        
        return encodings[0], metadata
        
    except Exception as e:
        print(f"❌ Error extracting face encoding from {image_path}: {e}")
        return None


def save_encoding(encoding: np.ndarray, file_path: str):
    """Save face encoding to pickle file"""
    Path(file_path).parent.mkdir(parents=True, exist_ok=True)
    with open(file_path, 'wb') as f:
        pickle.dump(encoding, f)


def load_encoding(file_path: str) -> Optional[np.ndarray]:
    """Load face encoding from pickle file"""
    try:
        with open(file_path, 'rb') as f:
            return pickle.load(f)
    except Exception as e:
        print(f"❌ Error loading encoding from {file_path}: {e}")
        return None


# ═══════════════════════════════════════════════════════════════
# Person Registration
# ═══════════════════════════════════════════════════════════════

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
        # Save photo file
        conn = get_db()
        
        # Check if employee_id already exists
        existing = conn.execute(
            "SELECT id FROM persons WHERE employee_id=?", (employee_id,)
        ).fetchone()
        
        if existing:
            conn.close()
            return False, f"Employee ID '{employee_id}' already exists", None
        
        # Insert person record to get ID
        cursor = conn.execute(
            """INSERT INTO persons (name, employee_id, role, department, notes, authorized)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (name, employee_id, role, department, notes, authorized)
        )
        person_id = cursor.lastrowid
        conn.commit()
        
        # Save photo
        photo_path = PERSONS_PHOTOS_DIR / f"person_{person_id}.jpg"
        
        if hasattr(photo_file, 'save'):
            # Flask file upload object
            photo_file.save(str(photo_path))
        elif isinstance(photo_file, (str, Path)):
            # File path - copy it
            import shutil
            shutil.copy(photo_file, photo_path)
        else:
            # Bytes data
            with open(photo_path, 'wb') as f:
                f.write(photo_file.read())
        
        if not FACE_RECOGNITION_AVAILABLE and _cloud_provider_enabled():
            # Cloud flow: enroll with cloud provider and store cloud identifier.
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
                    f"✅ Registered person with cloud recognition: {name} "
                    f"(ID: {employee_id}, person_id: {person_id}, cloud_subject: {cloud_subject})"
                )
                return True, f"Successfully registered {name} (cloud recognition enabled)", person_id

            # Fallback: still save person/photo even if cloud enrollment fails
            conn.execute(
                """UPDATE persons
                   SET photo_path=?, face_encoding_path=NULL, cloud_subject=NULL, updated_at=CURRENT_TIMESTAMP
                   WHERE id=?""",
                (str(photo_path), person_id)
            )
            conn.commit()
            conn.close()
            print(
                f"⚠️  Registered person without cloud enrollment: {name} "
                f"(ID: {employee_id}, person_id: {person_id}) — {cloud_msg}"
            )
            return True, f"Successfully registered {name} (photo saved; {cloud_msg})", person_id

        if not FACE_RECOGNITION_AVAILABLE:
            # Graceful fallback: save the person and photo, skip encoding.
            conn.execute(
                """UPDATE persons 
                   SET photo_path=?, face_encoding_path=NULL, cloud_subject=NULL, updated_at=CURRENT_TIMESTAMP
                   WHERE id=?""",
                (str(photo_path), person_id)
            )
            conn.commit()
            conn.close()
            print(
                f"✅ Registered person without face recognition: {name} "
                f"(ID: {employee_id}, person_id: {person_id})"
            )
            return True, f"Successfully registered {name} (photo saved; face recognition unavailable)", person_id

        # Extract face encoding
        result = extract_face_encoding(str(photo_path))

        if result is None:
            # No face detected - rollback
            conn.execute("DELETE FROM persons WHERE id=?", (person_id,))
            conn.commit()
            conn.close()
            photo_path.unlink(missing_ok=True)
            return False, "No face detected in photo. Please upload a clear face image.", None

        encoding, metadata = result

        if metadata['num_faces'] > 1:
            # Multiple faces - rollback
            conn.execute("DELETE FROM persons WHERE id=?", (person_id,))
            conn.commit()
            conn.close()
            photo_path.unlink(missing_ok=True)
            return False, f"Multiple faces ({metadata['num_faces']}) detected. Please upload a photo with only one face.", None

        # Save encoding
        encoding_path = PERSONS_ENCODINGS_DIR / f"person_{person_id}.pkl"
        save_encoding(encoding, str(encoding_path))

        # Update person record with file paths
        conn.execute(
            """UPDATE persons 
               SET photo_path=?, face_encoding_path=?, cloud_subject=NULL, updated_at=CURRENT_TIMESTAMP
               WHERE id=?""",
            (str(photo_path), str(encoding_path), person_id)
        )
        conn.commit()
        conn.close()

        # Invalidate encoding cache
        _reload_encoding_cache()

        print(f"✅ Registered person: {name} (ID: {employee_id}, person_id: {person_id})")
        return True, f"Successfully registered {name}", person_id
        
    except Exception as e:
        print(f"❌ Error registering person: {e}")
        return False, f"Error: {str(e)}", None


# ═══════════════════════════════════════════════════════════════
# Face Matching
# ═══════════════════════════════════════════════════════════════

def _reload_encoding_cache():
    """Reload all person encodings into memory cache"""
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
        
        print(f"🔄 Loaded {len(_encoding_cache)} face encodings into cache")


def match_face(face_encoding: np.ndarray, threshold: float = None) -> Tuple[Optional[int], float]:
    """
    Match a face encoding against known persons.
    
    Args:
        face_encoding: 128-d face encoding vector
        threshold: Match threshold (default: FACE_MATCH_THRESHOLD)
        
    Returns:
        (person_id, confidence) tuple. person_id=None if no match.
        confidence is 1.0 - distance (higher = better match)
    """
    if threshold is None:
        threshold = FACE_MATCH_THRESHOLD
    
    # Ensure encoding cache is loaded
    if not _encoding_cache:
        _reload_encoding_cache()
    
    if not _encoding_cache:
        return None, 0.0
    
    # Get all known encodings
    known_ids = list(_encoding_cache.keys())
    known_encodings = [_encoding_cache[pid] for pid in known_ids]
    
    # Calculate distances
    distances = face_recognition.face_distance(known_encodings, face_encoding)
    
    # Find best match
    min_distance_idx = np.argmin(distances)
    min_distance = distances[min_distance_idx]
    
    # Check if match is within threshold
    if min_distance <= threshold:
        person_id = known_ids[min_distance_idx]
        confidence = 1.0 - min_distance
        return person_id, confidence
    
    return None, 0.0


# ═══════════════════════════════════════════════════════════════
# Camera Frame Processing
# ═══════════════════════════════════════════════════════════════

def process_camera_frame(camera_id: int, frame_path: str) -> List[dict]:
    """
    Process a camera frame for face detection and recognition.
    
    Args:
        camera_id: Camera ID from database
        frame_path: Path to frame image file
        
    Returns:
        List of detection dicts: [{person_id, person_name, confidence, bbox, snapshot_path}]
    """
    detections = []

    if not FACE_RECOGNITION_AVAILABLE:
        if _cloud_provider_enabled():
            return _process_camera_frame_cloud(camera_id, frame_path)
        return []
    
    try:
        # Load image
        image = face_recognition.load_image_file(frame_path)
        
        # Detect face locations
        face_locations = face_recognition.face_locations(image, model=FACE_DETECTION_MODEL)
        
        if len(face_locations) == 0:
            return []  # No faces detected
        
        # Extract encodings
        encodings = face_recognition.face_encodings(image, face_locations)
        
        # Create detection directory for this camera
        camera_detections_dir = DETECTIONS_DIR / f"cam_{camera_id}"
        camera_detections_dir.mkdir(parents=True, exist_ok=True)
        
        # Process each detected face
        for i, (encoding, bbox) in enumerate(zip(encodings, face_locations)):
            # Match face
            person_id, confidence = match_face(encoding)
            
            # Crop face from image
            top, right, bottom, left = bbox
            face_image = image[top:bottom, left:right]
            pil_image = Image.fromarray(face_image)
            
            # Save cropped face
            timestamp_str = datetime.now().strftime('%Y%m%d_%H%M%S')
            snapshot_filename = f"face_{timestamp_str}_{i}.jpg"
            snapshot_path = camera_detections_dir / snapshot_filename
            pil_image.save(str(snapshot_path))
            
            # Get person name if matched
            person_name = None
            if person_id:
                conn = get_db()
                person = conn.execute(
                    "SELECT name FROM persons WHERE id=?", (person_id,)
                ).fetchone()
                conn.close()
                person_name = person['name'] if person else None
            
            detections.append({
                'person_id': person_id,
                'person_name': person_name,
                'confidence': confidence,
                'bbox': bbox,
                'snapshot_path': str(snapshot_path)
            })
        
        # Log detections to database
        conn = get_db()
        for det in detections:
            conn.execute(
                """INSERT INTO face_detections 
                   (camera_id, person_id, confidence, snapshot_path, timestamp)
                   VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)""",
                (camera_id, det['person_id'], det['confidence'], det['snapshot_path'])
            )
        conn.commit()
        conn.close()
        
        return detections
        
    except Exception as e:
        print(f"❌ Error processing frame from camera {camera_id}: {e}")
        return []


def _process_camera_frame_cloud(camera_id: int, frame_path: str) -> List[dict]:
    """Cloud-provider variant of frame processing."""
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
            })

        conn = get_db()
        for det in detections:
            conn.execute(
                """INSERT INTO face_detections
                   (camera_id, person_id, confidence, snapshot_path, timestamp)
                   VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)""",
                (camera_id, det['person_id'], det['confidence'], det['snapshot_path'])
            )
        conn.commit()
        conn.close()

        return detections

    except Exception as e:
        print(f"❌ Error processing cloud frame from camera {camera_id}: {e}")
        return []


# ═══════════════════════════════════════════════════════════════
# Background Face Recognition Loop
# ═══════════════════════════════════════════════════════════════

def start_face_recognition_loop(camera_id: int, interval: int = 5):
    """
    Start background face recognition for a camera.
    
    Args:
        camera_id: Camera ID from database
        interval: Processing interval in seconds (default: 5)
    """
    # Stop existing thread if running
    stop_face_recognition_loop(camera_id)
    
    # Create stop flag
    stop_flag = threading.Event()
    _thread_stop_flags[camera_id] = stop_flag
    
    def recognition_loop():
        """Background thread function"""
        print(f"🔍 Started face recognition for camera {camera_id} (interval: {interval}s)")
        
        # Import here to avoid circular dependency
        try:
            from recorder import CameraRecorder
            recorder = CameraRecorder()
        except Exception as e:
            print(f"❌ Cannot start face recognition for camera {camera_id}: {e}")
            return
        
        while not stop_flag.is_set():
            try:
                # Get camera info
                conn = get_db()
                camera = conn.execute(
                    "SELECT id, name, rtsp_url, type FROM cameras WHERE id=? AND enabled=1",
                    (camera_id,)
                ).fetchone()
                conn.close()
                
                if not camera:
                    print(f"⚠️  Camera {camera_id} not found or disabled, stopping recognition")
                    break
                
                # Capture snapshot
                snapshot_data = recorder.capture_snapshot_by_camera_id(camera_id)
                
                if snapshot_data:
                    # Save temporary frame
                    temp_frame_path = DETECTIONS_DIR / f"temp_cam_{camera_id}.jpg"
                    with open(temp_frame_path, 'wb') as f:
                        f.write(snapshot_data)
                    
                    # Process frame
                    detections = process_camera_frame(camera_id, str(temp_frame_path))
                    
                    # Handle unknown faces (trigger alerts)
                    for det in detections:
                        if det['person_id'] is None:
                            # Unknown face detected - trigger alert
                            _trigger_unknown_face_alert(camera_id, camera['name'], det)
                        else:
                            # Known person detected
                            print(f"✓ Detected: {det['person_name']} (confidence: {det['confidence']:.2f})")
                    
                    # Clean up temp file
                    temp_frame_path.unlink(missing_ok=True)
                
            except Exception as e:
                print(f"❌ Error in face recognition loop for camera {camera_id}: {e}")
            
            # Wait for next interval
            stop_flag.wait(interval)
        
        print(f"🛑 Stopped face recognition for camera {camera_id}")
    
    # Start thread
    thread = threading.Thread(target=recognition_loop, daemon=True)
    thread.start()
    _face_recognition_threads[camera_id] = thread


def stop_face_recognition_loop(camera_id: int):
    """Stop face recognition loop for a camera"""
    if camera_id in _thread_stop_flags:
        _thread_stop_flags[camera_id].set()
        
        # Wait for thread to finish (max 2 seconds)
        if camera_id in _face_recognition_threads:
            _face_recognition_threads[camera_id].join(timeout=2.0)
            del _face_recognition_threads[camera_id]
        
        del _thread_stop_flags[camera_id]
        print(f"🛑 Stopped face recognition for camera {camera_id}")


def _trigger_unknown_face_alert(camera_id: int, camera_name: str, detection: dict):
    """Trigger alert for unknown face detection"""
    try:
        conn = get_db()
        
        # Create alert
        conn.execute(
            """INSERT INTO alerts 
               (device_id, alert_type, severity, ai_score, video_file, timestamp)
               VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
            (f"camera_{camera_id}", "UNKNOWN_FACE", "MEDIUM", detection['confidence'], 
             detection['snapshot_path'])
        )
        
        # Mark detection as alert-created
        conn.execute(
            """UPDATE face_detections 
               SET alert_created=1 
               WHERE snapshot_path=?""",
            (detection['snapshot_path'],)
        )
        
        conn.commit()
        conn.close()
        
        print(f"⚠️  ALERT: Unknown face detected at {camera_name}")
        
    except Exception as e:
        print(f"❌ Error triggering alert: {e}")


# ═══════════════════════════════════════════════════════════════
# Analytics & Queries
# ═══════════════════════════════════════════════════════════════

def get_person_detections(person_id: int, hours: int = 24) -> List[dict]:
    """Get detection history for a person"""
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
    """Get recent unknown face detections"""
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


# ═══════════════════════════════════════════════════════════════
# Initialization
# ═══════════════════════════════════════════════════════════════

# Load encoding cache on module import if face recognition is available
if FACE_RECOGNITION_AVAILABLE:
    _reload_encoding_cache()
    print("✅ Face recognition engine initialized")
elif _cloud_provider_enabled():
    print("☁️  Cloud face recognition provider enabled (Luxand)")
else:
    print("⚠️  Face recognition engine disabled (library not available)")
