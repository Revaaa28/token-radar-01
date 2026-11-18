// LaunchScope's model: peer-priced launch values, derived entirely from the snapshot at runtime.
//
// The idea is deliberately simple to audit. Protocols that already trade give every category a
// market multiple: the median market-cap / TVL ratio of the live protocols in that category, read
// from this same snapshot. A category with few live peers cannot carry a median on its own, so
// each category figure is shrunk toward the global median in proportion to its peer count: one
// peer leans mostly on the market, fifteen peers stand on their own. A pre-token protocol is
// then priced as if its own TVL carried that blended multiple, nudged by its seven-day TVL
// momentum and by how long it has operated with no token on record. The same arithmetic on the
// peer set's lower and upper quartiles gives the value range the dashboard shows beside the
// point value. No name is hardcoded anywhere: rename a protocol and its row is unchanged,
// because only its figures are read.
//
//   peerMultiple(cat) = (n x median + K x globalMedian) / (n + K), clamped to [0.03, 2.50],
//                       over the live protocols in cat (n = 0 falls back to the global median)
//
// Two guards keep one odd peer from pricing a board. A peer must itself carry at least $25M of
// TVL: below that, a market-cap / TVL ratio is a small denominator wearing a number's clothes
// (one prediction-market token in this snapshot trades at 400x its recorded TVL). And every
// peer ratio is winsorised to [0.01, 5] before any median or quartile is taken, so the largest
// surviving peer can move a multiple but never own it.
//   momentum          = 1 + (clamp(change_7d ?? 0, -50, 100) / 100) x 0.35
//   maturity          = 0.70 + 0.30 x (min(age_days ?? 365, 1460) / 1460)
//   implied_value_usd = max(1, round(tvl_usd x peerMultiple x momentum x maturity))
//   implied range     = the same product on the shrunk lower and upper peer quartiles
//
// The board is every watchlist slug plus every rankable pre-token protocol the snapshot's own
// screens leave standing, above the floor as well as below it. Protocols whose token already
// trades are never ranked: they are the peer set, and the dashboard shows them separately at
// their real market caps.

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
  shrink_weight: number;
  /** A live protocol needs at least this much TVL before its ratio may price anything. */
  peer_tvl_floor_usd: number;
  /** Peer ratios are winsorised into this band before any median or quartile is taken. */
  ratio_floor: number;
  ratio_cap: number;
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
  shrink_weight: 3,
  peer_tvl_floor_usd: 25_000_000,
  ratio_floor: 0.01,
  ratio_cap: 5,
  momentum_weight: 0.35,
  momentum_floor: -50,
  momentum_cap: 100,
  maturity_floor: 0.7,
  maturity_span: 0.3,
  maturity_days: 1460,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it so a verdict can cite the exact model. */
export const MODEL_VERSION = 'peerscope-2';

/** How many live-token protocols the "Already trading" view carries, by market cap. */
export const LIVE_ROWS = 24;

/** How many of a row's live peers the detail view names, largest first. */
export const PEER_SAMPLE = 5;

/** The plain-language summary the dashboard prints verbatim in its methodology section. */
export const MODEL_SUMMARY =
  'Each pre-token protocol is priced from the protocols that already trade. A category\u2019s peer ' +
  'multiple is the median market-cap to TVL ratio of its live protocols in this snapshot, shrunk ' +
  'toward the global median in proportion to how few peers the category has, so a category with ' +
  'one live peer leans on the whole market and a category with fifteen stands on its own. A peer ' +
  'must itself carry at least $25M of TVL, and every peer ratio is winsorised to a 0.01\u20135 band ' +
  'before any median is taken, so one micro-cap peer cannot price a board. Implied ' +
  'value is TVL times that multiple, adjusted by a momentum factor from the seven-day TVL change ' +
  'and a maturity factor from the days the protocol has been tracked with no token on record. The ' +
  'range beside each value runs the same arithmetic on the peer set\u2019s lower and upper quartiles.';

/** The per-row model breakdown: every factor that produced the row's implied value. */
export interface ModelBreakdown {
  peer_multiple: number;
  /** The shrunk lower-quartile peer multiple behind the row's value range. */
  peer_q1_multiple: number;
  /** The shrunk upper-quartile peer multiple behind the row's value range. */
  peer_q3_multiple: number;
  peer_count: number;
  /** How the row was priced: its category's own peers, a blend of few peers and the market, or the global median. */
  peer_scope: 'category' | 'blend' | 'global';
  momentum_multiplier: number;
  maturity_multiplier: number;
}

