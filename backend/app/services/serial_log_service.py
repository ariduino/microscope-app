from collections import deque
from datetime import datetime, timezone


class SerialLogService:
    def __init__(self, max_lines: int = 5000):
        self._lines = deque(maxlen=max_lines)

    def append(self, direction: str, message: str) -> None:
        self._lines.append(
            {
                "ts": datetime.now(timezone.utc).isoformat(),
                "dir": direction,
                "msg": message,
            }
        )

    def tail(self, limit: int = 200) -> list[dict[str, str]]:
        if limit <= 0:
            return []
        return list(self._lines)[-limit:]


serial_log_service = SerialLogService()
