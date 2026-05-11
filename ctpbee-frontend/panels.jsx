/* ===========================================================
   Major panels: ContractList, QuoteHeader, DepthBook,
   TimeAndSales, OrderTicket, BlotterTabs
   =========================================================== */

const EXCHANGES = [
  { id: "ALL", label: "全部" },
  { id: "SHFE", label: "SHFE" },
  { id: "DCE", label: "DCE" },
  { id: "CZCE", label: "CZCE" },
  { id: "CFFEX", label: "CFFEX" },
  { id: "INE", label: "INE" },
  { id: "GFEX", label: "GFEX" },
  { id: "FAV", label: "★ 自选" },
];

const PRODUCTS = [
  { id: "ALL", label: "全部" },
  { id: "期货", label: "期货" },
  { id: "期权", label: "期权" },
];

/* ----- Contract list (virtualized) ----- */
const ROW_H = 52;
const VISIBLE_BUFFER = 8;

function ContractList({ contracts, selected, onSelect, onToggleFav }) {
  const [q, setQ] = React.useState("");
  const [ex, setEx] = React.useState("ALL");
  const [prod, setProd] = React.useState("期货");
  const containerRef = React.useRef(null);
  const [scrollTop, setScrollTop] = React.useState(0);

  const counts = React.useMemo(() => {
    const m = {
      ALL: contracts.length,
      FAV: contracts.filter((c) => c.fav).length,
    };
    contracts.forEach((c) => {
      m[c.ex] = (m[c.ex] || 0) + 1;
      if (c.product)
        m["_prod_" + c.product] = (m["_prod_" + c.product] || 0) + 1;
    });
    return m;
  }, [contracts.length, window.__favVersion]);

  const filtered = React.useMemo(
    () =>
      contracts.filter((c) => {
        if (ex === "FAV" && !c.fav) return false;
        if (ex !== "ALL" && ex !== "FAV" && c.ex !== ex) return false;
        if (prod !== "ALL" && c.product !== prod) return false;
        if (q) {
          const s = q.toLowerCase();
          if (!c.sym.toLowerCase().includes(s) && !c.name.includes(q))
            return false;
        }
        return true;
      }),
    [contracts.length, ex, prod, q, window.__favVersion],
  );

  const totalH = filtered.length * ROW_H;
  const visibleStart = Math.max(
    0,
    Math.floor(scrollTop / ROW_H) - VISIBLE_BUFFER,
  );
  const visibleEnd = Math.min(
    filtered.length,
    Math.ceil((scrollTop + 600) / ROW_H) + VISIBLE_BUFFER,
  );
  const visible = filtered.slice(visibleStart, visibleEnd);

  const handleScroll = React.useCallback((e) => {
    setScrollTop(e.target.scrollTop);
  }, []);

  // Reset scroll when filter changes
  React.useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [ex, prod, q]);

  return (
    <div className="panel" style={{ height: "100%" }}>
      <div className="phead">
        <span className="ttl">Contracts</span>
        <span className="sub">
          {filtered.length}/{contracts.length}
        </span>
      </div>
      <div className="search">
        <span style={{ color: "var(--fg-3)" }}>
          <Icon.Search />
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索代码 / 名称"
          spellCheck={false}
        />
        <span className="key">/</span>
      </div>
      <div className="ex-filters">
        {EXCHANGES.map((e) => (
          <button
            key={e.id}
            className={`ex-pill ${ex === e.id ? "on" : ""}`}
            onClick={() => setEx(e.id)}
          >
            {e.label}
            <span className="n">{counts[e.id] || 0}</span>
          </button>
        ))}
      </div>
      <div className="ex-filters" style={{ borderBottom: 0, paddingTop: 0 }}>
        {PRODUCTS.map((p) => (
          <button
            key={p.id}
            className={`ex-pill ${prod === p.id ? "on" : ""}`}
            onClick={() => setProd(p.id)}
          >
            {p.label}
            <span className="n">
              {p.id === "ALL" ? contracts.length : counts["_prod_" + p.id] || 0}
            </span>
          </button>
        ))}
      </div>
      <div
        className="pbody"
        ref={containerRef}
        onScroll={handleScroll}
        style={{ position: "relative", overflow: "auto" }}
      >
        <div style={{ height: totalH, position: "relative" }}>
          {visible.map((c, i) => {
            const actualIdx = visibleStart + i;
            const diff = c.last - c.prev;
            const sel = selected === c.sym;
            return (
              <div
                key={c.sym}
                className={`contract-row ${sel ? "sel" : ""}`}
                style={{
                  position: "absolute",
                  top: actualIdx * ROW_H,
                  left: 0,
                  right: 0,
                  height: ROW_H,
                }}
                onClick={() => onSelect(c.sym)}
              >
                <div>
                  <div className="l1">
                    <span
                      className={`star ${c.fav ? "on" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFav(c.sym);
                      }}
                    >
                      <Icon.Star on={!!c.fav} />
                    </span>
                    <span className="sym">{c.sym}</span>
                    {c.product && c.product !== "期货" ? (
                      <span
                        className="tag amber"
                        style={{ fontSize: 8, padding: "0 4px" }}
                      >
                        {c.product}
                      </span>
                    ) : null}
                    <span className="ex">{c.ex}</span>
                  </div>
                  <div className="name">{c.name}</div>
                </div>
                <div className="px">
                  <div className={`last ${chgClass(diff)}`}>
                    {fmtPx(c.last, c.tick)}
                  </div>
                  <div className={`chg ${chgClass(diff)}`}>
                    {chgSign(diff)}
                    {pctChg(c.last, c.prev).toFixed(2)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <div className="empty">
            <Icon.Empty />
            <div>无匹配合约</div>
          </div>
        )}
      </div>
      <div className="pfoot">
        <span>
          已订阅{" "}
          <b style={{ color: "var(--fg-1)" }}>
            {contracts.filter((c) => c.fav).length}
          </b>
        </span>
        <span className="sep" />
        <span>双击订阅 · 右键菜单</span>
      </div>
    </div>
  );
}

/* ----- Quote header (big readout) ----- */
function QuoteHeader({ contract, history }) {
  if (!contract) return null;
  const c = contract;
  const diff = c.last - c.prev;
  const pct = pctChg(c.last, c.prev);
  const cls = chgClass(diff);

  return (
    <div className="quote">
      <div className="left">
        <div className="ident">
          <div className="row1">
            <div className="symbol">{c.sym}</div>
            <span className="ex-tag">{c.ex}</span>
            <span className="tag live amber" style={{ color: "var(--amber)" }}>
              LIVE
            </span>
          </div>
          <div className="name">
            {c.name} · 合约乘数 {c.mult} · 最小变动 {c.tick}
          </div>
          <div style={{ marginTop: 6 }}>
            <Spark
              data={history}
              color={diff >= 0 ? "#ff4d4d" : "#22d39a"}
              fill
              height={28}
            />
          </div>
        </div>
        <div className="price-block">
          <div className={`last-px ${cls}`}>{fmtPx(c.last, c.tick)}</div>
          <div className={`chg-line ${cls}`}>
            {chgSign(diff)}
            {fmtPx(diff, c.tick)} &nbsp; {chgSign(diff)}
            {pct.toFixed(2)}%
          </div>
        </div>
      </div>
      <div className="right">
        <div className="stat-cell">
          <span className="lbl">Open</span>
          <span className="val">{fmtPx(c.open, c.tick)}</span>
        </div>
        <div className="stat-cell">
          <span className="lbl">P. Close</span>
          <span className="val">{fmtPx(c.prev, c.tick)}</span>
        </div>
        <div className="stat-cell">
          <span className="lbl">High</span>
          <span className="val up">{fmtPx(c.high, c.tick)}</span>
        </div>
        <div className="stat-cell">
          <span className="lbl">Low</span>
          <span className="val down">{fmtPx(c.low, c.tick)}</span>
        </div>
        <div className="stat-cell">
          <span className="lbl">Volume</span>
          <span className="val">{fmtNum(c.vol)}</span>
        </div>
        <div className="stat-cell">
          <span className="lbl">Open Int.</span>
          <span className="val">{fmtNum(c.oi)}</span>
        </div>
      </div>
    </div>
  );
}

/* ----- Depth (order book) ----- */
function DepthBook({ contract, depth, tns, onClickPx }) {
  if (!contract || !depth || !depth.bids || !depth.asks) return null;
  // Read per-symbol TNS buffer — never affected by other symbols' ticks
  const symTns =
    (window.MOCK._tnsBySym && window.MOCK._tnsBySym[contract.sym]) || [];
  const filteredTns = symTns.slice(0, 60);
  const allQty = [...depth.bids, ...depth.asks].map((r) => r.qty);
  const max = Math.max(...allQty, 1);
  const last = contract.last;
  const diff = last - contract.prev;
  return (
    <div className="dom-wrap">
      {/* Order book */}
      <div className="panel">
        <div className="phead">
          <span className="ttl">Depth — 5 Level</span>
          <span className="sub">{contract.sym}</span>
        </div>
        <div className="dom">
          {[...depth.asks].reverse().map((r, i) => (
            <div
              key={"a" + i}
              className="row ask"
              onClick={() => onClickPx(r.px)}
            >
              <div
                className="bar"
                style={{ width: `${(r.qty / max) * 65}%` }}
              />
              <div className="lbl">卖{5 - i}</div>
              <div className="px">{fmtPx(r.px, contract.tick)}</div>
              <div className="qty">{fmtNum(r.qty)}</div>
              <div className="qty mute" style={{ fontSize: 10 }}>
                {((r.qty / max) * 100).toFixed(0)}%
              </div>
            </div>
          ))}
          <div className="last-row">
            <div className="lbl">最新</div>
            <div className={`px ${chgClass(diff)}`}>
              {fmtPx(last, contract.tick)}
            </div>
            <div className={`qty ${chgClass(diff)}`}>
              {chgSign(diff)}
              {fmtPx(diff, contract.tick)}
            </div>
            <div className={`qty ${chgClass(diff)}`} style={{ fontSize: 10 }}>
              {chgSign(diff)}
              {pctChg(last, contract.prev).toFixed(2)}%
            </div>
          </div>
          {depth.bids.map((r, i) => (
            <div
              key={"b" + i}
              className="row bid"
              onClick={() => onClickPx(r.px)}
            >
              <div
                className="bar"
                style={{ width: `${(r.qty / max) * 65}%` }}
              />
              <div className="lbl">买{i + 1}</div>
              <div className="px">{fmtPx(r.px, contract.tick)}</div>
              <div className="qty">{fmtNum(r.qty)}</div>
              <div className="qty mute" style={{ fontSize: 10 }}>
                {((r.qty / max) * 100).toFixed(0)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Time & Sales — selected contract only, per-symbol buffer */}
      <div className="panel">
        <div className="phead">
          <span className="ttl">Tape · 逐笔成交</span>
          <span className="sub">{filteredTns.length}</span>
        </div>
        <div className="pbody">
          {filteredTns.map((t, i) => (
            <div key={`${t.time}-${t.px}-${t.qty}-${i}`} className="tns-row">
              <div>{t.time}</div>
              <div className={t.side === "B" ? "up" : "down"}>
                {fmtPx(t.px, contract.tick)}
              </div>
              <div>{t.qty}</div>
              <div className={t.side === "B" ? "up" : "down"}>
                {t.side === "B" ? "主买" : "主卖"}
              </div>
            </div>
          ))}
          {filteredTns.length === 0 && (
            <div className="empty">
              <div>等待 {contract.sym} 逐笔成交...</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----- Order ticket ----- */
function OrderTicket({ contract, depth, account, onSubmit }) {
  const [offset, setOffset] = React.useState("OPEN");
  const [type, setType] = React.useState("LIMIT");
  const [px, setPx] = React.useState(contract ? contract.last : 0);
  const [qty, setQty] = React.useState(1);

  React.useEffect(() => {
    if (contract) setPx(contract.last);
  }, [contract && contract.sym]);

  // Register click-to-price from DepthBook
  React.useEffect(() => {
    window.__clickPx = (newPx) => {
      if (type !== "MARKET") setPx(newPx);
    };
    return () => {
      window.__clickPx = null;
    };
  }, [type]);

  if (!contract) return null;

  const tick = contract.tick;
  const stepPx = (n) => {
    if (type !== "MARKET") setPx((p) => +(Number(p) + tick * n).toFixed(4));
  };

  const grabBid = () =>
    depth && depth.bids && depth.bids.length > 0 && setPx(depth.bids[0].px);
  const grabAsk = () =>
    depth && depth.asks && depth.asks.length > 0 && setPx(depth.asks[0].px);

  const nominal = (Number(px) || 0) * qty * contract.mult;

  return (
    <div className="panel" style={{ height: "100%" }}>
      <div className="phead">
        <span className="ttl">Order Ticket</span>
        <span className="sub">{contract.sym}</span>
      </div>
      <div className="ticket pbody no-scroll">
        <div className="offset-row">
          <button
            className={offset === "OPEN" ? "on" : ""}
            onClick={() => setOffset("OPEN")}
          >
            开仓
          </button>
          <button
            className={offset === "CLOSE" ? "on" : ""}
            onClick={() => setOffset("CLOSE")}
          >
            平仓
          </button>
          <button
            className={offset === "CLOSETODAY" ? "on" : ""}
            onClick={() => setOffset("CLOSETODAY")}
          >
            平今
          </button>
        </div>

        <div className="px-grab">
          <button className="bid" onClick={grabBid}>
            <span className="lbl">买1</span>
            <span>
              {depth && depth.bids[0] ? fmtPx(depth.bids[0].px, tick) : "—"}
            </span>
          </button>
          <button className="ask" onClick={grabAsk}>
            <span className="lbl">卖1</span>
            <span>
              {depth && depth.asks[0] ? fmtPx(depth.asks[0].px, tick) : "—"}
            </span>
          </button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div className="seg-ctl" style={{ display: "flex", width: "100%" }}>
            {["LIMIT", "MARKET", "FAK", "FOK"].map((t) => (
              <button
                key={t}
                className={type === t ? "on" : ""}
                style={{ flex: 1 }}
                onClick={() => setType(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="lbl">Price</span>
          <div className="ctl">
            <span className="step" onClick={() => stepPx(-1)}>
              −
            </span>
            <input
              value={type === "MARKET" ? "市价" : px}
              onChange={(e) => setPx(e.target.value)}
              disabled={type === "MARKET"}
            />
            <span className="step" onClick={() => stepPx(1)}>
              +
            </span>
          </div>
        </div>

        <div className="field">
          <span className="lbl">Qty (手)</span>
          <div className="ctl">
            <span
              className="step"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
            >
              −
            </span>
            <input
              value={qty}
              onChange={(e) => setQty(Math.max(1, +e.target.value || 1))}
            />
            <span className="step" onClick={() => setQty((q) => q + 1)}>
              +
            </span>
          </div>
        </div>

        <div className="qty-quick">
          {[1, 2, 5, 10, 20].map((n) => (
            <button key={n} onClick={() => setQty(n)}>
              {n}
            </button>
          ))}
        </div>

        <div className="ticket-summary">
          <span>开平</span>
          <b>{offsetLabel(offset)}</b>
          <span>类型</span>
          <b>{type}</b>
          <span>价格</span>
          <b>{type === "MARKET" ? "市价" : fmtPx(px, tick)}</b>
          <span>数量</span>
          <b>{qty} 手</b>
          <span>名义</span>
          <b>¥ {fmtNum(nominal, 0)}</b>
        </div>

        <div className="submit-bar">
          <button
            className="submit long"
            onClick={() =>
              onSubmit({
                dir: "LONG",
                offset,
                type,
                px: Number(px),
                qty,
                sym: contract.sym,
                ex: contract.ex,
              })
            }
          >
            买 · {offsetLabel(offset).slice(0, 1)}
          </button>
          <button
            className="submit short"
            onClick={() =>
              onSubmit({
                dir: "SHORT",
                offset,
                type,
                px: Number(px),
                qty,
                sym: contract.sym,
                ex: contract.ex,
              })
            }
          >
            卖 · {offsetLabel(offset).slice(0, 1)}
          </button>
        </div>
      </div>
      <div className="pfoot">
        <span>
          可用{" "}
          <b style={{ color: "var(--fg-1)" }}>
            ¥ {fmtNum(account.available, 0)}
          </b>
        </span>
        <span className="sep" />
        <span>
          风险度{" "}
          <b
            style={{
              color: account.riskRatio > 0.6 ? "var(--err)" : "var(--fg-1)",
            }}
          >
            {(account.riskRatio * 100).toFixed(2)}%
          </b>
        </span>
      </div>
    </div>
  );
}

/* ----- Blotter tabs (positions / open / done / log) ----- */
function BlotterTabs({
  positions,
  openOrders,
  doneTrades,
  orderLog,
  onSelectSym,
  onCancel,
  onCancelAll,
}) {
  const [tab, setTab] = React.useState("positions");
  const activeOrders = openOrders.filter(
    (o) =>
      o.status === "SUBMITTING" ||
      o.status === "NOTTRADED" ||
      o.status === "PARTTRADED",
  );
  return (
    <div className="panel" style={{ height: "100%" }}>
      <div className="tabs">
        <div
          className={`tab ${tab === "positions" ? "on" : ""}`}
          onClick={() => setTab("positions")}
        >
          持仓<span className="count">{positions.length}</span>
        </div>
        <div
          className={`tab ${tab === "open" ? "on" : ""}`}
          onClick={() => setTab("open")}
        >
          未成交<span className="count">{activeOrders.length}</span>
        </div>
        <div
          className={`tab ${tab === "done" ? "on" : ""}`}
          onClick={() => setTab("done")}
        >
          已成交<span className="count">{doneTrades.length}</span>
        </div>
        <div
          className={`tab ${tab === "log" ? "on" : ""}`}
          onClick={() => setTab("log")}
        >
          报单<span className="count">{orderLog.length}</span>
        </div>
        <div className="right">
          {tab === "open" && activeOrders.length > 0 && (
            <button
              className="cancel-all-btn"
              onClick={() => onCancelAll && onCancelAll(activeOrders)}
            >
              全撤 <span className="n">{activeOrders.length}</span>
            </button>
          )}
          <button className="btn icon" title="刷新">
            <Icon.Refresh />
          </button>
          <button className="btn icon" title="设置">
            <Icon.Settings />
          </button>
        </div>
      </div>
      <div className="pbody">
        {tab === "positions" && (
          <PositionsTbl rows={positions} onSelectSym={onSelectSym} />
        )}
        {tab === "open" && (
          <OpenOrdersTbl
            rows={activeOrders}
            onCancel={onCancel}
            onSelectSym={onSelectSym}
          />
        )}
        {tab === "done" && (
          <DoneTradesTbl rows={doneTrades} onSelectSym={onSelectSym} />
        )}
        {tab === "log" && <OrderLogTbl rows={orderLog} />}
      </div>
    </div>
  );
}

function PositionsTbl({ rows, onSelectSym }) {
  if (!rows.length)
    return (
      <div className="empty">
        <Icon.Empty />
        <div>当前无持仓</div>
      </div>
    );
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>合约</th>
          <th>方向</th>
          <th>总持</th>
          <th>昨仓</th>
          <th>今仓</th>
          <th>冻结</th>
          <th>开仓均价</th>
          <th>最新价</th>
          <th>浮动盈亏</th>
          <th>盈亏%</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p, i) => {
          const c = window.MOCK.contracts.find((x) => x.sym === p.sym);
          const sign = p.dir === "LONG" ? 1 : -1;
          const pnl = (p.last - p.avgPx) * sign * p.vol * (c ? c.mult : 1);
          const pnlPct = (((p.last - p.avgPx) * sign) / p.avgPx) * 100;
          return (
            <tr key={i} onClick={() => onSelectSym(p.sym)}>
              <td>
                {p.sym}{" "}
                <span className="mute" style={{ fontSize: 9.5, marginLeft: 4 }}>
                  {p.ex}
                </span>
              </td>
              <td>
                <span className={`tag ${p.dir}`}>{dirLabel(p.dir)}</span>
              </td>
              <td>{p.vol}</td>
              <td>{p.ydVol}</td>
              <td>{p.tdVol}</td>
              <td>{p.frozen || "—"}</td>
              <td>{fmtPx(p.avgPx, c ? c.tick : 0.01)}</td>
              <td className={chgClass(p.last - p.avgPx)}>
                {fmtPx(p.last, c ? c.tick : 0.01)}
              </td>
              <td className={chgClass(pnl)}>
                {pnl >= 0 ? "+" : ""}
                {fmtNum(pnl, 0)}
              </td>
              <td className={chgClass(pnlPct)}>
                {pnlPct >= 0 ? "+" : ""}
                {pnlPct.toFixed(2)}%
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function OpenOrdersTbl({ rows, onCancel, onSelectSym }) {
  if (!rows.length)
    return (
      <div className="empty">
        <Icon.Empty />
        <div>当前无挂单</div>
      </div>
    );
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>时间</th>
          <th>委托号</th>
          <th>合约</th>
          <th>方向</th>
          <th>类型</th>
          <th>价格</th>
          <th>数量</th>
          <th>已成</th>
          <th>状态</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((o) => {
          const c = window.MOCK.contracts.find((x) => x.sym === o.sym);
          return (
            <tr key={o.id} className="cancel-able">
              <td onClick={() => onSelectSym(o.sym)}>{o.time}</td>
              <td>{o.id}</td>
              <td>
                {o.sym}{" "}
                <span className="mute" style={{ fontSize: 9.5, marginLeft: 4 }}>
                  {o.ex}
                </span>
              </td>
              <td>
                <span className={`tag ${o.dir}`}>{dirZh(o.dir, o.offset)}</span>
              </td>
              <td className="mute" style={{ textTransform: "uppercase" }}>
                {o.type}
              </td>
              <td>{fmtPx(o.px, c ? c.tick : 0.01)}</td>
              <td>{o.vol}</td>
              <td className={o.traded > 0 ? "up" : "mute"}>{o.traded}</td>
              <td>
                <span
                  className={`tag ${o.status === "partial" ? "amber" : ""}`}
                >
                  {statusZh(o.status)}
                </span>
              </td>
              <td>
                <button className="cancel-btn" onClick={() => onCancel(o.id)}>
                  撤单
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DoneTradesTbl({ rows, onSelectSym }) {
  if (!rows.length)
    return (
      <div className="empty">
        <Icon.Empty />
        <div>今日暂无成交</div>
      </div>
    );
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>时间</th>
          <th>成交号</th>
          <th>关联委托</th>
          <th>合约</th>
          <th>方向</th>
          <th>开平</th>
          <th>成交价</th>
          <th>数量</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => {
          const c = window.MOCK.contracts.find((x) => x.sym === t.sym);
          return (
            <tr key={t.id} onClick={() => onSelectSym(t.sym)}>
              <td>{t.time}</td>
              <td>{t.id}</td>
              <td className="mute">{t.orderId}</td>
              <td>
                {t.sym}{" "}
                <span className="mute" style={{ fontSize: 9.5, marginLeft: 4 }}>
                  {t.ex}
                </span>
              </td>
              <td>
                <span className={`tag ${t.dir}`}>{dirLabel(t.dir)}</span>
              </td>
              <td>{offsetLabel(t.offset)}</td>
              <td className={t.dir === "LONG" ? "up" : "down"}>
                {fmtPx(t.px, c ? c.tick : 0.01)}
              </td>
              <td>{t.vol}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function OrderLogTbl({ rows }) {
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>时间</th>
          <th>委托号</th>
          <th>合约</th>
          <th>事件</th>
          <th style={{ textAlign: "left" }}>报文</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{r.time}</td>
            <td>{r.id}</td>
            <td>{r.sym}</td>
            <td>
              <span
                className={`tag ${
                  r.kind === "ok"
                    ? "short"
                    : r.kind === "err"
                      ? "long"
                      : r.kind === "amber"
                        ? "amber"
                        : ""
                }`}
              >
                {r.evt.toUpperCase()}
              </span>
            </td>
            <td style={{ textAlign: "left", fontFamily: "var(--mono)" }}>
              {r.msg}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ----- Market Dashboard (快期v3 风格) ----- */
const MARKET_EXCHANGES = [
  { id: "ALL", label: "全部" },
  { id: "SHFE", label: "SHFE" },
  { id: "DCE", label: "DCE" },
  { id: "CZCE", label: "CZCE" },
  { id: "CFFEX", label: "CFFEX" },
  { id: "INE", label: "INE" },
  { id: "GFEX", label: "GFEX" },
];

// Exchange badge color mapping
const EX_COLORS = {
  SHFE: { bg: "rgba(255,77,77,0.15)", fg: "#ff6b6b" },
  DCE: { bg: "rgba(34,211,154,0.15)", fg: "#22d39a" },
  CZCE: { bg: "rgba(245,176,66,0.15)", fg: "#f5b042" },
  CFFEX: { bg: "rgba(100,180,255,0.15)", fg: "#64b4ff" },
  INE: { bg: "rgba(100,180,255,0.15)", fg: "#64b4ff" },
  GFEX: { bg: "rgba(180,130,255,0.15)", fg: "#b482ff" },
};

function MarketPanel({ contracts, onSelect, onToggleFav }) {
  const [q, setQ] = React.useState("");
  const [ex, setEx] = React.useState("ALL");
  const [prod, setProd] = React.useState("期货");
  const [sortKey, setSortKey] = React.useState("vol");
  const [sortDir, setSortDir] = React.useState(-1);

  const list = React.useMemo(() => {
    let arr = contracts.filter((c) => {
      if (ex !== "ALL" && c.ex !== ex) return false;
      if (prod !== "ALL" && c.product !== prod) return false;
      if (q) {
        const s = q.toLowerCase();
        if (
          !c.sym.toLowerCase().includes(s) &&
          !c.name.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
    arr = [...arr].sort((a, b) => {
      let va, vb;
      switch (sortKey) {
        case "sym":
          va = a.sym;
          vb = b.sym;
          break;
        case "last":
          va = a.last || 0;
          vb = b.last || 0;
          break;
        case "chgPct":
          va = a.prev ? (a.last - a.prev) / a.prev : 0;
          vb = b.prev ? (b.last - b.prev) / b.prev : 0;
          break;
        case "vol":
          va = a.vol || 0;
          vb = b.vol || 0;
          break;
        case "oi":
          va = a.oi || 0;
          vb = b.oi || 0;
          break;
        case "turnover":
          va = a.turnover || 0;
          vb = b.turnover || 0;
          break;
        case "bid":
          va = a.bid_price_1 || 0;
          vb = b.bid_price_1 || 0;
          break;
        case "ask":
          va = a.ask_price_1 || 0;
          vb = b.ask_price_1 || 0;
          break;
        default:
          va = a.vol || 0;
          vb = b.vol || 0;
      }
      if (typeof va === "string") return sortDir * va.localeCompare(vb);
      return sortDir * (va - vb);
    });
    return arr;
  }, [contracts.length, ex, prod, q, sortKey, sortDir]);

  const counts = React.useMemo(() => {
    const m = { ALL: contracts.length };
    contracts.forEach((c) => {
      m[c.ex] = (m[c.ex] || 0) + 1;
    });
    return m;
  }, [contracts.length]);

  // Find global max volume for bar sizing
  const maxVol = React.useMemo(() => {
    return Math.max(...list.map((c) => c.vol || 0), 1);
  }, [list]);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => -d);
    } else {
      setSortKey(key);
      setSortDir(-1);
    }
  }

  function sortArrow(key) {
    if (sortKey !== key) return "";
    return sortDir === -1 ? "↓" : "↑";
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        flex: 1,
        background: "var(--bg-0)",
      }}
    >
      {/* Compact toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          background: "var(--bg-1)",
          borderBottom: "1px solid var(--line-1)",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            fontWeight: 700,
            color: "var(--amber)",
            marginRight: 8,
            letterSpacing: 2,
          }}
        >
          MARKET
        </span>
        {MARKET_EXCHANGES.map((e) => (
          <button
            key={e.id}
            onClick={() => setEx(e.id)}
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              padding: "2px 8px",
              border:
                ex === e.id
                  ? "1px solid var(--amber-line)"
                  : "1px solid transparent",
              borderRadius: 2,
              cursor: "pointer",
              background: ex === e.id ? "var(--amber-soft)" : "transparent",
              color: ex === e.id ? "var(--amber)" : "var(--fg-2)",
            }}
          >
            {e.label}{" "}
            <span style={{ color: "var(--fg-3)", fontSize: 9 }}>
              {counts[e.id] || 0}
            </span>
          </button>
        ))}
        <span
          style={{
            width: 1,
            height: 14,
            background: "var(--line-1)",
            margin: "0 4px",
          }}
        />
        {PRODUCTS.map((p) => (
          <button
            key={p.id}
            onClick={() => setProd(p.id)}
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              padding: "2px 8px",
              border:
                prod === p.id
                  ? "1px solid var(--amber-line)"
                  : "1px solid transparent",
              borderRadius: 2,
              cursor: "pointer",
              background: prod === p.id ? "var(--amber-soft)" : "transparent",
              color: prod === p.id ? "var(--amber)" : "var(--fg-2)",
            }}
          >
            {p.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div className="search" style={{ margin: 0, height: 24, width: 180 }}>
          <span style={{ color: "var(--fg-3)" }}>
            <Icon.Search />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索合约"
            spellCheck={false}
          />
        </div>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "var(--fg-3)",
          }}
        >
          {list.length}/{contracts.length}
        </span>
      </div>

      {/* Market grid — 快期v3 compact style */}
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <table className="tbl" style={{ fontSize: 11 }}>
          <thead>
            <tr style={{ height: 22 }}>
              <th
                style={{ width: 100, cursor: "pointer" }}
                onClick={() => toggleSort("sym")}
              >
                合约{sortArrow("sym")}
              </th>
              <th
                style={{ width: 75, cursor: "pointer" }}
                onClick={() => toggleSort("last")}
              >
                最新{sortArrow("last")}
              </th>
              <th
                style={{ width: 80, cursor: "pointer" }}
                onClick={() => toggleSort("chgPct")}
              >
                涨跌{sortArrow("chgPct")}
              </th>
              <th
                style={{ width: 70, cursor: "pointer" }}
                onClick={() => toggleSort("bid")}
              >
                买价{sortArrow("bid")}
              </th>
              <th style={{ width: 60 }}>买量</th>
              <th
                style={{ width: 70, cursor: "pointer" }}
                onClick={() => toggleSort("ask")}
              >
                卖价{sortArrow("ask")}
              </th>
              <th style={{ width: 60 }}>卖量</th>
              <th
                style={{ width: 80, cursor: "pointer" }}
                onClick={() => toggleSort("vol")}
              >
                成交量{sortArrow("vol")}
              </th>
              <th style={{ width: 80 }}>成交额</th>
              <th
                style={{ width: 75, cursor: "pointer" }}
                onClick={() => toggleSort("oi")}
              >
                持仓{sortArrow("oi")}
              </th>
              <th style={{ width: 55 }}>涨停</th>
              <th style={{ width: 55 }}>跌停</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c, idx) => {
              const diff = c.last - c.prev;
              const pct = c.prev ? (diff / c.prev) * 100 : 0;
              const up = diff > 0,
                down = diff < 0;
              const turnover = c.turnover || 0;
              const turnoverStr =
                turnover > 1e8
                  ? (turnover / 1e8).toFixed(1) + "亿"
                  : turnover > 1e4
                    ? (turnover / 1e4).toFixed(1) + "万"
                    : fmtNum(turnover, 0);
              const volRatio = (c.vol || 0) / maxVol;
              const exColor = EX_COLORS[c.ex] || {
                bg: "transparent",
                fg: "var(--fg-3)",
              };
              const rowBg = up
                ? `rgba(255,77,77,${0.04 + (volRatio * 0.06).toFixed(2)})`
                : down
                  ? `rgba(34,211,154,${0.04 + (volRatio * 0.06).toFixed(2)})`
                  : "transparent";

              return (
                <tr
                  key={c.sym}
                  onClick={() => onSelect(c.sym)}
                  style={{
                    cursor: "pointer",
                    height: 22,
                    background: rowBg,
                    borderBottom: "1px solid var(--line-1)",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = up
                      ? "var(--long-soft)"
                      : down
                        ? "var(--short-soft)"
                        : "var(--bg-2)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = rowBg)
                  }
                >
                  <td style={{ whiteSpace: "nowrap", padding: "0 6px" }}>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFav(c.sym);
                      }}
                      style={{
                        cursor: "pointer",
                        color: c.fav ? "var(--amber)" : "var(--fg-4)",
                        marginRight: 3,
                      }}
                    >
                      {c.fav ? "★" : "☆"}
                    </span>
                    <span style={{ fontWeight: 600, color: "var(--fg-0)" }}>
                      {c.sym}
                    </span>
                    {c.product === "期权" && (
                      <span
                        style={{
                          fontSize: 8,
                          color: "var(--amber)",
                          marginLeft: 2,
                          fontFamily: "var(--mono)",
                        }}
                      >
                        O
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      padding: "0 4px",
                      textAlign: "right",
                      fontWeight: 700,
                      fontFamily: "var(--mono)",
                      color: up
                        ? "var(--long)"
                        : down
                          ? "var(--short)"
                          : "var(--fg-0)",
                      background: up
                        ? "rgba(255,77,77,0.08)"
                        : down
                          ? "rgba(34,211,154,0.08)"
                          : "transparent",
                    }}
                  >
                    {fmtPx(c.last, c.tick)}
                  </td>
                  <td
                    style={{
                      padding: "0 4px",
                      textAlign: "right",
                      fontFamily: "var(--mono)",
                      fontSize: 10,
                      color: up
                        ? "var(--long)"
                        : down
                          ? "var(--short)"
                          : "var(--fg-1)",
                    }}
                  >
                    <span>
                      {chgSign(diff)}
                      {fmtPx(Math.abs(diff), c.tick)}
                    </span>
                    <span style={{ marginLeft: 6, fontWeight: 500 }}>
                      {chgSign(diff)}
                      {pct.toFixed(2)}%
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "0 4px",
                      textAlign: "right",
                      fontFamily: "var(--mono)",
                      color: "var(--long)",
                    }}
                  >
                    {c.bid_price_1 > 0 ? fmtPx(c.bid_price_1, c.tick) : "—"}
                  </td>
                  <td
                    style={{
                      padding: "0 4px",
                      textAlign: "right",
                      fontFamily: "var(--mono)",
                      color: "var(--fg-2)",
                      fontSize: 10,
                    }}
                  >
                    {c.bid_volume_1 || "—"}
                  </td>
                  <td
                    style={{
                      padding: "0 4px",
                      textAlign: "right",
                      fontFamily: "var(--mono)",
                      color: "var(--short)",
                    }}
                  >
                    {c.ask_price_1 > 0 ? fmtPx(c.ask_price_1, c.tick) : "—"}
                  </td>
                  <td
                    style={{
                      padding: "0 4px",
                      textAlign: "right",
                      fontFamily: "var(--mono)",
                      color: "var(--fg-2)",
                      fontSize: 10,
                    }}
                  >
                    {c.ask_volume_1 || "—"}
                  </td>
                  <td
                    style={{
                      padding: "0 4px",
                      textAlign: "right",
                      fontFamily: "var(--mono)",
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: `${Math.min(volRatio * 100, 100)}%`,
                        background: up
                          ? "rgba(255,77,77,0.06)"
                          : down
                            ? "rgba(34,211,154,0.06)"
                            : "rgba(100,100,100,0.04)",
                        pointerEvents: "none",
                      }}
                    />
                    <span style={{ position: "relative", zIndex: 1 }}>
                      {fmtNum(c.vol)}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "0 4px",
                      textAlign: "right",
                      fontFamily: "var(--mono)",
                      color: "var(--fg-2)",
                      fontSize: 10,
                    }}
                  >
                    {turnoverStr}
                  </td>
                  <td
                    style={{
                      padding: "0 4px",
                      textAlign: "right",
                      fontFamily: "var(--mono)",
                      color: "var(--fg-1)",
                    }}
                  >
                    {fmtNum(c.oi)}
                  </td>
                  <td
                    style={{
                      padding: "0 4px",
                      textAlign: "right",
                      fontFamily: "var(--mono)",
                      color: "var(--long)",
                      fontSize: 10,
                    }}
                  >
                    {c.limit_up > 0 ? fmtPx(c.limit_up, c.tick) : "—"}
                  </td>
                  <td
                    style={{
                      padding: "0 4px",
                      textAlign: "right",
                      fontFamily: "var(--mono)",
                      color: "var(--short)",
                      fontSize: 10,
                    }}
                  >
                    {c.limit_down > 0 ? fmtPx(c.limit_down, c.tick) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && (
          <div className="empty">
            <Icon.Empty />
            <div>无匹配合约</div>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, {
  ContractList,
  QuoteHeader,
  DepthBook,
  OrderTicket,
  BlotterTabs,
  MarketPanel,
});
