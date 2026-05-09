/* ===========================================================
   Reusable UI bits + icons
   =========================================================== */

const Icon = {
  Search: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
  ),
  Star: ({on}) => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6">
      <path d="M12 3l2.7 5.7 6.3.9-4.6 4.5 1.1 6.4L12 17.5 6.5 20.5l1.1-6.4L3 9.6l6.3-.9z"/>
    </svg>
  ),
  X: () => (<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 5l14 14M19 5L5 19"/></svg>),
  Plus: () => (<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 4v16M4 12h16"/></svg>),
  Refresh: () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>),
  Chevron: () => (<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>),
  Settings: () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>),
  Empty: () => (<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 10h18M8 14h3"/></svg>),
};

const Mark = () => (
  <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
    <path d="M16 3L4 10v12l12 7 12-7V10z" stroke="#f5b042" strokeWidth="1.6"/>
    <path d="M16 11l-6 3.5v7l6 3.5 6-3.5v-7z" fill="#f5b042" opacity="0.18" stroke="#f5b042" strokeWidth="1.4"/>
    <circle cx="16" cy="16" r="1.6" fill="#f5b042"/>
  </svg>
);

function fmtPx(px, tick) {
  if (px == null) return '—';
  const decimals = (tick && tick < 1) ? (String(tick).split('.')[1] || '').length : 0;
  return Number(px).toFixed(decimals);
}

function fmtNum(n, d = 0) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function pctChg(last, prev) {
  if (!prev) return 0;
  return (last - prev) / prev * 100;
}

function chgClass(diff) {
  if (diff > 0) return 'up';
  if (diff < 0) return 'down';
  return 'flat';
}

function chgSign(diff) {
  if (diff > 0) return '+';
  if (diff < 0) return '';
  return '';
}

function offsetLabel(o) {
  return ({ 'OPEN': '开仓', 'CLOSE': '平仓', 'CLOSETODAY': '平今', 'CLOSEYESTERDAY': '平昨' })[o] || o;
}

function dirLabel(d) {
  return d === 'LONG' ? '多' : '空';
}

function dirZh(d, offset) {
  const isLong = d === 'LONG';
  if (offset === 'OPEN') return isLong ? '买开' : '卖开';
  if (offset === 'CLOSE' || offset === 'CLOSETODAY' || offset === 'CLOSEYESTERDAY')
    return isLong ? '买平' : '卖平';
  return d;
}

function statusZh(s) {
  return ({
    'SUBMITTING': '已提交', '提交中': '已提交',
    'NOTTRADED': '已挂单', '未成交': '已挂单',
    'PARTTRADED': '部分成交', '部分成交': '部分成交',
    'ALLTRADED': '全部成交', '全部成交': '全部成交',
    'CANCELLED': '已撤单', '已撤销': '已撤单',
    'REJECTED': '已拒绝', '拒单': '已拒绝',
    'cancelling': '撤单中',
  })[s] || s;
}

// Sparkline given series
function Spark({ data, color = '#7a8290', height = 24, fill = false }) {
  if (!data || data.length < 2) return <svg className="spark" viewBox="0 0 100 24" preserveAspectRatio="none" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x},${y}`;
  });
  const path = `M ${pts.join(' L ')}`;
  const area = `${path} L 100,${height} L 0,${height} Z`;
  return (
    <svg className="spark" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
      {fill && <path d={area} fill={color} opacity="0.15" />}
      <path d={path} fill="none" stroke={color} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// Toast manager
function ToastHost({ toasts }) {
  return (
    <div className="toast-wrap">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.kind || ''}`}>
          <div className="t">{t.title}</div>
          <div className="m">{t.msg}</div>
        </div>
      ))}
    </div>
  );
}

// Loading screen shown between login and main app
function LoadingScreen({ progress, contractsCount }) {
  const pct = contractsCount > 100 ? 100 : Math.min(100, Math.round(contractsCount));
  return (
    <div className="login-screen">
      <div className="login-card" style={{ textAlign: 'center', padding: '48px 36px' }}>
        <div className="login-brand">
          <div className="logo">ctpbee<span> terminal</span></div>
          <div className="tagline">Connecting...</div>
        </div>
        <div style={{ margin: '28px 0 20px' }}>
          <div style={{
            width: '100%', height: 3, background: 'var(--bg-2)',
            borderRadius: 2, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', width: `${Math.max(pct, 5)}%`,
              background: pct >= 100 ? 'var(--short)' : 'var(--amber)',
              borderRadius: 2,
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-3)', marginBottom: 12 }}>
          <span>{progress.connected ? '● DSP Connected' : '○ Connecting DSP...'}</span>
          <span>合约 {contractsCount} / 100</span>
        </div>
        <div className="login-hint" style={{ color: 'var(--fg-2)' }}>
          {contractsCount >= 100
            ? '合约加载完成，即将进入...'
            : progress.connected
              ? '正在从 Dispatcher 同步合约数据...'
              : '正在连接 ctpbee Dispatcher...'}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  Icon, Mark, Spark, ToastHost, LoadingScreen,
  fmtPx, fmtNum, pctChg, chgClass, chgSign,
  offsetLabel, dirLabel, dirZh, statusZh,
});
