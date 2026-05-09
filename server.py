"""
ctpbee Frontend Bridge Server
Bridges ctpbee Dispatcher (Redis pub/sub) to WebSocket for browser clients.

ctpbee Dispatcher channels (configurable via ctpbee config):
  ORDER_UP_KERNEL   -> receives OrderRequest / CancelRequest / QueryContract
  ORDER_DOWN_KERNEL -> publishes OrderData / TradeData / ContractData
  TICK_KERNEL       -> publishes TickData

Message envelope: {"data": "<serialized_json>", "index": <int>}
The inner data is a JSON-serialized ctpbee entity (dumps/loads via ProxyPollen).
"""

import asyncio
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import redis.asyncio as aioredis
from websockets.asyncio.server import serve as ws_serve
from websockets.exceptions import ConnectionClosed

# ── Config from environment ──
REDIS_HOST = os.environ.get("CTPBEE_REDIS_HOST", "127.0.0.1")
REDIS_PORT = int(os.environ.get("CTPBEE_REDIS_PORT", 6379))
REDIS_DB = int(os.environ.get("CTPBEE_REDIS_DB", 0))

ORDER_UP_KERNEL = os.environ.get("CTPBEE_ORDER_UP_KERNEL", "ctpbee_order_up_kernel")
ORDER_DOWN_KERNEL = os.environ.get("CTPBEE_ORDER_DOWN_KERNEL", "ctpbee_order_down_kernel")
TICK_KERNEL = os.environ.get("CTPBEE_TICK_KERNEL", "ctpbee_tick_kernel")

WS_HOST = os.environ.get("CTPBEE_WS_HOST", "127.0.0.1")
WS_PORT = int(os.environ.get("CTPBEE_WS_PORT", 8765))

# ── Enum translation: frontend uses ctpbee Python Enum NAMES (LONG/SHORT/OPEN/etc.)
#    ctpbee Pollen serializes Enum VALUES (多/空/开/etc.) — translate at Redis boundary
_NAME_TO_VAL = {
    "LONG": "多", "SHORT": "空",
    "OPEN": "开", "CLOSE": "平", "CLOSETODAY": "平今", "CLOSEYESTERDAY": "平昨",
    "LIMIT": "限价", "MARKET": "市价", "FAK": "FAK", "FOK": "FOK",
}
_VAL_TO_NAME = {v: k for k, v in _NAME_TO_VAL.items()}


def to_ctpbee(cmd: dict) -> dict:
    """Translate frontend Enum NAMES → ctpbee Chinese VALUES for Redis publish."""
    return {
        "symbol": cmd["symbol"],
        "exchange": cmd["exchange"],
        "local_symbol": f"{cmd['symbol']}.{cmd['exchange']}",
        "direction": _NAME_TO_VAL.get(cmd["direction"], cmd["direction"]),
        "type": _NAME_TO_VAL.get(cmd.get("order_type", "LIMIT"), cmd.get("order_type", "LIMIT")),
        "price": float(cmd["price"]),
        "volume": float(cmd["volume"]),
        "offset": _NAME_TO_VAL.get(cmd.get("offset", "OPEN"), cmd.get("offset", "OPEN")),
    }


_STATUS_TO_NAME = {
    "提交中": "SUBMITTING", "未成交": "NOTTRADED", "部分成交": "PARTTRADED",
    "全部成交": "ALLTRADED", "已撤销": "CANCELLED", "拒单": "REJECTED",
}

def from_ctpbee(inner: dict) -> dict:
    """Translate ctpbee Chinese VALUES → frontend Enum NAMES."""
    for field in ("direction", "offset", "type", "status"):
        if field in inner and isinstance(inner[field], str):
            inner[field] = _VAL_TO_NAME.get(inner[field], _STATUS_TO_NAME.get(inner[field], inner[field]))
    return inner


# ── Connected WebSocket clients ──
clients: set[Any] = set()

# ── Cached contracts (indexed by symbol) ──
cached_contracts: dict[str, dict] = {}


def parse_ctpbee_message(raw: str) -> dict | None:
    """
    Parse a ctpbee DDDR/UDDR envelope:
      {"data": "<json_str>", "index": <int|null>}
    Returns a flat dict ready for the frontend, with a `type` key added.
    """
    if not raw:
        return None
    try:
        envelope = json.loads(raw)
    except json.JSONDecodeError:
        return None

    index = envelope.get("index")
    inner = envelope.get("data")
    if isinstance(inner, str):
        try:
            inner = json.loads(inner)
        except (json.JSONDecodeError, TypeError):
            pass

    if not isinstance(inner, dict):
        return None

    # Determine entity type by characteristic fields
    # Note: contract MUST come before tick — some contracts also match tick conditions
    if "pricetick" in inner and "size" in inner:
        inner["type"] = "contract"
    elif "tradeid" in inner and "order_id" in inner:
        inner["type"] = "trade"
    elif "order_id" in inner:
        inner["type"] = "order"
    elif "last_price" in inner and "bid_price_1" in inner:
        inner["type"] = "tick"
    elif "direction" in inner and "open_price" in inner and "yd_volume" in inner:
        inner["type"] = "position"
    elif "balance" in inner and "available" in inner:
        inner["type"] = "account"
    else:
        inner["type"] = "unknown"

    if index is not None:
        inner["_index"] = index

    # Translate Chinese enum values → ctpbee Enum NAMES for frontend
    return from_ctpbee(inner)


