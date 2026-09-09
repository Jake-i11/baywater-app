/**
 * Shared Analytics Calculator
 *
 * Pure, deterministic functions for computing student analytics from trade data.
 * Used by BOTH student and coach paths — this is the source of truth so numbers
 * never disagree between views.
 *
 * No API calls, no AI, no chart data — just statistics from trade fields.
 *
 * Design rules:
 * - Null/missing data → N/A, excluded from calculations that need it.
 * - Never convert missing values to zero.
 * - Every breakdown includes tradeCount (N) for sample-size honesty.
 * - Tiny samples are shown honestly, not hidden.
 */

import {
  AnalyticsTradeInput,
  StudentAnalytics,
  CorePerformance,
  DirectionBreakdown,
  RuleAdherenceBreakdown,
  DisciplineSummary,
  TickerPerformance,
  AnalyticsDimension,
  TIME_BUCKETS,
  STOCK_PRICE_BUCKETS,
  FLOAT_BUCKETS,
  SHARE_SIZE_BUCKETS,
  POSITION_SIZE_BUCKETS,
  RELATIVE_VOLUME_BUCKETS,
  DAY_VOLUME_BUCKETS,
  MARKET_CAP_BUCKETS,
  HOLD_TIME_BUCKETS,
  MAX_TICKER_PERFORMANCE,
} from './types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getPL(trade: AnalyticsTradeInput): number | null {
  return trade.realizedPl;
}

function getReturnPct(trade: AnalyticsTradeInput): number | null {
  const entry = trade.entryPrice;
  const exit = trade.exitPrice;
  const side = trade.side.toUpperCase();
  if (entry == null || exit == null || entry === 0) return null;
  const rawReturn = side === 'SHORT'
    ? (entry - exit) / entry
    : (exit - entry) / entry;
  const pct = rawReturn * 100;
  return Number.isFinite(pct) ? pct : null;
}

function isWin(trade: AnalyticsTradeInput): boolean {
  const pl = getPL(trade);
  return pl !== null && pl > 0;
}

function isLoss(trade: AnalyticsTradeInput): boolean {
  const pl = getPL(trade);
  return pl !== null && pl < 0;
}

/** Bucket a numeric value into a labeled range. Returns the key, or 'Unknown'. */
function bucketValue(
  value: number | null | undefined,
  buckets: Record<string, [number, number]>,
): string {
  if (value == null || !Number.isFinite(value)) return 'Unknown';
  for (const [label, [min, max]] of Object.entries(buckets)) {
    if (value >= min && value < max) return label;
  }
  return 'Unknown';
}

/** Get the time-of-day bucket key for an entry time string. */
function getTimeBucket(entryTime: string | null | undefined): string {
  if (!entryTime) return 'Unknown';
  const d = new Date(entryTime);
  if (isNaN(d.getTime())) return 'Unknown';
  // Use decimal hours (e.g. 9:30 = 9.5, 11:30 = 11.5)
  const hours = d.getHours() + d.getMinutes() / 60;
  for (const tb of TIME_BUCKETS) {
    if (hours >= tb.startHour && hours < tb.endHour) return tb.key;
  }
  return 'Unknown';
}

/**
 * Compute a single dimension's metrics from a subset of trades.
 * Returns null fields when there are no trades with valid P&L.
 */
function computeDimension(trades: AnalyticsTradeInput[]): AnalyticsDimension {
  const tradeCount = trades.length;
  const totalPL = trades.reduce((sum, t) => sum + (getPL(t) || 0), 0);
  const tradesWithPL = trades.filter(t => getPL(t) !== null);
  const wins = tradesWithPL.filter(t => isWin(t));
  const losses = tradesWithPL.filter(t => isLoss(t));

  const winRate = tradesWithPL.length > 0
    ? (wins.length / tradesWithPL.length) * 100
    : null;

  const avgPL = tradesWithPL.length > 0
    ? tradesWithPL.reduce((sum, t) => sum + (getPL(t) || 0), 0) / tradesWithPL.length
    : null;

  const returns = tradesWithPL.map(getReturnPct).filter((r): r is number => r !== null);
  const avgReturnPct = returns.length > 0
    ? returns.reduce((sum, r) => sum + r, 0) / returns.length
    : null;

  return {
    tradeCount,
    totalPL,
    winRate,
    avgPL,
    avgReturnPct,
    key: '',
    label: '',
  };
}

