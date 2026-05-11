# Changelog

## v0.6.0

##### 初始化握手信号

- **ctpbee/ctpbee/stream.py** — Dispatcher 的 `listen()` 中，`QueryContract` 分支推送完所有 positions/contracts/orders/trades 后，新增发布一条 `init_complete` 消息。关键修复：不能用 ctpbee 的 `dumps()`（对普通 dict 返回 None），必须用标准库 `json.dumps`。
- **ctpbee-frontend/server.py** — `parse_ctpbee_message()` 新增 `init_complete` → type=`"init"` 的识别，放在 entity 类型检测之前提前返回，避免走 `from_ctpbee` 翻译。
- **ctpbee-frontend/app.jsx** — `onMsg` 改为等 `msg.type === "init"` 才 `setAppState("ready")`，不再用 `contracts.length >= 100` 硬编码判断。Loading 界面改为三步显示。12 秒超时不再强制进入，改为退回登录页并提示错误。

##### 懒启动 Redis

- **ctpbee-frontend/server.py** — `main()` 启动时不再创建 `redis_task`，只监听 WebSocket。新增 `ensure_redis_started()` 函数和 `redis_start_lock`，在第一个客户端发来 `query_contracts` 时才启动 Redis subscriber。`redis_subscriber()` 去掉启动时自动发 query_contracts 的逻辑。新增全局变量 `redis_task`、`redis_ready`、`redis_start_lock` 管理 subscriber 生命周期。

##### Python 兼容性修复

- **ctpbee-frontend/server.py** — 新增 `from __future__ import annotations`。`asyncio.Task | None`、`dict | None`、`subprocess.Popen | None` 等 PEP 604 联合类型语法改为字符串字面量形式，兼容 Python 3.8。
- 三处 `await r.close()` / `await pubsub.close()` 改为 `await r.aclose()` / `await pubsub.aclose()`，消除 redis-py >= 5.0.1 的 `DeprecationWarning`。

##### 下单面板

- **panels.jsx — OrderTicket** — 移除 `dir` 状态和顶部 `dir-toggle` 方向切换按钮。两个提交按钮（买/卖）始终可用，一步完成方向选择加下单。摘要行「方向」改为「开平」。新增 `submit` callback 封装下单。
- **panels.jsx — OrderTicket** — 新增键盘快捷键：F1 买开、F2 卖开、F3 买平、F4 卖平（输入框内也生效）；+/- 调量、Ctrl+↑↓ 调价、Esc 取消焦点（输入框内不生效）。
- **panels.jsx — OrderTicket** — 修复 `stepPx` 在 `useEffect` 依赖数组中处于 TDZ 导致 `ReferenceError` 的 bug，依赖改为 `[submit, type]`。
- **panels.jsx — OrderTicket foot** — 新增 `positions` prop。下单面板底部显示当前合约持仓：`多 N 手 @均价` / `空 N 手 @均价`，颜色红多绿空。

##### 持仓面板

- **panels.jsx — PositionsTbl** — 新增列头点击排序，默认按浮动盈亏降序。支持合约/方向/总持/昨仓/今仓/开仓均价/最新价/浮动盈亏/盈亏% 排序，箭头 ↑↓ 指示。修复 `useMemo` 缓存过期 bug（`M.positions` 就地突变导致引用不变），改用 IIFE 即时计算。
- **panels.jsx — BlotterTabs** — 新增 `onCloseAll` prop。持仓 Tab 显示绿色「全平 N」按钮（仅持仓数大于 0 时显示）。

##### 顶栏与底栏

- **app.jsx — 顶栏菜单** — 「账户」「分析」「日志」三个死链接加上 `opacity: 0.45`、`cursor: not-allowed`、`title="即将上线"`。
- **app.jsx — 底栏行情滚动** — 硬编码的假数据替换为实时 Top 20 成交量合约涨跌幅，红涨绿跌。
- **app.jsx — MD/TD/DSP 独立指示灯** — `mdLive`、`tdLive`、`wsConnected` 各自反映行情流/交易网关/桥接的真实连接状态，Tooltip 显示 `MD ✓ · TD ✗ · DSP ✓`。
- **terminal.css — Toast** — `.toast-wrap` 从右下角移到左下角，不挡下单面板。

##### 全平风控

- **app.jsx — handleCloseAll** — 改用涨跌停价打限价单替代市价单：卖平用跌停价、买平用涨停价，`order_type` 从 `MARKET` 改为 `LIMIT`。SHFE/INE 自动拆分平今/平昨，其他交易所发单笔 `CLOSE`。

##### 部署优化

- **ctpbee-frontend/start.py** — 新增统一启动器，一个命令同时启动 WebSocket 桥接加 HTTP 前端。支持 `--dev`、`--no-bridge`、`--no-http` 参数。
- **ctpbee-frontend/install.sh** — `setup_venv()` 改为交互式询问。`install_deps()` 根据 `USE_VENV` 自动选 pip 路径。启动提示改为 `python start.py`。
- **ctpbee-frontend/install.ps1** — 同样改为交互式询问，`$UseVenv` 驱动 pip/python 路径选择。
- **ctpbee-frontend/README.md** — 启动说明改为 `python start.py`，展示有/无 venv 两条路径。

##### CDN 依赖

- **ctpbee-frontend/index.html** — React/ReactDOM/Babel 从 `cdn.jsdelivr.net` 换成 `cdn.staticfile.net`（七牛 Staticfile）。React/ReactDOM 从 development 切到 production.min。Babel 版本适配七牛可用版本 7.23.8。去掉 `crossorigin="anonymous"` 属性。
