"""
threat_detector.py — Real-time Threat Detection for Raspberry Pi 5
====================================================================

Two-layer pipeline optimised for CPU-only inference:

  Layer 1 — Weapon detection (YOLOv8n ONNX)
      Detects knives, guns, rifles, scissors in each frame.
      ~180ms/frame on RPi5 with ONNX runtime.

  Layer 2 — Behaviour analysis (Lucas-Kanade Optical Flow)
      Tracks motion between consecutive frames per camera.
      ~5ms/frame using sparse LK — no GPU required.

      Heuristics:
        magnitude > FIGHT_MAG  AND variance > FIGHT_VAR  → FIGHTING
        magnitude > RUN_MAG                               → SUSPICIOUS_MOVEMENT

  Results are emitted via Flask-SocketIO for instant UI update (<1s latency).

Usage (called from face_recognition_engine._process_and_handle):
    result = analyze_frame(camera_id, frame_bgr, weapon_detections)
    # {'threat_type': 'FIGHTING', 'confidence': 0.82, 'severity': 'HIGH', ...}
    # or None if no threat.
"""

import json
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

# OpenCV is required for optical flow — already in requirements.txt
try:
    import cv2
    CV2_AVAILABLE = True
except Exception:
    cv2 = None
    CV2_AVAILABLE = False

# ── Optical-flow thresholds ────────────────────────────────────────────────
# Tuned for 640×480 @ 5fps on RPi5.
# Raise FIGHT_MAG / RUN_MAG if you get too many false positives.
FIGHT_MAG   = float(8.0)    # mean motion magnitude to trigger FIGHTING
FIGHT_VAR   = float(2.5)    # variance of flow directions (radians) — chaotic = fight
RUN_MAG     = float(5.0)    # mean motion magnitude to trigger SUSPICIOUS_MOVEMENT
MIN_CORNERS = 20            # minimum trackable corners; below this → skip frame

# ── Weapon → threat mapping ────────────────────────────────────────────────
WEAPON_CLASSES = {'knife', 'gun', 'pistol', 'rifle', 'scissors'}

# ── Per-camera state ───────────────────────────────────────────────────────
# Stores previous grayscale frame and corner points for Lucas-Kanade tracking.
_flow_state: Dict[int, dict] = {}
_flow_lock  = threading.Lock()

# Frame-skip counter: run behaviour analysis every N frames to save CPU.
_frame_counters: Dict[int, int] = {}
BEHAVIOUR_EVERY_N = 3   # ~1 behaviour check per 15s at 5fps (3×5s interval)

# ── Snapshot directory ─────────────────────────────────────────────────────
_DETECTIONS_DIR = Path(__file__).parent / 'data' / 'detections'


# ═══════════════════════════════════════════════════════════════════════════
# Internal helpers
# ═══════════════════════════════════════════════════════════════════════════

def _save_snapshot(camera_id: int, frame_bgr: np.ndarray,
                   threat_type: str) -> Optional[str]:
    """Save annotated frame to disk; return path string."""
    try:
        cam_dir = _DETECTIONS_DIR / f"cam_{camera_id}"
        cam_dir.mkdir(parents=True, exist_ok=True)
        ts  = datetime.now().strftime('%Y%m%d_%H%M%S_%f')
        dst = cam_dir / f"threat_{threat_type.lower()}_{ts}.jpg"
        cv2.imwrite(str(dst), frame_bgr)
        return str(dst)
    except Exception:
        return None


def _corners(gray: np.ndarray) -> Optional[np.ndarray]:
    """Find good corners to track with Shi-Tomasi detector."""
    pts = cv2.goodFeaturesToTrack(
        gray,
        maxCorners=150,
        qualityLevel=0.01,
        minDistance=10,
        blockSize=7,
    )
    return pts


def _analyse_flow(prev_gray: np.ndarray, curr_gray: np.ndarray,
                  prev_pts: np.ndarray) -> Optional[dict]:
    """
    Run Lucas-Kanade sparse optical flow.
    Returns dict with 'magnitude' and 'variance', or None if too few points.
    """
    if prev_pts is None or len(prev_pts) < MIN_CORNERS:
        return None

    curr_pts, status, _ = cv2.calcOpticalFlowPyrLK(
        prev_gray, curr_gray, prev_pts, None,
        winSize=(21, 21), maxLevel=3,
        criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 20, 0.01),
    )

    if curr_pts is None:
        return None

    good_prev = prev_pts[status == 1]
    good_curr = curr_pts[status == 1]

    if len(good_curr) < MIN_CORNERS // 2:
        return None

    delta = good_curr - good_prev
    magnitudes = np.sqrt(delta[:, 0] ** 2 + delta[:, 1] ** 2)
    angles     = np.arctan2(delta[:, 1], delta[:, 0])

    mean_mag = float(np.mean(magnitudes))
    # Circular variance of angles (0=aligned, 1=completely random)
    dir_variance = float(1.0 - abs(np.mean(np.exp(1j * angles))))

    return {
        'magnitude': mean_mag,
        'variance':  dir_variance,
        'n_points':  len(good_curr),
    }


