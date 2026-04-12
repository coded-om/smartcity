"""
AI Engine - Isolation Forest Anomaly Detection
================================================

This module provides anomaly detection for IoT sensor data using
scikit-learn's Isolation Forest algorithm.

Key Features:
- One model per device (independent baselines)
- Trains on normal readings only
- Fast inference (< 1 ms per prediction)
- Offline operation (no internet required)
- Automatic alert classification

Model Lifecycle:
1. Collection Phase (0-24h): Gather normal readings
2. Training: Build Isolation Forest on historical data
3. Production: Score every new reading in real-time
4. Retraining: Monthly updates to adapt to environmental changes
"""

from sklearn.ensemble import IsolationForest
import joblib
import sqlite3
import numpy as np
from pathlib import Path
from datetime import datetime

# Configuration
MODELS_DIR = Path(__file__).parent / 'models'
MODELS_DIR.mkdir(exist_ok=True)

DB_PATH = Path(__file__).parent / 'sensors.db'

# Model cache to avoid reloading from disk
_model_cache = {}

# Anomaly detection parameters
CONTAMINATION = 0.05  # Expect 5% of data to be anomalies
N_ESTIMATORS = 100    # Number of trees in forest
MIN_SAMPLES = 100     # Minimum readings needed to train


def train_model(device_id: str) -> dict:
    """
    Train Isolation Forest model on historical normal readings.
    
    Args:
        device_id: Device identifier (e.g., "ESP32_Factory01")
    
    Returns:
        dict: Training statistics
            - readings_used (int): Number of readings used
            - features (list): Feature names
            - model_path (str): Path to saved model
            - trained_at (str): Timestamp
    
    Raises:
        ValueError: If insufficient data available
    
    Example:
        >>> stats = train_model("ESP32_Factory01")
        >>> print(f"Trained on {stats['readings_used']} readings")
    """
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0)
    
    # Fetch normal readings (exclude anomalies for training)
    # TRAINING and NORMAL are both considered baseline readings
    # Limit to last 43,200 readings (~24 hours at 2s interval)
    rows = conn.execute(
        """SELECT temperature, humidity, gas, mic 
           FROM readings
           WHERE device_id = ? 
             AND alert_type IN ('NORMAL', 'TRAINING')
           ORDER BY id DESC 
           LIMIT 43200""",
        (device_id,)
    ).fetchall()
    
    conn.close()
    
    # Validate sufficient data
    if len(rows) < MIN_SAMPLES:
        raise ValueError(
            f"Insufficient data for {device_id}: "
            f"Found {len(rows)} readings, need at least {MIN_SAMPLES}"
        )
    
    # Convert to numpy array
    X = np.array(rows, dtype=float)
    
    # Train Isolation Forest
    model = IsolationForest(
        n_estimators=N_ESTIMATORS,
        contamination=CONTAMINATION,
        max_samples='auto',
        random_state=42,
        n_jobs=-1  # Use all CPU cores
    )
    
    print(f"🔧 Training model for {device_id} on {len(rows)} readings...")
    model.fit(X)
    
    # Save model to disk
    model_path = MODELS_DIR / f"model_{device_id}.pkl"
    joblib.dump(model, model_path)
    
    # Cache in memory
    _model_cache[device_id] = model
    
    # Update device status in database
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0)
    conn.execute(
        """UPDATE devices 
           SET model_path = ?, 
               trained_at = ?,
               status = 'active'
           WHERE device_id = ?""",
        (str(model_path), datetime.now(), device_id)
    )
    conn.commit()
    conn.close()
    
    print(f"✅ Model trained and saved: {model_path}")
    
    return {
        'readings_used': len(rows),
        'features': ['temperature', 'humidity', 'gas', 'mic'],
        'model_path': str(model_path),
        'trained_at': datetime.now().isoformat(),
        'contamination': CONTAMINATION,
        'n_estimators': N_ESTIMATORS
    }


