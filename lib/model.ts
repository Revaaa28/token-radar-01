// LaunchScope's model: peer-priced launch values, derived entirely from the snapshot at runtime.
//
// The idea is deliberately simple to audit. Protocols that already trade give every category a
// market multiple: the median market-cap / TVL ratio of the live protocols in that category, read
// from this same snapshot. A pre-token protocol is then priced as if its own TVL carried the
// multiple its already-trading peers actually trade at, nudged by its seven-day TVL momentum and
// by how long it has operated with no token on record. No name is hardcoded anywhere: rename a
// protocol and its row is unchanged, because only its figures are read.
//
//   peerMultiple(cat) = median{ mcap_usd / tvl_usd : live protocols in cat }, clamped to [0.03, 2.50]
//                       (categories with fewer than 3 live peers fall back to the global median)
//   momentum          = 1 + (clamp(change_7d ?? 0, -50, 100) / 100) x 0.35
//   maturity          = 0.70 + 0.30 x (min(age_days ?? 365, 1460) / 1460)
//   implied_value_usd = max(1, round(tvl_usd x peerMultiple x momentum x maturity))
//
// The board is every watchlist slug plus every rankable pre-token protocol below the watchlist
// floor. Protocols whose token already trades are never ranked: they are the peer set, and the
// dashboard shows them separately at their real market caps.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The peer-priced model's constants, stated on the dashboard so a reader can re-run the maths. */
export interface ModelConstants {
  multiple_min: number;
  multiple_max: number;
  min_peers: number;
  momentum_weight: number;
  momentum_floor: number;
  momentum_cap: number;
  maturity_floor: number;
  maturity_span: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  multiple_min: 0.03,
  multiple_max: 2.5,
  min_peers: 3,
  momentum_weight: 0.35,
  momentum_floor: -50,
  momentum_cap: 100,
  maturity_floor: 0.7,
  maturity_span: 0.3,
  maturity_days: 1460,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it so a verdict can cite the exact model. */
export const MODEL_VERSION = 'peerscope-1';

/** How many live-token protocols the "Already trading" view carries, by market cap. */
export const LIVE_ROWS = 24;

/** The plain-language summary the dashboard prints verbatim in its methodology section. */
export const MODEL_SUMMARY =
  'Each pre-token protocol is priced from its already-trading peers: the peer multiple is the ' +
  'median market-cap to TVL ratio of live protocols in the same category, computed from this ' +
  'snapshot (categories with fewer than three live peers use the global median). Implied value ' +
  'is TVL times that multiple, adjusted by a momentum factor from the seven-day TVL change and ' +
  'a maturity factor from the days the protocol has been tracked with no token on record.';

/** The per-row model breakdown: every factor that produced the row's implied value. */
export interface ModelBreakdown {
  peer_multiple: number;
  peer_count: number;
  /** Which peer set priced the row: its own category's median, or the global fallback. */
  peer_scope: 'category' | 'global';
  momentum_multiplier: number;
  maturity_multiplier: number;
}

/** One row of board.json: a ranked pre-token protocol with its farm plan. */
export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  token_status: 'pre-token';
  watchlist: boolean;
  model: ModelBreakdown;
}

/** A live-token protocol: it already trades, so it is shown at market value and never ranked. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** The counts the dashboard's header chips state. */
export interface RadarCounts {
  protocols_scanned: number;
  pre_token_found: number;
  board_size: number;
  watchlist_size: number;
  early_size: number;
  live_size: number;
}

/** Everything the dashboard needs: the board rows (with farm plans), the live set, and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  model_summary: string;
  counts: RadarCounts;
  rows: BoardRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all: no market cap, no CoinGecko id, no symbol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol may be ranked: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The peer multiples: one clamped median market-cap/TVL per category, plus the global fallback.
 * Only live protocols with a real market cap and real TVL can be peers; a category needs at
 * least MODEL.min_peers of them before its own median is trusted over the global one.
 */
