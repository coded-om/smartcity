"""
state.py — shared mutable application state.

Centralises in-memory caches and cooldown logic so that mqtt_handler and all
route blueprints read/write the same objects without circular imports.

Import order: state.py imports from config.py, so config must be importable
first (which it is, since it only uses stdlib).
"""
import threading
import types

from config import ANOMALY_ALERT_COOLDOWN_SECS, RECORDING_COOLDOWN_SECS

# ── Optional face-recognition engine ─────────────────────────────────────────

try:
    import face_recognition_engine as fre          # type: ignore[import]
    FACE_RECOGNITION_ENABLED: bool = bool(
        fre.face_analysis_active() if hasattr(fre, 'face_analysis_active') else True
    )
except Exception as _fre_err:
    print(f"⚠️  Face recognition disabled: {_fre_err}")
    fre: types.ModuleType | None = None             # type: ignore[assignment]
    FACE_RECOGNITION_ENABLED = False

# ── Latest sensor readings (updated by mqtt_handler, read by sensor routes) ───

latest_readings: dict = {}

# ── Per-device recording cooldown ─────────────────────────────────────────────

_recording_ts:   dict          = {}
_recording_lock: threading.Lock = threading.Lock()


def can_record(device_id: str, now_ts: float) -> bool:
    """Return True and claim the slot when the device cooldown has expired."""
    with _recording_lock:
        if (now_ts - _recording_ts.get(device_id, 0.0)) < RECORDING_COOLDOWN_SECS:
            return False
        _recording_ts[device_id] = now_ts
        return True


# ── Per-device anomaly-alert cooldown ─────────────────────────────────────────

_anomaly_ts:   dict          = {}
_anomaly_lock: threading.Lock = threading.Lock()


def can_alert(device_id: str, alert_type: str, now_ts: float) -> bool:
    """Return True when an ANOMALY alert for *device_id* is not being throttled."""
    if alert_type != 'ANOMALY':
        return True
    with _anomaly_lock:
        if (now_ts - _anomaly_ts.get(device_id, 0.0)) < ANOMALY_ALERT_COOLDOWN_SECS:
            return False
        _anomaly_ts[device_id] = now_ts
        return True
