/**
 * Shared analytics types — single source of truth for both student and coach paths.
 * Every breakdown dimension includes sample size (tradeCount) so tiny samples are honest.
 */

/**
 * Minimal trade input shape needed for analytics calculations.
 * This is the normalized interface that both student and coach data adapters
 * convert their raw trade rows into before passing to the calculator.
 */
export interface AnalyticsTradeInput {
  id: string;
  /** Realized P&L as a number, or null when not available */
  realizedPl: number | null;
  /** Entry price, or null */
  entryPrice: number | null;
  /** Exit price, or null */
  exitPrice: number | null;
  /** Share quantity as a number, or null */
  size: number | null;
  /** Direction: 'LONG' or 'SHORT' (uppercase) */
  side: string;
  /** Entry timestamp */
  entryTime: string | null;
  /** Exit timestamp */
  exitTime: string | null;
  /** Hold time in minutes, or null */
  holdTimeMinutes: number | null;
  /** Discipline score 0-100, or null */
  disciplineScore: number | null;
  /** Setup type string, or null (e.g. 'breakout', 'pullback', 'Unknown') */
  setupType: string | null;
  /** Ticker symbol */
  ticker: string;
  /** Violations array */
  violations: string[];
  /** Market enrichment: entry-price-based stock price bucket key */
  stockPriceBucket: string;
  /** Market enrichment: market cap (raw value) */
  marketCap: number | null;
  /** Market enrichment: day volume (raw value) */
  dayVolume: number | null;
  /** Market enrichment: float shares bucket key */
  floatBucket: string;
  /** Market enrichment: relative volume bucket key */
  relativeVolumeBucket: string;
  /** Market enrichment: day volume bucket key */
  dayVolumeBucket: string;
  /** Market enrichment: market cap bucket key */
  marketCapBucket: string;
  /** Market enrichment: share size bucket key */
  shareSizeBucket: string;
  /** Market enrichment: position size (shares * price) bucket key */
  positionSizeBucket: string;
  /** Market enrichment: hold time bucket key */
  holdTimeBucket: string;
  /** Time-of-day 2-hour bucket key */
  timeBucket: string;
  /** Whether the trade followed rules (no violations) */
  followedRules: boolean;
  /** Behavior tags for execution score calculation */
  behaviorTags: string[];
}

/**
 * A single dimension breakdown result.
 * Every dimension shows N (tradeCount) alongside rates/averages.
 */
export interface AnalyticsDimension {
  /** Machine-readable key (e.g. '930-1130', 'LONG', 'breakout') */
  key: string;
  /** Human-readable label */
  label: string;
  /** Number of trades in this bucket — the sample size */
  tradeCount: number;
  /** Win rate as percentage, or null when no trades have valid P&L */
  winRate: number | null;
  /** Average P&L in dollars, or null when no trades have valid P&L */
  avgPL: number | null;
  /** Average return % (relative to entry value), or null when not derivable */
  avgReturnPct: number | null;
  /** Total P&L across all trades in this bucket */
  totalPL: number;
}

/**
 * Core performance summary.
 */
export interface CorePerformance {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  /** Win rate %, or null when no trades have valid P&L */
  winRate: number | null;
  /** Loss rate %, or null when no trades have valid P&L */
  lossRate: number | null;
  /** Total P&L across all trades */
  totalPL: number;
  /** Average P&L per trade, or null when no trades have valid P&L */
  averagePL: number | null;
  /** Average return % per trade, or null when not derivable */
  averageReturnPct: number | null;
  /** Profit factor (gross wins / gross losses), or null when undefined */
  profitFactor: number | null;
  /** Average winning trade P&L, or null */
  avgWinningTrade: number | null;
  /** Average losing trade P&L (absolute), or null */
  avgLosingTrade: number | null;
  /** Best single trade P&L, or null */
  bestTrade: number | null;
  /** Worst single trade P&L (absolute), or null */
  worstTrade: number | null;
  /** Average hold time in minutes, or null */
  avgHoldTimeMinutes: number | null;
  /** Average return % for long trades, or null */
  longAvgReturnPct: number | null;
  /** Average return % for short trades, or null */
  shortAvgReturnPct: number | null;
}

