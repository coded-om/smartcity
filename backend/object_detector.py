"""
Object Detector
===============
Security-relevant object detection using YOLOv8 nano.

Detects: cell phone, knife, scissors, backpack, handbag, gun / pistol
Designed to run on the same temp frame captured by the FR loop.

Usage::

    from object_detector import detect_objects
    results = detect_objects('/tmp/frame.jpg')
    # [{'class_name': 'cell phone', 'confidence': 0.82,
    #   'bbox_json': '[{"left":0.12,"top":0.30,"right":0.28,"bottom":0.70}]',
    #   'frame_width': 1280, 'frame_height': 720}, ...]
"""

import json
import threading
from pathlib import Path
from typing import List, Optional

import numpy as np

# ── YOLO availability flag ─────────────────────────────────────────────────
try:
    from ultralytics import YOLO as _YOLO
    YOLO_AVAILABLE = True
except Exception as _e:
    print(f"⚠️  YOLOv8 not available: {_e}  (pip install ultralytics)")
    _YOLO = None
    YOLO_AVAILABLE = False

# ── Security-relevant COCO classes ────────────────────────────────────────
SECURITY_CLASSES = {
    'cell phone', 'knife', 'scissors', 'backpack', 'handbag',
    'gun', 'pistol', 'rifle',  # not in standard COCO but some custom models have them
}

# Minimum confidence threshold
CONF_THRESHOLD = 0.35

# Model path – yolov8n.pt is downloaded automatically by ultralytics on first run
MODEL_NAME = 'yolov8n.pt'

# ── Lazy singleton ─────────────────────────────────────────────────────────
_model = None
_model_lock = threading.Lock()


def _get_model():
    """Load model once, reuse across calls."""
    global _model
    if _model is not None:
        return _model
    if not YOLO_AVAILABLE:
        return None
    with _model_lock:
        if _model is None:
            try:
                _model = _YOLO(MODEL_NAME)
                _model.fuse()          # merge Conv+BN layers → faster inference
                print(f"✅ YOLOv8 nano loaded ({MODEL_NAME})")
            except Exception as e:
                print(f"❌ Failed to load YOLO model: {e}")
                return None
    return _model


def _normalize_bbox(x1: float, y1: float, x2: float, y2: float,
                     width: int, height: int) -> dict:
    """Convert absolute pixel bbox to normalised 0-1 dict."""
    return {
        'left':   round(max(0.0, x1) / width,  4),
        'top':    round(max(0.0, y1) / height, 4),
        'right':  round(min(width,  x2) / width,  4),
        'bottom': round(min(height, y2) / height, 4),
    }


def detect_objects(frame_path: str, conf: float = CONF_THRESHOLD) -> List[dict]:
    """
    Run YOLOv8 object detection on *frame_path*.

    Returns a list of dicts for security-relevant detections only::

        [
            {
                'class_name':  'cell phone',
                'confidence':  0.82,
                'bbox_json':   '[{"left":0.12,"top":0.30,"right":0.28,"bottom":0.70}]',
                'frame_width': 1280,
                'frame_height': 720,
            },
            ...
        ]

    Returns [] when YOLO is unavailable or the frame cannot be read.
    """
    if not YOLO_AVAILABLE:
        return []

    model = _get_model()
    if model is None:
        return []

    frame_file = Path(frame_path)
    if not frame_file.exists():
        return []

    try:
        # Run inference at 50% resolution for speed; YOLO handles resizing internally
        results = model.predict(
            source=str(frame_file),
            conf=conf,
            iou=0.45,
            imgsz=640,        # YOLOv8 standard input size
            half=False,       # FP32 for CPU (no CUDA)
            verbose=False,
        )

        if not results or len(results) == 0:
            return []

        result = results[0]
        orig_h, orig_w = result.orig_shape[:2]
        names = model.names  # {0: 'person', 15: 'cell phone', ...}

        detections = []
        if result.boxes is None:
            return []

        for box in result.boxes:
            cls_id = int(box.cls[0].item())
            class_name = names.get(cls_id, str(cls_id)).lower()

            # Keep only security-relevant classes
            if class_name not in SECURITY_CLASSES:
                continue

            confidence = float(box.conf[0].item())
            x1, y1, x2, y2 = box.xyxy[0].tolist()

            bbox_dict = _normalize_bbox(x1, y1, x2, y2, orig_w, orig_h)
            detections.append({
                'class_name':   class_name,
                'confidence':   round(confidence, 4),
                'bbox_json':    json.dumps([bbox_dict]),
                'frame_width':  orig_w,
                'frame_height': orig_h,
            })

        return detections

    except Exception as e:
        print(f"❌ Object detection error: {e}")
        return []