/**
 * Shared pre-bucketed-dimension helper: group trades by an already-computed
 * bucket key on each trade, compute metrics per group.
 */
function computePreBucketedBreakdown(
  trades: AnalyticsTradeInput[],
  getKey: (t: AnalyticsTradeInput) => string,
  unavailableLabel: string,
  prefix: string,
): AnalyticsDimension[] {
  const groups: Record<string, AnalyticsTradeInput[]> = {};
  for (const t of trades) {
    const key = getKey(t) || 'Unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }

  const result: AnalyticsDimension[] = [];
  for (const [key, list] of Object.entries(groups)) {
    if (list.length === 0) continue;
    const dim = computeDimension(list);
    dim.key = key;
    dim.label = key === 'Unknown' ? unavailableLabel : `${prefix}: ${key}`;
    result.push(dim);
  }

  return result.sort((a, b) => b.tradeCount - a.tradeCount);
}

// ─── Core Performance ──────────────────────────────────────────────────────

export function computeCorePerformance(trades: AnalyticsTradeInput[]): CorePerformance {
  const totalTrades = trades.length;
  const tradesWithPL = trades.filter(t => getPL(t) !== null);
  const winningTrades = tradesWithPL.filter(t => isWin(t));
  const losingTrades = tradesWithPL.filter(t => isLoss(t));

  const totalPL = trades.reduce((sum, t) => sum + (getPL(t) || 0), 0);
  const winRate = tradesWithPL.length > 0
    ? (winningTrades.length / tradesWithPL.length) * 100
    : null;
  const lossRate = tradesWithPL.length > 0
    ? (losingTrades.length / tradesWithPL.length) * 100
    : null;

  const grossWins = winningTrades.reduce((sum, t) => sum + Math.abs(getPL(t) || 0), 0);
  const grossLosses = losingTrades.reduce((sum, t) => sum + Math.abs(getPL(t) || 0), 0);

  let profitFactor: number | null = null;
  if (tradesWithPL.length > 0) {
    if (grossLosses > 0) {
      profitFactor = grossWins / grossLosses;
    } else if (grossWins > 0) {
      profitFactor = null; // uncapped — not a real number
    } else {
      profitFactor = null; // no wins and no losses (all zero P&L?)
    }
  }

  const avgWinningTrade = winningTrades.length > 0
    ? winningTrades.reduce((sum, t) => sum + (getPL(t) || 0), 0) / winningTrades.length
    : null;

  const avgLosingTrade = losingTrades.length > 0
    ? Math.abs(losingTrades.reduce((sum, t) => sum + (getPL(t) || 0), 0)) / losingTrades.length
    : null;

  const plValues = tradesWithPL.map(getPL).filter((p): p is number => p !== null);
  const bestTrade = plValues.length > 0 ? Math.max(...plValues) : null;
  const worstTrade = plValues.length > 0 ? Math.abs(Math.min(...plValues)) : null;

  const holdTimes = trades.map(t => t.holdTimeMinutes).filter((h): h is number => h !== null && h > 0);
  const avgHoldTimeMinutes = holdTimes.length > 0
    ? holdTimes.reduce((sum, h) => sum + h, 0) / holdTimes.length
    : null;

  // Average return % by direction
  const longTrades = trades.filter(t => t.side.toUpperCase() === 'LONG' && getPL(t) !== null);
  const shortTrades = trades.filter(t => t.side.toUpperCase() === 'SHORT' && getPL(t) !== null);
  const longReturns = longTrades.map(getReturnPct).filter((r): r is number => r !== null);
  const shortReturns = shortTrades.map(getReturnPct).filter((r): r is number => r !== null);

  return {
    totalTrades,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate,
    lossRate,
    totalPL,
    averagePL: tradesWithPL.length > 0
      ? totalPL / tradesWithPL.length
      : null,
    averageReturnPct: (() => {
      const returns = tradesWithPL.map(getReturnPct).filter((r): r is number => r !== null);
      return returns.length > 0 ? returns.reduce((s, r) => s + r, 0) / returns.length : null;
    })(),
    profitFactor,
    avgWinningTrade,
    avgLosingTrade,
    bestTrade,
    worstTrade,
    avgHoldTimeMinutes,
    longAvgReturnPct: longReturns.length > 0
      ? longReturns.reduce((s, r) => s + r, 0) / longReturns.length
      : null,
    shortAvgReturnPct: shortReturns.length > 0
      ? shortReturns.reduce((s, r) => s + r, 0) / shortReturns.length
      : null,
  };
}

// ─── Direction Breakdown ───────────────────────────────────────────────────

export function computeDirectionBreakdown(trades: AnalyticsTradeInput[]): DirectionBreakdown {
  const longs = trades.filter(t => t.side.toUpperCase() === 'LONG');
  const shorts = trades.filter(t => t.side.toUpperCase() === 'SHORT');

  const longDim = computeDimension(longs);
  longDim.key = 'LONG';
  longDim.label = 'Long';

  const shortDim = computeDimension(shorts);
  shortDim.key = 'SHORT';
  shortDim.label = 'Short';

  return { long: longDim, short: shortDim };
}

// ─── Time of Day Breakdown ─────────────────────────────────────────────────

export function computeTimeOfDayBreakdown(trades: AnalyticsTradeInput[]): AnalyticsDimension[] {
  const buckets: Record<string, AnalyticsTradeInput[]> = {};
  for (const tb of TIME_BUCKETS) {
    buckets[tb.key] = [];
  }
  buckets['Unknown'] = [];

  for (const t of trades) {
    const key = getTimeBucket(t.entryTime);
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(t);
  }

  return TIME_BUCKETS.map(tb => {
    const dim = computeDimension(buckets[tb.key] || []);
    dim.key = tb.key;
    dim.label = tb.label;
    return dim;
  }).filter(d => d.tradeCount > 0);
}

// ─── Setup Type Breakdown ──────────────────────────────────────────────────

export function computeSetupTypeBreakdown(trades: AnalyticsTradeInput[]): AnalyticsDimension[] {
  const groups: Record<string, AnalyticsTradeInput[]> = {};
  for (const t of trades) {
    const key = (t.setupType && t.setupType.trim()) || 'Unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }

  return Object.entries(groups)
    .map(([key, list]) => {
      const dim = computeDimension(list);
      dim.key = key;
      dim.label = key === 'Unknown' ? 'Unclassified Setup' : key;
      return dim;
    })
    .sort((a, b) => b.tradeCount - a.tradeCount);
}

// ─── Numeric Bucket Breakdown (stock price, float, share size, etc.) ──────

export function computeBucketBreakdown(
  trades: AnalyticsTradeInput[],
  getValue: (t: AnalyticsTradeInput) => number | null | undefined,
  buckets: Record<string, [number, number]>,
  labelPrefix: string,
): AnalyticsDimension[] {
  const groups: Record<string, AnalyticsTradeInput[]> = {};

  // Initialize all bucket keys
  for (const key of Object.keys(buckets)) {
    groups[key] = [];
  }
  groups['Unknown'] = [];

  for (const t of trades) {
    const value = getValue(t);
    const key = bucketValue(value, buckets);
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }

  const result: AnalyticsDimension[] = [];
  for (const [key, list] of Object.entries(groups)) {
    if (list.length === 0) continue;
    const dim = computeDimension(list);
    dim.key = key;
    dim.label = key === 'Unknown' ? `${labelPrefix} (unavailable)` : `${labelPrefix}: ${key}`;
    result.push(dim);
  }

  return result.sort((a, b) => b.tradeCount - a.tradeCount);
}

// ─── Hold Time Breakdown ───────────────────────────────────────────────────

export function computeHoldTimeBreakdown(trades: AnalyticsTradeInput[]): AnalyticsDimension[] {
  return computeBucketBreakdown(
    trades,
    t => t.holdTimeMinutes,
    HOLD_TIME_BUCKETS,
    'Hold Time',
  );
}

// ─── Ticker Performance ────────────────────────────────────────────────────

export function computeTickerPerformance(trades: AnalyticsTradeInput[]): TickerPerformance[] {
  const groups: Record<string, AnalyticsTradeInput[]> = {};
  for (const t of trades) {
    const ticker = (t.ticker || '').toUpperCase();
    if (!ticker) continue;
    if (!groups[ticker]) groups[ticker] = [];
    groups[ticker].push(t);
  }

  const results: TickerPerformance[] = [];
  for (const [ticker, list] of Object.entries(groups)) {
    const dim = computeDimension(list);
    results.push({
      ticker,
      tradeCount: list.length,
      winRate: dim.winRate,
      avgPL: dim.avgPL,
      avgReturnPct: dim.avgReturnPct,
      totalPL: dim.totalPL,
    });
  }

  return results
    .sort((a, b) => b.tradeCount - a.tradeCount)
    .slice(0, MAX_TICKER_PERFORMANCE);
}

// ─── Discipline Summary ────────────────────────────────────────────────────

export function computeDisciplineSummary(trades: AnalyticsTradeInput[]): DisciplineSummary {
  const tradesWithScore = trades.filter(t => t.disciplineScore !== null);
  const averageDisciplineScore = tradesWithScore.length > 0
    ? tradesWithScore.reduce((sum, t) => sum + (t.disciplineScore || 0), 0) / tradesWithScore.length
    : null;

  const cleanTrades = trades.filter(t => t.violations.length === 0);
  const violationTrades = trades.filter(t => t.violations.length > 0);
  const cleanTradeRate = trades.length > 0
    ? (cleanTrades.length / trades.length) * 100
    : null;

  const totalViolations = trades.reduce((sum, t) => sum + t.violations.length, 0);

  return {
    averageDisciplineScore,
    cleanTrades: cleanTrades.length,
    violationTrades: violationTrades.length,
    cleanTradeRate,
    performanceWhenClean: computeDimension(cleanTrades),
    performanceWhenViolating: computeDimension(violationTrades),
    totalViolations,
  };
}

// ─── Rule Adherence Breakdown ──────────────────────────────────────────────

export function computeRuleAdherenceBreakdown(trades: AnalyticsTradeInput[]): RuleAdherenceBreakdown {
  const clean = trades.filter(t => t.violations.length === 0);
  const violating = trades.filter(t => t.violations.length > 0);

  return {
    followedRules: {
      key: 'followed',
      label: 'Followed Rules (0 violations)',
      ...computeDimension(clean),
    },
    violatedRules: {
      key: 'violated',
      label: 'Violated Rules (1+ violations)',
      ...computeDimension(violating),
    },
  };
}

// ─── Execution / Consistency Scores ────────────────────────────────────────

/**
 * Execution score — mirrors the exact formula used in app/profile/page.tsx so
 * the student and coach views always show the same number.
 *
 * Formula (from app/profile/page.tsx):
 *   normalizedPL = clamp(50 + (avgPL / 20), 0, 100)
 *   executionScore = clamp(
 *     normalizedPL * 0.6
 *     + (quality_setup trades / total) * 20
 *     + (discipline > 70 trades / total) * 20,
 *     0, 100
 *   )
 *
 * DATA LIMITATION (verified against the schema and insert path): the trades
 * table has NO behaviorTags column — lib/analyze/supabaseTradeInsert.ts never
 * writes tags and no migration creates one. The student page's
 * `t.behaviorTags?.includes('quality_setup')` is therefore ALWAYS false too
 * (its trades come from select('*') with no such column), so its setup-quality
 * component contributes 0 for the student as well. This mirror reproduces that
 * exact behavior: the component contributes 0 for BOTH student and coach.
 * Parity is exact — but the 20-point setup-quality component is structurally
 * dead weight in both views until a real tags pipeline exists.
 */
export function computeExecutionScore(trades: AnalyticsTradeInput[]): number {
  if (trades.length === 0) return 0;

  const tradesWithPL = trades.filter(t => t.realizedPl !== null);
  const totalPL = tradesWithPL.reduce((sum, t) => sum + (t.realizedPl || 0), 0);
  const avgPL = tradesWithPL.length > 0 ? totalPL / tradesWithPL.length : 0;

  const normalizedPL = Math.min(100, Math.max(0, 50 + avgPL / 20));

  const total = trades.length;
  const qualitySetupCount = trades.filter(t =>
    Array.isArray(t.behaviorTags) && t.behaviorTags.includes('quality_setup')
  ).length;

  const highDisciplineCount = trades.filter(t =>
    t.disciplineScore !== null && t.disciplineScore > 70
  ).length;

  const executionScore = Math.min(100, Math.max(0,
    normalizedPL * 0.6
    + (qualitySetupCount / total) * 20
    + (highDisciplineCount / total) * 20
  ));

  return Math.round(executionScore);
}

/**
 * Consistency score — mirrors the exact formula used in app/profile/page.tsx so
 * the student and coach views always show the same number.
 *
 * Formula (from app/profile/page.tsx):
 *   avgDiscipline = mean of (discipline_score || 0)
 *   avgViolations = totalViolations / totalTrades
 *   consistencyScore = clamp(
 *     avgDiscipline * 0.7
 *     + (1 - clamp(avgViolations / 5, 0, 1)) * 30,
 *     0, 100
 *   )
 *
 * Returns Math.round(...) to match the student page.
 */
export function computeConsistencyScore(trades: AnalyticsTradeInput[]): number {
  if (trades.length === 0) return 0;

  const disciplineScores = trades.map(t => t.disciplineScore || 0);
  const avgDiscipline = disciplineScores.reduce((sum, s) => sum + s, 0) / disciplineScores.length;

  const totalViolations = trades.reduce((sum, t) => sum + t.violations.length, 0);
  const avgViolations = totalViolations / trades.length;

  const consistencyScore = Math.min(100, Math.max(0,
    avgDiscipline * 0.7
    + (1 - Math.min(1, avgViolations / 5)) * 30
  ));

  return Math.round(consistencyScore);
}

/**
 * Execution score computed over only the trades that have behavior tags.
 * Returns null when no trades carry tags (data unavailable) — callers must
 * render N/A, never 0.
 */
export function computeAverageExecutionScore(trades: AnalyticsTradeInput[]): number | null {
  const tradesWithTags = trades.filter(t => Array.isArray(t.behaviorTags) && t.behaviorTags.length > 0);
  if (tradesWithTags.length === 0) return null;
  return computeExecutionScore(tradesWithTags);
}

/**
 * Consistency score for the whole trade set. Null only when there are no trades.
 */
export function computeAverageConsistencyScore(trades: AnalyticsTradeInput[]): number | null {
  if (trades.length === 0) return null;
  return computeConsistencyScore(trades);
}

// ─── Pre-bucketed Dimension Breakdowns ─────────────────────────────────────

/**
 * Float buckets. The adapter pre-computes floatBucket per trade.
 */
export function computeFloatBreakdown(trades: AnalyticsTradeInput[]): AnalyticsDimension[] {
  return computePreBucketedBreakdown(
    trades,
    t => t.floatBucket,
    'Float (unavailable)',
    'Float',
  );
}

/**
 * Relative volume buckets. The adapter pre-computes relativeVolumeBucket.
 */
export function computeRelativeVolumeBreakdown(trades: AnalyticsTradeInput[]): AnalyticsDimension[] {
  return computePreBucketedBreakdown(
    trades,
    t => t.relativeVolumeBucket,
    'Rel. Volume (unavailable)',
    'Rel. Volume',
  );
}

/**
 * Day volume buckets. The adapter pre-computes dayVolumeBucket from
 * trades.day_volume. Missing day volume → 'Unknown' bucket → N/A.
 */
export function computeDayVolumeBreakdown(trades: AnalyticsTradeInput[]): AnalyticsDimension[] {
  return computePreBucketedBreakdown(
    trades,
    t => t.dayVolumeBucket,
    'Day Volume (unavailable)',
    'Day Volume',
  );
}

/**
 * Market cap buckets. The adapter pre-computes marketCapBucket from
 * trades.market_cap. Missing market cap → 'Unknown' bucket → N/A.
 */
export function computeMarketCapBreakdown(trades: AnalyticsTradeInput[]): AnalyticsDimension[] {
  return computePreBucketedBreakdown(
    trades,
    t => t.marketCapBucket,
    'Market Cap (unavailable)',
    'Market Cap',
  );
}

// ─── Main Calculator ───────────────────────────────────────────────────────

/**
 * Calculate complete analytics for a set of trades.
 * This is the single source of truth — used by both student and coach paths.
 */
export function calculateStudentAnalytics(trades: AnalyticsTradeInput[]): StudentAnalytics {
  const core = computeCorePerformance(trades);
  const totalTrades = core.totalTrades;

  return {
    core,
    timeOfDay: computeTimeOfDayBreakdown(trades),
    direction: computeDirectionBreakdown(trades),
    setupType: computeSetupTypeBreakdown(trades),
    stockPrice: computeBucketBreakdown(trades, t => t.entryPrice, STOCK_PRICE_BUCKETS, 'Entry Price'),
    float: computeFloatBreakdown(trades),
    shareSize: computeBucketBreakdown(trades, t => t.size, SHARE_SIZE_BUCKETS, 'Share Size'),
    positionSize: computeBucketBreakdown(trades, t => {
      if (t.entryPrice == null || t.size == null || !Number.isFinite(t.entryPrice) || !Number.isFinite(t.size)) return null;
      return t.entryPrice * t.size;
    }, POSITION_SIZE_BUCKETS, 'Position Size'),
    relativeVolume: computeRelativeVolumeBreakdown(trades),
    holdTime: computeHoldTimeBreakdown(trades),
    dayVolume: computeDayVolumeBreakdown(trades),
    marketCap: computeMarketCapBreakdown(trades),
    tickerPerformance: computeTickerPerformance(trades),
    discipline: computeDisciplineSummary(trades),
    ruleAdherence: computeRuleAdherenceBreakdown(trades),
    executionScore: computeExecutionScore(trades),
    consistencyScore: computeConsistencyScore(trades),
    averageExecutionScore: computeAverageExecutionScore(trades),
    averageConsistencyScore: computeAverageConsistencyScore(trades),
    totalTrades,
  };
}

// ─── Comparison Helpers ────────────────────────────────────────────────────

/**
 * Compare a student's metrics against a firm aggregate.
 * Returns the differences and whether the student is above/below.
 */
export function compareStudentToFirm(
  student: CorePerformance,
  firm: CorePerformance,
): {
  winRateDiff: number | null;     // student - firm, percentage points
  avgReturnPctDiff: number | null; // student - firm, percentage points
  avgPLDiff: number | null;        // student - firm, dollars
  avgHoldTimeDiff: number | null;  // student - firm, minutes
  winRateStudentAbove: boolean | null;
  avgReturnPctStudentAbove: boolean | null;
  avgPLStudentAbove: boolean | null;
  avgHoldTimeStudentAbove: boolean | null;
} {
  const winRateDiff = (student.winRate !== null && firm.winRate !== null)
    ? student.winRate - firm.winRate
    : null;

  const avgReturnPctDiff = (student.averageReturnPct !== null && firm.averageReturnPct !== null)
    ? student.averageReturnPct - firm.averageReturnPct
    : null;

  const avgPLDiff = (student.averagePL !== null && firm.averagePL !== null)
    ? student.averagePL - firm.averagePL
    : null;

  const avgHoldTimeDiff = (student.avgHoldTimeMinutes !== null && firm.avgHoldTimeMinutes !== null)
    ? student.avgHoldTimeMinutes - firm.avgHoldTimeMinutes
    : null;

  return {
    winRateDiff,
    avgReturnPctDiff,
    avgPLDiff,
    avgHoldTimeDiff,
    winRateStudentAbove: winRateDiff !== null ? winRateDiff > 0 : null,
    avgReturnPctStudentAbove: avgReturnPctDiff !== null ? avgReturnPctDiff > 0 : null,
    avgPLStudentAbove: avgPLDiff !== null ? avgPLDiff > 0 : null,
    avgHoldTimeStudentAbove: avgHoldTimeDiff !== null ? avgHoldTimeDiff < 0 : null, // lower hold time can be better
  };
}