async def redis_subscriber():
    """
    Subscribe to ctpbee Redis channels and broadcast parsed messages
    to all connected WebSocket clients.
    """
    while True:
        r = None
        pubsub = None
        try:
            r = aioredis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB,
                               decode_responses=True)
            pubsub = r.pubsub()
            await pubsub.subscribe(TICK_KERNEL, ORDER_DOWN_KERNEL)
            print(f"[redis] subscribed to: {TICK_KERNEL}, {ORDER_DOWN_KERNEL}")

            # Immediately query contracts from ctpbee Dispatcher
            query_envelope = json.dumps({
                "data": json.dumps({"index": 0, "name": "ctpbee"}),
                "index": 0,
            }, ensure_ascii=False)
            await r.publish(ORDER_UP_KERNEL, query_envelope)
            print(f"[redis] sent query_contracts to {ORDER_UP_KERNEL}")

            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                parsed = parse_ctpbee_message(message["data"])
                if parsed is None:
                    continue

                msg_type = parsed.get("type", "?")
                print(f"[redis] recv channel={message['channel']} type={msg_type}")

                # Cache contracts for new clients
                if msg_type == "contract":
                    sym = parsed.get("symbol", "")
                    if sym:
                        cached_contracts[sym] = parsed
                        if len(cached_contracts) % 50 == 0:
                            print(f"[redis] contracts cached: {len(cached_contracts)}")

                payload = json.dumps(parsed, ensure_ascii=False)
                gone = set()
                for ws in clients.copy():
                    try:
                        await ws.send(payload)
                    except (ConnectionClosed, OSError):
                        gone.add(ws)
                clients.difference_update(gone)

        except (aioredis.ConnectionError, OSError) as e:
            print(f"[redis] connection error: {e}  (retrying in 3s...)")
            await asyncio.sleep(3)
        finally:
            if pubsub:
                try: await pubsub.close()
                except Exception: pass
            if r:
                try: await r.close()
                except Exception: pass


async def redis_publisher(msg: dict):
    """Publish an upstream message (order / cancel / query) to Redis."""
    r = None
    try:
        r = aioredis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB,
                           decode_responses=True)
        envelope = json.dumps({
            "data": json.dumps(msg.get("data", msg)),
            "index": msg.get("index", 0),
        }, ensure_ascii=False)
        await r.publish(ORDER_UP_KERNEL, envelope)
    except Exception as e:
        print(f"[redis] publish error: {e}")
    finally:
        if r:
            try: await r.close()
            except Exception: pass


async def ws_handler(websocket):
    """Handle a single WebSocket client connection."""
    clients.add(websocket)
    peer = websocket.remote_address
    print(f"[ws] client connected: {peer}  (total={len(clients)})")

    # Push cached contracts to new client immediately (snapshot to avoid mutation during iteration)
    if cached_contracts:
        snapshot = list(cached_contracts.values())
        for data in snapshot:
            payload = json.dumps(data, ensure_ascii=False)
            try:
                await websocket.send(payload)
            except (ConnectionClosed, OSError):
                break
        print(f"[ws] pushed {len(snapshot)} cached contracts to {peer}")

    try:
        async for raw in websocket:
            try:
                cmd = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send(json.dumps({"type": "error", "msg": "invalid json"}))
                continue

            action = cmd.get("action")
            if action == "ping":
                await websocket.send(json.dumps({"type": "pong"}))

            elif action == "order":
                required = ("symbol", "exchange", "direction", "price", "volume")
                if not all(k in cmd for k in required):
                    await websocket.send(json.dumps({
                        "type": "error", "msg": f"order requires fields: {required}"
                    }, ensure_ascii=False))
                    continue
                order_data = to_ctpbee(cmd)
                print(f"[order] {order_data['symbol']}.{order_data['exchange']} "
                      f"{order_data['direction']}{order_data['offset']} "
                      f"{order_data['volume']}@{order_data['price']} {order_data['type']}")
                await redis_publisher({"data": order_data, "index": cmd.get("index", 0)})
                await websocket.send(json.dumps({
                    "type": "ack", "action": "order",
                    "msg": f"order sent: {cmd['symbol']} {cmd['direction']} {cmd['volume']}@{cmd['price']}"
                }, ensure_ascii=False))

            elif action == "cancel":
                required = ("order_id", "symbol", "exchange")
                if not all(k in cmd for k in required):
                    await websocket.send(json.dumps({
                        "type": "error", "msg": f"cancel requires fields: {required}"
                    }, ensure_ascii=False))
                    continue
                cancel_data = {
                    "order_id": cmd["order_id"],
                    "symbol": cmd["symbol"],
                    "exchange": cmd["exchange"],
                    "local_symbol": f"{cmd['symbol']}.{cmd['exchange']}",
                }
                await redis_publisher({"data": cancel_data, "index": cmd.get("index", 0)})
                await websocket.send(json.dumps({
                    "type": "ack", "action": "cancel",
                    "msg": f"cancel sent: {cmd['order_id']}"
                }, ensure_ascii=False))

            elif action == "query_contracts":
                query_data = {"index": cmd.get("index", 0), "name": "ctpbee"}
                await redis_publisher({"data": query_data, "index": cmd.get("index", 0)})
                await websocket.send(json.dumps({
                    "type": "ack", "action": "query_contracts",
                    "msg": "contract query sent"
                }, ensure_ascii=False))

            else:
                await websocket.send(json.dumps({
                    "type": "error", "msg": f"unknown action: {action}"
                }, ensure_ascii=False))

    except ConnectionClosed:
        pass
    finally:
        clients.discard(websocket)
        print(f"[ws] client disconnected: {peer}  (total={len(clients)})")


