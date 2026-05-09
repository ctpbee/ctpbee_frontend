# ctpbee Terminal

面向 [ctpbee](https://github.com/ctpbee/ctpbee) 量化交易框架的 Dispatcher 模式前端交易终端。

通过 Redis pub/sub 桥接 ctpbee 的事件引擎，提供实时行情、手动下单、撤单、持仓管理等功能。

## 架构

```
┌──────────────────────────────────────────────────┐
│  ctpbee Terminal (浏览器)                         │
│  React 18 · 原生 CSS · WebSocket                  │
└────────────┬─────────────────────────────────────┘
             │ ws://localhost:8765
┌────────────▼─────────────────────────────────────┐
│  server.py (WebSocket ↔ Redis 桥接)               │
│  Python asyncio · websockets · redis-py           │
└────────────┬─────────────────────────────────────┘
             │ Redis pub/sub
┌────────────▼─────────────────────────────────────┐
│  ctpbee Dispatcher (stream.py)                    │
│  TICK_KERNEL · ORDER_UP_KERNEL · ORDER_DOWN_KERNEL│
└────────────┬─────────────────────────────────────┘
             │ CTP / CTP Mini / Local / Looper
┌────────────▼─────────────────────────────────────┐
│  交易所 (SHFE · DCE · CZCE · CFFEX · INE)         │
└──────────────────────────────────────────────────┘
```

**两种运行模式**：
- **实盘模式**：连接 ctpbee Dispatcher 服务器，WebSocket 实时推送行情和订单状态
- **模拟模式**：未连接后端时自动降级，使用内置模拟数据演示界面功能

## 功能

| 功能 | 说明 |
|------|------|
| 合约列表 | 按交易所筛选、搜索、星标自选 |
| 实时行情 | 最新价、涨跌幅、5 档盘口深度、逐笔成交 |
| 下单 | 限价/市价/FAK/FOK，支持买开/卖开/买平/卖平 |
| 撤单 | 单笔撤单 + 一键全撤 |
| 持仓管理 | 多空分别显示，实时浮动盈亏 |
| 未成交订单 | 委托队列，状态实时更新 |
| 已成交查询 | 成交记录，关联委托号 |
| 报单日志 | 完整事件流：提交→接受→部分成交→全部成交→撤单→拒单 |
| 登录鉴权 | 可修改的用户名/密码，Dispatcher 地址配置 |
| 连接状态 | 顶栏 MD/TD/DSP 指示灯，底栏延迟/心跳 |

## 快速开始

### 1. 安装

```bash
# Linux / macOS
cd ctpbee-frontend
chmod +x install.sh
./install.sh

# Windows PowerShell
powershell -ExecutionPolicy Bypass -File install.ps1
```

安装脚本会自动：
- 检查 Python 3.8+
- 创建虚拟环境
- 安装依赖
- 生成 `.env` 配置文件

### 2. 启动桥接服务器

```bash
# 需要 ctpbee 运行中 + Redis 可用
source .venv/bin/activate  # Linux/macOS
# 或 .venv\Scripts\activate  # Windows
python server.py
```

也可以通过环境变量配置：

```bash
CTPBEE_REDIS_HOST=192.168.1.100 CTPBEE_WS_PORT=9000 python server.py
```

### 3. 打开前端

直接浏览器打开 `ctpbee-frontend/index.html`，或启动 HTTP 服务：

```bash
cd ctpbee-frontend
python -m http.server 8000
# 访问 http://localhost:8000/ctpbee-frontend/index.html
```

默认登录凭据：`admin` / `admin`

### 4. 配置 Dispatcher 地址

登录页底部的 `Dispatcher Address` 填写桥接服务器地址（默认 `ws://localhost:8765`），地址会自动持久化。

## 配置项

所有配置通过环境变量或 `.env` 文件设置：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CTPBEE_REDIS_HOST` | `127.0.0.1` | Redis 地址 |
| `CTPBEE_REDIS_PORT` | `6379` | Redis 端口 |
| `CTPBEE_REDIS_DB` | `0` | Redis 数据库编号 |
| `CTPBEE_ORDER_UP_KERNEL` | `ctpbee_order_up_kernel` | 上行通道（报单/撤单/查询） |
| `CTPBEE_ORDER_DOWN_KERNEL` | `ctpbee_order_down_kernel` | 下行通道（订单/成交/合约） |
| `CTPBEE_TICK_KERNEL` | `ctpbee_tick_kernel` | 行情通道 |
| `CTPBEE_WS_HOST` | `0.0.0.0` | WebSocket 监听地址 |
| `CTPBEE_WS_PORT` | `8765` | WebSocket 监听端口 |

## 目录结构

```
ctpbee-frontend/
├── README.md
├── requirements.txt          # Python 依赖
├── server.py                 # WebSocket ↔ Redis 桥接服务器
├── install.sh                # Linux/macOS 安装脚本
├── install.ps1               # Windows PowerShell 安装脚本
├── .env                      # 环境配置（安装时自动生成）
├── .gitignore
└── ctpbee-frontend/          # 前端资源
    ├── index.html            # 入口
    ├── terminal.css          # 设计系统（CSS 变量 + 组件样式）
    ├── data.jsx              # 模拟数据 + 行情模拟器
    ├── components.jsx        # 通用组件（Icon/Mark/Spark/Toast）
    ├── panels.jsx            # 业务面板（行情/盘口/下单/持仓/订单表格）
    ├── wsbridge.jsx          # WebSocket 桥接模块（自动重连/消息分发）
    └── app.jsx               # 应用骨架（登录/状态管理/事件处理）
```

## 设计说明

- **颜色约定（中国期货）**：红多绿空 — `--long: #ff4d4d`（买/涨），`--short: #22d39a`（卖/跌）
- **技术栈**：React 18 UMD + Babel Standalone（浏览器内 JSX 转译），无构建步骤
- **数据流**：所有 JSX 通过 `window.MOCK` 共享数据，WebSocket 消息直接写入 `MOCK` 对象并触发 UI 更新
- **合约代码**：保持 ctpbee 原始数据不做任何大小写转换，以 ctpbee 数据为准

### 报单生命周期

```
前端发送                     ctpbee send_order         CTP onRtnOrder/onRtnTrade
   │                              │                         │
   │  WS order ──────────────────►│                         │
   │                              │  on_event(ORDER)        │
   │                              │  local_order_id         │
   │                              │  (本地预估 ID)           │
   │  ◄─── SUBMITTING order ──────│                         │
   │  (加入未成交队列)              │                         │
   │                              │                         │  CTP 确认
   │                              │                         │  交易所返回真实 ID
   │  ◄─── 回单确认 ──────────────│◄────────────────────────│
   │  (按特征匹配合并，替换 ID)      │                         │
   │                              │                         │
   │  ◄─── ALLTRADED order ───────│◄────────────────────────│
   │  (从未成交队列移除)            │                         │
   │                              │                         │
   │  ◄─── Trade ─────────────────│◄────────────────────────│
   │  (已成交 + 更新持仓)           │                         │
```

关键行为：
- 前端不创建本地虚拟未成交单，完全根据 ctpbee 回单确定
- ctpbee `send_order` 用登录时的 `frontid/sessionid` 构造本地预估 ID，CTP `onRtnOrder` 用交易所返回的真实 `frontid/sessionid` 构造实际 ID——两者可能不同。前端会自动按 合约+方向+开平+数量+SUBMITTING 状态匹配合并
- 委托号展示使用 `local_order_id`（`{gateway}.{frontid}_{sessionid}_{orderref}`），由 ctpbee `__post_init__` 统一构造，格式一致
- 撤单发送原始 `order_id`（不含 gateway 前缀），匹配 CTP 撤单接口格式

### 持仓方向匹配

中国期货成交方向与持仓方向在平仓时相反：

| 操作 | 成交方向 | 影响的持仓方向 |
|------|---------|--------------|
| 买开 | LONG | LONG |
| 卖开 | SHORT | SHORT |
| 卖平 | SHORT | LONG |
| 买平 | LONG | SHORT |

前端处理成交数据时，平仓方向自动取反匹配对应持仓。

### WS 协议

- **上行**（前端 → bridge → ctpbee）：`{"action":"order"|"cancel"|"query_contracts","symbol":...,"direction":...}`
- **下行**（ctpbee → bridge → 前端）：`{"type":"tick"|"order"|"trade"|"position"|"contract"|"account",...}`
- **枚举转换**：ctpbee 使用中文枚举值（多/空/开/平/限价/市价），`server.py` 在 Redis 边界将中文值译为前端使用的英文 NAME（LONG/SHORT/OPEN/CLOSE/LIMIT/MARKET）

## License

MIT
