// LaunchScope's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the peer-priced launch board, the already-trading peer set, and a per-protocol detail
// panel with the valuation breakdown and the full farm plan from board.json. No network: every
// byte it shows is in data.js. Hash links are reproducible: #detail=<slug> opens a protocol,
// #cat=<Category> applies that category filter on load.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('app');
  var detail = document.getElementById('detail');
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, watchOnly: false, sort: 'implied', view: 'board', selected: null };

  var usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usdFmt.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return 'x' + Number(n).toFixed(4).replace(/0+$/, '').replace(/\.$/, '.0'); }
  function chainsText(r) { return r.chains && r.chains.length ? r.chains.join(', ') : 'an unnamed chain'; }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('detail')) state.selected = params.get('detail');
    if (params.get('cat')) state.category = params.get('cat');
    if (params.get('q')) state.q = params.get('q');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.selected) params.set('detail', state.selected);
    if (state.category !== 'all') params.set('cat', state.category);
    if (state.q) params.set('q', state.q);
    var next = params.toString();
    window.history.replaceState(null, '', next ? '#' + next : window.location.pathname + window.location.search);
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.minTvl > 0 && r.tvl_usd < state.minTvl) return false;
      if (state.watchOnly && !r.watchlist) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sorted(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'change') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -1 : a.age_days; bv = b.age_days === null ? -1 : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av !== bv) return bv - av;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    var c = DATA.counts;
    return el('div', null,
      el('header', { class: 'topbar' },
        el('div', { class: 'scope', 'aria-hidden': 'true' }, el('i', null)),
        el('div', null,
          el('div', { class: 'brand', text: 'LaunchScope' }),
          el('div', { class: 'sub', text: 'peer-priced token launch radar' })
        ),
        el('div', { class: 'top-meta' },
          el('span', { text: 'snapshot ' + DATA.as_of }),
          el('span', { text: 'model ' + DATA.model_version }),
          el('span', { text: 'floor ' + fmtUsd(DATA.floor_usd) })
        )
      ),
      el('section', { class: 'lede' },
        el('h1', { text: 'Pre-token protocols, priced by the peers that already trade' }),
        el('p', null,
          'LaunchScope scans ', el('b', { text: String(c.protocols_scanned) }), ' protocols, finds ',
          el('b', { text: String(c.pre_token_found) }), ' with no token on record, and ranks ',
          el('b', { text: String(c.board_size) }), ' of them by what a token would be worth if it ' +
          'traded at the same market-cap to TVL multiple as its live category peers. Select any row ' +
          'for the full breakdown and its farm plan.'
        )
      ),
      el('div', { class: 'chips' },
        el('div', { class: 'chip' }, el('b', { text: String(c.protocols_scanned) }), el('span', { text: 'protocols scanned' })),
        el('div', { class: 'chip' }, el('b', { text: String(c.pre_token_found) }), el('span', { text: 'pre-token found' })),
        el('div', { class: 'chip' }, el('b', { text: String(c.board_size) }), el('span', { text: 'ranked on the board' })),
        el('div', { class: 'chip' }, el('b', { text: String(c.watchlist_size) }), el('span', { text: 'on the watchlist' }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorised'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Name, slug, category, chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); renderTable(); });
    function selectField(id, label, options, current, onchange) {
      var sel = el('select', { id: id, 'aria-label': label },
        options.map(function (o) { return el('option', { value: o[0], text: o[1], selected: String(o[0]) === String(current) ? 'selected' : null }); }));
      sel.addEventListener('change', function () { onchange(sel.value); });
      return el('div', { class: 'field' }, el('label', { for: id, text: label }), sel);
    }
    var catField = selectField('f-cat', 'Category', [['all', 'All categories']].concat(categories.map(function (c) { return [c, c]; })), state.category,
      function (v) { state.category = v; writeHash(); renderTable(); });
    var chainField = selectField('f-chain', 'Chain', [['all', 'All chains']].concat(chains.map(function (c) { return [c, c]; })), state.chain,
      function (v) { state.chain = v; renderTable(); });
    var tvlField = selectField('f-tvl', 'Minimum TVL', [['0', 'Any TVL'], ['10000000', '$10M and up'], ['50000000', '$50M and up'], ['250000000', '$250M and up'], ['1000000000', '$1B and up']], String(state.minTvl),
      function (v) { state.minTvl = Number(v); renderTable(); });
    var sortField = selectField('f-sort', 'Sort by', [['implied', 'Implied value'], ['tvl', 'TVL'], ['change', '7d change'], ['age', 'Age']], state.sort,
      function (v) { state.sort = v; renderTable(); });
    var watch = el('input', { type: 'checkbox', id: 'f-watch', checked: state.watchOnly ? 'checked' : null });
    watch.addEventListener('change', function () { state.watchOnly = watch.checked; renderTable(); });
    var boardBtn = el('button', { type: 'button', 'aria-pressed': state.view === 'board' ? 'true' : 'false', text: 'Launch board', onclick: function () { state.view = 'board'; render(); } });
    var liveBtn = el('button', { type: 'button', 'aria-pressed': state.view === 'live' ? 'true' : 'false', text: 'Already trading', onclick: function () { state.view = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      catField, chainField, tvlField, sortField,
      el('label', { class: 'check' }, watch, 'Watchlist only'),
      el('div', { class: 'field' }, el('label', { text: 'View' }), el('div', { class: 'views' }, boardBtn, liveBtn)),
      el('span', { class: 'count', id: 'row-count' })
    );
  }

  function boardTable() {
    var list = sorted(filtered());
    var count = document.getElementById('row-count');
    if (count) count.textContent = list.length + ' of ' + DATA.rows.length + ' rows';
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'Nothing on scope matches that filter' }),
        el('p', { text: 'Clear the search or widen the category, chain and TVL filters to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () {
          state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; state.watchOnly = false; writeHash(); render();
        } })
      ));
    }
    var tbody = el('tbody');
    list.forEach(function (r) {
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false', 'data-slug': r.slug, tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', { class: 'name' },
          el('b', { text: r.name }),
          r.watchlist ? el('span', { class: 'star', title: 'On the snapshot watchlist', text: '★ watchlist' }) : null,
          el('span', { class: 'sub', text: r.slug })
        ),
        el('td', { text: r.category || 'Uncategorised' }),
        el('td', { text: (r.chains || []).slice(0, 3).join(', ') + ((r.chains || []).length > 3 ? ' +' + (r.chains.length - 3) : '') }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.model.peer_multiple) }),
        el('td', { class: 'num implied', text: fmtUsd(r.implied_value_usd) })
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Ranked by implied value. ★ marks the snapshot watchlist; the rest are early finds below its $50M floor.' }),
          el('thead', null, el('tr', null,
            el('th', { text: 'Rank' }), el('th', { text: 'Protocol' }), el('th', { text: 'Category' }),
            el('th', { text: 'Chains' }), el('th', { text: 'TVL' }), el('th', { text: '7d' }),
            el('th', { text: 'Age' }), el('th', { text: 'Peer x' }), el('th', { text: 'Implied value' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var count = document.getElementById('row-count');
    if (count) count.textContent = DATA.live.length + ' already trading';
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'pill live', text: 'trading' })),
        el('td', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: r.slug })),
        el('td', { text: r.category || 'Uncategorised' }),
        el('td', { text: (r.chains || []).slice(0, 3).join(', ') }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.tvl_usd > 0 && r.mcap_usd ? fmtMult(r.mcap_usd / r.tvl_usd) : 'n/a' })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'These protocols already trade, so their market cap is a fact, not a model. They are the peer set the launch board is priced from, and they are never ranked.' }),
          el('thead', null, el('tr', null,
            el('th', { text: 'Status' }), el('th', { text: 'Protocol' }), el('th', { text: 'Category' }),
            el('th', { text: 'Chains' }), el('th', { text: 'TVL' }), el('th', { text: '7d' }),
            el('th', { text: 'Market cap' }), el('th', { text: 'Mcap / TVL' })
          )),
          tbody
        )
      )
    );
  }

  function methodPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel method' },
      el('h2', { text: 'How this radar prices a launch' }),
      el('p', { text: DATA.model_summary }),
      el('div', { class: 'formula', text: 'implied = TVL x peer multiple (median mcap/TVL of live peers in the category, clamped ' +
        m.multiple_min + ' to ' + m.multiple_max + ', ' + m.min_peers + '+ peers or the global median) x momentum (1 + clamp(7d change, ' +
        m.momentum_floor + ', ' + m.momentum_cap + ')% x ' + m.momentum_weight + ') x maturity (' + m.maturity_floor + ' + ' + m.maturity_span +
        ' x min(age, ' + m.maturity_days + 'd) / ' + m.maturity_days + ')' }),
      el('p', { text: 'Momentum comes from the seven-day TVL change: a protocol gaining TVL is priced above its static peer value, one losing TVL below it. Maturity comes from the days DefiLlama has tracked the protocol with no token on record: the longer it has operated tokenless, the closer it is priced to the full peer multiple. Protocols whose token already trades are never ranked — they appear under Already trading at market value, and they are the peers this board is priced from.' })
    );
  }

  function footer() {
    return el('footer', { class: 'foot' },
      el('span', { text: 'Source: ' + DATA.source }),
      el('span', { text: 'Implied values are this model\u2019s own claim about a hypothetical launch, not a prediction that a token will launch or trade at that value.' })
    );
  }

  function fact(label, value) {
    return el('div', null, el('span', { text: label }), el('b', { text: value }));
  }
  function eqLine(label, value, total) {
    return el('div', total ? { class: 'total' } : null, el('span', { text: label }), el('b', { text: value }));
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    detail.textContent = '';
    detail.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'kicker', text: 'Rank ' + row.rank + ' of ' + DATA.counts.board_size + ' · pre-token' }),
        el('h2', { text: row.name }),
        el('p', { class: 'sub', text: row.slug })
      ),
      el('button', { class: 'close', type: 'button', text: 'Close', onclick: function () { closeDetail(); } })
    ));
    detail.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Facts' }),
      el('div', { class: 'facts' },
        fact('Category', row.category || 'Uncategorised'),
        fact('Chains', chainsText(row)),
        fact('TVL', fmtUsd(row.tvl_usd)),
        fact('7d TVL change', fmtPct(row.change_7d)),
        fact('Listed', row.listed_at || 'not recorded'),
        fact('Age, no token', fmtAge(row.age_days)),
        fact('Watchlist', row.watchlist ? 'yes — above the $50M floor' : 'no — early find below the floor'),
        fact('Token status', 'no token on record')
      )
    ));
    var m = row.model;
    var peerLabel = m.peer_scope === 'category'
      ? 'x peer multiple (' + m.peer_count + ' live ' + (row.category || 'category') + ' peers)'
      : 'x peer multiple (global median, ' + m.peer_count + ' live peers)';
    var peerNote = m.peer_scope === 'category'
      ? 'The peer multiple is the median market-cap / TVL of the already-trading protocols in this category in the same snapshot. This is the model\u2019s claim, not a launch prediction.'
      : 'This category has fewer than three live peers with a market cap in the snapshot, so the row is priced on the global median market-cap / TVL of all live protocols instead. This is the model\u2019s claim, not a launch prediction.';
    detail.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Valuation breakdown' }),
      el('div', { class: 'eq' },
        eqLine('TVL', fmtUsd(row.tvl_usd)),
        eqLine(peerLabel, fmtMult(m.peer_multiple)),
        eqLine('x momentum (7d change ' + fmtPct(row.change_7d) + ')', fmtMult(m.momentum_multiplier)),
        eqLine('x maturity (' + fmtAge(row.age_days) + ' with no token)', fmtMult(m.maturity_multiplier)),
        eqLine('= implied value', fmtUsd(row.implied_value_usd), true)
      ),
      el('p', { class: 'note', text: peerNote })
    ));
    detail.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('span', { class: 'act', text: action }), tail ? el('span', { class: 'ct', text: tail }) : null);
      }))
    ));
    detail.hidden = false;
    renderTableSelection();
  }
  function closeDetail() {
    state.selected = null;
    detail.hidden = true;
    writeHash();
    renderTableSelection();
  }
  function renderTableSelection() {
    Array.prototype.forEach.call(app.querySelectorAll('tbody tr'), function (tr) {
      tr.setAttribute('data-selected', tr.getAttribute('data-slug') === state.selected ? 'true' : 'false');
    });
  }

  var tableHost = null;
  function renderTable() {
    if (!tableHost) return;
    var fresh = state.view === 'board' ? boardTable() : liveTable();
    tableHost.replaceChildren(fresh);
  }
  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(controls());
    tableHost = el('div', null);
    shell.appendChild(tableHost);
    if (state.view === 'board') shell.appendChild(methodPanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    renderTable();
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !detail.hidden) closeDetail();
  });
})();