def check_ctpbee():
    """Verify ctpbee >= 1.7.4 is installed."""
    try:
        from ctpbee import __version__
    except ImportError:
        sys.exit("ctpbee not installed. Run: pip install ctpbee>=1.7.4")
    parts = tuple(int(x) for x in __version__.split("."))
    if parts < (1, 7, 4):
        sys.exit(f"ctpbee {__version__} is too old, need >= 1.7.4. Run: pip install ctpbee>=1.7.4")


async def main():
    check_ctpbee()
    print(f"  ctpbee Frontend Bridge Server")
    print(f"  Redis: {REDIS_HOST}:{REDIS_PORT} db={REDIS_DB}")
    print(f"  WebSocket: {WS_HOST}:{WS_PORT}")

    stop = asyncio.Event()

    def shutdown():
        print("\n[server] shutting down...")
        stop.set()

    sigs = [signal.SIGINT]
    if hasattr(signal, 'SIGTERM'):
        sigs.append(signal.SIGTERM)
    for sig in sigs:
        try:
            signal.signal(sig, lambda *_: shutdown())
        except (ValueError, OSError):
            pass

    redis_task = asyncio.create_task(redis_subscriber())

    async with ws_serve(ws_handler, WS_HOST, WS_PORT):
        print(f"[server] ready — open ctpbee-frontend/index.html to connect")
        await stop.wait()

    redis_task.cancel()
    print("[server] stopped.")


# ── Dev mode: auto-reload on file changes ──
WATCH_DIRS = [
    Path(__file__).resolve().parent,  # server.py + ctpbee-frontend/
]


def collect_mtimes() -> dict[str, float]:
    """Walk watched dirs and return {path: mtime} for tracked extensions."""
    exts = {".py", ".jsx", ".js", ".css", ".html"}
    result: dict[str, float] = {}
    for d in WATCH_DIRS:
        if not d.is_dir():
            continue
        for p in d.rglob("*"):
            if p.is_file() and p.suffix in exts:
                # Skip __pycache__, .venv, .git, node_modules
                if any(x in p.parts for x in ("__pycache__", ".venv", ".git", "node_modules")):
                    continue
                try:
                    result[str(p)] = p.stat().st_mtime
                except OSError:
                    pass
    return result


def dev_runner():
    """Run server in a subprocess, restart on file changes."""
    print("  ctpbee Bridge Server [dev mode — auto-reload]")
    print(f"  watching: {', '.join(str(d) for d in WATCH_DIRS)}")
    print()

    proc: subprocess.Popen | None = None

    def start():
        nonlocal proc
        if proc is not None:
            print("[dev] stopping old server...")
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except (subprocess.TimeoutExpired, OSError):
                proc.kill()
                proc.wait()
        print("[dev] starting server...")
        proc = subprocess.Popen(
            [sys.executable, "-u", __file__],
            stdout=sys.stdout, stderr=sys.stderr,
        )

    def stop():
        nonlocal proc
        if proc is not None:
            print("[dev] stopping server...")
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except (subprocess.TimeoutExpired, OSError):
                proc.kill()
                proc.wait()
            proc = None

    start()
    prev_mtimes = collect_mtimes()

    try:
        while True:
            time.sleep(1.5)
            curr = collect_mtimes()
            changed = []
            for path, mt in curr.items():
                if path not in prev_mtimes or mt > prev_mtimes[path]:
                    changed.append(path)
            # Also detect deleted/added files
            for path in prev_mtimes:
                if path not in curr:
                    changed.append(path)

            if changed:
                names = [Path(p).name for p in changed]
                print(f"\n[dev] {len(changed)} file(s) changed: {', '.join(names[:6])}{'...' if len(names) > 6 else ''}")
                print("[dev] restarting...")
                start()
                prev_mtimes = collect_mtimes()
    except KeyboardInterrupt:
        print()
    finally:
        stop()
        print("[dev] stopped.")


if __name__ == "__main__":
    if "--dev" in sys.argv or "--watch" in sys.argv:
        dev_runner()
    else:
        asyncio.run(main())