/**
 * Long vs short breakdown.
 */
export interface DirectionBreakdown {
  long: AnalyticsDimension;
  short: AnalyticsDimension;
}

/**
 * Rules vs violations breakdown — performance when following rules vs violating them.
 */
export interface RuleAdherenceBreakdown {
  followedRules: AnalyticsDimension;
  violatedRules: AnalyticsDimension;
}

/**
 * Discipline summary — derived from existing discipline_score and violations fields.
 */
export interface DisciplineSummary {
  /** Average discipline score across all trades, or null when no scores */
  averageDisciplineScore: number | null;
  /** Number of trades with zero violations */
  cleanTrades: number;
  /** Number of trades with at least one violation */
  violationTrades: number;
  /** Percentage of trades with no violations, or null when no trades */
  cleanTradeRate: number | null;
  /** Performance when following rules (no violations) */
  performanceWhenClean: AnalyticsDimension;
  /** Performance when violating rules */
  performanceWhenViolating: AnalyticsDimension;
  /** Total count of violations across all trades */
  totalViolations: number;
}

/**
 * Ticker-level performance — top N tickers by trade count.
 */
export interface TickerPerformance {
  ticker: string;
  tradeCount: number;
  winRate: number | null;
  avgPL: number | null;
  avgReturnPct: number | null;
  totalPL: number;
}

/**
 * Complete analytics result for a single student (or a firm aggregate).
 */
export interface StudentAnalytics {
  /** Core performance metrics */
  core: CorePerformance;
  /** Time-of-day breakdown (2-hour buckets) */
  timeOfDay: AnalyticsDimension[];
  /** Direction breakdown (long vs short) */
  direction: DirectionBreakdown;
  /** Setup type breakdown */
  setupType: AnalyticsDimension[];
  /** Stock price buckets */
  stockPrice: AnalyticsDimension[];
  /** Float buckets */
  float: AnalyticsDimension[];
  /** Share size buckets */
  shareSize: AnalyticsDimension[];
  /** Position size buckets (shares × entry price) */
  positionSize: AnalyticsDimension[];
  /** Relative volume buckets */
  relativeVolume: AnalyticsDimension[];
  /** Hold time buckets */
  holdTime: AnalyticsDimension[];
  /** Day volume buckets */
  dayVolume: AnalyticsDimension[];
  /** Market cap buckets */
  marketCap: AnalyticsDimension[];
  /** Ticker-level performance (top tickers) */
  tickerPerformance: TickerPerformance[];
  /** Discipline summary */
  discipline: DisciplineSummary;
  /** Rule adherence breakdown */
  ruleAdherence: RuleAdherenceBreakdown;
  /** Execution score (0-100) — mirrors student profile calculation */
  executionScore: number;
  /** Consistency score (0-100) — mirrors student profile calculation */
  consistencyScore: number;
  /** Average execution score when behavior tags are available, or null */
  averageExecutionScore: number | null;
  /** Average consistency score, or null when no trades */
  averageConsistencyScore: number | null;
  /** Total number of trades (same as core.totalTrades, included for convenience) */
  totalTrades: number;
}

/**
 * Bucket definitions for stock price (entry price).
 * Keys are string labels, values are [min, max) ranges in dollars.
 */
export const STOCK_PRICE_BUCKETS: Record<string, [number, number]> = {
  'Under $5': [0, 5],
  '$5–$10': [5, 10],
  '$10–$20': [10, 20],
  '$20–$50': [20, 50],
  '$50–$100': [50, 100],
  '$100–$200': [100, 200],
  '$200+': [200, Infinity],
};

/**
 * Bucket definitions for float (shares).
 */
export const FLOAT_BUCKETS: Record<string, [number, number]> = {
  'Under 10M': [0, 10_000_000],
  '10M–20M': [10_000_000, 20_000_000],
  '20M–50M': [20_000_000, 50_000_000],
  '50M–100M': [50_000_000, 100_000_000],
  '100M–500M': [100_000_000, 500_000_000],
  '500M–1B': [500_000_000, 1_000_000_000],
  'Over 1B': [1_000_000_000, Infinity],
};