/** One live peer the dashboard names in a row's detail view: the evidence behind its multiple. */
export interface PeerSample {
  name: string;
  mcap_usd: number;
  tvl_usd: number;
  ratio: number;
}

/** A farm plan's totals, computed from the same figures its steps state. */
export interface PlanTotals {
  capital_usd: number;
  gas_usd: number;
  hold_days: number;
  weeks: number;
}

/** One row of board.json: a ranked pre-token protocol with its farm plan. */
export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  /** The value range from the peer quartiles: the same model at its lower and upper multiples. */
  implied_low_usd: number;
  implied_high_usd: number;
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
  peers: PeerSample[];
  plan: PlanTotals;
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

/** Why pre-token protocols were left off the board, counted for the methodology panel. */
export interface ExclusionCounts {
  total: number;
  /** The protocol is an exchange itself (category CEX). */
  exchange: number;
  /** The name ends in a version marker: a pool of another protocol. */
  versioned: number;
  /** The name carries a wrapped/staked word or begins with an exchange's name. */
  named_product: number;
  /** A bridged or staked product category (Bridge, Liquid Staking and kin) at or above the floor. */
  product_category: number;
  /** Board rows at or above the floor that the watchlist leaves out: finds, ranked anyway. */
  off_list_finds: number;
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
  exclusions: ExclusionCounts;
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
const round2 = (n: number): number => Math.round(n * 100) / 100;

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

/** The watchlist's name screen: a whole word wrapped, staked or staking marks a product of a trading token. */
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;

/** The watchlist's exchange screen: a name that begins with an exchange's name is its product. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Categories the watchlist treats as products of another protocol rather than launches of their own. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/** Whether a protocol records no token at all: no market cap, no CoinGecko id, no symbol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol may be ranked, and if not, the first screen that sets it aside. The screens
 * are the snapshot's own: the watchlist's name and category rules, applied at every size, plus
 * the product categories only at or above the floor (below it they are early finds, as in v1).
 * Watchlist members are always ranked, whatever a screen says.
 */
export function exclusionReason(p: SnapshotProtocol, floorUsd: number): keyof Omit<ExclusionCounts, 'total' | 'off_list_finds'> | null {
  if (p.category === 'CEX') return 'exchange';
  if (VERSIONED.test(p.name)) return 'versioned';
  if (PRODUCT_WORD.test(p.name) || EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x))) return 'named_product';
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category) && p.tvl_usd >= floorUsd) return 'product_category';
  return null;
}

/** Whether a protocol may be ranked: pre-token and through every screen. */
export function isRankable(p: SnapshotProtocol, floorUsd: number): boolean {
  return isPreToken(p) && exclusionReason(p, floorUsd) === null;
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A quantile of a sorted non-empty list, by linear interpolation between the nearest ranks. */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0]!;
  const at = q * (sorted.length - 1);
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

/** One peer set's shape: how many live peers, and their ratios' median and quartiles. */
interface PeerStats {
  count: number;
  median: number;
  q1: number;
  q3: number;
  /** The set's largest peers by market cap, for the detail view's evidence table. */
  sample: PeerSample[];
}

function statsOf(live: SnapshotProtocol[]): PeerStats {
  const ratios = live
    .map((p) => clamp(p.mcap_usd! / p.tvl_usd, MODEL.ratio_floor, MODEL.ratio_cap))
    .sort((a, b) => a - b);
  const sample = [...live]
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, PEER_SAMPLE)
    .map((p) => ({
      name: p.name,
      mcap_usd: p.mcap_usd!,
      tvl_usd: p.tvl_usd,
      ratio: round4(clamp(p.mcap_usd! / p.tvl_usd, MODEL.ratio_floor, MODEL.ratio_cap)),
    }));
  return {
    count: ratios.length,
    median: ratios.length > 0 ? median(ratios) : MODEL.multiple_min,
    q1: ratios.length > 0 ? quantile(ratios, 0.25) : MODEL.multiple_min,
    q3: ratios.length > 0 ? quantile(ratios, 0.75) : MODEL.multiple_min,
    sample,
  };
}

/**
 * The peer statistics: one entry per category with at least one live peer, plus the global set.
 * Only live protocols with a real market cap and at least the peer floor of TVL can be peers:
 * below that floor a ratio is a small denominator, not evidence.
 */
