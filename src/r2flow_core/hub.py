from __future__ import annotations

from fastapi import WebSocket

# Минимальный fan-out для live-логов: run_id -> сокеты.
# Красиво и без Redis: для solo/team хватает, для scale — заменим на pub/sub.


class LogHub:
    def __init__(self) -> None:
        self._rooms: dict[str, set[WebSocket]] = {}

    async def join(self, room: str, ws: WebSocket) -> None:
        await ws.accept()
        self._rooms.setdefault(room, set()).add(ws)

    def leave(self, room: str, ws: WebSocket) -> None:
        room_set = self._rooms.get(room)
        if room_set and ws in room_set:
            room_set.remove(ws)

    async def send(self, room: str, message: dict) -> None:
        dead: list[WebSocket] = []
        for ws in list(self._rooms.get(room, set())):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.leave(room, ws)


hub = LogHub()
