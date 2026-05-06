# Smart City Security System

An AI-powered IoT security monitoring platform that combines:

- **ESP32 sensor data ingestion** (MQTT)
- **Backend anomaly detection** (Flask + Isolation Forest)
- **Live camera preview/recording** (RTSP via ffmpeg/OpenCV)
- **Web dashboard** (React)
- **Alerting + forensic logs**

---

## Project Structure

```text
smartcity/
├── backend/         # Flask API, AI engine, recorder, notifier
├── frontend/        # React dashboard
├── esp32/           # MicroPython firmware
├── run_backend.sh   # Backend launcher
├── deploy.sh        # Deployment helper
└── test_phase1.sh   # Basic test script
```

---

## Features

- Multi-sensor ingestion (temperature, humidity, gas, microphone, motion)
- Device-aware AI anomaly detection
- Alert severity classification
- Forensic alert history + video evidence
- Live camera stream and fallback snapshot preview
- Camera diagnostics:
	- RTSP connectivity
	- Snapshot success
	- Stream success
	- Preview latency

---

## Requirements

- Linux (recommended)
- Python 3.10+
- Node.js 18+
- ffmpeg
- MQTT broker (e.g., Mosquitto on localhost:1883)

Install ffmpeg if needed:

```bash
sudo apt update
sudo apt install -y ffmpeg
```

---

## Backend Setup

From the project root:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

Run backend:

```bash
./run_backend.sh
```

---

## Frontend Setup

```bash
cd frontend
npm install
npm start
```

Dashboard opens at:

- `http://localhost:3000`

Backend API runs at:

- `http://127.0.0.1:5000`

---

## Environment Configuration

Create/update `.env` in project root.

Camera + preview tuning example:

```env
DEFAULT_CAMERA_DEVICE_ID=ESP32_Factory01
CAMERA_ESP32_Factory01=rtsp://username:password@camera_ip:554/h264_stream

CAMERA_PREVIEW_WIDTH=240
CAMERA_PREVIEW_JPEG_QUALITY=28
CAMERA_PREVIEW_INTERVAL=2.5
```

> `CAMERA_PREVIEW_WIDTH`, `CAMERA_PREVIEW_JPEG_QUALITY`, and `CAMERA_PREVIEW_INTERVAL`
> are useful knobs for stream stability on slower systems/networks.

---

## ESP32 Firmware

Edit `esp32/main.py`:

- `DEVICE_ID`
- WiFi credentials
- MQTT broker IP

Then flash/upload to your ESP32 board.

---

## Common Commands

Run backend:

```bash
./run_backend.sh
```

Run frontend:

```bash
cd frontend && npm start
```

Clean snapshots:

```bash
cd backend/recordings && rm -f *.jpg
```

---

## Troubleshooting

- **Port 5000 in use**: backend launcher auto-tries nearby ports.
- **No camera preview**:
	- verify RTSP URL
	- verify ffmpeg installed
	- check dashboard diagnostics cards
- **High preview latency**:
	- lower `CAMERA_PREVIEW_WIDTH`
	- increase `CAMERA_PREVIEW_INTERVAL`
	- increase JPEG quality value (more compression)

---

## License

Internal/Project use unless specified otherwise.