export function peerStats(snapshot: Snapshot): { byCategory: Map<string, PeerStats>; global: PeerStats } {
  const liveByCategory = new Map<string, SnapshotProtocol[]>();
  const allLive: SnapshotProtocol[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) continue;
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd < MODEL.peer_tvl_floor_usd) continue;
    allLive.push(p);
    if (p.category !== null) {
      const list = liveByCategory.get(p.category) ?? [];
      list.push(p);
      liveByCategory.set(p.category, list);
    }
  }
  const byCategory = new Map<string, PeerStats>();
  for (const [category, live] of liveByCategory) byCategory.set(category, statsOf(live));
  return { byCategory, global: statsOf(allLive) };
}

/**
 * The peer set one protocol is priced with: its category's statistics shrunk toward the global
 * ones by peer count, each figure clamped to the model's band. A category with no live peers is
 * priced on the global set alone.
 */
function peerFor(
  p: SnapshotProtocol,
  peers: ReturnType<typeof peerStats>,
): { multiple: number; q1: number; q3: number; count: number; scope: 'category' | 'blend' | 'global'; sample: PeerSample[] } {
  const g = peers.global;
  const own = p.category !== null ? peers.byCategory.get(p.category) : undefined;
  if (own === undefined || own.count === 0) {
    return {
      multiple: clamp(g.median, MODEL.multiple_min, MODEL.multiple_max),
      q1: clamp(g.q1, MODEL.multiple_min, MODEL.multiple_max),
      q3: clamp(g.q3, MODEL.multiple_min, MODEL.multiple_max),
      count: g.count,
      scope: 'global',
      sample: g.sample,
    };
  }
  const k = MODEL.shrink_weight;
  const shrink = (ownFigure: number, globalFigure: number): number =>
    clamp((own.count * ownFigure + k * globalFigure) / (own.count + k), MODEL.multiple_min, MODEL.multiple_max);
  return {
    multiple: shrink(own.median, g.median),
    q1: shrink(own.q1, g.q1),
    q3: shrink(own.q3, g.q3),
    count: own.count,
    scope: own.count >= 3 ? 'category' : 'blend',
    sample: own.sample,
  };
}

/** One protocol's full pricing: the implied value, its range, and every factor behind them. */
export function priceProtocol(
  p: SnapshotProtocol,
  asOf: string,
  peers: ReturnType<typeof peerStats>,
): { implied: number; low: number; high: number; age: number | null; breakdown: ModelBreakdown; sample: PeerSample[] } {
  const age = ageDays(asOf, p.listed_at);
  const peer = peerFor(p, peers);
  const growth = clamp(p.change_7d ?? 0, MODEL.momentum_floor, MODEL.momentum_cap);
  const momentum = 1 + (growth / 100) * MODEL.momentum_weight;
  const ageForModel = age ?? MODEL.unknown_age_days;
  const maturity = MODEL.maturity_floor + MODEL.maturity_span * (Math.min(ageForModel, MODEL.maturity_days) / MODEL.maturity_days);
  const at = (multiple: number): number => Math.max(1, Math.round(p.tvl_usd * multiple * momentum * maturity));
  return {
    implied: at(peer.multiple),
    low: at(peer.q1),
    high: at(peer.q3),
    age,
    breakdown: {
      peer_multiple: round4(peer.multiple),
      peer_q1_multiple: round4(peer.q1),
      peer_q3_multiple: round4(peer.q3),
      peer_count: peer.count,
      peer_scope: peer.scope,
      momentum_multiplier: round4(momentum),
      maturity_multiplier: round4(maturity),
    },
    sample: peer.sample,
  };
}

// ---------------------------------------------------------------- farm plans
//
// Every plan is six steps generated from the protocol's own record: its category picks the two
// core actions, its first chain picks the wallet and the gas figures, its TVL picks the capital
// tier, its age picks the hold, its seven-day move picks the caution or the urgency in the hold
// step, and a protocol on three or more chains rotates the weekly action across two of them.
// The wording differs by category because the qualifying activity differs: a lending farmer
// supplies and borrows, a bridge farmer routes transfers, a staking farmer stakes and restakes
// the receipt. No step names a third-party site: claims come only from the protocol's own
// published link.

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

