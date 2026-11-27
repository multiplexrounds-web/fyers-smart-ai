import asyncio
import json
import threading
from typing import Callable, Optional, Tuple

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

SYMBOLS = [
    "NSE:NIFTY50-INDEX",
    "NSE:NIFTYBANK-INDEX",
    "NSE:FINNIFTY-INDEX",
    "BSE:SENSEX-INDEX",
]


class FyersStreamHub:
    """One read-only FYERS market-data stream shared with connected app clients."""

    def __init__(self):
        self.clients = set()
        self.loop = None
        self.socket = None
        self.starting = False
        self.lock = threading.Lock()

    async def broadcast(self, payload):
        stale = []
        for client in list(self.clients):
            try:
                await client.send_json(payload)
            except Exception:
                stale.append(client)
        for client in stale:
            self.clients.discard(client)

    def publish_from_thread(self, payload):
        loop = self.loop
        if loop and loop.is_running():
            asyncio.run_coroutine_threadsafe(self.broadcast(payload), loop)

    def start(self, app_id: str, access_token: str):
        with self.lock:
            if self.starting or self.socket is not None:
                return
            self.starting = True

        def run():
            try:
                from fyers_apiv3.FyersWebsocket import data_ws

                def on_message(message):
                    try:
                        payload = message
                        if isinstance(message, str):
                            payload = json.loads(message)
                        items = payload if isinstance(payload, list) else [payload]
                        for item in items:
                            if isinstance(item, dict) and item.get("symbol"):
                                self.publish_from_thread({"type": "tick", "data": item})
                    except Exception:
                        self.publish_from_thread({"type": "status", "status": "message_error"})

                def on_connect():
                    self.publish_from_thread({"type": "status", "status": "connected"})
                    self.socket.subscribe(symbols=SYMBOLS, data_type="SymbolUpdate")
                    self.socket.keep_running()

                def on_close(message):
                    self.publish_from_thread({"type": "status", "status": "disconnected"})

                def on_error(message):
                    self.publish_from_thread({"type": "status", "status": "stream_error"})

                self.socket = data_ws.FyersDataSocket(
                    access_token=f"{app_id}:{access_token}",
                    log_path="",
                    litemode=False,
                    write_to_file=False,
                    reconnect=True,
                    on_connect=on_connect,
                    on_close=on_close,
                    on_error=on_error,
                    on_message=on_message,
                )
                self.socket.connect()
            except Exception:
                self.publish_from_thread({"type": "status", "status": "unavailable"})
            finally:
                with self.lock:
                    self.socket = None
                    self.starting = False

        threading.Thread(target=run, name="fyers-market-stream", daemon=True).start()


def create_stream_router(token_provider: Callable[[], Tuple[Optional[str], Optional[str]]]):
    router = APIRouter()
    hub = FyersStreamHub()

    @router.websocket("/ws/market")
    async def market_stream(websocket: WebSocket):
        app_id, access_token = token_provider()
        if not app_id or not access_token:
            await websocket.close(code=4401, reason="FYERS authorization required")
            return

        await websocket.accept()
        hub.loop = asyncio.get_running_loop()
        hub.clients.add(websocket)
        await websocket.send_json({"type": "status", "status": "connecting"})
        hub.start(app_id, access_token)

        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            hub.clients.discard(websocket)
        except Exception:
            hub.clients.discard(websocket)

    return router
