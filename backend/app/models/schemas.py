from pathlib import Path
from typing import Literal, Optional, Union

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str


class CameraCaptureRequest(BaseModel):
    project: str
    label: Optional[str] = None
    format: Literal["png", "jpeg"] = "png"


class CameraCaptureResponse(BaseModel):
    image_path: str
    sidecar_path: str


class CameraSettingsRequest(BaseModel):
    ae_mode: Literal["auto", "manual"]
    awb_mode: Literal["auto", "manual"]
    exposure_time: Optional[int] = Field(default=None, ge=1)
    analogue_gain: Optional[float] = Field(default=None, ge=1.0)
    red_gain: Optional[float] = Field(default=None, gt=0.0)
    blue_gain: Optional[float] = Field(default=None, gt=0.0)
    preview_resolution: Optional[str] = None
    capture_resolution: Optional[str] = None


class CameraSettingsResponse(BaseModel):
    ae_mode: Literal["auto", "manual"]
    awb_mode: Literal["auto", "manual"]
    exposure_time: Optional[int]
    analogue_gain: Optional[float]
    red_gain: Optional[float]
    blue_gain: Optional[float]
    preview_resolution: str
    capture_resolution: str
    live_exposure_time: Optional[int]
    live_analogue_gain: Optional[float]
    ae_enabled: Optional[bool]
    live_red_gain: Optional[float]
    live_blue_gain: Optional[float]
    awb_enabled: Optional[bool]
    last_error: Optional[str]


class JogRequest(BaseModel):
    axis: Literal["x", "y", "z"]
    direction: Literal["positive", "negative"]
    steps: int = Field(ge=1, le=20000)


class RawCommandRequest(BaseModel):
    command: str = Field(min_length=1, max_length=256)


class RgbwRequest(BaseModel):
    r: int = Field(ge=0, le=255)
    g: int = Field(ge=0, le=255)
    b: int = Field(ge=0, le=255)
    w: int = Field(ge=0, le=255)
    bri: int = Field(ge=0, le=255)


class LightPresetRequest(BaseModel):
    preset: Literal["white_full", "off"]


class SidecarMetadata(BaseModel):
    timestamp: str
    project: str
    label: Optional[str]
    filename: str
    image_format: Literal["png", "jpeg"]
    xyz_position: dict[str, Optional[int]]
    rgbw_values: dict[str, int]
    camera_settings: dict[str, Optional[Union[str, int, float, bool]]]
