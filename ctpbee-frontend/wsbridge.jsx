/* ===========================================================
   WebSocket bridge — connects to ctpbee Dispatcher bridge server
   (server.py) and maps incoming messages to window.MOCK.
   =========================================================== */

(function () {
  let WS_URL = window.location.protocol === 'https:'
    ? 'wss://' + window.location.host
    : 'ws://' + (window.location.hostname || 'localhost') + ':8765';

  let ws = null;
  let reconnectTimer = null;
  let reconnectDelay = 1000;
  let connected = false;
  let latencyMs = 0;
  let lastPingTime = 0;
  let connecting = false;
  const listeners = [];

  // ── ctpbee snake_case → MOCK camelCase mapping ──
  function mapTick(raw) {
    return {
      sym: raw.symbol || raw.sym || '',
      ex: raw.exchange || raw.ex,
      last: raw.last_price ?? raw.last,
      open: raw.open_price ?? raw.open,
      high: raw.high_price ?? raw.high,
      low: raw.low_price ?? raw.low,
      prev: raw.pre_settlement_price ?? raw.pre_close ?? raw.prev,
      vol: raw.volume ?? raw.vol,
      oi: raw.open_interest ?? raw.oi,
      bid_price_1: raw.bid_price_1, bid_price_2: raw.bid_price_2,
      bid_price_3: raw.bid_price_3, bid_price_4: raw.bid_price_4,
      bid_price_5: raw.bid_price_5,
      ask_price_1: raw.ask_price_1, ask_price_2: raw.ask_price_2,
      ask_price_3: raw.ask_price_3, ask_price_4: raw.ask_price_4,
      ask_price_5: raw.ask_price_5,
      bid_volume_1: raw.bid_volume_1, bid_volume_2: raw.bid_volume_2,
      bid_volume_3: raw.bid_volume_3, bid_volume_4: raw.bid_volume_4,
      bid_volume_5: raw.bid_volume_5,
      ask_volume_1: raw.ask_volume_1, ask_volume_2: raw.ask_volume_2,
      ask_volume_3: raw.ask_volume_3, ask_volume_4: raw.ask_volume_4,
      ask_volume_5: raw.ask_volume_5,
      last_volume: raw.last_volume || 0,
      limit_up: raw.limit_up,
      limit_down: raw.limit_down,
      average_price: raw.average_price,
      turnover: raw.turnover,
      datetime: raw.datetime,
    };
  }

  // ── ctpbee uses Chinese values natively — keep them as-is throughout ──

  function mapOrder(raw) {
    return {
      id: raw.local_order_id || raw.order_id || raw.id,
      order_id: raw.order_id || '',  // raw CTP order_id, needed for cancel
      sym: raw.symbol || raw.sym || '',
      ex: raw.exchange || raw.ex,
      dir: raw.direction || 'LONG',
      offset: raw.offset || 'OPEN',
      px: raw.price ?? raw.px,
      vol: raw.volume ?? raw.vol,
      traded: raw.traded ?? 0,
      status: raw.status || 'NOTTRADED',
      time: raw.time || nowHMS(),
      type: raw.type || 'LIMIT',
      _fromWire: true,
      _ts: Date.now(),
    };
  }

  function mapTrade(raw) {
    return {
      id: raw.tradeid || raw.id,
      orderId: raw.local_order_id || raw.order_id || raw.orderId,
      sym: raw.symbol || raw.sym || '',
      ex: raw.exchange || raw.ex,
      dir: raw.direction || 'LONG',
      offset: raw.offset || 'OPEN',
      px: raw.price ?? raw.px,
      vol: raw.volume ?? raw.vol,
      time: raw.time || nowHMS(),
      _fromWire: true,
    };
  }

  function mapPosition(raw) {
    return {
      sym: raw.symbol || raw.sym || '',
      ex: raw.exchange || raw.ex,
      dir: raw.direction || 'LONG',
      vol: raw.volume ?? raw.vol,
      ydVol: raw.yd_volume ?? raw.ydVol ?? 0,
      tdVol: (raw.volume ?? raw.vol) - (raw.yd_volume ?? raw.ydVol ?? 0),
      avgPx: raw.price ?? raw.avgPx ?? raw.open_price ?? 0,
      last: raw.last ?? raw.last_price ?? 0,
      frozen: raw.frozen ?? 0,
      pnl: raw.pnl ?? 0,
      float_pnl: raw.float_pnl ?? 0,
      _fromWire: true,
    };
  }

  // Pick only non-zero/undefined numeric value or fallback
  function pickVal(...vals) {
    for (const v of vals) {
      if (v !== undefined && v !== null) return v;
    }
    return undefined;
  }

  function mapContract(raw) {
    const c = {
      sym: raw.symbol || raw.sym || '',
      ex: raw.exchange || raw.ex,
      name: raw.name || '',
      tick: pickVal(raw.pricetick, raw.tick) ?? 1,
      mult: pickVal(raw.size, raw.mult) ?? 1,
      _fromWire: true,
    };
    // Only include market data fields that are actually present in the message
    const last = pickVal(raw.last, raw.last_price);
    if (last !== undefined) c.last = last;
    if (pickVal(raw.open_price, raw.open) !== undefined) c.open = pickVal(raw.open_price, raw.open);
    if (pickVal(raw.high_price, raw.high) !== undefined) c.high = pickVal(raw.high_price, raw.high);
    if (pickVal(raw.low_price, raw.low) !== undefined) c.low = pickVal(raw.low_price, raw.low);
    if (pickVal(raw.pre_settlement_price, raw.prev) !== undefined) c.prev = pickVal(raw.pre_settlement_price, raw.prev);
    if (pickVal(raw.volume, raw.vol) !== undefined) c.vol = pickVal(raw.volume, raw.vol);
    if (pickVal(raw.open_interest, raw.oi) !== undefined) c.oi = pickVal(raw.open_interest, raw.oi);
    if (raw.product) c.product = raw.product;
    if (pickVal(raw.min_volume) !== undefined) c.min_volume = pickVal(raw.min_volume);
    if (raw._fromWire !== undefined) c._fromWire = raw._fromWire;
    return c;
  }

  // No translation — ctpbee Chinese values pass through directly

  function nowHMS() {
    const d = new Date();
    return d.toTimeString().slice(0, 8);
  }

  // ── Apply incoming message to MOCK ──
  function applyMessage(msg) {
    const M = window.MOCK;
    if (!M) return;

    switch (msg.type) {
      case 'tick': {
        const t = mapTick(msg);
        const idx = M.contracts.findIndex(c => c.sym === t.sym);
        if (idx >= 0) {
          // Mutate in-place — preserves object reference for React.memo / useMemo cache
          Object.assign(M.contracts[idx], t);
        } else {
          M.contracts.push(t);
        }
        // Update positions with same symbol
        M.positions.forEach(p => {
          if (p.sym === t.sym) p.last = t.last;
        });
        // Update openOrders _lastPx
        M.openOrders.forEach(o => {
          if (o.sym === t.sym) o._lastPx = t.last;
        });
        // Append to time & sales — per-symbol buffer, max 30 per symbol
        if (t.last > 0) {
          const side = t.last >= (t.ask_price_1 || t.last) ? 'B' :
                       t.last <= (t.bid_price_1 || t.last) ? 'S' : 'B';
          const key = t.sym;
          if (!M._tnsBySym) M._tnsBySym = {};
          if (!M._tnsBySym[key]) M._tnsBySym[key] = [];
          M._tnsBySym[key].unshift({
            sym: t.sym,
            time: nowHMS(),
            px: t.last,
            qty: t.vol || t.last_volume || 1,
            side,
          });
          if (M._tnsBySym[key].length > 30) M._tnsBySym[key].pop();
          // Also maintain flat array for backward compat
          if (!M.tns) M.tns = [];
          M.tns.unshift({ sym: t.sym, time: nowHMS(), px: t.last, qty: t.vol || t.last_volume || 1, side });
          if (M.tns.length > 120) M.tns.length = 120;
        }
        break;
      }

      case 'order': {
        const o = mapOrder(msg);
        let idx = M.openOrders.findIndex(x => x.id === o.id);
        const statusEvt = statusToEvent(o.status);

        if (idx >= 0) {
          const old = M.openOrders[idx];
          M.openOrders[idx] = { ...old, ...o };
          if (old.status !== o.status) {
            M.orderLog.unshift({
              time: o.time, id: o.id, sym: o.sym,
              evt: statusEvt,
              msg: `订单状态: ${old.status} → ${o.status} ${o.traded ? o.traded + '/' + o.vol + '已成交' : ''}`,
              kind: evtToKind(statusEvt),
            });
          }
        } else {
          // ctpbee fires on_event(ORDER) in send_order with a locally-guessed
          // order_id before CTP confirms with the real exchange-assigned order_id.
          // When frontid/sessionid differ between local and exchange, the IDs
          // won't match. Reconcile by finding a recent wire-order with the same
          // symbol, direction, offset, volume and SUBMITTING status.
          const now = Date.now();
          const recIdx = M.openOrders.findIndex(x =>
            x.sym === o.sym && x.dir === o.dir && x.offset === o.offset &&
            x.vol === o.vol && x.status === 'SUBMITTING' &&
            x._fromWire && (now - (x._ts || 0)) < 15000
          );
          if (recIdx >= 0) {
            const old = M.openOrders[recIdx];
            M.openOrders[recIdx] = { ...old, ...o };
            M.orderLog.unshift({
              time: o.time, id: o.id, sym: o.sym,
              evt: statusEvt,
              msg: `回单确认 ${old.id} → ${o.id} ${o.status}`,
              kind: 'info',
            });
          } else {
            M.openOrders.unshift(o);
            M.orderLog.unshift({
              time: o.time, id: o.id, sym: o.sym,
              evt: statusEvt,
              msg: `新订单 ${o.dir} ${o.offset} ${o.vol}@${o.px}`,
              kind: 'info',
            });
          }
        }
        // Remove terminal orders from open list
        if (o.status === 'ALLTRADED' || o.status === 'CANCELLED' || o.status === 'REJECTED') {
          const rmIdx = M.openOrders.findIndex(x => x.id === o.id);
          if (rmIdx >= 0) M.openOrders.splice(rmIdx, 1);
        }
        break;
      }

      case 'trade': {
        const t = mapTrade(msg);
        if (!M.doneTrades.find(x => x.id === t.id)) {
          M.doneTrades.unshift(t);
        }
        // Update position volume
        // Chinese futures convention:
        //   OPEN:  trade dir matches position dir (buy open → LONG pos)
        //   CLOSE: trade dir is OPPOSITE to position dir (sell close → LONG pos)
        const isOpen = t.offset === 'OPEN';
        const posDir = isOpen ? t.dir : (t.dir === 'LONG' ? 'SHORT' : 'LONG');
        let matched = false;
        for (let i = 0; i < M.positions.length; i++) {
          const p = M.positions[i];
          if (p.sym !== t.sym || p.dir !== posDir) continue;
          matched = true;
          if (isOpen) {
            const oldNotional = p.avgPx * p.vol;
            const newNotional = t.px * t.vol;
            p.tdVol += t.vol;
            p.vol += t.vol;
            p.avgPx = p.vol > 0 ? (oldNotional + newNotional) / p.vol : t.px;
            p.last = t.px;
          } else {
            p.vol -= t.vol;
            if (t.offset === 'CLOSEYESTERDAY') p.ydVol -= t.vol;
            else p.tdVol -= t.vol;
          }
          if (p.vol <= 0) M.positions.splice(i, 1);
          break;
        }
        // If no matching position and this is an opening trade, create one
        if (!matched && isOpen) {
          M.positions.push({
            sym: t.sym, ex: t.ex, dir: t.dir,
            vol: t.vol, ydVol: 0, tdVol: t.vol,
            avgPx: t.px, last: t.px, frozen: 0,
          });
        }
        // Update open order traded count, remove if fully filled
        for (let i = M.openOrders.length - 1; i >= 0; i--) {
          const o = M.openOrders[i];
          if (o.id === t.orderId) {
            o.traded += t.vol;
            if (o.traded >= o.vol) {
              o.status = 'ALLTRADED';
              M.orderLog.unshift({
                time: t.time, id: o.id, sym: o.sym, evt: 'filled',
                msg: `全部成交 ${o.vol}@${t.px}`,
                kind: 'ok',
              });
              M.openOrders.splice(i, 1);
            } else {
              o.status = 'PARTTRADED';
            }
          }
        }
        break;
      }

      case 'position': {
        const p = mapPosition(msg);
        const idx = M.positions.findIndex(x => x.sym === p.sym && x.dir === p.dir);
        if (idx >= 0) {
          M.positions[idx] = { ...M.positions[idx], ...p };
        } else {
          M.positions.push(p);
        }
        // Remove zero-volume positions
        for (let i = M.positions.length - 1; i >= 0; i--) {
          if (M.positions[i].vol <= 0) M.positions.splice(i, 1);
        }
        recomputeRisk(M);
        break;
      }

      case 'contract': {
        const c = mapContract(msg);
        const idx = M.contracts.findIndex(x => x.sym === c.sym);
        if (idx >= 0) {
          // Merge: contract from ctpbee provides metadata (tick, mult, name)
          // but must preserve existing price data (last, open, etc.) from ticks
          const existing = M.contracts[idx];
          M.contracts[idx] = { ...existing, ...c, fav: existing.fav };
          // Market data from existing takes priority over contract defaults
          if (c.last === undefined && existing.last !== undefined) M.contracts[idx].last = existing.last;
        } else {
          // New contract without tick yet — set defaults
          M.contracts.push({ last: 0, open: 0, high: 0, low: 0, prev: 0, vol: 0, oi: 0, fav: false, ...c });
        }
        break;
      }

      case 'account': {
        M.account = {
          ...M.account,
          id: msg.accountid ?? M.account.id,
          broker: msg.gateway_name ?? M.account.broker,
          balance: msg.balance ?? M.account.balance,
          available: msg.available ?? M.account.available,
          margin: msg.margin ?? (msg.frozen ? (msg.balance - msg.available) : M.account.margin),
          frozen: msg.frozen ?? M.account.frozen,
          pnl: msg.pnl ?? M.account.pnl,
        };
        recomputeRisk(M);
        break;
      }

      case 'pong':
        if (lastPingTime > 0) {
          latencyMs = Math.round(performance.now() - lastPingTime);
          notifyStatus();
        }
        break;

      case 'ack':
        break;

      case 'error':
        console.warn('[wsbridge] server error:', msg.msg);
        break;
    }

    // Notify listeners (app.jsx re-render) — skip for ticks to avoid flooding
    // Tick data is picked up by the useTicker polling loop instead.
    if (msg.type !== 'tick') {
      listeners.forEach(fn => { try { fn(msg); } catch (e) { } });
    }
  }

  function statusToEvent(s) {
    // server.py 的 from_ctpbee 已把中文枚举翻成英文 NAME——这里以英文键为主,
    // 中文键仅作双保险(防御直连 Dispatcher 未经桥接翻译的场景)
    const m = { 'SUBMITTING': 'submit', 'NOTTRADED': 'accepted', 'PARTTRADED': 'partial',
                 'ALLTRADED': 'filled', 'CANCELLED': 'cancelled', 'REJECTED': 'rejected',
                 '提交中': 'submit', '未成交': 'accepted', '部分成交': 'partial',
                 '全部成交': 'filled', '已撤销': 'cancelled', '拒单': 'rejected' };
    return m[s] || s;
  }

  function evtToKind(e) {
    const m = { submit: 'info', accepted: 'ok', partial: 'amber',
                 filled: 'ok', cancelled: 'amber', rejected: 'err' };
    return m[e] || 'info';
  }

  // ── 风险度: 保证金占用 / 动态权益 ──
  // 柜台回报里没有这个字段——此前顶栏与下单脚注显示的 0.00% 是假数据。
  // 保证金占用 = 权益 − 可用(柜台口径); 权益取 balance(动态权益)。
  // 在账户回报与持仓变化后各重算一次。
  function recomputeRisk(M) {
    const a = M.account;
    const balance = Number(a.balance) || 0;
    const available = Number(a.available) || 0;
    if (a.margin === undefined || a.margin === null) {
      a.margin = Math.max(0, balance - available);
    }
    a.riskRatio = balance > 0 ? a.margin / balance : 0;
  }

  // ── Connection management ──
  let _firstConnect = true;

  function clearMockData() {
    const M = window.MOCK;
    if (!M) return;
    M.contracts.length = 0;
    M.positions.length = 0;
    M.openOrders.length = 0;
    M.doneTrades.length = 0;
    M.orderLog.length = 0;
  }

  function connect(url) {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    if (connecting) return;

    const target = url || WS_URL;
    connecting = true;

    try {
      ws = new WebSocket(target);
    } catch (e) {
      connecting = false;
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      connected = true;
      connecting = false;
      reconnectDelay = 1000;
      console.log('[wsbridge] connected to', target);
      // Clear mock data only after first successful connection
      if (_firstConnect) {
        _firstConnect = false;
        clearMockData();
      }
      notifyStatus();
      // Request initial contract list
      send('query_contracts', { index: 0 }).catch(() => {});
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        applyMessage(msg);
      } catch (e) {
        // ignore unparseable messages
      }
    };

    ws.onclose = () => {
      connected = false;
      connecting = false;
      ws = null;
      console.log('[wsbridge] disconnected');
      notifyStatus();
      scheduleReconnect();
    };

    ws.onerror = () => {
      connecting = false;
      // onclose will fire after this
    };
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.onclose = null; // prevent reconnect
      ws.close();
      ws = null;
    }
    connected = false;
    connecting = false;
    notifyStatus();
  }

  function setUrl(url) {
    if (!url) return;
    disconnect();
    WS_URL = url;
    reconnectDelay = 1000;
    connect(url);
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectDelay = Math.min(reconnectDelay * 1.5, 15000);
      console.log('[wsbridge] reconnecting in', (reconnectDelay / 1000).toFixed(1) + 's...');
      connect();
    }, reconnectDelay);
  }

  function notifyStatus() {
    listeners.forEach(fn => { try { fn({ type: '_status', connected, latency: latencyMs }); } catch (e) { } });
  }

  function send(action, data = {}) {
    return new Promise((resolve, reject) => {
      if (!connected || !ws) {
        reject(new Error('WebSocket not connected'));
        return;
      }
      const payload = JSON.stringify({ action, ...data });
      try {
        ws.send(payload);
        resolve({ type: 'ack', action });
      } catch (e) {
        reject(e);
      }
    });
  }

  function subscribe(listener) {
    listeners.push(listener);
    return () => {
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }

  function isConnected() { return connected; }
  function getLatency() { return latencyMs; }

  // Periodic ping for latency measurement (RTT via pong)
  setInterval(() => {
    if (!connected || !ws) return;
    lastPingTime = performance.now();
    send('ping').catch(() => {});
  }, 5000);

  // ── Expose to window ──
  window.__wsbridge = {
    connect,
    disconnect,
    setUrl,
    send,
    subscribe,
    isConnected,
    getLatency,
    getUrl: () => WS_URL,
  };

  // Defer auto-connect — login page will call setUrl/connect explicitly
})();
