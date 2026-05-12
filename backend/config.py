"""
config.py — centralised configuration and environment loading.

Import this module early (before other local modules) so that .env values are
available via os.environ for every subsequent import.
"""
import os
from pathlib import Path


def _load_env_file() -> None:
    """Lightweight .env loader — no external dependency required."""
    env_path = Path(__file__).parent.parent / '.env'
    if not env_path.exists():
        return
    for raw in env_path.read_text(encoding='utf-8').splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key   = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_env_file()

# ── Filesystem paths ──────────────────────────────────────────────────────────
DB_PATH        = Path(__file__).parent / 'sensors.db'
RECORDINGS_DIR = Path(__file__).parent / 'recordings'

# ── Device liveness ───────────────────────────────────────────────────────────
DEVICE_TIMEOUT_SECS = 15

# ── Face recognition ──────────────────────────────────────────────────────────
FR_LOOP_INTERVAL_SECS = max(2, int(os.getenv('FACE_RECOGNITION_LOOP_INTERVAL_SECS', '5')))

# ── Cooldowns ─────────────────────────────────────────────────────────────────
RECORDING_COOLDOWN_SECS     = max(15,   int(os.getenv('RECORDING_COOLDOWN_SECS',     '90')))
ANOMALY_ALERT_COOLDOWN_SECS = max(3,    int(os.getenv('ANOMALY_ALERT_COOLDOWN_SECS', '10')))

# ── DB write retry ────────────────────────────────────────────────────────────
DB_WRITE_RETRY_ATTEMPTS   = max(1,    int(os.getenv('DB_WRITE_RETRY_ATTEMPTS',    '4')))
DB_WRITE_RETRY_DELAY_SECS = max(0.05, float(os.getenv('DB_WRITE_RETRY_DELAY_SECS', '0.2')))
