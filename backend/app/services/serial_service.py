from __future__ import annotations

import re
import threading
import time
from dataclasses import dataclass
from typing import Optional

import serial
from serial.tools import list_ports

from app.core.config import settings
from app.services.serial_log_service import serial_log_service


@dataclass
class SerialService:
    _ser: Optional[serial.Serial] = None

    def __post_init__(self) -> None:
        self._lock = threading.Lock()
        self._last_error: Optional[str] = None
        self._connected_port: Optional[str] = None

    def ensure_connected(self) -> bool:
        if self._ser and self._ser.is_open:
            if self._connected_port and self._connected_port in {p["device"] for p in self.list_ports()}:
                return True
            self._last_error = "Serial device was disconnected"
            self.disconnect()
            return False

        if self._ser and not self._ser.is_open:
            self.disconnect()
            return False

        if self._ser and self._ser.is_open:
            return True

        port = settings.serial_port or self._autodetect_port()
        if not port:
            return False

        try:
            self._ser = serial.Serial(
                port=port,
                baudrate=settings.serial_baudrate,
                timeout=settings.serial_read_timeout_s,
                write_timeout=1.0,
            )
            # Give Nano time if it auto-resets on open.
            time.sleep(settings.serial_connect_delay_s)
            self._flush_input()
            self._connected_port = port
            self._last_error = None
            return True
        except Exception as exc:
            self._last_error = str(exc)
            self._ser = None
            self._connected_port = None
            return False

    def send_line(self, command: str, expect_reply: bool = True, timeout_s: float = 2.0, log_io: bool = True) -> str:
        with self._lock:
            if not self.ensure_connected():
                raise RuntimeError("Serial controller not connected")

            assert self._ser is not None
            try:
                stripped = command.strip()
                if log_io:
                    serial_log_service.append("tx", stripped)
                self._ser.write((stripped + "\n").encode("utf-8"))
                self._ser.flush()
            except Exception as exc:
                self._last_error = f"Serial write failed: {exc}"
                self.disconnect()
                raise RuntimeError(self._last_error)

            if not expect_reply:
                return ""

            lines: list[str] = []
            start = time.time()
            while time.time() - start < timeout_s:
                try:
                    raw = self._ser.readline()
                except Exception as exc:
                    self._last_error = f"Serial read failed: {exc}"
                    self.disconnect()
                    raise RuntimeError(self._last_error)
                if not raw:
                    continue
                line = raw.decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                lines.append(line)
                if log_io:
                    serial_log_service.append("rx", line)

                low = line.lower()
                if low in {"done", "done.", "ok"}:
                    break
                if low.startswith("error"):
                    break
                # Position and LED queries are single-line responses.
                if re.match(r"^-?\d+\s+-?\d+\s+-?\d+$", line) or line.startswith("led "):
                    break

            return "\n".join(lines).strip()

    def reconnect(self) -> bool:
        with self._lock:
            self.disconnect()
            return self.ensure_connected()

    def disconnect(self) -> None:
        if self._ser is not None:
            try:
                self._ser.close()
            except Exception:
                pass
        self._ser = None
        self._connected_port = None

    def status(self) -> dict[str, object]:
        ports = self.list_ports()
        port_names = {p["device"] for p in ports}
        connected = bool(self._ser and self._ser.is_open and self._connected_port in port_names)
        if not connected and self._ser is not None:
            self._last_error = self._last_error or "Serial device is not available"
            self.disconnect()
        return {
            "connected": connected,
            "port": self._connected_port if connected else None,
            "configured_port": settings.serial_port,
            "baudrate": settings.serial_baudrate,
            "ports": ports,
            "last_error": self._last_error,
        }

    def _flush_input(self) -> None:
        if self._ser is None:
            return
        try:
            self._ser.reset_input_buffer()
            self._ser.reset_output_buffer()
        except Exception:
            pass

    def _autodetect_port(self) -> Optional[str]:
        candidates = []
        for p in list_ports.comports():
            dev = p.device or ""
            desc = (p.description or "").lower()
            if "arduino" in desc or "ch340" in desc or "usb serial" in desc:
                candidates.append(dev)
            elif dev.startswith("/dev/ttyACM") or dev.startswith("/dev/ttyUSB") or dev.startswith("/dev/cu.usb"):
                candidates.append(dev)

        return candidates[0] if candidates else None

    def list_ports(self) -> list[dict[str, str]]:
        out: list[dict[str, str]] = []
        for p in list_ports.comports():
            out.append(
                {
                    "device": p.device or "",
                    "description": p.description or "",
                }
            )
        return out


serial_service = SerialService()
