
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

from stream_buffer import LiveStreamBuffer

class CameraRecorder:
    
    def __init__(self, recordings_dir: str = None):
        self.recordings_dir = Path(recordings_dir or 
                                   Path(__file__).parent / 'recordings')
        self.recordings_dir.mkdir(exist_ok=True)
        self._snapshot_cache = {}
        self._snapshot_lock = threading.Lock()
        self._recording_in_progress: set = set()
        self._recording_lock = threading.Lock()
        self.preview_width = max(160, int(os.getenv('CAMERA_PREVIEW_WIDTH', '240')))
        self.preview_quality = min(31, max(2, int(os.getenv('CAMERA_PREVIEW_JPEG_QUALITY', '28'))))
        self.preview_interval_seconds = max(0.5, float(os.getenv('CAMERA_PREVIEW_INTERVAL', '2.5')))
        
        self.cameras = self._load_camera_config()
        
        self.ffmpeg_available = self._check_ffmpeg()
        
        if not self.ffmpeg_available:
            print("[WARN]  ffmpeg not found. Camera recording disabled.")
            print("   Install: sudo apt install ffmpeg")

    def _format_subprocess_error(self, stderr: bytes, default_message: str) -> str:
        decoded = stderr.decode(errors='ignore').strip() if stderr else ''
        return decoded[-400:] if decoded else default_message

    def get_preview_profile(self) -> dict:
        return {
            'width': self.preview_width,
            'jpeg_quality': self.preview_quality,
            'interval_seconds': self.preview_interval_seconds,
            'opencv_available': cv2 is not None,
            'ffmpeg_available': self.ffmpeg_available,
        }
    
    def _check_ffmpeg(self) -> bool:
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
        return [
            'ffmpeg',
            '-hide_banner',
            '-loglevel', 'error',
            '-rtsp_transport', 'tcp',
            '-i', rtsp_url,
        ]
    
    def _load_camera_config(self) -> dict:
        cameras = {}

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
                    camera_key = row['device_id'] if row['device_id'] else f"cam_{row['id']}"
                    cameras[camera_key] = {
                        'rtsp': row['rtsp_url'],
                        'type': row['type'],
                        'camera_id': row['id'],
                        'name': row['name']
                    }
                
                if cameras:
                    print(f"[Camera] Loaded {len(cameras)} camera(s) from database")
                    for key, cam in cameras.items():
                        print(f"   - {key}: {cam.get('name', 'N/A')}")
        except Exception as e:
            print(f"[WARN]  Could not load cameras from database: {e}")

        if not cameras:
            for key, value in os.environ.items():
                if key.startswith('CAMERA_'):
                    device_id = key.replace('CAMERA_', '')
                    cameras[device_id] = {'rtsp': value, 'type': 'RTSP'}

            if cameras:
                print(f"[Camera] Loaded {len(cameras)} camera(s) from environment")
                for device_id in cameras.keys():
                    print(f"   - {device_id}")
            else:
                print("[WARN]  No cameras configured")
                print("   Add cameras via API or .env: CAMERA_esp32_1=rtsp://...")
        
        return cameras

    def _resolve_camera_mapping(self, device_id: str):
        def _extract_url(camera_config):
            if not camera_config:
                return None
            if isinstance(camera_config, str):
                return camera_config
            if isinstance(camera_config, dict):
                return camera_config.get('rtsp')
            return None

        rtsp_url = _extract_url(self.cameras.get(device_id))
        if rtsp_url:
            return device_id, rtsp_url

        if len(self.cameras) == 1:
            only_device_id = next(iter(self.cameras.keys()))
            rtsp_url = _extract_url(self.cameras.get(only_device_id))
            if rtsp_url:
                print(f"[Info]  Using only configured camera '{only_device_id}' for {device_id}")
                return only_device_id, rtsp_url

        return None, None

    def _get_rtsp_url(self, device_id: str) -> str:
        _, rtsp_url = self._resolve_camera_mapping(device_id)
        return rtsp_url

    def _get_recording_url(self, device_id: str) -> str:
        mediamtx_host = os.getenv('MEDIAMTX_HOST', 'localhost')
        mediamtx_port = os.getenv('MEDIAMTX_RTSP_PORT', '8554')

        resolved_device_id, direct_url = self._resolve_camera_mapping(device_id)
        if not direct_url:
            return None

        raw_path = resolved_device_id.replace('ESP32_', '').lower() + '_raw'
        mediamtx_url = f'rtsp://{mediamtx_host}:{mediamtx_port}/{raw_path}'

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
        
        with self._recording_lock:
            if device_id in self._recording_in_progress:
                return None
            self._recording_in_progress.add(device_id)

        rtsp_url = self._get_recording_url(device_id)
        
        if not rtsp_url:
            print(f"[WARN]  No camera configured for {device_id}")
            with self._recording_lock:
                self._recording_in_progress.discard(device_id)
            return None
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{device_id}_{alert_type}_{timestamp}.mp4"
        output_path = self.recordings_dir / filename
        
        thread = threading.Thread(
            target=self._record_worker,
            args=(rtsp_url, str(output_path), duration, device_id),
            daemon=True
        )
        thread.start()
        
        print(f"[Camera] Recording started: {filename}")
        
        return str(output_path)
    
    def _record_worker(self, rtsp_url: str, output_path: str,
                       duration: int, device_id: str = None):
        """Background worker for recording"""
        try:
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
            
            result = subprocess.run(
                cmd_copy,
                capture_output=True,
                timeout=duration + 10
            )
            
            if result.returncode != 0:
                result = subprocess.run(
                    cmd_reencode,
                    capture_output=True,
                    timeout=duration + 20
                )

            if result.returncode == 0:
                file_size = Path(output_path).stat().st_size / (1024 * 1024)
                print(f"[OK] Recording complete: {Path(output_path).name} ({file_size:.1f} MB)")
            else:
                stderr = result.stderr.decode(errors='ignore').strip()
                stderr_tail = stderr[-400:] if stderr else 'Unknown ffmpeg error'
                print(f"[ERROR] Recording failed: {stderr_tail}")
                
        except subprocess.TimeoutExpired:
            print(f"  Recording timeout: {output_path}")
        except Exception as e:
            print(f"[ERROR] Recording error: {e}")
        finally:
            if device_id:
                with self._recording_lock:
                    self._recording_in_progress.discard(device_id)
    
    def record_snapshot(self, device_id: str) -> str:
        rtsp_url = self._get_recording_url(device_id)
        if not rtsp_url:
            return None
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{device_id}_snapshot_{timestamp}.jpg"
        output_path = self.recordings_dir / filename
        
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
                    print(f" Snapshot saved: {filename}")
                    return str(output_path)

                ffmpeg_error = self._format_subprocess_error(result.stderr, 'Unknown ffmpeg snapshot error')
            except Exception as e:
                ffmpeg_error = str(e)

        if cv2 is not None:
            capture = None
            try:
                capture = cv2.VideoCapture(rtsp_url)
                if capture.isOpened():
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
                            print(f" Snapshot saved via OpenCV: {filename}")
                            return str(output_path)
            except Exception as e:
                print(f"[ERROR] OpenCV snapshot fallback error: {e}")
            finally:
                if capture is not None:
                    capture.release()

        if ffmpeg_error:
            print(f"[ERROR] Snapshot failed: {ffmpeg_error}")
        else:
            print("[ERROR] Snapshot failed: No available capture method succeeded")

        return None

    def mjpeg_stream(self, device_id: str):
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
                    print(f"[ERROR] MJPEG stream failed: {self._format_subprocess_error(stderr, 'Unknown streaming error')}")

    def mjpeg_stream_by_id(self, camera_id: int, fps: int = 5):
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
            print(f"[ERROR] mjpeg_stream_by_id db error: {e}")
            return

        if not camera:
            return

        rtsp_url = camera['rtsp_url']
        cam_type = camera['type']

        if cam_type == 'ESP32-CAM':
            import requests, time
            host = rtsp_url.rstrip('/')
            if not host.startswith('http'):
                host = f'http://{host}'
            snapshot_paths = ['/capture', '/jpg/image.jpg', '/snapshot.jpg', '/image.jpg']
            working_path = None
            while True:
                try:
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

        buf = LiveStreamBuffer.get(camera_id, rtsp_url)
        yield from buf.stream(fps=fps)

    def get_live_snapshot(self, device_id: str, max_age_seconds: int = 3) -> str:
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

            return stale_cached_path

    def capture_snapshot_by_camera_id(self, camera_id: int) -> bytes:
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
            
            if cam_type == 'ESP32-CAM':
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
                fallback_rtsp = camera.get('rtsp_url', '')
                if fallback_rtsp and not fallback_rtsp.startswith('rtsp://'):
                    return None
                rtsp_url = fallback_rtsp
                if not rtsp_url:
                    return None

            if not cam_type == 'ESP32-CAM' or rtsp_url.startswith('rtsp://'):
                if not self.ffmpeg_available:
                    return None

                buf = LiveStreamBuffer.get(camera_id, rtsp_url)
                return buf.snapshot(timeout=12.0)

            return None
                
        except Exception as e:
            print(f"[ERROR] Error capturing snapshot for camera {camera_id}: {e}")
            return None

    def diagnose_camera(self, device_id: str) -> dict:
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
            print(f"  Deleted {deleted_count} old recording(s) ({freed_mb:.1f} MB freed)")
    
    def get_recording_stats(self) -> dict:
        mp4_files = list(self.recordings_dir.glob("*.mp4"))
        jpg_files = list(self.recordings_dir.glob("*.jpg"))
        
        total_size = sum(f.stat().st_size for f in mp4_files + jpg_files)
        
        return {
            'total_videos': len(mp4_files),
            'total_snapshots': len(jpg_files),
            'total_size_mb': total_size / (1024 * 1024),
            'recordings_dir': str(self.recordings_dir)
        }

_recorder = None

def get_recorder() -> CameraRecorder:
    global _recorder
    if _recorder is None:
        _recorder = CameraRecorder()
    return _recorder

if __name__ == '__main__':
    print(" Testing Camera Recorder")
    print("=" * 50)
    
    recorder = get_recorder()
    
    print(f"[Camera] ffmpeg available: {recorder.ffmpeg_available}")
    print(f" Recordings dir: {recorder.recordings_dir}")
    print(f" Cameras configured: {len(recorder.cameras)}")
    
    if recorder.cameras:
        for device_id in recorder.cameras.keys():
            url = recorder._get_rtsp_url(device_id)
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