def predict(device_id: str, reading: dict) -> dict:
    """
    Score a sensor reading for anomalies.
    
    Args:
        device_id: Device identifier
        reading: Dict with keys: temperature, humidity, gas, mic
    
    Returns:
        dict: Prediction results
            - anomaly (bool): True if anomalous
            - score (float): Anomaly score (-1.0 to +1.0)
                +1.0 = very normal
                 0.0 = edge case
                -1.0 = very anomalous
            - type (str): Alert classification
    
    Raises:
        FileNotFoundError: If model not trained yet
    
    Example:
        >>> result = predict("ESP32_Factory01", {
        ...     "temperature": 55, "humidity": 60,
        ...     "gas": 3200, "mic": 800
        ... })
        >>> if result['anomaly']:
        ...     print(f"ALERT: {result['type']} (score: {result['score']})")
    """
    # Load model from cache or disk
    if device_id not in _model_cache:
        model_path = MODELS_DIR / f"model_{device_id}.pkl"
        
        if not model_path.exists():
            raise FileNotFoundError(
                f"Model not found for {device_id}. "
                f"Train first using POST /api/train/{device_id}"
            )
        
        _model_cache[device_id] = joblib.load(model_path)
    
    model = _model_cache[device_id]
    
    # Prepare input features (must match training order)
    X = [[
        reading.get('temperature', 0),
        reading.get('humidity', 0),
        reading.get('gas', 0),
        reading.get('mic', 0)
    ]]
    
    # Get anomaly score
    # Higher scores = more normal
    # Lower scores = more anomalous
    score = model.decision_function(X)[0]
    
    # Get binary prediction (-1 = anomaly, 1 = normal)
    prediction = model.predict(X)[0]
    is_anomaly = (prediction == -1)
    
    # Classify alert type based on sensor values and anomaly status
    alert_type = _classify(reading, is_anomaly)
    
    return {
        'anomaly': bool(is_anomaly),
        'score': round(float(score), 4),
        'type': alert_type,
    }


def _classify(reading: dict, is_anomaly: bool) -> str:
    """
    Classify alert type based on sensor readings and anomaly status.
    
    Priority order:
    1. Critical thresholds (FIRE, GAS_LEAK, EXPLOSION)
    2. Motion detection (INTRUDER)
    3. AI anomaly (ANOMALY)
    4. Normal (NORMAL)
    
    Args:
        reading: Sensor values dict
        is_anomaly: Whether AI detected anomaly
    
    Returns:
        str: Alert type classification
    """
    temp = reading.get('temperature', 0)
    gas = reading.get('gas', 0)
    mic = reading.get('mic', 0)
    motion = reading.get('motion', 0)
    
    # Critical threshold checks (highest priority)
    if temp > 55:
        return 'FIRE'
    
    if gas > 3000:
        return 'GAS_LEAK'
    
    if mic > 3500:
        return 'EXPLOSION'
    
    # Motion detection
    if motion == 1:
        return 'INTRUDER'
    
    # AI-detected anomaly (no specific threshold crossed)
    if is_anomaly:
        return 'ANOMALY'
    
    # All good
    return 'NORMAL'


def get_severity(alert_type: str, score: float) -> str:
    """
    Determine alert severity level.
    
    Args:
        alert_type: Classification (FIRE, GAS_LEAK, etc.)
        score: AI anomaly score (-1.0 to +1.0)
    
    Returns:
        str: CRITICAL, HIGH, MEDIUM, or LOW
    """
    # Critical alerts always highest severity
    if alert_type in ('FIRE', 'EXPLOSION'):
        return 'CRITICAL'
    
    if alert_type == 'GAS_LEAK':
        return 'CRITICAL'
    
    if alert_type == 'INTRUDER':
        return 'HIGH'
    
    # For generic anomalies, use score
    if alert_type == 'ANOMALY':
        if score < -0.7:
            return 'HIGH'
        elif score < -0.4:
            return 'MEDIUM'
        else:
            return 'LOW'
    
    return 'LOW'


def clear_model_cache():
    """Clear all cached models (useful for testing or updates)"""
    global _model_cache
    _model_cache.clear()
    print("🗑️  Model cache cleared")


def list_trained_models() -> list:
    """
    List all trained models.
    
    Returns:
        list: Device IDs with trained models
    """
    models = list(MODELS_DIR.glob("model_*.pkl"))
    device_ids = [m.stem.replace("model_", "") for m in models]
    return device_ids


if __name__ == '__main__':
    # Test/debug code
    print("🧪 AI Engine Test")
    print("=" * 50)
    print(f"Models directory: {MODELS_DIR}")
    print(f"Database: {DB_PATH}")
    print(f"Trained models: {list_trained_models()}")
    print("=" * 50)
