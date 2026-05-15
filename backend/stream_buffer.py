import subprocess
import threading
import time

class LiveStreamBuffer:

    _registry: dict = {}
    _registry_lock = threading.Lock()

    @classmethod
    def get(cls, camera_id: int, rtsp_url: str) -> 'LiveStreamBuffer':
        with cls._registry_lock:
            buf = cls._registry.get(camera_id)
            if buf is None or not buf.alive():
                if buf is not None:
                    buf.stop()
                buf = cls(camera_id, rtsp_url)
                cls._registry[camera_id] = buf
        return buf

    def __init__(self, camera_id: int, rtsp_url: str) -> None:
        self.camera_id  = camera_id
        self.rtsp_url   = rtsp_url
        self._latest_jpeg: bytes | None = None
        self._lock        = threading.Lock()
        self._stop_event  = threading.Event()
        self._process: subprocess.Popen | None = None
        self._thread = threading.Thread(
            target=self._run,
            daemon=True,
            name=f'stream-buf-{camera_id}',
        )
        self._thread.start()

    def _run(self) -> None:
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
                while True:
                    s = buf.find(b'\xff\xd8')
                    if s < 0:
                        buf = b''
                        break
                    e = buf.find(b'\xff\xd9', s + 2)
                    if e < 0:
                        buf = buf[s:]       # keep incomplete frame tail
                        break
                    frame = buf[s:e + 2]
                    with self._lock:
                        self._latest_jpeg = frame
                    buf = buf[e + 2:]
        finally:
            self._terminate()

    def _terminate(self) -> None:
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

    def alive(self) -> bool:
        return (
            self._thread.is_alive()
            and self._process is not None
            and self._process.poll() is None
        )

    def snapshot(self, timeout: float = 10.0) -> bytes | None:
        deadline = time.time() + timeout
        while time.time() < deadline:
            with self._lock:
                if self._latest_jpeg:
                    return self._latest_jpeg
            time.sleep(0.05)
        return None

    def stream(self, fps: int = 5):
        interval   = 1.0 / max(1, fps)
        last_frame = None
        deadline   = time.time() + 12.0   # wait up to 12 s for first frame

        while not self._stop_event.is_set():
            with self._lock:
                current = self._latest_jpeg
            if current is not None:
                deadline = time.time() + 5.0    # reset watchdog on live frames
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

    def stop(self) -> None:
        self._stop_event.set()
        self._terminate()