export function peerMultiples(snapshot: Snapshot): { byCategory: Map<string, { multiple: number; count: number }>; global: { multiple: number; count: number } } {
  const ratiosByCategory = new Map<string, number[]>();
  const allRatios: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) continue;
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    allRatios.push(ratio);
    if (p.category !== null) {
      const list = ratiosByCategory.get(p.category) ?? [];
      list.push(ratio);
      ratiosByCategory.set(p.category, list);
    }
  }
  const global = {
    multiple: clamp(allRatios.length > 0 ? median(allRatios) : MODEL.multiple_min, MODEL.multiple_min, MODEL.multiple_max),
    count: allRatios.length,
  };
  const byCategory = new Map<string, { multiple: number; count: number }>();
  for (const [category, ratios] of ratiosByCategory) {
    if (ratios.length >= MODEL.min_peers) {
      byCategory.set(category, { multiple: clamp(median(ratios), MODEL.multiple_min, MODEL.multiple_max), count: ratios.length });
    }
  }
  return { byCategory, global };
}

/** The peer multiple and peer count one protocol is priced with: its category's, or the global fallback. */
function peerFor(
  p: SnapshotProtocol,
  peers: ReturnType<typeof peerMultiples>,
): { multiple: number; count: number; scope: 'category' | 'global' } {
  if (p.category !== null) {
    const own = peers.byCategory.get(p.category);
    if (own !== undefined) return { ...own, scope: 'category' };
  }
  return { ...peers.global, scope: 'global' };
}

/** One protocol's full pricing: the implied value and every factor behind it. */
export function priceProtocol(
  p: SnapshotProtocol,
  asOf: string,
  peers: ReturnType<typeof peerMultiples>,
): { implied: number; age: number | null; breakdown: ModelBreakdown } {
  const age = ageDays(asOf, p.listed_at);
  const peer = peerFor(p, peers);
  const growth = clamp(p.change_7d ?? 0, MODEL.momentum_floor, MODEL.momentum_cap);
  const momentum = 1 + (growth / 100) * MODEL.momentum_weight;
  const ageForModel = age ?? MODEL.unknown_age_days;
  const maturity = MODEL.maturity_floor + MODEL.maturity_span * (Math.min(ageForModel, MODEL.maturity_days) / MODEL.maturity_days);
  const implied = Math.max(1, Math.round(p.tvl_usd * peer.multiple * momentum * maturity));
  return {
    implied,
    age,
    breakdown: {
      peer_multiple: round4(peer.multiple),
      peer_count: peer.count,
      peer_scope: peer.scope,
      momentum_multiplier: round4(momentum),
      maturity_multiplier: round4(maturity),
    },
  };
}

// ---------------------------------------------------------------- farm plans
//
// Every plan is six steps generated from the protocol's own record: its category picks the two
// core actions, its first chain picks the gas figures, its TVL picks the capital tier and its
// age picks the hold. The wording differs by category because the qualifying activity differs:
// a lending farmer supplies and borrows, a bridge farmer routes transfers, a staking farmer
// stakes and restakes the receipt. No step names a third-party site: claims come only from the
// protocol's own published link.

/** Approximate cost of one ordinary transaction on a chain, in dollars, as the plans state it. */
const GAS_USD: Record<string, number> = {
  Ethereum: 8,
  Solana: 0.05,
  Base: 0.25,
  Arbitrum: 0.35,
  'BNB Chain': 0.3,
  Binance: 0.3,
  Polygon: 0.05,
  Avalanche: 0.4,
  Optimism: 0.3,
};
const GAS_DEFAULT = 1;

