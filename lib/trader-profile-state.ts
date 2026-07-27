/**
 * Trader Profile State
 *
 * Pure, deterministic functions for building and tracking a trader's
 * persistent profile from historical trade data.
 *
 * Calculates:
 * - TraderProfile (strengths, weaknesses, recurring mistakes, personal rules, improvement score)
 * - Improvement tracking (behavior trend detection across recent vs older trades)
 *
 * No API calls, no AI, no database — runs entirely from the trades array.
 */

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface RecurringMistake {
  behavior: string;
  count: number;
  trend: 'improving' | 'stable' | 'worsening';
}

export interface TraderProfileState {
  totalTrades: number;
  strengths: string[];
  weaknesses: string[];
  recurringMistakes: RecurringMistake[];
  personalRules: string[];
  improvementScore: number;
}

export interface BehaviorTrend {
  behavior: string;
  previousCount: number;
  recentCount: number;
  trend: 'improving' | 'stable' | 'worsening';
}

// ─── Trade shape consumed by the profile builder ─────────────────────────

export interface ProfileTrade {
  side: string;
  realized_pl: string | null;
  size: string;
  holdTime: string;
  ticker: string;
  violations: string[];
  violationsCount: number;
  behaviorTags?: string[];
  behaviorSeverity?: string;
  discipline_score?: number | null;
  entry_time?: string | null;
  timestamp?: string | null;
  [key: string]: any;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function getNumericPL(t: ProfileTrade): number | null {
  if (t.realized_pl === null || t.realized_pl === 'null') return null;
  const pl = parseFloat(t.realized_pl);
  return isNaN(pl) ? null : pl;
}

function parseHoldTimeToMinutes(holdTime: string): number {
  if (!holdTime || holdTime === "Open trade") return 0;
  if (holdTime === "<1m") return 0.5;
  const hourMatch = holdTime.match(/(\d+)\s*h/);
  const minMatch = holdTime.match(/(\d+)\s*m/);
  const hours = hourMatch ? parseInt(hourMatch[1], 10) : 0;
  const minutes = minMatch ? parseInt(minMatch[1], 10) : 0;
  return hours * 60 + minutes;
}

// The known negative/positive behavior tags
const NEGATIVE_TAGS = new Set([
  'Chased Entry', 'Late Entry', 'Exited Too Early',
  'Held Loser Too Long', 'Oversized Position',
  'Repeated Ticker', 'Dangerous Win',
]);

const POSITIVE_TAGS = new Set([
  'Good Timing', 'Good Exit',
]);

// ─── Main Profile Builder ────────────────────────────────────────────────

/**
 * Build a TraderProfileState from an array of trades.
 *
 * Pure function — O(n), no AI, no API calls.
 *
 * @param trades All trades the trader has executed
 * @returns A computed trader profile
 */
export function calculateTraderProfile(trades: ProfileTrade[]): TraderProfileState {
  const totalTrades = trades.length;

  if (totalTrades === 0) {
    return {
      totalTrades: 0,
      strengths: [],
      weaknesses: [],
      recurringMistakes: [],
      personalRules: [],
      improvementScore: 50,
    };
  }

  // ── Aggregate behavior tags ──
  const tagCounts: Record<string, number> = {};
  for (const t of trades) {
    if (t.behaviorTags) {
      for (const tag of t.behaviorTags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
  }

  // ── Strengths: positive tags that appear frequently ──
  const strengths: string[] = [];
  for (const tag of POSITIVE_TAGS) {
    const count = tagCounts[tag] || 0;
    if (count >= 2) {
      strengths.push(tag);
    }
  }

  // Add derived strengths from P&L analysis
  const pls = trades.map(t => getNumericPL(t)).filter((p): p is number => p !== null);
  const winners = pls.filter(p => p > 0);
  const losers = pls.filter(p => p < 0);
  const winRate = pls.length > 0 ? Math.round((winners.length / pls.length) * 100) : 0;

  if (winRate >= 60 && totalTrades >= 5) {
    strengths.push('Solid win rate');
  }

  // ── Weaknesses: negative tags that appear frequently ──
  const weaknesses: string[] = [];
  const negativeCounts: { tag: string; count: number }[] = [];

  for (const tag of NEGATIVE_TAGS) {
    const count = tagCounts[tag] || 0;
    if (count >= 2) {
      negativeCounts.push({ tag, count });
      weaknesses.push(tag);
    }
  }

  // Add violation-based weaknesses
  const violationCounts: Record<string, number> = {};
  for (const t of trades) {
    for (const v of t.violations || []) {
      if (v !== 'DANGEROUS_WIN') {
        violationCounts[v] = (violationCounts[v] || 0) + 1;
      }
    }
  }
  for (const [v, count] of Object.entries(violationCounts)) {
    if (count >= 3) {
      weaknesses.push(v);
    }
  }

  // ── Recurring mistakes with trend detection ──
  const recurringMistakes = buildRecurringMistakes(trades, negativeCounts);

  // ── Personal rules (derived from common violations, inverted) ──
  const personalRules: string[] = [];
  const commonViolations = Object.entries(violationCounts)
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // Map violations to positive rules
  const violationToRule: Record<string, string> = {
    'Ticker not allowed': 'Trade only approved tickers',
    'Price below minimum': 'Maintain minimum price filter',
    'Price above maximum': 'Respect max price threshold',
    'Trade placed after 9:00 AM': 'Complete trades before 9:00 AM cutoff',
    'DANGEROUS_WIN': 'Do not violate rules even on winning trades',
  };

  for (const [v] of commonViolations) {
    const rule = violationToRule[v];
    if (rule && !personalRules.includes(rule)) {
      personalRules.push(rule);
    }
  }

  // Add sizing rule if oversized positions are common
  if ((tagCounts['Oversized Position'] || 0) >= 3) {
    personalRules.push('Keep position size consistent');
  }

  // ── Improvement score (0-100) ──
  const improvementScore = calculateImprovementScore(trades, winRate, tagCounts);

  return {
    totalTrades,
    strengths: strengths.slice(0, 3),
    weaknesses: weaknesses.slice(0, 3),
    recurringMistakes: recurringMistakes.slice(0, 3),
    personalRules: personalRules.slice(0, 3),
    improvementScore,
  };
}

// ─── Recurring Mistakes Builder ──────────────────────────────────────────

function buildRecurringMistakes(
  trades: ProfileTrade[],
  negativeCounts: { tag: string; count: number }[]
): RecurringMistake[] {
  if (trades.length < 6) {
    // Not enough trades for trend detection
    return negativeCounts.map(({ tag, count }) => ({
      behavior: tag,
      count,
      trend: 'stable' as const,
    }));
  }

  const mid = Math.floor(trades.length / 2);
  const previous = trades.slice(0, mid);
  const recent = trades.slice(mid);

  const countInSet = (set: ProfileTrade[], tag: string): number => {
    let c = 0;
    for (const t of set) {
      if (t.behaviorTags && t.behaviorTags.includes(tag)) c++;
    }
    return c;
  };

  const mistakes: RecurringMistake[] = [];

  for (const { tag, count } of negativeCounts) {
    const prevCount = countInSet(previous, tag);
    const recentCount = countInSet(recent, tag);

    let trend: 'improving' | 'stable' | 'worsening';
    if (prevCount > 0 && recentCount < prevCount) {
      trend = 'improving';
    } else if (prevCount > 0 && recentCount > prevCount * 1.3) {
      trend = 'worsening';
    } else {
      trend = 'stable';
    }

    mistakes.push({ behavior: tag, count, trend });
  }

  // Sort by count descending, then by worsening first
  mistakes.sort((a, b) => {
    if (a.trend === 'worsening' && b.trend !== 'worsening') return -1;
    if (a.trend !== 'worsening' && b.trend === 'worsening') return 1;
    return b.count - a.count;
  });

  return mistakes;
}

// ─── Improvement Score ──────────────────────────────────────────────────

function calculateImprovementScore(
  trades: ProfileTrade[],
  winRate: number,
  tagCounts: Record<string, number>
): number {
  if (trades.length < 3) return 50;

  let score = 50;

  // Win rate contribution (±20)
  if (winRate >= 60) score += 20;
  else if (winRate >= 50) score += 10;
  else if (winRate >= 40) score -= 5;
  else score -= 15;

  // Behavior tag penalties
  const negativeTagCount = [...NEGATIVE_TAGS].reduce(
    (sum, tag) => sum + (tagCounts[tag] || 0), 0
  );
  const tagRatio = trades.length > 0 ? negativeTagCount / trades.length : 0;
  if (tagRatio <= 0.2) score += 15;
  else if (tagRatio <= 0.4) score += 5;
  else if (tagRatio <= 0.6) score -= 5;
  else score -= 15;

  // Positive tag bonus
  const positiveTagCount = [...POSITIVE_TAGS].reduce(
    (sum, tag) => sum + (tagCounts[tag] || 0), 0
  );
  if (positiveTagCount >= 3) score += 10;

  // Large loss penalty
  const pls = trades.map(t => getNumericPL(t)).filter((p): p is number => p !== null);
  const losers = pls.filter(p => p < 0);
  if (losers.length > 0) {
    const avgLoser = Math.abs(losers.reduce((s, p) => s + p, 0)) / losers.length;
    const avgWinner = pls.filter(p => p > 0).reduce((s, p) => s + p, 0) / Math.max(1, pls.filter(p => p > 0).length);
    if (avgLoser > avgWinner * 1.5) {
      score -= 10;
    }
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─── Trend Detection (Part 2) ────────────────────────────────────────────

/**
 * Compare behavior tag frequency between recent and previous trades.
 *
 * Splits the trades array at the midpoint.
 * Returns an array of BehaviorTrend for each detected behavior tag.
 */
export function detectBehaviorTrends(trades: ProfileTrade[]): BehaviorTrend[] {
  if (trades.length < 6) return [];

  const mid = Math.floor(trades.length / 2);
  const previous = trades.slice(0, mid);
  const recent = trades.slice(mid);

  // Collect all unique behavior tags
  const allTags = new Set<string>();
  for (const t of trades) {
    if (t.behaviorTags) {
      for (const tag of t.behaviorTags) {
        allTags.add(tag);
      }
    }
  }

  const trends: BehaviorTrend[] = [];

  for (const tag of allTags) {
    const prevCount = previous.filter(t => t.behaviorTags?.includes(tag)).length;
    const recentCount = recent.filter(t => t.behaviorTags?.includes(tag)).length;

    let trend: 'improving' | 'stable' | 'worsening';
    if (prevCount > 0 && recentCount < prevCount) {
      trend = 'improving';
    } else if (prevCount > 0 && recentCount > prevCount * 1.3) {
      trend = 'worsening';
    } else if (prevCount === 0 && recentCount > 0) {
      trend = 'worsening';
    } else {
      trend = 'stable';
    }

    trends.push({ behavior: tag, previousCount: prevCount, recentCount, trend });
  }

  // Sort: worsening first, then by total count descending
  trends.sort((a, b) => {
    const totalA = a.previousCount + a.recentCount;
    const totalB = b.previousCount + b.recentCount;
    if (a.trend === 'worsening' && b.trend !== 'worsening') return -1;
    if (a.trend !== 'worsening' && b.trend === 'worsening') return 1;
    return totalB - totalA;
  });

  return trends;
}

/**
 * Format a trend entry into a human-readable string with direction indicator.
 */
export function formatTrend(trend: BehaviorTrend): string {
  const direction = trend.trend === 'improving' ? '↓' :
    trend.trend === 'worsening' ? '↑' : '→';

  if (trend.trend === 'improving') {
    const reduction = trend.previousCount > 0
      ? Math.round((1 - trend.recentCount / trend.previousCount) * 100)
      : 0;
    return `${direction} ${trend.behavior} reduced ${reduction}%`;
  }

  if (trend.trend === 'worsening') {
    const increase = trend.previousCount > 0
      ? Math.round((trend.recentCount / trend.previousCount - 1) * 100)
      : 100;
    return `${direction} ${trend.behavior} increasing ${increase}%`;
  }

  return `${direction} No change in ${trend.behavior}`;
}
