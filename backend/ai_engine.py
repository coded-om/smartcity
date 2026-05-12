"""
AI Engine - Isolation Forest + Rule-Based Anomaly Detection
============================================================

Two-layer detection:
  Layer 1 – Rule-based: Immediate classification based on configured thresholds.
             Fires even before a model is trained.
  Layer 2 – Isolation Forest: Statistical anomaly scoring per device.

Alert priority:
  FIRE > GAS_LEAK > EXPLOSION > INTRUDER > ANOMALY > NORMAL
"""

from sklearn.ensemble import IsolationForest
import joblib
import sqlite3
import numpy as np
from pathlib import Path
from datetime import datetime

# ── Paths ────────────────────────────────────────────────────────────────────
MODELS_DIR = Path(__file__).parent / 'models'
MODELS_DIR.mkdir(exist_ok=True)
DB_PATH = Path(__file__).parent / 'sensors.db'

# ── In-memory model cache ─────────────────────────────────────────────────────
_model_cache = {}

# ── Isolation Forest params ───────────────────────────────────────────────────
CONTAMINATION = 0.05
N_ESTIMATORS  = 100
MIN_SAMPLES   = 100

# ── Rule-based thresholds ─────────────────────────────────────────────────────
RULES = {
    'temp_fire':     55,    # °C
    'temp_high':     35,    # °C
    'humid_high':    70,    # %
    'gas_critical':  3000,  # ADC
    'gas_high':      2100,  # ADC
    'mic_explosion': 3500,  # ADC
}


def train_model(device_id: str) -> dict:
    """Train Isolation Forest on historical normal readings for one device."""
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0)
    rows = conn.execute(
        """SELECT temperature, humidity, gas, mic
           FROM readings
           WHERE device_id = ?
             AND alert_type IN ('NORMAL', 'TRAINING')
           ORDER BY id DESC LIMIT 43200""",
        (device_id,)
    ).fetchall()
    conn.close()

    if len(rows) < MIN_SAMPLES:
        raise ValueError(
            f"Not enough data for {device_id}: {len(rows)} readings (need {MIN_SAMPLES})"
        )

    X = np.array(rows, dtype=float)
    model = IsolationForest(
        n_estimators=N_ESTIMATORS,
        contamination=CONTAMINATION,
        max_samples='auto',
        random_state=42,
        n_jobs=-1,
    )
    print(f"🔧 Training model for {device_id} on {len(rows)} readings…")
    model.fit(X)

    model_path = MODELS_DIR / f"model_{device_id}.pkl"
    joblib.dump(model, model_path)
    _model_cache[device_id] = model

    conn = sqlite3.connect(str(DB_PATH), timeout=30.0)
    conn.execute(
        "UPDATE devices SET model_path=?, trained_at=?, status='active' WHERE device_id=?",
        (str(model_path), datetime.now().strftime('%Y-%m-%d %H:%M:%S'), device_id),
    )
    conn.commit()
    conn.close()
    print(f"✅ Model saved: {model_path}")
    return {
        'readings_used': len(rows),
        'features':      ['temperature', 'humidity', 'gas', 'mic'],
        'model_path':    str(model_path),
        'trained_at':    datetime.now().isoformat(),
        'contamination': CONTAMINATION,
        'n_estimators':  N_ESTIMATORS,
    }


def auto_train_if_ready(device_id: str) -> bool:
    """Train automatically if >= MIN_SAMPLES exist but no model yet."""
    model_path = MODELS_DIR / f"model_{device_id}.pkl"
    if model_path.exists():
        return False
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0)
    count = conn.execute(
        "SELECT COUNT(*) FROM readings WHERE device_id=? AND alert_type IN ('NORMAL','TRAINING')",
        (device_id,),
    ).fetchone()[0]
    conn.close()
    if count >= MIN_SAMPLES:
        try:
            train_model(device_id)
            return True
        except Exception as e:
            print(f"⚠️  Auto-train failed for {device_id}: {e}")
    return False


def retrain_all_devices() -> int:
    """
    Periodically retrain models for ALL devices that have enough data.
    Called by APScheduler every RETRAIN_INTERVAL_HOURS hours.
    Unlike auto_train_if_ready, this forces a retrain even when a model exists.
    Returns the count of devices retrained.
    """
    print("🔄 Scheduled retrain: starting for all devices…")
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0)
    dev_ids = [r[0] for r in conn.execute("SELECT device_id FROM devices").fetchall()]
    conn.close()
    count = 0
    for dev_id in dev_ids:
        try:
            check = sqlite3.connect(str(DB_PATH), timeout=30.0)
            rows = check.execute(
                "SELECT COUNT(*) FROM readings WHERE device_id=? AND alert_type IN ('NORMAL','TRAINING')",
                (dev_id,),
            ).fetchone()[0]
            check.close()
            if rows >= MIN_SAMPLES:
                train_model(dev_id)
                count += 1
                print(f"🤖 Retrained model for {dev_id} ({rows} samples)")
            else:
                print(f"⏭️  Skipped {dev_id}: only {rows}/{MIN_SAMPLES} samples")
        except Exception as e:
            print(f"⚠️  Scheduled retrain failed for {dev_id}: {e}")
    print(f"✅ Scheduled retrain done — {count} device(s) updated")
    return count