/** The wallet a chain's farmer actually uses, so the setup step names the right software. */
function walletFor(chain: string): string {
  if (chain === 'Solana') return 'a dedicated Solana wallet (Phantom or Solflare)';
  if (chain === 'Sui') return 'a dedicated Sui wallet';
  if (chain === 'Bittensor') return 'a dedicated Bittensor wallet';
  if (chain === 'Bitcoin') return 'a dedicated Bitcoin wallet';
  if (chain === 'Aptos') return 'a dedicated Aptos wallet (Petra)';
  return 'a dedicated EVM wallet';
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

/** A plan's totals from the same figures its steps state: capital, all-in gas, and the hold. */
export function planTotals(p: SnapshotProtocol, age: number | null): PlanTotals {
  const gas = GAS_USD[chainOf(p)] ?? GAS_DEFAULT;
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  return {
    capital_usd: capitalFor(p),
    gas_usd: round2(gas * (1 + 2 * weeks)),
    hold_days: hold,
    weeks,
  };
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

/** The hold step's middle sentence: the protocol's own seven-day move, read as caution or urgency. */
function momentumNote(p: SnapshotProtocol): string {
  const change = p.change_7d;
  if (change === null) return 'Its seven-day TVL change is unreported, so keep the position at the standard size for the full hold.';
  if (change <= -10) {
    return `Its TVL fell ${Math.abs(change).toFixed(2)}% this week, so start at half size and add the rest only after the position has held through two weekly checks.`;
  }
  if (change >= 10) {
    return `Its TVL rose ${change.toFixed(2)}% this week, so activity that starts early in the hold counts for more than a late burst at the end.`;
  }
  return `Its TVL moved ${change >= 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(2)}% this week, inside the normal band, so the standard cadence applies.`;
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
  const totals = planTotals(p, age);
  const capital = totals.capital_usd;
  const hold = totals.hold_days;
  const book = playbookFor(p.category, p.name, chain, capital);
  const name = p.name;
  const weekly =
    p.chains.length >= 3
      ? `${book.weekly}, alternating between ${p.chains[0]} and ${p.chains[1]} week to week so the wallet is active on two of its chains`
      : book.weekly;
  return [
    `Create ${walletFor(chain)} for ${name} and fund it on ${chain} with the capital plus gas money, keeping its seed phrase offline and never reusing it for other farms. Cost: ${gasOne} of gas for the first funding transaction. Time: 10 minutes.`,
    `${book.core}. Cost: $${capital} of capital plus about ${gasOne} of gas. Time: 15 minutes to set up.`,
    `${book.second}. Cost: about ${gasOne} of gas, reusing the funded wallet. Time: 10 minutes.`,
    `${weekly}. Cost: about ${gasWeek} of gas per week. Time: 10 minutes a week.`,
    `Hold the ${name} position for at least ${hold} days so the activity spans more than one weekly snapshot, and check the protocol's points or rewards page each week for new qualifying tasks. ${momentumNote(p)} Cost: the $${capital} stays in the position for the full hold, about ${gasText(totals.gas_usd)} of gas all-in. Time: ${hold} days.`,
    `When ${name} publishes a claim, claim only from the protocol's own published link, and keep a farm log of the wallet, dates and transaction hashes so the position can be repeated or unwound. Cost: no fee to check, and never pay anyone to claim for you. Time: 10 minutes.`,
  ];
}

// ---------------------------------------------------------------- the board

/** The protocols the board ranks, strongest first, with ranks 1..n, and why the rest were set aside. */
export function buildBoard(snapshot: Snapshot): { rows: BoardRow[]; exclusions: ExclusionCounts } {
  const peers = peerStats(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const exclusions: ExclusionCounts = { total: 0, exchange: 0, versioned: 0, named_product: 0, product_category: 0, off_list_finds: 0 };
  for (const p of snapshot.protocols) {
    if (!isPreToken(p) || chosen.has(p.slug)) continue;
    const reason = exclusionReason(p, snapshot.floor_usd);
    if (reason === null) chosen.set(p.slug, p);
    else {
      exclusions[reason] += 1;
      exclusions.total += 1;
    }
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
  const rows = scored.map((s, i) => ({
    slug: s.p.slug,
    name: s.p.name,
    rank: i + 1,
    implied_value_usd: s.implied,
    implied_low_usd: s.low,
    implied_high_usd: s.high,
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
    peers: s.sample,
    plan: planTotals(s.p, s.age),
  }));
  exclusions.off_list_finds = rows.filter((r) => !r.watchlist && r.tvl_usd >= snapshot.floor_usd).length;
  return { rows, exclusions };
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
  const { rows: board, exclusions } = buildBoard(snapshot);
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
    exclusions,
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
    if (r.implied_low_usd > r.implied_value_usd || r.implied_high_usd < r.implied_value_usd) {
      return `${r.slug} has a value range that does not hold its implied value`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
