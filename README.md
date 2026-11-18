# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Revaaa28/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Revaaa28/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

LaunchScope is a token launch radar that scans the snapshot's 758 protocols, finds the ones with no token on record, and ranks 233 of them — every watchlist protocol, every rankable pre-token protocol below the $50M floor, and 20 finds at or above the floor that the watchlist leaves out — by implied launch value. Each protocol is priced from its already-trading peers: the peer multiple is the median market-cap/TVL ratio of live protocols in the same category, computed from the same snapshot at runtime, shrunk toward the global median in proportion to how few peers the category has, and guarded by a $25M peer TVL floor and a winsorised ratio band so one micro-cap peer cannot price a board. The point value is adjusted by a momentum factor from the seven-day TVL change and a maturity factor from the days tracked with no token; the range beside it runs the same arithmetic on the peer set's lower and upper quartiles. Protocols that already trade are never ranked; they form the peer set and appear in the dashboard's "Already trading" view at market value. Every board row carries a six-step farm plan generated from its category, chains, TVL tier, age and seven-day move, with a cost and a time on each step and the plan's totals stated up front. The 109 pre-token protocols set aside are counted by reason on the dashboard itself: exchanges, versioned pools, named wrapped/staked or exchange products, and the bridged/staked product categories at or above the floor.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

## The model

`lib/model.ts` holds the whole model (`peerscope-2`). A live protocol may be a peer only if it carries a market cap and at least $25M of TVL; each peer ratio is winsorised to [0.01, 5] before any statistic is taken. For a category with n peers, the multiple is `(n x category median + 3 x global median) / (n + 3)`, clamped to [0.03, 2.50]; a category with no peers of size uses the global median. A pre-token protocol's implied value is `max(1, round(TVL x peer multiple x momentum x maturity))`, where momentum is `1 + (clamp(change_7d, -50, 100) / 100) x 0.35` and maturity is `0.70 + 0.30 x (min(age_days, 1460) / 1460)`, with age counted from `listed_at` to the snapshot's `as_of`; its range applies the same product to the shrunk peer quartiles. Rows sort by implied value descending (ties: TVL descending, then slug), and each row records its peer multiple, quartiles, peer count, peer scope, both multipliers, the largest peers behind its multiple, and its farm plan's totals, so the dashboard's detail view can show the exact arithmetic and the evidence under it. No protocol name is hardcoded anywhere.

## Layout of the repo

- `main.ts` — the program: reads the snapshot, builds and self-checks the board, writes `board.json` and `data.js`, copies `dashboard/` and `screenshots/` to the output, and writes `dossier.json` last via the vendored library.
- `lib/model.ts` — snapshot parsing, the peer-priced model, the farm-plan playbooks, the board self-check and the `data.js` writer.
- `vendor/makefun-board.ts` — make.fun's dossier library, vendored byte-for-byte.
- `dashboard/` — LaunchScope, a static dark radar page (no network) with search, category/chain/TVL filters, a watchlist toggle, four sort orders, a launch board with a value range under every price, an already-trading view, per-protocol detail with the valuation breakdown, the named peers behind the multiple and the farm plan, and `#detail=<slug>` / `#cat=<Category>` deep links. Its `model.js` recomputes each row's implied value and range in the page from the factors `data.js` carries, so the figures on screen are the figures the code produces.
- `screenshots/` — the board and a filtered view at 1440x1024, and a detail view at 1440x1440, tall enough to hold the whole farm plan.

---
<sub>Entered on [make.fun](https://make.fun/?ref=25wtkm1p&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)</sub>
