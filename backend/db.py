import sqlite3
from datetime import datetime
from pathlib import Path

from config import DB_PATH

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn

def to_db_datetime(dt: datetime) -> str:
    return dt.strftime('%Y-%m-%d %H:%M:%S')

def is_db_locked(err: Exception) -> bool:
    return (
        isinstance(err, sqlite3.OperationalError)
        and 'database is locked' in str(err).lower()
    )

def serialize_alert(row: sqlite3.Row) -> dict:
    alert = dict(row)
    vf = alert.get('video_file')
    alert['video_url'] = f"/api/recordings/{Path(vf).name}" if vf else None
    return alert

_SCHEMA_SQL = """
    CREATE TABLE IF NOT EXISTS readings (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id   TEXT    NOT NULL,
        timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP,
        temperature REAL,
        humidity    REAL,
        gas         INTEGER,
        mic         INTEGER,
        motion      INTEGER,
        ai_score    REAL    DEFAULT 0.0,
        alert_type  TEXT    DEFAULT 'NORMAL'
    );

    CREATE TABLE IF NOT EXISTS alerts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id   TEXT    NOT NULL,
        timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP,
        alert_type  TEXT,
        severity    TEXT,
        ai_score    REAL,
        video_file  TEXT,
        resolved    INTEGER DEFAULT 0,
        notes       TEXT
    );

    CREATE TABLE IF NOT EXISTS devices (
        device_id   TEXT PRIMARY KEY,
        location    TEXT,
        lat         REAL DEFAULT NULL,
        lng         REAL DEFAULT NULL,
        model_path  TEXT,
        trained_at  DATETIME,
        last_seen   DATETIME,
        status      TEXT DEFAULT 'training'
    );

    CREATE TABLE IF NOT EXISTS cameras (
        id                       INTEGER PRIMARY KEY AUTOINCREMENT,
        name                     TEXT NOT NULL,
        rtsp_url                 TEXT NOT NULL,
        type                     TEXT DEFAULT 'RTSP',
        device_id                TEXT,
        location                 TEXT,
        lat                      REAL,
        lng                      REAL,
        enabled                  INTEGER DEFAULT 1,
        face_recognition_enabled INTEGER DEFAULT 0,
        recording_enabled        INTEGER DEFAULT 1,
        created_at               DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at               DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS persons (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        name               TEXT NOT NULL,
        employee_id        TEXT UNIQUE,
        role               TEXT,
        department         TEXT,
        photo_path         TEXT,
        face_encoding_path TEXT,
        cloud_subject      TEXT,
        authorized         INTEGER DEFAULT 1,
        notes              TEXT,
        created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at         DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS face_detections (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        camera_id       INTEGER NOT NULL,
        person_id       INTEGER,
        confidence      REAL,
        snapshot_path   TEXT,
        bbox_json       TEXT,
        frame_width     INTEGER,
        frame_height    INTEGER,
        analysis_method TEXT    DEFAULT 'opencv',
        face_count      INTEGER DEFAULT 0,
        timestamp       DATETIME DEFAULT CURRENT_TIMESTAMP,
        alert_created   INTEGER DEFAULT 0,
        FOREIGN KEY (camera_id) REFERENCES cameras(id),
        FOREIGN KEY (person_id) REFERENCES persons(id)
    );

    CREATE INDEX IF NOT EXISTS idx_readings_device_time
        ON readings(device_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_alerts_device_time
        ON alerts(device_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_alerts_resolved
        ON alerts(resolved);
    CREATE INDEX IF NOT EXISTS idx_face_detections_timestamp
        ON face_detections(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_face_detections_camera
        ON face_detections(camera_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_face_detections_person
        ON face_detections(person_id, timestamp DESC);

    CREATE TABLE IF NOT EXISTS object_detections (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        camera_id       INTEGER NOT NULL,
        class_name      TEXT    NOT NULL,
        confidence      REAL,
        bbox_json       TEXT,
        frame_width     INTEGER,
        frame_height    INTEGER,
        snapshot_path   TEXT,
        timestamp       DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (camera_id) REFERENCES cameras(id)
    );
    CREATE INDEX IF NOT EXISTS idx_object_detections_camera_time
        ON object_detections(camera_id, timestamp DESC);
"""

_MIGRATIONS = [
    "ALTER TABLE devices          ADD COLUMN lat              REAL    DEFAULT NULL",
    "ALTER TABLE devices          ADD COLUMN lng              REAL    DEFAULT NULL",
    "ALTER TABLE persons          ADD COLUMN cloud_subject    TEXT",
    "ALTER TABLE face_detections  ADD COLUMN bbox_json        TEXT",
    "ALTER TABLE face_detections  ADD COLUMN frame_width      INTEGER",
    "ALTER TABLE face_detections  ADD COLUMN frame_height     INTEGER",
    "ALTER TABLE face_detections  ADD COLUMN analysis_method  TEXT    DEFAULT 'opencv'",
    "ALTER TABLE face_detections  ADD COLUMN face_count       INTEGER DEFAULT 0",
]

def init_db() -> None:
    conn = get_db()
    conn.executescript(_SCHEMA_SQL)
    conn.commit()
    for sql in _MIGRATIONS:
        try:
            conn.execute(sql)
            conn.commit()
        except Exception:
            pass  # column already exists  safe to ignore
    conn.close()

    data_dir = Path(__file__).parent / 'data'
    (data_dir / 'persons' / 'photos').mkdir(parents=True, exist_ok=True)
    (data_dir / 'persons' / 'encodings').mkdir(parents=True, exist_ok=True)
    (data_dir / 'detections').mkdir(parents=True, exist_ok=True)

    print("[OK] Database initialised")
