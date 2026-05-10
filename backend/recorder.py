"""
Recorder - RTSP Camera Recording System
========================================

Records video clips from EZVIZ cameras when alerts are triggered.

Features:
- RTSP stream recording via ffmpeg
- 30-second clips centered on alert
- Motion-triggered recording
- Multiple camera support
- Auto-cleanup of old recordings

Camera Support:
- EZVIZ cameras (CS-C6N, CS-CV246, etc.)
- Generic RTSP cameras
- USB cameras (via V4L2)

RTSP URL Format:
rtsp://username:password@camera_ip:554/h264/ch1/main/av_stream
"""

import subprocess
import os
from pathlib import Path
from datetime import datetime
import threading
import time

try:
    import cv2
except Exception:
    cv2 = None


class _LiveStreamBuffer:
    """One ffmpeg process per RTSP camera, shared by all consumers.

    Reads the RTSP stream continuously, stores the latest JPEG frame in
    memory.  Snapshot and MJPEG-stream callers read from this buffer instead
    of opening their own RTSP connection, keeping usage within the camera's
    simultaneous-session limit.
    """

    # Class-level registry so every CameraRecorder instance shares the same
    # per-camera process even if multiple CameraRecorder objects are created.
    _registry: dict = {}
    _registry_lock = threading.Lock()

    @classmethod
    def get(cls, camera_id: int, rtsp_url: str) -> '_LiveStreamBuffer':
        """Return (and lazily create) the shared buffer for *camera_id*."""
        with cls._registry_lock:
            buf = cls._registry.get(camera_id)
            if buf is None or not buf.alive():
                if buf is not None:
                    buf.stop()
                buf = cls(camera_id, rtsp_url)
                cls._registry[camera_id] = buf
        return buf

    def __init__(self, camera_id: int, rtsp_url: str):
        self.camera_id = camera_id
        self.rtsp_url = rtsp_url
        self._latest_jpeg: bytes = None
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._process: subprocess.Popen = None
        self._thread = threading.Thread(
            target=self._run, daemon=True,
            name=f'live-stream-{camera_id}'
        )
        self._thread.start()

    # ------------------------------------------------------------------
    # Internal reader loop
    # ------------------------------------------------------------------

    def _run(self):
        cmd = [
            'ffmpeg', '-hide_banner', '-loglevel', 'error',
            '-rtsp_transport', 'tcp',
            '-i', self.rtsp_url,
            '-an',
            '-vf', 'fps=5,scale=1280:720',
            '-vcodec', 'mjpeg',
            '-q:v', '4',
            '-f', 'image2pipe',
            'pipe:1',
        ]
        try:
            self._process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                bufsize=0,
            )
            buf = b''
            while not self._stop_event.is_set():
                data = self._process.stdout.read(65536)
                if not data:
                    break
                buf += data
                # Parse back-to-back JPEG frames by SOI/EOI markers.
                while True:
                    s = buf.find(b'\xff\xd8')
                    if s < 0:
                        buf = b''
                        break
                    e = buf.find(b'\xff\xd9', s + 2)
                    if e < 0:
                        buf = buf[s:]      # keep incomplete frame
                        break
                    frame = buf[s:e + 2]
                    with self._lock:
                        self._latest_jpeg = frame
                    buf = buf[e + 2:]
        finally:
            self._terminate()

    def _terminate(self):
        p = self._process
        if p and p.poll() is None:
            try:
                p.terminate()
                p.wait(timeout=3)
            except Exception:
                try:
                    p.kill()
                except Exception:
                    pass

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def alive(self) -> bool:
        return (
            self._thread.is_alive()
            and self._process is not None
            and self._process.poll() is None
        )

    def snapshot(self, timeout: float = 10.0) -> bytes:
        """Return the latest JPEG frame, blocking up to *timeout* seconds."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            with self._lock:
                if self._latest_jpeg:
                    return self._latest_jpeg
            time.sleep(0.05)
        return None

    def stream(self, fps: int = 5):
        """Generator yielding ``multipart/x-mixed-replace`` boundary chunks."""
        interval = 1.0 / max(1, fps)
        last_frame = None
        # Wait up to 12 s for the first frame before giving up.
        deadline = time.time() + 12.0
        while not self._stop_event.is_set():
            with self._lock:
                current = self._latest_jpeg
            if current is not None:
                deadline = time.time() + 5.0   # reset watchdog
                if current is not last_frame:
                    last_frame = current
                    yield (
                        b'--frame\r\nContent-Type: image/jpeg\r\n'
                        b'Content-Length: ' + str(len(current)).encode()
                        + b'\r\n\r\n' + current + b'\r\n'
                    )
            elif time.time() > deadline:
                break
            time.sleep(interval)

    def stop(self):
        self._stop_event.set()
        self._terminate()

class CameraRecorder:
    """RTSP camera recorder using ffmpeg"""
    
    def __init__(self, recordings_dir: str = None):
        """
        Initialize recorder.
        
        Args:
            recordings_dir: Directory for video storage
        """
        self.recordings_dir = Path(recordings_dir or 
                                   Path(__file__).parent / 'recordings')
        self.recordings_dir.mkdir(exist_ok=True)
        self._snapshot_cache = {}
        self._snapshot_lock = threading.Lock()
        # Debounce: track cameras that already have a recording in progress.
        self._recording_in_progress: set = set()
        self._recording_lock = threading.Lock()
        self.preview_width = max(160, int(os.getenv('CAMERA_PREVIEW_WIDTH', '240')))
        self.preview_quality = min(31, max(2, int(os.getenv('CAMERA_PREVIEW_JPEG_QUALITY', '28'))))
        self.preview_interval_seconds = max(0.5, float(os.getenv('CAMERA_PREVIEW_INTERVAL', '2.5')))
        
        # Camera configuration from environment
        self.cameras = self._load_camera_config()
        
        # Check ffmpeg availability
        self.ffmpeg_available = self._check_ffmpeg()
        
        if not self.ffmpeg_available:
            print("⚠️  ffmpeg not found. Camera recording disabled.")
            print("   Install: sudo apt install ffmpeg")

    def _format_subprocess_error(self, stderr: bytes, default_message: str) -> str:
        """Return the useful tail of a subprocess stderr message."""
        decoded = stderr.decode(errors='ignore').strip() if stderr else ''
        return decoded[-400:] if decoded else default_message

    def get_preview_profile(self) -> dict:
        """Return live preview tuning settings."""
        return {
            'width': self.preview_width,
            'jpeg_quality': self.preview_quality,
            'interval_seconds': self.preview_interval_seconds,
            'opencv_available': cv2 is not None,
            'ffmpeg_available': self.ffmpeg_available,
        }
    
    def _check_ffmpeg(self) -> bool:
        """Check if ffmpeg is installed"""
        try:
            result = subprocess.run(
                ['ffmpeg', '-version'],
                capture_output=True,
                timeout=5
            )
            return result.returncode == 0
        except Exception:
            return False

    def _build_preview_ffmpeg_input_args(self, rtsp_url: str) -> list:
        """Return shared ffmpeg input args for RTSP preview work."""
        return [
            'ffmpeg',
            '-hide_banner',
            '-loglevel', 'error',
            '-rtsp_transport', 'tcp',
            '-i', rtsp_url,
        ]
    
    def _load_camera_config(self) -> dict:
        """Load camera RTSP URLs from database first, then fallback to environment variables.
        Database format: cameras table with device_id, rtsp_url
        Env format: CAMERA_<DEVICE_ID>=rtsp://...
        """
        cameras = {}

        # Try loading from database first
        try:
            import sqlite3
            db_path = Path(__file__).parent / 'sensors.db'
            if db_path.exists():
                conn = sqlite3.connect(str(db_path))
                conn.row_factory = sqlite3.Row
                rows = conn.execute(
                    "SELECT id, name, rtsp_url, device_id, type FROM cameras WHERE enabled=1"
                ).fetchall()
                conn.close()
                
                for row in rows:
                    # Use camera name or ID as key
                    camera_key = row['device_id'] if row['device_id'] else f"cam_{row['id']}"
                    cameras[camera_key] = {
                        'rtsp': row['rtsp_url'],
                        'type': row['type'],
                        'camera_id': row['id'],
                        'name': row['name']
                    }
                
                if cameras:
                    print(f"📹 Loaded {len(cameras)} camera(s) from database")
                    for key, cam in cameras.items():
                        print(f"   - {key}: {cam.get('name', 'N/A')}")
        except Exception as e:
            print(f"⚠️  Could not load cameras from database: {e}")

        # Fallback to environment variables if no DB cameras found
        if not cameras:
            for key, value in os.environ.items():
                if key.startswith('CAMERA_'):
                    device_id = key.replace('CAMERA_', '')
                    cameras[device_id] = {'rtsp': value, 'type': 'RTSP'}

            if cameras:
                print(f"📹 Loaded {len(cameras)} camera(s) from environment")
                for device_id in cameras.keys():
                    print(f"   - {device_id}")
            else:
                print("⚠️  No cameras configured")
                print("   Add cameras via API or .env: CAMERA_esp32_1=rtsp://...")
        
        return cameras

    def _resolve_camera_mapping(self, device_id: str):
        """Resolve a device id to the configured camera id and URL.

        Returns:
            tuple[str | None, str | None]: (resolved_device_id, rtsp_url)
        """
        def _extract_url(camera_config):
            if not camera_config:
                return None
            if isinstance(camera_config, str):
                return camera_config
            if isinstance(camera_config, dict):
                return camera_config.get('rtsp')
            return None

        # 1) Direct device match
        rtsp_url = _extract_url(self.cameras.get(device_id))
        if rtsp_url:
            return device_id, rtsp_url

        # 2) If only one camera exists, use it as final fallback for any device
        if len(self.cameras) == 1:
            only_device_id = next(iter(self.cameras.keys()))
            rtsp_url = _extract_url(self.cameras.get(only_device_id))
            if rtsp_url:
                print(f"ℹ️  Using only configured camera '{only_device_id}' for {device_id}")
                return only_device_id, rtsp_url

        return None, None

    def _get_rtsp_url(self, device_id: str) -> str:
        """Resolve RTSP URL for device from camera config."""
        _, rtsp_url = self._resolve_camera_mapping(device_id)
        return rtsp_url

    def _get_recording_url(self, device_id: str) -> str:
        """Return the best RTSP URL to use for recording.

        Prefers MediaMTX local RTSP (localhost:8554/factory01_raw) so that
        ffmpeg does not open a second direct connection to the camera —
        most cameras only allow one concurrent RTSP session.
        Falls back to the direct camera URL if MediaMTX is not running.
        """
        mediamtx_host = os.getenv('MEDIAMTX_HOST', 'localhost')
        mediamtx_port = os.getenv('MEDIAMTX_RTSP_PORT', '8554')

        # Resolve the actual configured camera id and direct RTSP URL.
        resolved_device_id, direct_url = self._resolve_camera_mapping(device_id)
        if not direct_url:
            return None

        # Build the MediaMTX path name from the device id:
        # ESP32_Factory01 → factory01_raw  (raw H265, stream-copy friendly)
        raw_path = resolved_device_id.replace('ESP32_', '').lower() + '_raw'
        mediamtx_url = f'rtsp://{mediamtx_host}:{mediamtx_port}/{raw_path}'

        # Probe MediaMTX to see if the path is live (quick 2s timeout)
        try:
            probe = subprocess.run(
                ['ffprobe', '-v', 'quiet', '-rtsp_transport', 'tcp',
                 '-i', mediamtx_url, '-show_entries', 'stream=codec_type',
                 '-of', 'default=noprint_wrappers=1'],
                capture_output=True, timeout=3
            )
            if probe.returncode == 0:
                return mediamtx_url
        except Exception:
            pass

        # MediaMTX not available — fall back to direct camera URL
        return direct_url
    
    def record_alert(self, device_id: str, alert_type: str, 
                     duration: int = 30) -> str:
        """
        Record video clip for alert.
        
        Args:
            device_id: Device that triggered alert
            alert_type: Type of alert (FIRE, GAS_LEAK, etc.)
            duration: Recording duration in seconds
        
        Returns:
            str: Path to recorded video file, or None if failed
        """
        if not self.ffmpeg_available:
            return None
        
        # Debounce: skip if a recording for this device is already running.
        with self._recording_lock:
            if device_id in self._recording_in_progress:
                return None
            self._recording_in_progress.add(device_id)

        # Get camera URL for this device (prefer MediaMTX local RTSP)
        rtsp_url = self._get_recording_url(device_id)
        
        if not rtsp_url:
            print(f"⚠️  No camera configured for {device_id}")
            with self._recording_lock:
                self._recording_in_progress.discard(device_id)
            return None
        
        # Generate filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{device_id}_{alert_type}_{timestamp}.mp4"
        output_path = self.recordings_dir / filename
        
        # Record in background thread
        thread = threading.Thread(
            target=self._record_worker,
            args=(rtsp_url, str(output_path), duration, device_id),
            daemon=True
        )
        thread.start()
        
        print(f"📹 Recording started: {filename}")
        
        return str(output_path)
    
    def _record_worker(self, rtsp_url: str, output_path: str,
                       duration: int, device_id: str = None):
        """Background worker for recording"""
        try:
            # Fast path: copy H264 stream without re-encoding
            cmd_copy = [
                'ffmpeg',
                '-hide_banner',
                '-loglevel', 'error',
                '-rtsp_transport', 'tcp',      # Use TCP for reliability
                '-i', rtsp_url,                # Input RTSP stream
                '-t', str(duration),           # Duration
                '-an',                         # Ignore audio (many RTSP cams have no audio)
                '-c:v', 'copy',                # Copy video codec (no re-encode)
                '-movflags', '+faststart',
                '-y',                          # Overwrite output
                output_path
            ]

            # Fallback path: re-encode if copy fails (more compatible)
            cmd_reencode = [
                'ffmpeg',
                '-hide_banner',
                '-loglevel', 'error',
                '-rtsp_transport', 'tcp',
                '-i', rtsp_url,
                '-t', str(duration),
                '-an',
                '-c:v', 'libx264',
                '-preset', 'veryfast',
                '-crf', '28',
                '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',
                '-y',
                output_path
            ]
            
            # Try stream-copy first
            result = subprocess.run(
                cmd_copy,
                capture_output=True,
                timeout=duration + 10
            )
            
            if result.returncode != 0:
                # Retry with re-encode for compatibility
                result = subprocess.run(
                    cmd_reencode,
                    capture_output=True,
                    timeout=duration + 20
                )

            if result.returncode == 0:
                file_size = Path(output_path).stat().st_size / (1024 * 1024)
                print(f"✅ Recording complete: {Path(output_path).name} ({file_size:.1f} MB)")
            else:
                stderr = result.stderr.decode(errors='ignore').strip()
                stderr_tail = stderr[-400:] if stderr else 'Unknown ffmpeg error'
                print(f"❌ Recording failed: {stderr_tail}")
                
        except subprocess.TimeoutExpired:
            print(f"⏱️  Recording timeout: {output_path}")
        except Exception as e:
            print(f"❌ Recording error: {e}")
        finally:
            if device_id:
                with self._recording_lock:
                    self._recording_in_progress.discard(device_id)
    
    def record_snapshot(self, device_id: str) -> str:
        """
        Capture single frame snapshot.
        
        Args:
            device_id: Device identifier
        
        Returns:
            str: Path to snapshot image, or None if failed
        """
        rtsp_url = self._get_recording_url(device_id)
        if not rtsp_url:
            return None
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{device_id}_snapshot_{timestamp}.jpg"
        output_path = self.recordings_dir / filename
        
        # Try ffmpeg first when available, then fall back to OpenCV.
        ffmpeg_error = None
        if self.ffmpeg_available:
            try:
                cmd = self._build_preview_ffmpeg_input_args(rtsp_url) + [
                    '-frames:v', '1',
                    '-update', '1',
                    '-an',
                    '-vf', f'scale={self.preview_width}:-2',
                    '-q:v', '5', '-update', '1',
                    '-f', 'image2',
                    '-y',
                    str(output_path)
                ]

                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    timeout=20
                )

                if result.returncode == 0 and output_path.exists() and output_path.stat().st_size > 0:
                    print(f"📸 Snapshot saved: {filename}")
                    return str(output_path)

                ffmpeg_error = self._format_subprocess_error(result.stderr, 'Unknown ffmpeg snapshot error')
            except Exception as e:
                ffmpeg_error = str(e)

        if cv2 is not None:
            capture = None
            try:
                capture = cv2.VideoCapture(rtsp_url)
                if capture.isOpened():
                    # Warm up a couple of frames for RTSP sources.
                    frame = None
                    for _ in range(3):
                        ok, frame = capture.read()
                        if ok and frame is not None:
                            break
                        time.sleep(0.2)

                    if frame is not None:
                        height, width = frame.shape[:2]
                        if width > self.preview_width:
                            scaled_height = max(1, int(height * (self.preview_width / width)))
                            frame = cv2.resize(frame, (self.preview_width, scaled_height))
                        saved = cv2.imwrite(str(output_path), frame)
                        if saved and output_path.exists() and output_path.stat().st_size > 0:
                            print(f"📸 Snapshot saved via OpenCV: {filename}")
                            return str(output_path)
            except Exception as e:
                print(f"❌ OpenCV snapshot fallback error: {e}")
            finally:
                if capture is not None:
                    capture.release()

        if ffmpeg_error:
            print(f"❌ Snapshot failed: {ffmpeg_error}")
        else:
            print("❌ Snapshot failed: No available capture method succeeded")

        return None

    def mjpeg_stream(self, device_id: str):
        """Yield a direct MJPEG stream from ffmpeg for browser live preview."""
        if not self.ffmpeg_available:
            return

        rtsp_url = self._get_recording_url(device_id)
        if not rtsp_url:
            return

        cmd = self._build_preview_ffmpeg_input_args(rtsp_url) + [
            '-an',
            '-vf', f'fps={max(1, round(1 / self.preview_interval_seconds))},scale={self.preview_width}:-2',
            '-q:v', '5', '-update', '1',
            '-f', 'mpjpeg',
            'pipe:1',
        ]

        process = None
        try:
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                bufsize=0,
            )

            while True:
                chunk = process.stdout.read(4096)
                if not chunk:
                    break
                yield chunk
        finally:
            if process is not None:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=2)
                    except subprocess.TimeoutExpired:
                        process.kill()

                stderr = process.stderr.read() if process.stderr else b''
                if process.returncode not in (0, None):
                    print(f"❌ MJPEG stream failed: {self._format_subprocess_error(stderr, 'Unknown streaming error')}")

    def mjpeg_stream_by_id(self, camera_id: int, fps: int = 5):
        """Yield a direct MJPEG stream from ffmpeg for a camera looked up by database ID."""
        if not self.ffmpeg_available:
            return

        try:
            import sqlite3
            db_path = Path(__file__).parent / 'sensors.db'
            conn = sqlite3.connect(str(db_path))
            conn.row_factory = sqlite3.Row
            camera = conn.execute(
                "SELECT * FROM cameras WHERE id=? AND enabled=1", (camera_id,)
            ).fetchone()
            conn.close()
        except Exception as e:
            print(f"❌ mjpeg_stream_by_id db error: {e}")
            return

        if not camera:
            return

        rtsp_url = camera['rtsp_url']
        cam_type = camera['type']

        if cam_type == 'ESP32-CAM':
            # ESP32-CAM: poll common HTTP snapshot endpoints, yield frames manually
            import requests, time
            host = rtsp_url.rstrip('/')
            if not host.startswith('http'):
                host = f'http://{host}'
            snapshot_paths = ['/capture', '/jpg/image.jpg', '/snapshot.jpg', '/image.jpg']
            working_path = None
            while True:
                try:
                    # Discover working path on first success
                    paths_to_try = [working_path] if working_path else snapshot_paths
                    for path in paths_to_try:
                        try:
                            resp = requests.get(f'{host}{path}', timeout=3)
                            if resp.status_code == 200 and len(resp.content) > 100:
                                working_path = path
                                frame = resp.content
                                yield (
                                    b'--frame\r\nContent-Type: image/jpeg\r\n'
                                    b'Content-Length: ' + str(len(frame)).encode() + b'\r\n\r\n'
                                    + frame + b'\r\n'
                                )
                                break
                        except Exception:
                            pass
                except Exception:
                    pass
                time.sleep(1.0 / max(1, fps))
            return

        # RTSP camera — use the shared stream buffer (one ffmpeg connection).
        buf = _LiveStreamBuffer.get(camera_id, rtsp_url)
        yield from buf.stream(fps=fps)

    def get_live_snapshot(self, device_id: str, max_age_seconds: int = 3) -> str:
        """
        Return a recent snapshot for live preview, capturing a new one if needed.

        Args:
            device_id: Device identifier
            max_age_seconds: Reuse recent snapshot younger than this age

        Returns:
            str: Path to snapshot image, or None if unavailable
        """
        with self._snapshot_lock:
            cached = self._snapshot_cache.get(device_id)
            now = time.time()
            stale_cached_path = None

            if cached:
                cached_path = Path(cached['path'])
                if cached_path.exists():
                    stale_cached_path = str(cached_path)
                    if (now - cached['captured_at']) <= max_age_seconds:
                        return stale_cached_path

            snapshot_path = self.record_snapshot(device_id)
            if snapshot_path:
                self._snapshot_cache[device_id] = {
                    'path': snapshot_path,
                    'captured_at': now,
                }
                return snapshot_path

            # Fall back to older cached snapshot instead of returning None/404 on transient capture failure.
            return stale_cached_path

    def capture_snapshot_by_camera_id(self, camera_id: int) -> bytes:
        """
        Capture a snapshot from a camera by its database ID.
        
        Args:
            camera_id: Camera ID from database
            
        Returns:
            JPEG image bytes or None if failed
        """
        try:
            import sqlite3
            db_path = Path(__file__).parent / 'sensors.db'
            conn = sqlite3.connect(str(db_path))
            conn.row_factory = sqlite3.Row
            
            camera = conn.execute(
                "SELECT * FROM cameras WHERE id=? AND enabled=1", (camera_id,)
            ).fetchone()
            conn.close()
            
            if not camera:
                return None
            
            rtsp_url = camera['rtsp_url']
            cam_type = camera['type']
            
            # Handle different camera types
            if cam_type == 'ESP32-CAM':
                # HTTP snapshot for ESP32-CAM — try /capture then /jpg/image.jpg
                import requests
                host = rtsp_url.rstrip('/')
                if not host.startswith('http'):
                    host = f'http://{host}'
                for path in ['/capture', '/jpg/image.jpg', '/snapshot.jpg', '/image.jpg']:
                    try:
                        response = requests.get(f'{host}{path}', timeout=5)
                        if response.status_code == 200 and len(response.content) > 100:
                            return response.content
                    except Exception:
                        pass
                # Fall back to RTSP snapshot if HTTP failed and rtsp_url looks like an IP
                fallback_rtsp = camera.get('rtsp_url', '')
                if fallback_rtsp and not fallback_rtsp.startswith('rtsp://'):
                    return None
                rtsp_url = fallback_rtsp
                if not rtsp_url:
                    return None
                # fall through to RTSP path below

            if not cam_type == 'ESP32-CAM' or rtsp_url.startswith('rtsp://'):
                # RTSP camera — use the shared stream buffer so we don't open
                # an extra RTSP connection (camera connection limit is ~2).
                if not self.ffmpeg_available:
                    return None

                buf = _LiveStreamBuffer.get(camera_id, rtsp_url)
                return buf.snapshot(timeout=12.0)

            return None
                
        except Exception as e:
            print(f"❌ Error capturing snapshot for camera {camera_id}: {e}")
            return None

    def diagnose_camera(self, device_id: str) -> dict:
        """Run a lightweight end-to-end camera diagnostic."""
        started = time.perf_counter()
        rtsp_url = self._get_recording_url(device_id)
        snapshot_path = None
        snapshot_source = 'none'

        diagnostics = {
            'device_id': device_id,
            'configured': bool(rtsp_url),
            'rtsp_connectivity': False,
            'snapshot_success': False,
            'stream_success': False,
            'response_time_ms': None,
            'preview_profile': self.get_preview_profile(),
        }

        if not rtsp_url:
            diagnostics['error'] = f'No camera configured for {device_id}'
            return diagnostics

        # Prefer existing cached snapshot first to avoid expensive RTSP reconnect during diagnostics.
        with self._snapshot_lock:
            cached = self._snapshot_cache.get(device_id)
            if cached:
                cached_path = Path(cached['path'])
                if cached_path.exists():
                    snapshot_path = str(cached_path)
                    snapshot_source = 'cache'

        if not snapshot_path:
            snapshot_path = self.get_live_snapshot(
                device_id,
                max_age_seconds=max(15, int(self.preview_interval_seconds * 8))
            )
            if snapshot_path:
                snapshot_source = 'fresh'

        elapsed_ms = round((time.perf_counter() - started) * 1000, 1)

        diagnostics['response_time_ms'] = elapsed_ms
        diagnostics['rtsp_connectivity'] = bool(snapshot_path)
        diagnostics['snapshot_success'] = bool(snapshot_path)
        diagnostics['stream_success'] = bool(rtsp_url) and self.ffmpeg_available
        diagnostics['snapshot_source'] = snapshot_source

        if snapshot_path:
            snapshot_file = Path(snapshot_path)
            diagnostics['snapshot_path'] = str(snapshot_file)
            diagnostics['snapshot_size_kb'] = round(snapshot_file.stat().st_size / 1024, 1)
        else:
            diagnostics['error'] = 'Snapshot capture failed'

        return diagnostics
    
    def cleanup_old_recordings(self, days: int = 7):
        """
        Delete recordings older than N days.
        
        Args:
            days: Age threshold in days
        """
        cutoff_time = time.time() - (days * 86400)
        deleted_count = 0
        freed_space = 0
        
        for video_file in self.recordings_dir.glob("*.mp4"):
            if video_file.stat().st_mtime < cutoff_time:
                file_size = video_file.stat().st_size
                video_file.unlink()
                deleted_count += 1
                freed_space += file_size
        
        if deleted_count > 0:
            freed_mb = freed_space / (1024 * 1024)
            print(f"🗑️  Deleted {deleted_count} old recording(s) ({freed_mb:.1f} MB freed)")
    
    def get_recording_stats(self) -> dict:
        """Get storage statistics"""
        mp4_files = list(self.recordings_dir.glob("*.mp4"))
        jpg_files = list(self.recordings_dir.glob("*.jpg"))
        
        total_size = sum(f.stat().st_size for f in mp4_files + jpg_files)
        
        return {
            'total_videos': len(mp4_files),
            'total_snapshots': len(jpg_files),
            'total_size_mb': total_size / (1024 * 1024),
            'recordings_dir': str(self.recordings_dir)
        }


# Singleton instance
_recorder = None

def get_recorder() -> CameraRecorder:
    """Get global recorder instance"""
    global _recorder
    if _recorder is None:
        _recorder = CameraRecorder()
    return _recorder


if __name__ == '__main__':
    # Test recorder
    print("🧪 Testing Camera Recorder")
    print("=" * 50)
    
    recorder = get_recorder()
    
    print(f"📹 ffmpeg available: {recorder.ffmpeg_available}")
    print(f"📁 Recordings dir: {recorder.recordings_dir}")
    print(f"🎥 Cameras configured: {len(recorder.cameras)}")
    
    if recorder.cameras:
        for device_id in recorder.cameras.keys():
            url = recorder._get_rtsp_url(device_id)
            # Mask password in URL
            masked_url = url.split('@')[-1] if '@' in url else url
            print(f"   {device_id}: ...@{masked_url}")
    
    print("\nStorage stats:")
    stats = recorder.get_recording_stats()
    print(f"   Videos: {stats['total_videos']}")
    print(f"   Snapshots: {stats['total_snapshots']}")
    print(f"   Total size: {stats['total_size_mb']:.1f} MB")
    
    print("=" * 50)
    
    print("\nTo configure cameras, add to .env:")
    print("CAMERA_ESP32_Factory01=rtsp://user:pass@192.168.1.100:554/h264/ch1/main/av_stream")
