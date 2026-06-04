from __future__ import annotations

from dataclasses import dataclass
import re

from app.services.serial_service import serial_service

@dataclass
class MotionService:
    last_rgbw: tuple[int, int, int, int] = (0, 0, 0, 0)
    last_bri: int = 255
    last_position: dict[str, int] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.last_position is None:
            self.last_position = {"x": 0, "y": 0, "z": 0}

    def jog(self, axis: str, direction: str, steps: int) -> str:
        sign = 1 if direction == "positive" else -1
        signed_steps = sign * steps

        cmd_map = {"x": "mrx", "y": "mry", "z": "mrz"}
        cmd = f"{cmd_map[axis]} {signed_steps}"
        reply = serial_service.send_line(cmd, expect_reply=True, timeout_s=3.0)
        self._refresh_position_from_serial()
        return reply or "ok"

    def position(self) -> dict[str, int]:
        self._refresh_position_from_serial()
        return self.last_position

    def set_rgbw(self, r: int, g: int, b: int, w: int, bri: int) -> None:
        cmd = f"led {r} {g} {b} {w} {bri}"
        serial_service.send_line(cmd, expect_reply=True, timeout_s=2.0)
        self.last_rgbw = (r, g, b, w)
        self.last_bri = bri

    def _refresh_position_from_serial(self) -> None:
        reply = serial_service.send_line("p?", expect_reply=True, timeout_s=1.5)
        self._parse_and_store_position(reply)

    def _parse_and_store_position(self, reply: str) -> None:
        # Firmware returns "x y z" as plain ints.
        m_plain = re.search(r"(-?\d+)\s+(-?\d+)\s+(-?\d+)", reply)
        if m_plain:
            self.last_position = {
                "x": int(m_plain.group(1)),
                "y": int(m_plain.group(2)),
                "z": int(m_plain.group(3)),
            }
            return

        # Fallback for any verbose format like x=.. y=.. z=..
        m_labeled = re.search(r"x\s*=\s*(-?\d+).+y\s*=\s*(-?\d+).+z\s*=\s*(-?\d+)", reply, re.IGNORECASE)
        if m_labeled:
            self.last_position = {
                "x": int(m_labeled.group(1)),
                "y": int(m_labeled.group(2)),
                "z": int(m_labeled.group(3)),
            }


motion_service = MotionService()