# ─────────────────────────────────────────────────────────────────────────────
# Prediction
# ─────────────────────────────────────────────────────────────────────────────

def predict(device_id: str, reading: dict) -> dict:
    """Score a sensor reading; returns anomaly flag, score, and alert type."""
    # Layer 1: rule-based (works without a trained model)
    rule_type = _rule_classify(reading)
    if rule_type not in ('NORMAL', 'ANOMALY'):
        return {'anomaly': True, 'score': -1.0, 'type': rule_type, 'source': 'rule'}

    # Layer 2: Isolation Forest
    if device_id not in _model_cache:
        model_path = MODELS_DIR / f"model_{device_id}.pkl"
        if not model_path.exists():
            raise FileNotFoundError(f"No model for {device_id}")
        _model_cache[device_id] = joblib.load(model_path)

    model      = _model_cache[device_id]
    X          = [[reading.get('temperature', 0), reading.get('humidity', 0),
                   reading.get('gas', 0),          reading.get('mic', 0)]]
    score      = float(model.decision_function(X)[0])
    is_anomaly = model.predict(X)[0] == -1
    alert_type = _full_classify(reading, is_anomaly)
    return {'anomaly': bool(is_anomaly), 'score': round(score, 4), 'type': alert_type, 'source': 'ml'}


def _rule_classify(reading: dict) -> str:
    temp   = reading.get('temperature', 0) or 0
    gas    = reading.get('gas', 0)          or 0
    mic    = reading.get('mic', 0)          or 0
    motion = reading.get('motion', 0)       or 0
    if temp   > RULES['temp_fire']:     return 'FIRE'
    if gas    > RULES['gas_critical']:  return 'GAS_LEAK'
    if mic    > RULES['mic_explosion']: return 'EXPLOSION'
    if motion == 1:                     return 'INTRUDER'
    if gas    > RULES['gas_high']:      return 'ANOMALY'
    if temp   > RULES['temp_high']:     return 'ANOMALY'
    if (reading.get('humidity', 0) or 0) > RULES['humid_high']: return 'ANOMALY'
    return 'NORMAL'


def _full_classify(reading: dict, is_anomaly: bool) -> str:
    rule = _rule_classify(reading)
    if rule not in ('NORMAL', 'ANOMALY'):
        return rule
    return 'ANOMALY' if is_anomaly else 'NORMAL'


def get_severity(alert_type: str, score: float) -> str:
    if alert_type in ('FIRE', 'EXPLOSION', 'GAS_LEAK'): return 'CRITICAL'
    if alert_type == 'INTRUDER':                         return 'HIGH'
    if alert_type == 'ANOMALY':
        if score < -0.7:   return 'HIGH'
        elif score < -0.4: return 'MEDIUM'
        else:              return 'LOW'
    return 'LOW'


# ─────────────────────────────────────────────────────────────────────────────
# Security Event Analytics
# ─────────────────────────────────────────────────────────────────────────────

