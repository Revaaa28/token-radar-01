// LaunchScope's pricing, in the page: the same peerscope-2 arithmetic lib/model.ts runs, small
// enough to audit here. app.js recomputes every row's implied value and value range from the
// factors data.js carries (TVL, the shrunk peer multiple and its quartiles, the momentum and
// maturity multipliers) and renders the equation from these functions, so the figures on screen
// are the figures this code produces — open a protocol and the breakdown is computed, not pasted.
(function () {
  'use strict';

  /** The model's band: no peer multiple, however wild its peers, prices outside it. */
  var MULT_MIN = 0.03;
  var MULT_MAX = 2.5;

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  /** The momentum multiplier from a seven-day TVL change: 1 + clamp(change, -50, 100)% x 0.35. */
  function momentumMultiplier(change7d) {
    var growth = change7d === null || change7d === undefined ? 0 : clamp(change7d, -50, 100);
    return 1 + (growth / 100) * 0.35;
  }

  /** The maturity multiplier from the days tracked with no token: 0.70 + 0.30 x min(age, 1460) / 1460. */
  function maturityMultiplier(ageDays) {
    var age = ageDays === null || ageDays === undefined ? 365 : ageDays;
    return 0.7 + 0.3 * (Math.min(age, 1460) / 1460);
  }

  /** One product of the model: TVL x a peer multiple x the row's momentum x its maturity, in whole dollars. */
  function valueAt(tvlUsd, multiple, row) {
    var m = row.model;
    return Math.max(1, Math.round(tvlUsd * clamp(multiple, MULT_MIN, MULT_MAX) * m.momentum_multiplier * m.maturity_multiplier));
  }

  /** The row's implied value, recomputed from its factors: board.json's implied_value_usd, re-derived. */
  function impliedValue(row) { return valueAt(row.tvl_usd, row.model.peer_multiple, row); }

  /** The row's value range: the same product at the peer set's shrunk lower and upper quartiles. */
  function valueRange(row) {
    return {
      low: valueAt(row.tvl_usd, row.model.peer_q1_multiple, row),
      high: valueAt(row.tvl_usd, row.model.peer_q3_multiple, row)
    };
  }

  /** Where a row's multiple came from, in the words the detail view prints. */
  function scopeText(row) {
    var m = row.model;
    if (m.peer_scope === 'category') {
      return m.peer_count + ' live ' + (row.category || 'category') + ' peers, their median shrunk lightly toward the market';
    }
    if (m.peer_scope === 'blend') {
      return 'only ' + m.peer_count + ' live ' + (row.category || 'category') + ' peer' + (m.peer_count === 1 ? '' : 's') +
        ' of size trade, so the multiple blends their median with the global market median';
    }
    return 'no live peer of size in this category — priced on the global median';
  }

  /** A plan's totals as the detail view states them: capital in, gas all-in, and the hold. */
  function planTotals(row) {
    var p = row.plan;
    return {
      capital: p.capital_usd,
      gas: p.gas_usd,
      holdDays: p.hold_days,
      weeks: p.weeks,
      summary: '$' + p.capital_usd + ' of capital, about $' + (p.gas_usd % 1 === 0 ? p.gas_usd : p.gas_usd.toFixed(2)) +
        ' of gas all-in, held ' + p.hold_days + ' days (' + p.weeks + ' weekly actions)'
    };
  }

  window.LS_MODEL = {
    momentumMultiplier: momentumMultiplier,
    maturityMultiplier: maturityMultiplier,
    impliedValue: impliedValue,
    valueRange: valueRange,
    scopeText: scopeText,
    planTotals: planTotals
  };
})();
