from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.models.schemas import (
    CameraCaptureRequest,
    CameraCaptureResponse,
    HealthResponse,
    JogRequest,
    LightPresetRequest,
    RawCommandRequest,
    RgbwRequest,
)
from app.services.camera_service import camera_service
from app.services.motion_service import motion_service
from app.services.serial_service import serial_service
from app.services.serial_log_service import serial_log_service

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.post("/camera/start")
def camera_start() -> dict[str, str]:
    camera_service.start()
    return {"status": "started"}


@router.post("/camera/stop")
def camera_stop() -> dict[str, str]:
    camera_service.stop()
    return {"status": "stopped"}


@router.post("/camera/restart")
def camera_restart() -> dict[str, str]:
    camera_service.restart()
    return {"status": "restarted"}


@router.get("/camera/status")
def camera_status() -> dict[str, object]:
    return camera_service.status()


@router.get("/camera/stream")
def camera_stream() -> StreamingResponse:
    return StreamingResponse(
        camera_service.mjpeg_stream(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@router.post("/camera/capture", response_model=CameraCaptureResponse)
def camera_capture(req: CameraCaptureRequest) -> CameraCaptureResponse:
    return camera_service.capture(req)


@router.post("/motion/jog")
def motion_jog(req: JogRequest) -> dict[str, str]:
    try:
        motion_service.jog(req.axis, req.direction, req.steps)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return {"status": "ok"}


@router.post("/motion/raw")
def motion_raw(req: RawCommandRequest) -> dict[str, str]:
    try:
        reply = serial_service.send_line(req.command, expect_reply=True, timeout_s=3.0)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return {"status": "ok", "reply": reply or ""}


@router.get("/motion/position")
def motion_position() -> dict[str, int]:
    try:
        pos = motion_service.position()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return pos


@router.post("/light/set_rgbw")
def light_set(req: RgbwRequest) -> dict[str, str]:
    try:
        motion_service.set_rgbw(req.r, req.g, req.b, req.w, req.bri)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return {"status": "ok"}


@router.post("/light/preset")
def light_preset(req: LightPresetRequest) -> dict[str, str]:
    try:
        if req.preset == "white_full":
            motion_service.set_rgbw(0, 0, 0, 255, 255)
        elif req.preset == "off":
            motion_service.set_rgbw(0, 0, 0, 0, 0)
        else:
            raise HTTPException(status_code=400, detail="Unsupported preset")
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return {"status": "ok"}


@router.get("/serial/log")
def serial_log(limit: int = 200) -> list[dict[str, str]]:
    return serial_log_service.tail(limit)


@router.get("/serial/status")
def serial_status() -> dict[str, object]:
    return serial_service.status()


@router.post("/serial/reconnect")
def serial_reconnect() -> dict[str, object]:
    connected = serial_service.reconnect()
    return {"status": "connected" if connected else "disconnected", "connected": connected}