/** A gas figure as the plans print it: cents under a dollar, trimmed dollars above. */
function gasText(n: number): string {
  return n < 1 ? `$${n.toFixed(2)}` : `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

/** The first chain a protocol names, or a neutral phrase when it names none. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position uses, tiered by the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  if (p.tvl_usd >= 10_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

interface Playbook {
  /** The category's core qualifying action (step 2). */
  core: string;
  /** A second, different qualifying action in the same category (step 3). */
  second: string;
  /** The weekly cadence action (step 4), before the per-week gas figure is appended. */
  weekly: string;
}

/** The playbook for one category: concrete actions a farmer can actually perform there. */
function playbookFor(category: string | null, name: string, chain: string, capital: number): Playbook {
  switch (category) {
    case 'Lending':
      return {
        core: `Supply $${capital} of USDC as collateral in ${name} on ${chain}, then borrow a small amount against it so both sides of the market record your wallet`,
        second: `Repay part of the borrow and re-supply it in a second ${name} market on ${chain}, so your activity is not a single one-off deposit`,
        weekly: `Top up the ${name} supply position or adjust the borrow once a week to keep the health factor steady`,
      };
    case 'Dexs':
      return {
        core: `Add $${capital} of liquidity to the busiest USDC pair on ${name} on ${chain} and keep the LP position open`,
        second: `Route several ordinary swaps through ${name} on ${chain} across different days, so the wallet shows real trading volume as well as liquidity`,
        weekly: `Rebalance the ${name} LP position once a week and claim any trading fees it has earned`,
      };
    case 'Bridge':
      return {
        core: `Bridge $${capital} of USDC from Ethereum to ${chain} through ${name}, then bridge a smaller amount back a few days later`,
        second: `Bridge a second asset through ${name} to a different destination chain and use the bridged funds in a local app instead of idling them`,
        weekly: `Make one small bridge transfer through ${name} each week, alternating direction`,
      };
    case 'Canonical Bridge':
      return {
        core: `Deposit $${capital} of ETH or USDC into the ${name} canonical bridge on Ethereum and withdraw it to ${chain}`,
        second: `Use the bridged funds in an app on ${chain} for at least a week before bridging any of it back through ${name}`,
        weekly: `Bridge one small deposit through ${name} each week and keep the withdrawal proofs with your records`,
      };
    case 'Liquid Staking':
      return {
        core: `Stake $${capital} of the native asset through ${name} on ${chain} and hold the liquid staking receipt token it issues`,
        second: `Use the ${name} receipt token as collateral or liquidity in one integrated app on ${chain}, so the position counts in two places`,
        weekly: `Stake a small top-up through ${name} once a week and record the receipt balance each time`,
      };
    case 'Liquid Restaking':
      return {
        core: `Restake $${capital} of a liquid staking token through ${name} on ${chain} and keep the restaked position open`,
        second: `Delegate part of the ${name} restaked position to a second operator or vault, so the wallet is not tied to a single strategy`,
        weekly: `Add a small restake through ${name} once a week and check the operator allocations have not changed`,
      };
    case 'Yield':
      return {
        core: `Deposit $${capital} of USDC into the main ${name} yield vault on ${chain} and hold the vault shares`,
        second: `Move a smaller second deposit into a different ${name} strategy on ${chain}, so the wallet holds two distinct positions`,
        weekly: `Compound the ${name} yield once a week by re-depositing the harvested amount`,
      };
    case 'Yield Aggregator':
      return {
        core: `Deposit $${capital} of USDC into an auto-compounding ${name} vault on ${chain} and keep the shares staked in the vault`,
        second: `Split a second deposit across two ${name} vaults with different underlying strategies on ${chain}`,
        weekly: `Harvest and re-stake the ${name} vault rewards once a week so compounding is visible on-chain`,
      };
    case 'Risk Curators':
      return {
        core: `Deposit $${capital} of USDC into a ${name}-curated vault on ${chain} and hold the vault shares while the curator allocates them`,
        second: `Add a smaller position in a second ${name}-curated vault with a different risk profile on ${chain}`,
        weekly: `Review the ${name} vault allocations once a week and shift a small amount if a vault is wound down`,
      };
    case 'Onchain Capital Allocator':
      return {
        core: `Allocate $${capital} of USDC through ${name} on ${chain} into its main allocation vault and keep the position open`,
        second: `Open a second, smaller allocation in a different ${name} strategy on ${chain} so the wallet is active in two allocations`,
        weekly: `Rebalance a small slice of the ${name} allocation once a week following the allocator's own published strategy`,
      };
    case 'RWA':
      return {
        core: `Buy $${capital} of the tokenised real-world asset issued through ${name} on ${chain} and hold it in the farm wallet`,
        second: `Use the ${name} asset as collateral or in a supported liquidity pool on ${chain} instead of leaving it idle`,
        weekly: `Check the ${name} asset's published yield and attestations once a week and top up by a small amount`,
      };
    case 'CDP':
      return {
        core: `Open a collateralised position in ${name} on ${chain}: deposit $${capital} of collateral and mint a modest amount of its stablecoin`,
        second: `Use the minted stablecoin in one app on ${chain} and repay part of the ${name} debt, so the wallet shows a full borrow-and-repay cycle`,
        weekly: `Check the ${name} collateral ratio once a week and top up collateral whenever it drifts toward liquidation`,
      };
    case 'Derivatives':
      return {
        core: `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position rather than a directional bet`,
        second: `Close and re-open the hedge at a different size on ${name}, and try a second market it lists, so the wallet shows genuine trading activity`,
        weekly: `Roll the ${name} hedge once a week and keep each week's margin deposit modest and consistent`,
      };
    default:
      return {
        core: `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open so the wallet builds a real usage history`,
        second: `Make a second, different transaction in ${name} on ${chain} — a second deposit, a withdrawal and re-deposit, or a vote — a few days after the first`,
        weekly: `Repeat one small qualifying transaction in ${name} once a week rather than farming it in a single burst`,
      };
  }
}

