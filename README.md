# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Revaaa28/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Revaaa28/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

LaunchScope is a token launch radar that scans the snapshot's 758 protocols, finds the ones with no token on record, and ranks 226 of them — every watchlist protocol plus every rankable pre-token protocol below the $50M floor — by implied launch value. Each protocol is priced from its already-trading peers: the peer multiple is the median market-cap/TVL ratio of live protocols in the same category, computed from the same snapshot at runtime (categories with fewer than three live peers fall back to the global median), adjusted by a momentum factor from the seven-day TVL change and a maturity factor from the days tracked with no token. Protocols that already trade are never ranked; they form the peer set and appear in the dashboard's "Already trading" view at market value. Every board row carries a six-step farm plan generated from its category, chain, TVL tier and age, with a cost and a time on each step.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

## The model

`lib/model.ts` holds the whole model (`peerscope-1`). For each category with at least three live protocols carrying a market cap and TVL, the category multiple is the median of their market-cap/TVL ratios, clamped to [0.03, 2.50]; other categories use the global median of all live ratios. A pre-token protocol's implied value is `max(1, round(TVL x peer multiple x momentum x maturity))`, where momentum is `1 + (clamp(change_7d, -50, 100) / 100) x 0.35` and maturity is `0.70 + 0.30 x (min(age_days, 1460) / 1460)`, with age counted from `listed_at` to the snapshot's `as_of`. Rows sort by implied value descending (ties: TVL descending, then slug), and each row records its peer multiple, peer count, peer scope and both multipliers, so the dashboard's detail view can show the exact arithmetic. No protocol name is hardcoded anywhere.

## Layout of the repo

- `main.ts` — the program: reads the snapshot, builds and self-checks the board, writes `board.json` and `data.js`, copies `dashboard/` and `screenshots/` to the output, and writes `dossier.json` last via the vendored library.
- `lib/model.ts` — snapshot parsing, the peer-priced model, the farm-plan playbooks, the board self-check and the `data.js` writer.
- `vendor/makefun-board.ts` — make.fun's dossier library, vendored byte-for-byte.
- `dashboard/` — LaunchScope, a static dark radar page (no network) with search, category/chain/TVL filters, a watchlist toggle, four sort orders, a launch board, an already-trading view, per-protocol detail with the valuation breakdown and farm plan, and `#detail=<slug>` / `#cat=<Category>` deep links.
- `screenshots/` — the board, a detail view and a filtered view of the built page at 1440x1000.

---
<sub>Entered on [make.fun](https://make.fun/?ref=25wtkm1p&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)</sub>