/**
 * Bucket definitions for share size (number of shares per trade).
 */
export const SHARE_SIZE_BUCKETS: Record<string, [number, number]> = {
  '1–50': [1, 50],
  '50–100': [50, 100],
  '100–250': [100, 250],
  '250–500': [250, 500],
  '500–1000': [500, 1000],
  '1000–2500': [1000, 2500],
  'Over 2500': [2500, Infinity],
};

/**
 * Bucket definitions for position size (shares × entry price = notional value).
 */
export const POSITION_SIZE_BUCKETS: Record<string, [number, number]> = {
  'Under $1K': [0, 1000],
  '$1K–$5K': [1000, 5000],
  '$5K–$10K': [5000, 10000],
  '$10K–$25K': [10000, 25000],
  '$25K–$50K': [25000, 50000],
  '$50K–$100K': [50000, 100000],
  'Over $100K': [100000, Infinity],
};

/**
 * Bucket definitions for relative volume.
 */
export const RELATIVE_VOLUME_BUCKETS: Record<string, [number, number]> = {
  'Under 1x': [0, 1],
  '1x–2x': [1, 2],
  '2x–3x': [2, 3],
  '3x–5x': [3, 5],
  '5x–10x': [5, 10],
  'Over 10x': [10, Infinity],
};

/**
 * Bucket definitions for day volume (share volume on the trade day).
 */
export const DAY_VOLUME_BUCKETS: Record<string, [number, number]> = {
  'Under 100K': [0, 100_000],
  '100K–500K': [100_000, 500_000],
  '500K–1M': [500_000, 1_000_000],
  '1M–5M': [1_000_000, 5_000_000],
  '5M–10M': [5_000_000, 10_000_000],
  '10M–50M': [10_000_000, 50_000_000],
  '50M–100M': [50_000_000, 100_000_000],
  'Over 100M': [100_000_000, Infinity],
};

/**
 * Bucket definitions for market cap.
 */
export const MARKET_CAP_BUCKETS: Record<string, [number, number]> = {
  'Under $10M': [0, 10_000_000],
  '$10M–$50M': [10_000_000, 50_000_000],
  '$50M–$100M': [50_000_000, 100_000_000],
  '$100M–$500M': [100_000_000, 500_000_000],
  '$500M–$1B': [500_000_000, 1_000_000_000],
  '$1B–$10B': [1_000_000_000, 10_000_000_000],
  '$10B–$50B': [10_000_000_000, 50_000_000_000],
  '$50B–$100B': [50_000_000_000, 100_000_000_000],
  'Over $100B': [100_000_000_000, Infinity],
};

/**
 * Bucket definitions for hold time (minutes).
 */
export const HOLD_TIME_BUCKETS: Record<string, [number, number]> = {
  '<1 min': [0, 1],
  '1–5 min': [1, 5],
  '5–15 min': [5, 15],
  '15–30 min': [15, 30],
  '30–60 min': [30, 60],
  '1–2 hours': [60, 120],
  '2–4 hours': [120, 240],
  'Over 4 hours': [240, Infinity],
};

/**
 * Time-of-day 2-hour buckets (market hours 9:30–16:00 ET).
 * Keys use the format "HHMM-HHMM".
 */
export const TIME_BUCKETS: { key: string; label: string; startHour: number; endHour: number }[] = [
  { key: '930-1130', label: '9:30–11:30 AM', startHour: 9.5, endHour: 11.5 },
  { key: '1130-1330', label: '11:30 AM–1:30 PM', startHour: 11.5, endHour: 13.5 },
  { key: '1330-1530', label: '1:30–3:30 PM', startHour: 13.5, endHour: 15.5 },
  { key: '1530-1600', label: '3:30–4:00 PM', startHour: 15.5, endHour: 16 },
];

/**
 * Maximum number of tickers to include in ticker performance.
 */
export const MAX_TICKER_PERFORMANCE = 15;