def analyze_security_events(device_id: str = None) -> dict:
    """Return aggregated security analytics for the dashboard."""
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0)
    conn.row_factory = sqlite3.Row

    dev_filter  = "AND a.device_id = ?" if device_id else ""
    dev_params  = (device_id,) if device_id else ()
    dev_filter2 = "WHERE a.device_id = ?" if device_id else "WHERE 1=1"

    # Alert type distribution
    type_rows = conn.execute(
        f"SELECT alert_type, COUNT(*) cnt FROM alerts a {dev_filter2} {'AND' if device_id else 'AND'} 1=1 "
        f"GROUP BY alert_type ORDER BY cnt DESC",
        dev_params,
    ).fetchall()
    alert_type_counts = {r['alert_type']: r['cnt'] for r in type_rows}

    # Severity distribution
    sev_rows = conn.execute(
        f"SELECT severity, COUNT(*) cnt FROM alerts a {dev_filter2} GROUP BY severity ORDER BY cnt DESC",
        dev_params,
    ).fetchall()
    severity_counts = {r['severity']: r['cnt'] for r in sev_rows}

    # Hourly heatmap (last 7 days)
    heatmap_rows = conn.execute(
        f"""SELECT CAST(strftime('%H', a.timestamp) AS INTEGER) hour, COUNT(*) cnt
            FROM alerts a {dev_filter2}
              AND a.timestamp >= datetime('now', '-7 days')
            GROUP BY hour ORDER BY hour""",
        dev_params,
    ).fetchall()
    hourly_heatmap = [{'hour': r['hour'], 'count': r['cnt']} for r in heatmap_rows]

    # 24h trend
    last24 = conn.execute(
        f"SELECT COUNT(*) FROM alerts a {dev_filter2} AND a.timestamp >= datetime('now','-24 hours')",
        dev_params,
    ).fetchone()[0]
    prev24 = conn.execute(
        f"""SELECT COUNT(*) FROM alerts a {dev_filter2}
              AND a.timestamp BETWEEN datetime('now','-48 hours') AND datetime('now','-24 hours')""",
        dev_params,
    ).fetchone()[0]
    trend_pct = round(((last24 - prev24) / prev24) * 100, 1) if prev24 > 0 else (100.0 if last24 > 0 else 0)

    # Per-device risk scores (last 24h)
    device_rows = conn.execute(
        """SELECT device_id,
                  SUM(CASE severity WHEN 'CRITICAL' THEN 4 WHEN 'HIGH' THEN 3
                                    WHEN 'MEDIUM'   THEN 2 ELSE 1 END) weighted,
                  COUNT(*) total
           FROM alerts WHERE timestamp >= datetime('now','-24 hours')
           GROUP BY device_id""",
    ).fetchall()
    risk_scores = {
        r['device_id']: {'score': min(100, round((r['weighted'] / 80) * 100)), 'total_alerts': r['total']}
        for r in device_rows
    }

    # Top devices by alert count
    top_rows = conn.execute(
        "SELECT device_id, COUNT(*) cnt FROM alerts GROUP BY device_id ORDER BY cnt DESC LIMIT 10",
    ).fetchall()
    top_devices = [{'device_id': r['device_id'], 'alert_count': r['cnt']} for r in top_rows]

    # Recent event clusters
    cluster_rows = conn.execute(
        """SELECT timestamp, alert_type, device_id, severity FROM alerts
           WHERE timestamp >= datetime('now','-24 hours')
           ORDER BY timestamp DESC LIMIT 200""",
    ).fetchall()
    clusters = _cluster_events([dict(r) for r in cluster_rows])

    conn.close()
    return {
        'alert_type_counts': alert_type_counts,
        'severity_counts':   severity_counts,
        'hourly_heatmap':    hourly_heatmap,
        'trend_24h':         {'last_24h': last24, 'prev_24h': prev24, 'change_pct': trend_pct},
        'risk_scores':       risk_scores,
        'top_devices':       top_devices,
        'recent_clusters':   clusters[:10],
    }


def _cluster_events(events: list, window_minutes: int = 5) -> list:
    if not events:
        return []
    clusters, current = [], [events[0]]
    for ev in events[1:]:
        try:
            t_prev = datetime.fromisoformat(current[-1]['timestamp'])
            t_curr = datetime.fromisoformat(ev['timestamp'])
            if abs((t_prev - t_curr).total_seconds()) <= window_minutes * 60:
                current.append(ev)
            else:
                clusters.append(current); current = [ev]
        except Exception:
            current.append(ev)
    clusters.append(current)
    order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
    return [
        {
            'event_count':  len(c),
            'start':        c[-1]['timestamp'],
            'end':          c[0]['timestamp'],
            'types':        list({e['alert_type'] for e in c}),
            'devices':      list({e['device_id'] for e in c}),
            'max_severity': next((s for s in order if s in {e['severity'] for e in c}), 'LOW'),
        }
        for c in clusters
    ]


def get_sensor_trends(device_id: str, hours: int = 24) -> list:
    """Return time-series sensor data for charts."""
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """SELECT timestamp, temperature, humidity, gas, mic, motion, ai_score, alert_type
           FROM readings
           WHERE device_id = ? AND timestamp >= datetime('now', ? || ' hours')
           ORDER BY timestamp ASC LIMIT 500""",
        (device_id, f'-{hours}'),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
# Utilities
# ─────────────────────────────────────────────────────────────────────────────

def clear_model_cache():
    global _model_cache
    _model_cache.clear()
    print("🗑️  Model cache cleared")


def list_trained_models() -> list:
    return [m.stem.replace('model_', '') for m in MODELS_DIR.glob('model_*.pkl')]
