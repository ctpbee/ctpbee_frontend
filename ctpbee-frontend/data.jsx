/* ===========================================================
   Shared data store — populated by WebSocket bridge (wsbridge.jsx).
   All panels read from window.MOCK.
   =========================================================== */

(function () {
  // Generates 5-level depth from contract price/volume fields
  function genDepth(c) {
    if (!c) return { bids: [], asks: [] };
    const bids = [], asks = [];
    for (let i = 1; i <= 5; i++) {
      const bp = c['bid_price_' + i], bv = c['bid_volume_' + i];
      const ap = c['ask_price_' + i], av = c['ask_volume_' + i];
      bids.push({ px: (bp && bp > 0) ? bp : 0, qty: (bv && bv > 0) ? bv : 0 });
      asks.push({ px: (ap && ap > 0) ? ap : 0, qty: (av && av > 0) ? av : 0 });
    }
    return { bids, asks };
  }

  function nowHMS() {
    const d = new Date();
    return d.toTimeString().slice(0, 8);
  }

  window.MOCK = {
    contracts: [],
    genDepth,
    tns: [],
    _tnsBySym: {},
    positions: [],
    openOrders: [],
    doneTrades: [],
    orderLog: [],
    account: {
      id: '',
      broker: '',
      balance: 0,
      available: 0,
      margin: 0,
      frozen: 0,
      pnl: 0,
      riskRatio: 0,
    },
  };
  window.nowHMS = nowHMS;
})();
