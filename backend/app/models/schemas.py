from pathlib import Path
from typing import Literal, Optional, Union

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str


class CameraCaptureRequest(BaseModel):
    project: str
    session: str
    format: Literal["png", "jpeg"] = "png"


class CameraCaptureResponse(BaseModel):
    image_path: str
    sidecar_path: str


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
    session: str
    filename: str
    image_format: Literal["png", "jpeg"]
    xyz_position: dict[str, Optional[int]]
    rgbw_values: dict[str, int]
    camera_settings: dict[str, Optional[Union[str, int, float]]]
