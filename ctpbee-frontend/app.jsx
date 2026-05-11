/* ===========================================================
   App shell — login gate → main terminal + WebSocket bridge
   =========================================================== */

const { useState, useEffect, useMemo } = React;

/* ----- Ticker: drives re-renders for real-time updates ----- */
function useTicker(intervalMs = 600) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

function useClock() {
  const [t, setT] = useState(window.nowHMS());
  useEffect(() => {
    const id = setInterval(() => setT(window.nowHMS()), 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

/* ----- Toast helper ----- */
let _toastId = 0;
function nextToastId() {
  return "t" + ++_toastId;
}

const LS_KEY_FAVS = "hexa_favs";
const LS_KEY_SEL = "hexa_selected";
const LS_KEY_DISPATCHER = "hexa_dispatcher";
const LS_KEY_USER = "hexa_user";
const LS_KEY_PASS = "hexa_pass";
const DEFAULT_USER = "admin";
const DEFAULT_PASS = "admin";

function loadFavs() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY_FAVS)) || [];
  } catch {
    return [];
  }
}
function saveFavs(favs) {
  try {
    localStorage.setItem(LS_KEY_FAVS, JSON.stringify(favs));
  } catch {}
}
function loadDispatcherUrl() {
  try {
    return localStorage.getItem(LS_KEY_DISPATCHER) || "ws://localhost:8765";
  } catch {
    return "ws://localhost:8765";
  }
}
function loadCreds() {
  try {
    var raw = localStorage.getItem(LS_KEY_PASS);
    var pass = DEFAULT_PASS;
    if (raw) {
      try {
        pass = decodeURIComponent(atob(raw));
      } catch (_) {
        try {
          pass = decodeURIComponent(escape(atob(raw)));
        } catch (_) {
          pass = raw;
        } // plaintext backward compat
      }
    }
    return {
      user: localStorage.getItem(LS_KEY_USER) || DEFAULT_USER,
      pass: pass,
    };
  } catch {
    return { user: DEFAULT_USER, pass: DEFAULT_PASS };
  }
}
function saveCreds(user, pass) {
  try {
    localStorage.setItem(LS_KEY_USER, user);
    localStorage.setItem(LS_KEY_PASS, btoa(encodeURIComponent(pass)));
  } catch {}
}

