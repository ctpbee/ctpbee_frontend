# -*- coding: utf-8 -*-
"""server.py 桥接层的单元测试(不需要 Redis / WebSocket)。

覆盖: 消息解析(parse_ctpbee_message 的实体嗅探与中文枚举翻译)、
上行命令翻译(to_ctpbee)、下行翻译(from_ctpbee)。
直接运行: python tests/test_server_bridge.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import server  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}: {name}" + (f" ({detail})" if detail else ""))


def envelope(inner: dict, index=0) -> str:
    return json.dumps({"data": json.dumps(inner, ensure_ascii=False),
                       "index": index}, ensure_ascii=False)


# ------------------------------------------------------------------ #
# A. parse_ctpbee_message: 实体类型嗅探
# ------------------------------------------------------------------ #
tick = envelope({
    "symbol": "ag2612", "exchange": "SHFE", "last_price": 7431.0,
    "bid_price_1": 7430.0, "volume": 12345, "direction": "多",  # direction 干扰项
})
p = server.parse_ctpbee_message(tick)
check("A1 tick 嗅探(不被 direction 干扰)", p and p["type"] == "tick")
check("A2 tick 保留 index → _index", p and p.get("_index") == 0)

order = envelope({"order_id": 99, "symbol": "ag2612", "exchange": "SHFE",
                  "status": "未成交", "direction": "多", "offset": "开",
                  "price": 7431.0, "volume": 2})
p = server.parse_ctpbee_message(order)
check("A3 order 嗅探 + 中文枚举翻译",
      p["type"] == "order" and p["status"] == "NOTTRADED"
      and p["direction"] == "LONG" and p["offset"] == "OPEN")

trade = envelope({"order_id": 99, "tradeid": "T1", "symbol": "ag2612",
                  "exchange": "SHFE", "direction": "空", "offset": "平今",
                  "price": 7420.0, "volume": 1})
p = server.parse_ctpbee_message(trade)
check("A4 trade 嗅探(order_id+tradeid 优先于 order)",
      p["type"] == "trade" and p["direction"] == "SHORT"
      and p["offset"] == "CLOSETODAY")

contract = envelope({"symbol": "ag2612", "exchange": "SHFE",
                     "pricetick": 1.0, "size": 15.0})
p = server.parse_ctpbee_message(contract)
check("A5 contract 嗅探(pricetick+size 优先于 tick)", p["type"] == "contract")

position = envelope({"symbol": "ag2612", "exchange": "SHFE",
                     "direction": "多", "open_price": 7400.0,
                     "yd_volume": 1, "volume": 2})
p = server.parse_ctpbee_message(position)
check("A6 position 嗅探", p["type"] == "position" and p["direction"] == "LONG")

account = envelope({"accountid": "001", "balance": 100000.0,
                    "available": 80000.0})
p = server.parse_ctpbee_message(account)
check("A7 account 嗅探", p["type"] == "account")

init = envelope({"type": "init_complete", "count": 500})
p = server.parse_ctpbee_message(init)
check("A8 init_complete → init", p["type"] == "init" and p["count"] == 500)

check("A9 坏 JSON → None", server.parse_ctpbee_message("not-json") is None)
check("A10 空 → None", server.parse_ctpbee_message("") is None)
weird = json.dumps({"data": {"foo": 1}, "index": 3})
p = server.parse_ctpbee_message(weird)
check("A11 未知形状 → unknown", p["type"] == "unknown")

# data 已是 dict(非字符串)的载荷
p = server.parse_ctpbee_message(json.dumps(
    {"data": {"symbol": "x", "pricetick": 1, "size": 10}, "index": 1}))
check("A12 data 为内嵌 dict 也能解析", p["type"] == "contract")

# ------------------------------------------------------------------ #
# B. to_ctpbee: 前端枚举名 → 中文值
# ------------------------------------------------------------------ #
cmd = {"symbol": "ag2612", "exchange": "SHFE", "direction": "LONG",
       "offset": "CLOSETODAY", "price": "7431", "volume": "2",
       "order_type": "FAK"}
c = server.to_ctpbee(cmd)
check("B1 方向/开平翻译 + 数值转换",
      c["direction"] == "多" and c["offset"] == "平今"
      and c["price"] == 7431.0 and c["volume"] == 2.0)
check("B2 本土化的订单类型(FAK 原样)", c["type"] == "FAK")
check("B3 local_symbol 拼接", c["local_symbol"] == "ag2612.SHFE")

c = server.to_ctpbee({"symbol": "rb2601", "exchange": "SHFE",
                       "direction": "SHORT", "price": 3400, "volume": 1})
check("B4 缺省 offset=OPEN type=限价",
      c["offset"] == "开" and c["type"] == "限价" and c["direction"] == "空")

# ------------------------------------------------------------------ #
# C. from_ctpbee: 双向翻译
# ------------------------------------------------------------------ #
inner = {"direction": "空", "offset": "平昨", "status": "已撤销", "type": "限价"}
t = server.from_ctpbee(inner)
check("C1 四字段全翻", t["direction"] == "SHORT" and t["offset"] == "CLOSEYESTERDAY"
      and t["status"] == "CANCELLED" and t["type"] == "LIMIT")

t = server.from_ctpbee({"direction": "自定义方向"})
check("C2 未知值原样保留", t["direction"] == "自定义方向")

print()
failed = [r for r in results if not r[1]]
print(f"{'=' * 60}\n{len(results) - len(failed)}/{len(results)} 通过")
sys.exit(1 if failed else 0)
