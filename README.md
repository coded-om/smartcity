# Smart City Security System

An AI-powered IoT security monitoring platform built with Flask, React, and MicroPython.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.10+, Flask 3.0, Flask-SocketIO, SQLite |
| AI | YOLOv8n (ONNX), Isolation Forest, Face Recognition |
| Frontend | React 18, Tailwind CSS, Lucide React, Recharts |
| IoT | ESP32 + MicroPython, MQTT (Mosquitto) |
| Camera | RTSP via FFmpeg/OpenCV, MediaMTX |

---

## Project Structure

```text
smartcity/
├── backend/
│   ├── app.py                  # Flask app factory + startup
│   ├── ai_engine.py            # Isolation Forest anomaly detection
│   ├── object_detector.py      # YOLOv8n weapon/object detection
│   ├── face_recognition_engine.py
│   ├── threat_detector.py      # Optical flow + weapon threat detection
│   ├── mqtt_handler.py         # MQTT ingestion pipeline
│   ├── recorder.py             # RTSP recording + snapshot capture
│   ├── notifier.py             # Telegram alerts
│   ├── db.py                   # SQLite schema + helpers
│   ├── config.py               # Environment config
│   ├── state.py                # Shared mutable state
│   ├── stream_buffer.py        # Live stream frame buffer
│   ├── routes/                 # API blueprints
│   │   ├── sensors.py
│   │   ├── cameras.py
│   │   ├── persons.py
│   │   └── analytics.py
│   ├── data/
│   │   ├── detections/         # Threat snapshot images
│   │   └── persons/            # Face encodings + photos
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.js
│   │   ├── components/         # Dashboard pages + UI components
│   │   └── lib/utils.js
│   └── package.json
└── esp32/
    ├── main.py                 # ESP32 Device 1 firmware
    └── esp32_2.py              # ESP32 Device 2 firmware
```

---

## Features

- Multi-sensor ingestion — temperature, humidity, gas, sound, motion (via MQTT)
- Device-aware AI anomaly detection with auto-retraining (APScheduler)
- YOLOv8n real-time object detection (weapons, suspicious items)
- Optical-flow threat detection for fighting/suspicious movement
- Face recognition enrollment and live identification
- Alert severity classification (LOW / MEDIUM / HIGH / CRITICAL)
- Forensic alert history with video/snapshot evidence
- Live camera preview with RTSP stream buffering
- Telegram bot notifications for high-severity alerts
- Real-time WebSocket dashboard (Socket.IO)

---

## Requirements

- Linux
- Python 3.10+
- Node.js 18+
- FFmpeg
- MQTT broker (Mosquitto on `localhost:1883`)

```bash
sudo apt update && sudo apt install -y ffmpeg mosquitto mosquitto-clients
```

---

## Backend Setup

```bash
cd smartcity
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

Run:

```bash
cd backend
python app.py
```

API available at `http://127.0.0.1:5000`

---

## Frontend Setup

```bash
cd frontend
npm install
npm start
```

Dashboard at `http://localhost:3000`

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Telegram alerts
TELEGRAM_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# Camera RTSP streams
DEFAULT_CAMERA_DEVICE_ID=cam_1
CAMERA_cam_1=rtsp://user:pass@camera_ip:554/stream

# Preview tuning
CAMERA_PREVIEW_WIDTH=240
CAMERA_PREVIEW_JPEG_QUALITY=28
CAMERA_PREVIEW_INTERVAL=2.5
```

---

## ESP32 Firmware

Edit `esp32/main.py` (Device 1) or `esp32/esp32_2.py` (Device 2):

```python
DEVICE_ID = "ESP32_1"
WIFI_SSID = "your_wifi"
WIFI_PASSWORD = "your_password"
MQTT_BROKER = "192.168.x.x"
```

Upload to your ESP32 board via [Thonny](https://thonny.org) or `mpremote`.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Port 5000 in use | Kill the process using that port or change `PORT` in `config.py` |
| No camera preview | Verify RTSP URL, check FFmpeg is installed, review dashboard diagnostics |
| High preview latency | Lower `CAMERA_PREVIEW_WIDTH`, increase `CAMERA_PREVIEW_INTERVAL` |
| MQTT not receiving | Check Mosquitto is running: `sudo systemctl status mosquitto` |
| AI model not training | Need at least 10 readings per device in the database |

---

## License

Internal / Project use.