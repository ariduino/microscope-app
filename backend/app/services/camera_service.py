from __future__ import annotations

import io
import json
import threading
import time
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
        self._mode: str = "auto"
        self._manual_exposure_time: int = 10000
        self._manual_analogue_gain: float = 1.0
        self._preview_resolution: str = "1920x1080"
        self._capture_resolution: str = "3280x2464"
        self._live_exposure_time: Optional[int] = None
        self._live_analogue_gain: Optional[float] = None
        self._live_ae_enabled: Optional[bool] = None

    def start(self) -> None:
        with self._lock:
            if self.running:
                return

            if Picamera2 is None:
                self._last_error = "Picamera2 is not available in this environment"
                self.running = False
                return

            try:
                self._output = _StreamingOutput()
                self._camera = Picamera2()
                config = self._create_preview_configuration(self._camera)
                self._camera.configure(config)
                self._apply_settings_locked()
                self._camera.start_recording(JpegEncoder(), FileOutput(self._output))
                self.running = True
                self._last_error = None
                self._refresh_live_settings_locked()
            except Exception as exc:
                self._close_camera()
                self._last_error = f"Failed to start camera: {exc}"
                self.running = False

    def stop(self) -> None:
        with self._lock:
            if not self.running and self._camera is None:
                return
            self._close_camera()
            self.running = False

    def restart(self) -> None:
        with self._lock:
            self._restart_locked()

    def status(self) -> dict[str, object]:
        with self._lock:
            if self.running:
                self._refresh_live_settings_locked()
        return {
            "running": self.running,
            "available": Picamera2 is not None,
            "last_error": self._last_error,
            "settings": {
                "mode": self._mode,
                "exposure_time": self._manual_exposure_time,
                "analogue_gain": self._manual_analogue_gain,
                "preview_resolution": self._preview_resolution,
                "capture_resolution": self._capture_resolution,
                "live_exposure_time": self._live_exposure_time,
                "live_analogue_gain": self._live_analogue_gain,
                "ae_enabled": self._live_ae_enabled,
            },
        }

    def update_settings(
        self,
        mode: str,
        exposure_time: Optional[int],
        analogue_gain: Optional[float],
        preview_resolution: Optional[str],
        capture_resolution: Optional[str],
    ) -> dict[str, object]:
        with self._lock:
            preview_changed = preview_resolution is not None and preview_resolution != self._preview_resolution
            self._mode = mode
            if exposure_time is not None:
                self._manual_exposure_time = exposure_time
            if analogue_gain is not None:
                self._manual_analogue_gain = analogue_gain
            if preview_resolution is not None:
                self._preview_resolution = preview_resolution
            if capture_resolution is not None:
                self._capture_resolution = capture_resolution

            if self.running and self._camera is not None:
                if preview_changed:
                    self._restart_locked()
                else:
                    self._apply_settings_locked()
                    self._refresh_live_settings_locked()

            return self._settings_payload()

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

            capture_dir = settings.capture_root / req.project
            capture_dir.mkdir(parents=True, exist_ok=True)

            index = self._next_index(capture_dir, req.project, req.format)
            filename = f"{req.project}-{index:03d}.{req.format}"
            image_path = capture_dir / filename
            sidecar_path = image_path.with_suffix(".json")

            if self._camera is not None and self.running:
                self._capture_file_locked(str(image_path), req.format)
                camera_settings = {
                    "status": "captured",
                    "mode": "picamera2",
                    "last_error": self._last_error,
                    "camera_mode": self._mode,
                    "preview_resolution": self._preview_resolution,
                    "capture_resolution": self._capture_resolution,
                    "requested_exposure_time": self._manual_exposure_time if self._mode == "manual" else None,
                    "requested_analogue_gain": self._manual_analogue_gain if self._mode == "manual" else None,
                    "ae_enabled": self._live_ae_enabled,
                    "exposure_time": self._live_exposure_time,
                    "analogue_gain": self._live_analogue_gain,
                }
            else:
                # Fallback so filesystem flow is testable off-device.
                image_path.write_bytes(b"")
                camera_settings = {
                    "status": "stub_capture",
                    "mode": "stub",
                    "last_error": self._last_error,
                    "camera_mode": self._mode,
                    "preview_resolution": self._preview_resolution,
                    "capture_resolution": self._capture_resolution,
                    "requested_exposure_time": self._manual_exposure_time if self._mode == "manual" else None,
                    "requested_analogue_gain": self._manual_analogue_gain if self._mode == "manual" else None,
                    "ae_enabled": self._live_ae_enabled,
                    "exposure_time": self._live_exposure_time,
                    "analogue_gain": self._live_analogue_gain,
                }

            metadata = SidecarMetadata(
                timestamp=now.isoformat(),
                project=req.project,
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

    def _close_camera(self) -> None:
        camera = self._camera
        self._camera = None
        self._output.frame = None
        if camera is None:
            return
        try:
            camera.stop_recording()
        except Exception:
            pass
        try:
            camera.stop()
        except Exception:
            pass
        try:
            camera.close()
        except Exception:
            pass

    def _restart_locked(self) -> None:
        self._close_camera()
        self.running = False
        time.sleep(0.5)
        if Picamera2 is None:
            self._last_error = "Picamera2 is not available in this environment"
            return
        try:
            self._output = _StreamingOutput()
            self._camera = Picamera2()
            config = self._create_preview_configuration(self._camera)
            self._camera.configure(config)
            self._apply_settings_locked()
            self._camera.start_recording(JpegEncoder(), FileOutput(self._output))
            self.running = True
            self._last_error = None
            self._refresh_live_settings_locked()
        except Exception as exc:
            self._close_camera()
            self._last_error = f"Failed to start camera: {exc}"
            self.running = False

    def _apply_settings_locked(self) -> None:
        if self._camera is None:
            return

        if self._mode == "auto":
            self._camera.set_controls({"AeEnable": True})
        else:
            self._camera.set_controls(
                {
                    "AeEnable": False,
                    "ExposureTime": int(self._manual_exposure_time),
                    "AnalogueGain": float(self._manual_analogue_gain),
                }
            )

    def _create_preview_configuration(self, camera: Picamera2) -> object:
        return camera.create_video_configuration(
            main={
                "size": self._parse_resolution(self._preview_resolution),
                "format": "RGB888",
            }
        )

    def _capture_file_locked(self, path: str, fmt: str) -> None:
        if self._camera is None:
            raise RuntimeError("Camera is not running")

        try:
            self._camera.stop_recording()
        except Exception:
            pass

        try:
            still_config = self._camera.create_still_configuration(
                main={"size": self._parse_resolution(self._capture_resolution)}
            )
            self._apply_settings_locked()
            self._camera.switch_mode_and_capture_file(still_config, path, format=fmt)
            preview_config = self._create_preview_configuration(self._camera)
            self._camera.configure(preview_config)
            self._apply_settings_locked()
            self._output = _StreamingOutput()
            self._camera.start_recording(JpegEncoder(), FileOutput(self._output))
            self._refresh_live_settings_locked()
        except Exception as exc:
            self._last_error = f"Failed to capture image: {exc}"
            self.running = False
            self._close_camera()
            raise

    def _refresh_live_settings_locked(self) -> None:
        if self._camera is None or not self.running:
            return
        try:
            metadata = self._camera.capture_metadata()
            self._live_exposure_time = self._coerce_int(metadata.get("ExposureTime"))
            self._live_analogue_gain = self._coerce_float(metadata.get("AnalogueGain"))
            ae_meta = metadata.get("AeEnable")
            self._live_ae_enabled = bool(ae_meta) if ae_meta is not None else (self._mode == "auto")
        except Exception as exc:
            self._last_error = f"Failed to read camera metadata: {exc}"

    def _settings_payload(self) -> dict[str, object]:
        return {
            "mode": self._mode,
            "exposure_time": self._manual_exposure_time,
            "analogue_gain": self._manual_analogue_gain,
            "preview_resolution": self._preview_resolution,
            "capture_resolution": self._capture_resolution,
            "live_exposure_time": self._live_exposure_time,
            "live_analogue_gain": self._live_analogue_gain,
            "ae_enabled": self._live_ae_enabled,
            "last_error": self._last_error,
        }

    @staticmethod
    def _coerce_int(value: object) -> Optional[int]:
        if value is None:
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _coerce_float(value: object) -> Optional[float]:
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _parse_resolution(value: str) -> tuple[int, int]:
        width_str, height_str = value.lower().split("x", 1)
        return int(width_str), int(height_str)

    def _next_index(self, directory: Path, project: str, fmt: str) -> int:
        prefix = f"{project}-"
        suffix = f".{fmt}"
        matches = [p for p in directory.iterdir() if p.is_file() and p.name.startswith(prefix) and p.name.endswith(suffix)]
        return len(matches) + 1


camera_service = CameraService()