/**
 * A protocol's farm plan: exactly six steps, each one string of the form
 * "<action>. Cost: <cost>. Time: <time>.", generated from the protocol's own record.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = chainOf(p);
  const gas = GAS_USD[chain] ?? GAS_DEFAULT;
  const gasOne = gasText(gas);
  const gasWeek = gasText(Math.round(gas * 2 * 100) / 100);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const book = playbookFor(p.category, p.name, chain, capital);
  const name = p.name;
  return [
    `Create a dedicated wallet for ${name} and fund it on ${chain} with the capital plus gas money, keeping its seed phrase offline and never reusing it for other farms. Cost: ${gasOne} of gas for the first funding transaction. Time: 10 minutes.`,
    `${book.core}. Cost: $${capital} of capital plus about ${gasOne} of gas. Time: 15 minutes to set up.`,
    `${book.second}. Cost: about ${gasOne} of gas, reusing the funded wallet. Time: 10 minutes.`,
    `${book.weekly}. Cost: about ${gasWeek} of gas per week. Time: 10 minutes a week.`,
    `Hold the ${name} position for at least ${hold} days so the activity spans more than one weekly snapshot, and check the protocol's points or rewards page each week for new qualifying tasks. Cost: the $${capital} stays in the position for the full hold. Time: ${hold} days.`,
    `When ${name} publishes a claim, claim only from the protocol's own published link, and keep a farm log of the wallet, dates and transaction hashes so the position can be repeated or unwound. Cost: no fee to check, and never pay anyone to claim for you. Time: 10 minutes.`,
  ];
}

// ---------------------------------------------------------------- the board

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const peers = peerMultiples(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => {
    const priced = priceProtocol(p, snapshot.as_of, peers);
    return { p, ...priced };
  });
  scored.sort(
    (a, b) =>
      b.implied - a.implied ||
      b.p.tvl_usd - a.p.tvl_usd ||
      (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  return scored.map((s, i) => ({
    slug: s.p.slug,
    name: s.p.name,
    rank: i + 1,
    implied_value_usd: s.implied,
    farm_steps: farmSteps(s.p, s.age),
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.age,
    token_status: 'pre-token' as const,
    watchlist: watchlist.has(s.p.slug),
    model: s.breakdown,
  }));
}

/** The live-token protocols, by market cap, for the dashboard's "Already trading" view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const live = liveRows(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: MODEL,
    model_version: MODEL_VERSION,
    model_summary: MODEL_SUMMARY,
    counts: {
      protocols_scanned: snapshot.protocols.length,
      pre_token_found: snapshot.protocols.filter(isPreToken).length,
      board_size: board.length,
      watchlist_size: snapshot.watchlist.length,
      early_size: board.filter((r) => !r.watchlist).length,
      live_size: live.length,
    },
    rows: board,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) {
    if (byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `rank ${byRank[i]!.rank} outranks rank ${byRank[i - 1]!.rank} on implied value`;
  }
  if (board.length >= 2 && byRank[0]!.implied_value_usd === byRank[byRank.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${byRank[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const len = s.trim().length;
      if (len < 20 || len > 600) return `${r.slug} has a farm step of ${len} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
