
import json
import os
import threading
from pathlib import Path
from typing import List

from config import _load_env_file

_load_env_file()

try:
    from ultralytics import YOLO as _YOLO
    YOLO_AVAILABLE = True
except Exception as _e:
    print(f"[WARN]  YOLOv8 not available: {_e}  (pip install ultralytics)")
    _YOLO = None
    YOLO_AVAILABLE = False

DEFAULT_SECURITY_CLASSES = {
    'cell phone', 'knife', 'scissors', 'backpack', 'handbag',
    'gun', 'pistol', 'rifle',  # not in standard COCO but some custom models have them
}

_ENV_CLASSES = {
    c.strip().lower()
    for c in os.getenv('YOLO_TARGET_CLASSES', '').split(',')
    if c.strip()
}
SECURITY_CLASSES = _ENV_CLASSES or DEFAULT_SECURITY_CLASSES

CONF_THRESHOLD = 0.35
CLASS_FILTERING_ENABLED = os.getenv('YOLO_CLASS_FILTERING', '1').strip().lower() not in {
    '0', 'false', 'no', 'off'
}

PT_MODEL_NAME   = 'yolov8n.pt'
ONNX_MODEL_NAME = 'yolov8n.onnx'
CUSTOM_MODEL_PATH = os.getenv('YOLO_MODEL_PATH', '').strip()
MODEL_PROFILE = os.getenv('YOLO_MODEL_PROFILE', 'default').strip().lower()
SUSPICIOUS_MODEL_PATHS = [
    Path(__file__).parent / 'models' / 'suspicious-detection.pt',
    Path(__file__).parent / 'models' / 'suspicious-detection.onnx',
]

_model = None
_model_lock = threading.Lock()

def _ensure_onnx() -> str:
    onnx_path = Path(ONNX_MODEL_NAME)
    if onnx_path.exists():
        return str(onnx_path)
    print(f"[Retrain] Exporting {PT_MODEL_NAME}  {ONNX_MODEL_NAME} (one-time, ~30s)")
    try:
        pt_model = _YOLO(PT_MODEL_NAME)
        exported = pt_model.export(format='onnx', imgsz=640, simplify=True)
        print(f"[OK] ONNX export done  {exported}")
        return str(exported)
    except Exception as e:
        print(f"[WARN]  ONNX export failed ({e}), falling back to .pt")
        return PT_MODEL_NAME

def _resolve_model_path() -> str:
    if CUSTOM_MODEL_PATH:
        custom = Path(CUSTOM_MODEL_PATH).expanduser()
        if custom.exists():
            return str(custom)
        print(f"[WARN]  YOLO_MODEL_PATH not found: {custom}  falling back")

    if MODEL_PROFILE == 'suspicious':
        for candidate in SUSPICIOUS_MODEL_PATHS:
            if candidate.exists():
                return str(candidate)
        print("[WARN]  suspicious profile requested but model file not found in backend/models/")

    return _ensure_onnx()

def _get_model():
    global _model
    if _model is not None:
        return _model
    if not YOLO_AVAILABLE:
        return None
    with _model_lock:
        if _model is None:
            try:
                model_path = _resolve_model_path()
                _model = _YOLO(model_path)
                try:
                    _model.fuse()
                except Exception:
                    pass
                print(f"[OK] YOLO detector loaded ({model_path})")
                if SECURITY_CLASSES:
                    print(f" YOLO class filter active: {sorted(SECURITY_CLASSES)}")
            except Exception as e:
                print(f"[ERROR] Failed to load YOLO model: {e}")
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

def warmup() -> bool:
    model = _get_model()
    if model is not None:
        print(" YOLOv8 warmup complete  model is ready in memory")
        return True
    return False

def detect_objects(frame_path: str, conf: float = CONF_THRESHOLD) -> List[dict]:
    if not YOLO_AVAILABLE:
        return []

    model = _get_model()
    if model is None:
        return []

    frame_file = Path(frame_path)
    if not frame_file.exists():
        return []

    try:
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

            if CLASS_FILTERING_ENABLED and class_name not in SECURITY_CLASSES:
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
        print(f"[ERROR] Object detection error: {e}")
        return []