# ═══════════════════════════════════════════════════════════════════════════
# Public API
# ═══════════════════════════════════════════════════════════════════════════

def analyze_frame(camera_id: int,
                  frame_bgr: np.ndarray,
                  weapon_detections: List[dict]) -> Optional[dict]:
    """
    Analyse one camera frame for threats.

    Args:
        camera_id:          Camera ID (used for per-camera state).
        frame_bgr:          BGR image as numpy array (from cv2.imread or decoded JPEG).
        weapon_detections:  List of dicts from object_detector.detect_objects()
                            that are WEAPON_CLASSES.

    Returns:
        dict with keys:
            threat_type   : 'ARMED_THREAT' | 'FIGHTING' | 'SUSPICIOUS_MOVEMENT'
            confidence    : float 0-1
            severity      : 'CRITICAL' | 'HIGH' | 'MEDIUM'
            source        : 'weapon' | 'behaviour'
            snapshot_path : str | None
            flow          : dict | None  (debug — magnitude, variance)
        or None if the frame is safe.
    """
    if not CV2_AVAILABLE or frame_bgr is None:
        return None

    # ── Layer 1: Weapon check (instant — weapons already detected by YOLO) ─
    weapon_hits = [d for d in weapon_detections
                   if d.get('class_name', '').lower() in WEAPON_CLASSES]
    if weapon_hits:
        best = max(weapon_hits, key=lambda d: d.get('confidence', 0))
        snap = _save_snapshot(camera_id, frame_bgr, 'ARMED_THREAT')
        return {
            'threat_type':   'ARMED_THREAT',
            'confidence':    round(best.get('confidence', 0.9), 4),
            'severity':      'CRITICAL',
            'source':        'weapon',
            'weapon_class':  best.get('class_name'),
            'bbox_json':     best.get('bbox_json'),
            'snapshot_path': snap,
            'flow':          None,
            'timestamp':     datetime.now().isoformat(),
        }

    # ── Layer 2: Behaviour via Optical Flow ───────────────────────────────
    with _flow_lock:
        _frame_counters[camera_id] = _frame_counters.get(camera_id, 0) + 1
        if _frame_counters[camera_id] % BEHAVIOUR_EVERY_N != 0:
            # Update state but skip expensive analysis this tick
            gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
            _flow_state[camera_id] = {
                'gray': gray,
                'pts':  _corners(gray),
            }
            return None

        curr_gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        state = _flow_state.get(camera_id)

        if state is None:
            _flow_state[camera_id] = {'gray': curr_gray, 'pts': _corners(curr_gray)}
            return None

        flow = _analyse_flow(state['gray'], curr_gray, state.get('pts'))

        # Update state for next tick
        _flow_state[camera_id] = {'gray': curr_gray, 'pts': _corners(curr_gray)}

    if flow is None:
        return None

    mag = flow['magnitude']
    var = flow['variance']

    if mag >= FIGHT_MAG and var >= FIGHT_VAR:
        confidence = min(0.95, 0.5 + (mag - FIGHT_MAG) * 0.04 + var * 0.1)
        snap = _save_snapshot(camera_id, frame_bgr, 'FIGHTING')
        return {
            'threat_type':   'FIGHTING',
            'confidence':    round(confidence, 4),
            'severity':      'HIGH',
            'source':        'behaviour',
            'weapon_class':  None,
            'bbox_json':     None,
            'snapshot_path': snap,
            'flow':          flow,
            'timestamp':     datetime.now().isoformat(),
        }

    if mag >= RUN_MAG:
        confidence = min(0.80, 0.4 + (mag - RUN_MAG) * 0.05)
        snap = _save_snapshot(camera_id, frame_bgr, 'SUSPICIOUS')
        return {
            'threat_type':   'SUSPICIOUS_MOVEMENT',
            'confidence':    round(confidence, 4),
            'severity':      'MEDIUM',
            'source':        'behaviour',
            'weapon_class':  None,
            'bbox_json':     None,
            'snapshot_path': snap,
            'flow':          flow,
            'timestamp':     datetime.now().isoformat(),
        }

    return None


def reset_camera(camera_id: int) -> None:
    """Clear per-camera flow state (call when camera is stopped/restarted)."""
    with _flow_lock:
        _flow_state.pop(camera_id, None)
        _frame_counters.pop(camera_id, None)
