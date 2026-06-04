from __future__ import annotations

import io
import json
import threading
from datetime import datetime
from pathlib import Path
from typing import Iterator, Optional

from app.core.config import settings
from app.models.schemas import CameraCaptureRequest, CameraCaptureResponse, SidecarMetadata
from app.services.motion_service import motion_service

try:
    from picamera2 import Picamera2
    from picamera2.encoders import JpegEncoder
    from picamera2.outputs import FileOutput
except Exception:  # pragma: no cover
    Picamera2 = None  # type: ignore[assignment]
    JpegEncoder = None  # type: ignore[assignment]
    FileOutput = None  # type: ignore[assignment]


class _StreamingOutput(io.BufferedIOBase):
    def __init__(self) -> None:
        self.frame: Optional[bytes] = None
        self.condition = threading.Condition()

    def write(self, buf: bytes) -> int:
        with self.condition:
            self.frame = buf
            self.condition.notify_all()
        return len(buf)


class CameraService:
    def __init__(self) -> None:
        self.running = False
        self._camera: Optional[Picamera2] = None
        self._output = _StreamingOutput()
        self._lock = threading.Lock()
        self._last_error: Optional[str] = None

    def start(self) -> None:
        with self._lock:
            if self.running:
                return

            if Picamera2 is None:
                self._last_error = "Picamera2 is not available in this environment"
                self.running = False
                return

            try:
                self._camera = Picamera2()
                config = self._camera.create_video_configuration(main={"size": (1280, 720)})
                self._camera.configure(config)
                self._camera.start_recording(JpegEncoder(), FileOutput(self._output))
                self.running = True
                self._last_error = None
            except Exception as exc:
                self._last_error = f"Failed to start camera: {exc}"
                self.running = False
                self._camera = None

    def stop(self) -> None:
        with self._lock:
            if not self.running and self._camera is None:
                return
            try:
                if self._camera is not None:
                    self._camera.stop_recording()
            except Exception:
                pass
            finally:
                self.running = False
                self._camera = None

    def restart(self) -> None:
        self.stop()
        self.start()

    def status(self) -> dict[str, object]:
        return {
            "running": self.running,
            "available": Picamera2 is not None,
            "last_error": self._last_error,
        }

    def mjpeg_stream(self) -> Iterator[bytes]:
        if not self.running:
            self.start()

        if not self.running:
            message = self._last_error or "Camera is not running"
            payload = message.encode("utf-8", errors="replace")
            while True:
                yield b"--frame\r\nContent-Type: text/plain\r\n\r\n" + payload + b"\r\n"

        while True:
            with self._output.condition:
                self._output.condition.wait()
                frame = self._output.frame
            if frame is None:
                continue
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + frame + b"\r\n"

    def capture(self, req: CameraCaptureRequest) -> CameraCaptureResponse:
        with self._lock:
            if not self.running:
                self.start()

            now = datetime.now()
            ts = now.strftime("%Y%m%d_%H%M%S")

            capture_dir = settings.capture_root / req.project / req.session
            capture_dir.mkdir(parents=True, exist_ok=True)

            index = self._next_index(capture_dir, req.project, req.session, req.format)
            filename = f"{req.project}_{req.session}_{ts}_{index:04d}.{req.format}"
            image_path = capture_dir / filename
            sidecar_path = image_path.with_suffix(".json")

            if self._camera is not None and self.running:
                self._camera.capture_file(str(image_path), format=req.format)
                camera_settings = {
                    "status": "captured",
                    "mode": "picamera2",
                    "last_error": self._last_error,
                }
            else:
                # Fallback so filesystem flow is testable off-device.
                image_path.write_bytes(b"")
                camera_settings = {
                    "status": "stub_capture",
                    "mode": "stub",
                    "last_error": self._last_error,
                }

            metadata = SidecarMetadata(
                timestamp=now.isoformat(),
                project=req.project,
                session=req.session,
                filename=filename,
                image_format=req.format,
                xyz_position=motion_service.position(),
                rgbw_values={
                    "r": motion_service.last_rgbw[0],
                    "g": motion_service.last_rgbw[1],
                    "b": motion_service.last_rgbw[2],
                    "w": motion_service.last_rgbw[3],
                    "bri": motion_service.last_bri,
                },
                camera_settings=camera_settings,
            )
            sidecar_path.write_text(json.dumps(metadata.model_dump(), indent=2), encoding="utf-8")

            return CameraCaptureResponse(image_path=str(image_path), sidecar_path=str(sidecar_path))

    def _next_index(self, directory: Path, project: str, session: str, fmt: str) -> int:
        prefix = f"{project}_{session}_"
        suffix = f".{fmt}"
        matches = [p for p in directory.iterdir() if p.is_file() and p.name.startswith(prefix) and p.name.endswith(suffix)]
        return len(matches) + 1


camera_service = CameraService()
