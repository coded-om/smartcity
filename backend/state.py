import threading
import types

from config import ANOMALY_ALERT_COOLDOWN_SECS, RECORDING_COOLDOWN_SECS

try:
    import face_recognition_engine as fre          # type: ignore[import]
    FACE_RECOGNITION_ENABLED: bool = bool(
        fre.face_analysis_active() if hasattr(fre, 'face_analysis_active') else True
    )
except Exception as _fre_err:
    print(f"[WARN]  Face recognition disabled: {_fre_err}")
    fre: types.ModuleType | None = None             # type: ignore[assignment]
    FACE_RECOGNITION_ENABLED = False

latest_readings: dict = {}

_recording_ts:   dict          = {}
_recording_lock: threading.Lock = threading.Lock()

def can_record(device_id: str, now_ts: float) -> bool:
    with _recording_lock:
        if (now_ts - _recording_ts.get(device_id, 0.0)) < RECORDING_COOLDOWN_SECS:
            return False
        _recording_ts[device_id] = now_ts
        return True

_anomaly_ts:   dict          = {}
_anomaly_lock: threading.Lock = threading.Lock()

def can_alert(device_id: str, alert_type: str, now_ts: float) -> bool:
    if alert_type != 'ANOMALY':
        return True
    with _anomaly_lock:
        if (now_ts - _anomaly_ts.get(device_id, 0.0)) < ANOMALY_ALERT_COOLDOWN_SECS:
            return False
        _anomaly_ts[device_id] = now_ts
        return True