/* ===== Login Component ===== */
function Login({ onLogin, initError }) {
  const stored = loadCreds();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [dispatcher, setDispatcher] = useState(loadDispatcherUrl());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwdChange, setShowPwdChange] = useState(false);
  const [newUser, setNewUser] = useState(stored.user);
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("请输入用户名和密码");
      return;
    }
    const creds = loadCreds();
    if (username !== creds.user || password !== creds.pass) {
      setError("用户名或密码错误");
      return;
    }

    setLoading(true);
    try {
      localStorage.setItem(LS_KEY_DISPATCHER, dispatcher);
    } catch {}

    setTimeout(() => {
      setLoading(false);
      onLogin(dispatcher);
    }, 400);
  }

  function handleChangePwd(e) {
    e.preventDefault();
    setPwdMsg("");
    if (!newUser.trim()) {
      setPwdMsg("用户名不能为空");
      return;
    }
    if (!newPass) {
      setPwdMsg("密码不能为空");
      return;
    }
    if (newPass.length < 3) {
      setPwdMsg("密码至少 3 位");
      return;
    }
    if (newPass !== confirmPass) {
      setPwdMsg("两次密码输入不一致");
      return;
    }

    saveCreds(newUser.trim(), newPass);
    setShowPwdChange(false);
    setPwdMsg("密码已修改");
    setUsername("");
    setPassword("");

    // Auto-dismiss success message
    setTimeout(() => setPwdMsg(""), 2000);
  }

  const hintUser = stored.user;
  const isDefault =
    stored.user === DEFAULT_USER && stored.pass === DEFAULT_PASS;

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <div className="logo">
            ctpbee<span> terminal</span>
          </div>
          <div className="tagline">Dispatcher Frontend</div>
        </div>

        {!showPwdChange ? (
          <>
            <form onSubmit={handleSubmit}>
              <div className="login-field">
                <span className="lbl">Username</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={hintUser}
                  autoFocus
                  autoComplete="username"
                />
              </div>
              <div className="login-field">
                <span className="lbl">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="······"
                  autoComplete="current-password"
                />
              </div>
              <div
                className={`login-error ${error || initError ? "show" : ""}`}
              >
                {error || initError}
              </div>
              <button className="login-btn" type="submit" disabled={loading}>
                {loading ? "CONNECTING..." : "LOGIN"}
              </button>
            </form>
            <div className="login-hint">
              {pwdMsg && (
                <span style={{ color: "var(--ok)", marginRight: 12 }}>
                  {pwdMsg}
                </span>
              )}
              <span className="pwd-link" onClick={() => setShowPwdChange(true)}>
                修改密码
              </span>
            </div>
          </>
        ) : (
          <>
            <form onSubmit={handleChangePwd}>
              <div className="login-field">
                <span className="lbl">新用户名</span>
                <input
                  type="text"
                  value={newUser}
                  onChange={(e) => setNewUser(e.target.value)}
                  placeholder={DEFAULT_USER}
                  autoFocus
                />
              </div>
              <div className="login-field">
                <span className="lbl">新密码</span>
                <input
                  type="password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  placeholder="至少 3 位"
                  autoComplete="new-password"
                />
              </div>
              <div className="login-field">
                <span className="lbl">确认密码</span>
                <input
                  type="password"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  placeholder="再次输入密码"
                  autoComplete="new-password"
                />
              </div>
              <div className={`login-error ${pwdMsg ? "show" : ""}`}>
                {pwdMsg}
              </div>
              <button className="login-btn" type="submit">
                修改密码
              </button>
            </form>
            <div className="login-hint">
              <span
                className="pwd-link"
                onClick={() => {
                  setShowPwdChange(false);
                  setPwdMsg("");
                  setNewPass("");
                  setConfirmPass("");
                }}
              >
                返回登录
              </span>
            </div>
          </>
        )}

        <div className="login-divider" />
        <div className="login-field">
          <span className="lbl">Dispatcher Address</span>
          <input
            type="text"
            value={dispatcher}
            onChange={(e) => setDispatcher(e.target.value)}
            placeholder="ws://localhost:8765"
            spellCheck={false}
          />
        </div>
        <div className="login-hint">
          {isDefault ? (
            <>
              默认凭据 <em>{DEFAULT_USER}</em> / <em>{DEFAULT_PASS}</em>
              {" · "}启动 <em>python server.py</em> 连接 ctpbee
            </>
          ) : (
            <>
              凭据已自定义 · 用户名 <em>{hintUser}</em>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===== Main App ===== */
function App() {
  const M = window.MOCK;

  // ── App state: login → loading → ready ──
  const [appState, setAppState] = useState("login");
  const [wsUrl, setWsUrl] = useState(loadDispatcherUrl());
  const [loadProgress, setLoadProgress] = useState({
    contracts: 0,
    connected: false,
  });

  // ── Restore persisted state ──
  const [selected, setSelected] = useState(() => {
    try {
      return localStorage.getItem(LS_KEY_SEL) || "RB2510";
    } catch {
      return "RB2510";
    }
  });

  // Apply saved favs to MOCK contracts
  useEffect(() => {
    if (appState !== "ready") return;
    const favs = loadFavs();
    favs.forEach((sym) => {
      const c = M.contracts.find((x) => x.sym === sym);
      if (c) c.fav = true;
    });
    force((n) => n + 1);
  }, [appState]);

  useTicker(500);
  const clock = useClock();

  // ── View toggle: trade / market ──
  const [view, setView] = React.useState("trade");

  useEffect(() => {
    window.__simSelected = selected;
    try {
      localStorage.setItem(LS_KEY_SEL, selected);
    } catch {}
  }, [selected]);

  const [history, setHistory] = useState({});
  const [depthMap, setDepthMap] = useState({});
  const [toasts, setToasts] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsLatency, setWsLatency] = useState(0);
  const [, force] = useState(0);
  const [initError, setInitError] = useState("");

  const contract = M.contracts.find((c) => c.sym === selected);

  // ── Handle login: connect wsbridge with configured URL ──
  function handleLogin(url) {
    setInitError("");
    setWsUrl(url);
    setAppState("loading");
    setLoadProgress({ contracts: 0, connected: false });
    // 超时未收到初始化信号 → 返回登录页，提示错误
    setTimeout(() => {
      setAppState((prev) => {
        if (prev === "loading") {
          setInitError(
            "未收到 Dispatcher 初始化信号，请检查 ctpbee 是否已启动 (Dispatcher 模式) 且 Redis 可用",
          );
          return "login";
        }
        return prev;
      });
    }, 12000);
    // Connection will be established by the useEffect below
  }

  // ── WebSocket bridge — set up once on login, persists across loading→ready ──
  const active = appState !== "login";
  useEffect(() => {
    if (!active) return;
    const bridge = window.__wsbridge;
    if (!bridge) return;

    let _loadingDone = false;
    function onMsg(msg) {
      if (msg.type === "_status") {
        setWsConnected(msg.connected);
        setWsLatency(msg.latency || 0);
        setLoadProgress((p) => ({ ...p, connected: msg.connected }));
      }
      if (!_loadingDone && msg.type === "init") {
        _loadingDone = true;
        setInitError(""); // clear any pending timeout error
        console.log("[app] init complete, contracts:", msg.count);
        setAppState("ready");
      }
      force((n) => n + 1);
    }

    const unsub = bridge.subscribe(onMsg);
    bridge.setUrl(wsUrl);
    return unsub;
  }, [active, wsUrl]);

  // ── History & depth maintenance ──
  useEffect(() => {
    if (appState !== "ready") return;
    const id = setInterval(() => {
      setHistory((prev) => {
        const next = { ...prev };
        M.contracts.forEach((c) => {
          const old = next[c.sym] || [];
          const series = [...old, c.last];
          if (series.length > 80) series.shift();
          next[c.sym] = series;
        });
        return next;
      });
      setDepthMap((prev) => {
        const c = M.contracts.find((x) => x.sym === selected);
        return { ...prev, [selected]: M.genDepth(c) };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [selected, appState]);

  const depth = depthMap[selected] || (contract && M.genDepth(contract));

  // ── Toast ──
  function pushToast(t) {
    const id = nextToastId();
    setToasts((prev) => [...prev, { id, ...t }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((x) => x.id !== id)),
      3500,
    );
  }

  // ── Order submission ──
  function handleSubmit(o) {
    const bridge = window.__wsbridge;

    if (!bridge || !bridge.isConnected()) {
      pushToast({
        kind: "err",
        title: "Not Connected",
        msg: "WebSocket 未连接，无法发送报单",
      });
      return;
    }

    const index = Date.now() % 100000;
    const desc = `${dirZh(o.dir, o.offset)} ${o.qty}@${o.type === "市价" ? "市价" : o.px}`;
    M.orderLog.unshift({
      time: window.nowHMS(),
      sym: o.sym,
      evt: "submit",
      msg: `WS发送报单 ${desc}，等待回单...`,
      kind: "info",
    });
    bridge
      .send("order", {
        symbol: o.sym,
        exchange: o.ex,
        direction: o.dir,
        offset: o.offset,
        price: o.px,
        volume: o.qty,
        order_type: o.type || "LIMIT",
        index,
      })
      .then(() => {
        pushToast({ kind: "ok", title: "Order Sent", msg: `${o.sym} ${desc}` });
      })
      .catch((err) => {
        M.orderLog.unshift({
          time: window.nowHMS(),
          sym: o.sym,
          evt: "rejected",
          msg: `发送失败: ${err.message || "connection lost"}`,
          kind: "err",
        });
        pushToast({
          kind: "err",
          title: "Send Failed",
          msg: err.message || "connection lost",
        });
        force((n) => n + 1);
      });
    force((n) => n + 1);
  }

  // ── Cancel order ──
  function handleCancel(id) {
    const bridge = window.__wsbridge;
    const idx = M.openOrders.findIndex((o) => o.id === id);
    if (idx < 0) return;
    const o = M.openOrders[idx];

    if (!bridge || !bridge.isConnected()) {
      pushToast({
        kind: "err",
        title: "Not Connected",
        msg: "WebSocket 未连接，无法撤单",
      });
      return;
    }

    o._cancelling = true;
    const index = Date.now() % 100000;
    M.orderLog.unshift({
      time: window.nowHMS(),
      id,
      sym: o.sym,
      evt: "cancel-req",
      msg: `WS发送撤单请求`,
      kind: "info",
    });
    bridge
      .send("cancel", {
        order_id: o.order_id || id,
        symbol: o.sym,
        exchange: o.ex,
        index,
      })
      .then(() => {
        pushToast({ kind: "ok", title: "Cancel Sent", msg: `${id} ${o.sym}` });
      })
      .catch((err) => {
        o.status = "NOTTRADED";
        o._cancelling = false;
        M.orderLog.unshift({
          time: window.nowHMS(),
          id,
          sym: o.sym,
          evt: "rejected",
          msg: `撤单发送失败: ${err.message || "connection lost"}`,
          kind: "err",
        });
        pushToast({
          kind: "err",
          title: "Cancel Failed",
          msg: err.message || "connection lost",
        });
        force((n) => n + 1);
      });
    force((n) => n + 1);
  }

  // ── Cancel all active orders ──
  function handleCancelAll(orders) {
    orders.forEach((o) => handleCancel(o.id));
  }

  // ── Close all positions ──
  function handleCloseAll(positions) {
    const bridge = window.__wsbridge;
    if (!bridge || !bridge.isConnected()) {
      pushToast({
        kind: "err",
        title: "Not Connected",
        msg: "WebSocket 未连接，无法平仓",
      });
      return;
    }
    if (!confirm(`确认全部平仓？共 ${positions.length} 个持仓`)) return;

    positions.forEach((p) => {
      const c = M.contracts.find((x) => x.sym === p.sym);
      if (!c) return;
      const closeDir = p.dir === "LONG" ? "SHORT" : "LONG";

      const sendClose = (offset, vol) => {
        if (vol <= 0) return;
        // 用涨跌停价打限价单：买平用涨停价，卖平用跌停价 → 保证成交
        const isBuy = closeDir === "LONG";
        const limitPx = isBuy
          ? c.limit_up || c.last * 1.1
          : c.limit_down || c.last * 0.9;
        const index = Date.now() % 100000;
        M.orderLog.unshift({
          time: window.nowHMS(),
          sym: p.sym,
          evt: "submit",
          msg: `全平: ${dirZh(closeDir, offset)} ${vol}手 @${fmtPx(limitPx, c.tick)}`,
          kind: "info",
        });
        bridge
          .send("order", {
            symbol: p.sym,
            exchange: p.ex,
            direction: closeDir,
            offset,
            price: limitPx,
            volume: vol,
            order_type: "LIMIT",
            index,
          })
          .catch((err) => {
            M.orderLog.unshift({
              time: window.nowHMS(),
              sym: p.sym,
              evt: "rejected",
              msg: `全平发送失败: ${err.message || "connection lost"}`,
              kind: "err",
            });
          });
      };

      // SHFE/INE require split close: 平今 (today) vs 平昨 (yesterday)
      const isSplitEx = p.ex === "SHFE" || p.ex === "INE";
      if (isSplitEx) {
        sendClose("CLOSETODAY", p.tdVol);
        sendClose("CLOSEYESTERDAY", p.ydVol);
      } else {
        sendClose("CLOSE", p.vol);
      }
    });
    pushToast({
      kind: "ok",
      title: "Close All Sent",
      msg: `已发送 ${positions.length} 笔平仓单`,
    });
    force((n) => n + 1);
  }

  function toggleFav(sym) {
    const c = M.contracts.find((x) => x.sym === sym);
    if (c) {
      c.fav = !c.fav;
      window.__favVersion = (window.__favVersion || 0) + 1;
      saveFavs(M.contracts.filter((x) => x.fav).map((x) => x.sym));
      const bridge = window.__wsbridge;
      if (bridge && bridge.isConnected()) {
        console.log(
          `[fav] ${c.fav ? "subscribe" : "unsubscribe"} ${sym}.${c.ex}`,
        );
      }
      pushToast({
        kind: "ok",
        title: c.fav ? "已添加自选" : "已取消自选",
        msg: `${sym}.${c.ex} ${c.name}`,
      });
    }
    force((n) => n + 1);
  }

  // ── Keyboard shortcuts ──
  useEffect(() => {
    if (appState !== "ready") return;
    function onKey(e) {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === "/") {
        e.preventDefault();
        const input = document.querySelector(".search input");
        if (input) input.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [appState]);

  // ── Computed values (re-computed each render since data is mutable globals) ──
  const totalPnl = M.positions.reduce((acc, p) => {
    const c = M.contracts.find((x) => x.sym === p.sym);
    const sign = p.dir === "LONG" ? 1 : -1;
    return acc + (p.last - p.avgPx) * sign * p.vol * (c ? c.mult : 1);
  }, 0);

  const mdLive = M.contracts.some((c) => c.last > 0);
  const tdLive = M.account.balance > 0;

  const connLabel = wsConnected ? "DSP" : "OFF";
  const connTitle = [
    mdLive ? "MD ✓" : "MD ✗",
    tdLive ? "TD ✓" : "TD ✗",
    wsConnected ? "DSP ✓" : "DSP ✗",
  ].join(" · ");

  // ── Login gate ──
  if (appState === "login") {
    return <Login onLogin={handleLogin} initError={initError} />;
  }

  // ── Loading screen — 三步: 连接 → 数据 → 等待初始化信号 ──
  if (appState === "loading") {
    const step = loadProgress.connected ? 2 : 1;
    return (
      <div className="login-screen">
        <div
          className="login-card"
          style={{ textAlign: "center", padding: "48px 36px" }}
        >
          <div className="login-brand">
            <div className="logo">
              ctpbee<span> terminal</span>
            </div>
            <div className="tagline">正在初始化...</div>
          </div>
          <div style={{ margin: "28px 0 20px", textAlign: "left" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: step >= 1 ? "var(--short)" : "var(--fg-3)",
              }}
            >
              <span>{step >= 1 ? "●" : "○"}</span>
              <span>
                {step >= 1 ? "WebSocket 已连接" : "正在连接 WebSocket..."}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: step >= 2 ? "var(--amber)" : "var(--fg-3)",
              }}
            >
              <span>○</span>
              <span>合约数据加载中... {M.contracts.length} 个</span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: "var(--fg-3)",
              }}
            >
              <span>○</span>
              <span style={{ color: "var(--amber)" }}>
                等待 Dispatcher 初始化完成信号...
              </span>
            </div>
          </div>
          <div
            className="login-hint"
            style={{ color: "var(--fg-2)", fontSize: 10 }}
          >
            {!loadProgress.connected
              ? "请确认 server.py 已启动，Redis 可用"
              : "ctpbee Dispatcher 正在推送全部数据，完成后自动进入"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Top bar */}
      <div className="topbar">
        <div className="brand">
          <div className="mark">
            <Mark />
          </div>
          <div>
            <div className="name">
              ctpbee<span> terminal</span>
            </div>
          </div>
          <div className="ver">v0.5 · ctpbee dispatch</div>
        </div>
        <div className="menu">
          <div
            className="item"
            style={
              view === "trade"
                ? { color: "var(--amber)" }
                : { cursor: "pointer" }
            }
            onClick={() => setView("trade")}
          >
            交易
          </div>
          <div
            className="item"
            style={
              view === "market"
                ? { color: "var(--amber)" }
                : { cursor: "pointer" }
            }
            onClick={() => setView("market")}
          >
            行情
          </div>
          <div
            className="item"
            title="即将上线"
            style={{ opacity: 0.45, cursor: "not-allowed" }}
          >
            账户
          </div>
          <div
            className="item"
            title="即将上线"
            style={{ opacity: 0.45, cursor: "not-allowed" }}
          >
            分析
          </div>
          <div
            className="item"
            title="即将上线"
            style={{ opacity: 0.45, cursor: "not-allowed" }}
          >
            日志
          </div>
        </div>
        <div className="topstats">
          <div className="stat">
            <span className="lbl">Account</span>
            <span className="val" style={{ fontSize: 12 }}>
              {M.account.id} · {M.account.broker}
            </span>
          </div>
          <div className="stat">
            <span className="lbl">权益</span>
            <span className="val">
              ¥ {fmtNum(M.account.balance + totalPnl, 0)}
            </span>
          </div>
          <div className="stat">
            <span className="lbl">可用</span>
            <span className="val">¥ {fmtNum(M.account.available, 0)}</span>
          </div>
          <div className="stat">
            <span className="lbl">浮动盈亏</span>
            <span className={`val ${chgClass(totalPnl)}`}>
              {totalPnl >= 0 ? "+" : ""}¥ {fmtNum(Math.abs(totalPnl), 0)}
            </span>
          </div>
          <div className="stat">
            <span className="lbl">风险度</span>
            <span
              className="val"
              style={{
                color: M.account.riskRatio > 0.6 ? "var(--err)" : undefined,
              }}
            >
              {(M.account.riskRatio * 100).toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="conn" title={connTitle}>
          <div className="dots">
            <div
              className={`dot ${mdLive ? "" : "dim"}`}
              title={mdLive ? "行情数据接收中" : "等待行情数据..."}
            >
              MD
            </div>
            <div
              className={`dot ${tdLive ? "" : "dim"}`}
              title={tdLive ? "交易网关已连接" : "等待交易网关..."}
            >
              TD
            </div>
            <div
              className={`dot ${wsConnected ? "live" : "dim"}`}
              title={wsConnected ? "Dispatcher 已连接" : "Dispatcher 未连接"}
            >
              {connLabel}
            </div>
          </div>
        </div>
        <div className="clock">{clock}</div>
      </div>

      {/* Workspace */}
      {view === "market" ? (
        <div className="workspace" style={{ gridTemplateColumns: "1fr" }}>
          <MarketPanel
            contracts={M.contracts}
            onSelect={(sym) => {
              setSelected(sym);
              setView("trade");
            }}
            onToggleFav={toggleFav}
          />
        </div>
      ) : (
        <div className="workspace">
          <div className="col">
            <ContractList
              contracts={M.contracts}
              selected={selected}
              onSelect={setSelected}
              onToggleFav={toggleFav}
            />
          </div>

          <div className="col-mid">
            <div
              className="col"
              style={{ display: "flex", flexDirection: "column" }}
            >
              <QuoteHeader
                contract={contract}
                history={history[selected] || []}
              />
              <DepthBook
                contract={contract}
                depth={depth}
                tns={M.tns}
                onClickPx={(px) => {
                  if (window.__clickPx) window.__clickPx(px);
                }}
              />
            </div>
            <div className="col">
              <BlotterTabs
                positions={M.positions}
                openOrders={M.openOrders}
                doneTrades={M.doneTrades}
                orderLog={M.orderLog}
                onSelectSym={setSelected}
                onCancel={handleCancel}
                onCancelAll={handleCancelAll}
                onCloseAll={handleCloseAll}
              />
            </div>
          </div>

          <div className="col">
            <OrderTicket
              contract={contract}
              depth={depth}
              account={M.account}
              positions={M.positions}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div className="bottombar">
        <div className="seg">
          <span>Server</span>
          <b style={{ color: wsConnected ? "var(--short)" : "var(--err)" }}>
            {wsConnected ? wsUrl : "disconnected"}
          </b>
        </div>
        <div className="seg">
          <span>Latency</span>
          <b className={wsConnected ? "up" : ""}>
            {wsConnected ? wsLatency + "ms" : "—"}
          </b>
        </div>
        <div className="seg">
          <span>Heartbeat</span>
          <b style={{ color: wsConnected ? "var(--short)" : "var(--fg-3)" }}>
            {wsConnected ? "OK" : "OFF"}
          </b>
        </div>
        <div className="feed">
          {(() => {
            const tickers = M.contracts
              .filter((c) => c.last > 0 && c.prev > 0)
              .sort((a, b) => (b.vol || 0) - (a.vol || 0))
              .slice(0, 20);
            if (tickers.length === 0) {
              return (
                <span style={{ color: "var(--fg-3)" }}>等待行情数据...</span>
              );
            }
            return tickers.map((c, i) => {
              const chg = ((c.last - c.prev) / c.prev) * 100;
              const cls = chg >= 0 ? "up" : "down";
              const sign = chg >= 0 ? "+" : "";
              return (
                <span key={c.sym}>
                  {i > 0 && <em>•</em>}
                  <span style={{ color: "var(--fg-3)" }}>{c.ex} </span>
                  <span style={{ color: "var(--fg-0)", fontWeight: 500 }}>
                    {c.sym}{" "}
                  </span>
                  <span className={cls}>
                    {sign}
                    {chg.toFixed(2)}%
                  </span>
                </span>
              );
            });
          })()}
          {wsConnected ? (
            <span style={{ color: "var(--short)", marginLeft: 12 }}>
              <em>•</em> 会话已建立 · 行情/报单通道就绪
            </span>
          ) : (
            <span style={{ color: "var(--err)", marginLeft: 12 }}>
              <em>•</em> 未连接 · 启动 server.py 连接 Dispatcher
            </span>
          )}
        </div>
        <div className="seg">
          <span>Build</span>
          <b>2026.04.27</b>
        </div>
      </div>

      <ToastHost toasts={toasts} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
