from pathlib import Path
import os
from typing import Optional

from pydantic import BaseModel


class Settings(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: list[str] = ["*"]
    position_poll_interval_ms: int = 500
    serial_read_timeout_s: float = 0.2
    serial_port: Optional[str] = os.getenv("SERIAL_PORT")
    serial_baudrate: int = int(os.getenv("SERIAL_BAUDRATE", "115200"))
    serial_connect_delay_s: float = float(os.getenv("SERIAL_CONNECT_DELAY_S", "2.0"))
    capture_root: Path = Path.home() / "MicroscopeCaptures"
    frontend_dist: Path = Path(__file__).resolve().parents[3] / "frontend" / "dist"


settings = Settings()
