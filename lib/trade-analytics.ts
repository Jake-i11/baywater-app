/**
 * Trade Analytics Engine
 *
 * Pure, deterministic functions for analyzing completed trades.
 * No API calls, no chart data, no AI — just statistics derived from trade data.
 *
 * Designed to work with the TradeData interface used in the analyze page.
 */

// ─── Core Interfaces ─────────────────────────────────────────────────────────

export interface TraderProfile {
  // Basic statistics
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalProfitLoss: number;
  averageWinner: number;
  averageLoser: number;
  largestWinner: number;
  largestLoser: number;
  profitFactor: number;

  // Trading style
  longTrades: number;
  shortTrades: number;
  longWins: number;
  shortWins: number;
  longWinRate: number;
  shortWinRate: number;
  averageHoldTime: string;
  averageHoldTimeMinutes: number;
  averagePositionSize: number;
  mostTradedTickers: string[];

  // Timing behavior
  averageEntryHour: string;
  commonTradingHour: number;
  morningTrades: number;
  afternoonTrades: number;
  morningWins: number;
  afternoonWins: number;
  morningWinRate: number;
  afternoonWinRate: number;
  bestTradingWindow: string;
  worstTradingWindow: string;

  // Per-ticker breakdown
  bestPerformingTicker: string;
  worstPerformingTicker: string;

  // Discipline
  averageDisciplineScore: number;
  totalViolations: number;
  totalViolationCost: number;

  // Tags
  tags: TradeTag[];
}

export interface TradeTag {
  category: 'position' | 'behavior' | 'outcome' | 'direction';
  label: string;
  description: string;
  count: number;
}

export interface TraderInsights {
  strengths: string[];
  weaknesses: string[];
  tendencies: string[];
  statistics: TraderProfile;
}

// ─── Type for the trade shape consumed by analytics ─────────────────────────

export interface AnalyticsTrade {
  side: string;
  realized_pl: string | null;
  entry_price: string | null;
  exit_price: string | null;
  size: string;
  entry_time: string | null;
  exit_time: string | null;
  timestamp: string | null;
  holdTime: string;
  violations: string[];
  violationsCount: number;
  discipline_score: number | null;
  violation_cost: string | null;
  [key: string]: any;
}

// ─── Hold Time Parsing ──────────────────────────────────────────────────────

/**
 * Parse a hold time string like "12m", "1h 24m", "<1m", "34m" into minutes.
 * Returns 0 if unparseable.
 */
export function parseHoldTimeToMinutes(holdTime: string): number {
  if (!holdTime || holdTime === "Open trade") return 0;
  if (holdTime === "<1m") return 0.5;

  const hourMatch = holdTime.match(/(\d+)\s*h/);
  const minMatch = holdTime.match(/(\d+)\s*m/);

  const hours = hourMatch ? parseInt(hourMatch[1], 10) : 0;
  const minutes = minMatch ? parseInt(minMatch[1], 10) : 0;

  return hours * 60 + minutes;
}

// ─── Timestamp Hour Extraction ──────────────────────────────────────────────

/**
 * Extract the hour (0-23) from a timestamp string.
 * Supports ISO strings, "HH:MM:SS", "HH:MM AM/PM", etc.
 * Returns -1 if unparseable.
 */
export function extractHourFromTimestamp(timestamp: string | null | undefined): number {
  if (!timestamp) return -1;

  // Try to create a Date object
  const d = new Date(timestamp);
  if (!isNaN(d.getTime())) {
    return d.getHours();
  }

  // Try "HH:MM:SS" or "HH:MM" format
  const timeMatch = timestamp.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const isPM = timeMatch[4]?.toUpperCase() === 'PM';

    if (isPM && hours < 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;

    // Return raw hour — no rounding, so 9:45 AM stays hour 9 (9:00-10:00 window)
    return hours;
  }

  return -1;
}

/**
 * Get an hour window label like "9:00-10:00", "10:00-11:00", etc.
 */
function hourWindowLabel(hour: number): string {
  const start = hour;
  const end = hour + 1;
  const fmt = (h: number) => {
    if (h === 0) return "12:00 AM";
    if (h < 12) return `${h}:00 AM`;
    if (h === 12) return "12:00 PM";
    if (h < 24) return `${h - 12}:00 PM`;
    return `${h - 12}:00 PM`;
  };
  return `${fmt(start)}-${fmt(end)}`;
}

/**
 * Normalize an hour to a readable string (e.g., 14 => "2:00 PM").
 */
function formatHour(hour: number): string {
  if (hour < 0 || hour >= 24) return "Unknown";
  if (hour === 0) return "12:00 AM";
  if (hour < 12) return `${hour}:00 AM`;
  if (hour === 12) return "12:00 PM";
  return `${hour - 12}:00 PM`;
}

// ─── Main Analytics Function ────────────────────────────────────────────────

/**
 * Build a full TraderProfile from an array of completed trades.
 *
 * Pure function — no side effects, no API calls, no AI.
 * O(n) over the trades array — efficient for hundreds/thousands of trades.
 */
export function buildTraderProfile(trades: AnalyticsTrade[]): TraderProfile {
  const totalTrades = trades.length;

  // ── Basic P&L Stats ──
  const plValues: number[] = [];
  const winners: number[] = [];
  const losers: number[] = [];

  for (const t of trades) {
    if (t.realized_pl === null || t.realized_pl === 'null') continue;
    const pl = parseFloat(t.realized_pl);
    if (isNaN(pl)) continue;
    plValues.push(pl);
    if (pl > 0) winners.push(pl);
    else if (pl < 0) losers.push(pl);
  }

  const winningTrades = winners.length;
  const losingTrades = losers.length;
  const totalProfitLoss = plValues.reduce((sum, v) => sum + v, 0);
  const averageWinner = winners.length > 0
    ? winners.reduce((sum, v) => sum + v, 0) / winners.length
    : 0;
  const averageLoser = losers.length > 0
    ? Math.abs(losers.reduce((sum, v) => sum + v, 0)) / losers.length
    : 0;
  const largestWinner = winners.length > 0 ? Math.max(...winners) : 0;
  const largestLoser = losers.length > 0 ? Math.abs(Math.min(...losers)) : 0;

  // Profit Factor = gross profits / gross losses
  const grossProfit = winners.reduce((sum, v) => sum + v, 0);
  const grossLoss = Math.abs(losers.reduce((sum, v) => sum + v, 0));
  const profitFactor = grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? 999 : 1;

  const winRate = plValues.length > 0
    ? Math.round((winningTrades / plValues.length) * 100)
    : 0;

  // ── Side Breakdown ──
  let longTrades = 0;
  let shortTrades = 0;
  let longWins = 0;
  let shortWins = 0;
  let longPLs: number[] = [];
  let shortPLs: number[] = [];

  for (const t of trades) {
    const side = (t.side || '').toUpperCase();
    if (side === 'SHORT') {
      shortTrades++;
      const pl = t.realized_pl !== null && t.realized_pl !== 'null' ? parseFloat(t.realized_pl) : null;
      if (pl !== null && !isNaN(pl)) {
        shortPLs.push(pl);
        if (pl > 0) shortWins++;
      }
    } else {
      longTrades++;
      const pl = t.realized_pl !== null && t.realized_pl !== 'null' ? parseFloat(t.realized_pl) : null;
      if (pl !== null && !isNaN(pl)) {
        longPLs.push(pl);
        if (pl > 0) longWins++;
      }
    }
  }

  const longWinRate = longPLs.length > 0 ? Math.round((longWins / longPLs.length) * 100) : 0;
  const shortWinRate = shortPLs.length > 0 ? Math.round((shortWins / shortPLs.length) * 100) : 0;

  // ── Hold Time / Position Size ──
  let totalHoldMinutes = 0;
  let holdTimeCount = 0;
  let totalSize = 0;
  let sizeCount = 0;

  for (const t of trades) {
    const mins = parseHoldTimeToMinutes(t.holdTime || '');
    if (mins > 0) {
      totalHoldMinutes += mins;
      holdTimeCount++;
    }
    const sz = parseFloat(t.size);
    if (!isNaN(sz) && sz > 0) {
      totalSize += sz;
      sizeCount++;
    }
  }

  const averageHoldTimeMinutes = holdTimeCount > 0 ? Math.round(totalHoldMinutes / holdTimeCount) : 0;
  const averagePositionSize = sizeCount > 0 ? Math.round(totalSize / sizeCount) : 0;

  // Format average hold time
  let averageHoldTime: string;
  if (averageHoldTimeMinutes < 1) {
    averageHoldTime = "<1m";
  } else if (averageHoldTimeMinutes < 60) {
    averageHoldTime = `${averageHoldTimeMinutes}m`;
  } else {
    const h = Math.floor(averageHoldTimeMinutes / 60);
    const m = averageHoldTimeMinutes % 60;
    averageHoldTime = m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  // ── Most Traded Tickers ──
  const tickerCounts: Record<string, number> = {};
  for (const t of trades) {
    const ticker = (t.ticker || '').toUpperCase();
    if (ticker) tickerCounts[ticker] = (tickerCounts[ticker] || 0) + 1;
  }
  const mostTradedTickers = Object.entries(tickerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([ticker]) => ticker);

  // ── Timing / Hour Analysis ──
  const hourBuckets: Record<number, { wins: number; total: number; pl: number }> = {};
  let morningCount = 0;
  let morningWinsCount = 0;
  let afternoonCount = 0;
  let afternoonWinsCount = 0;
  let totalEntryHours = 0;
  let entryHourCount = 0;

  for (const t of trades) {
    const ts = t.entry_time || t.timestamp;
    const hour = extractHourFromTimestamp(ts);
    if (hour < 0) continue;

    totalEntryHours += hour;
    entryHourCount++;

    if (!hourBuckets[hour]) {
      hourBuckets[hour] = { wins: 0, total: 0, pl: 0 };
    }
    hourBuckets[hour].total++;

    const pl = t.realized_pl !== null && t.realized_pl !== 'null' ? parseFloat(t.realized_pl) : null;
    if (pl !== null && !isNaN(pl)) {
      hourBuckets[hour].pl += pl;
      if (pl > 0) hourBuckets[hour].wins++;
    }

    // Morning vs Afternoon (noon = 12)
    if (hour < 12) {
      morningCount++;
      if (pl !== null && pl > 0) morningWinsCount++;
    } else {
      afternoonCount++;
      if (pl !== null && pl > 0) afternoonWinsCount++;
    }
  }

  const averageEntryHour = entryHourCount > 0
    ? formatHour(Math.round(totalEntryHours / entryHourCount))
    : "Unknown";

  // Most common trading hour
  let commonTradingHour = -1;
  let maxCount = 0;
  for (const [hourStr, data] of Object.entries(hourBuckets)) {
    if (data.total > maxCount) {
      maxCount = data.total;
      commonTradingHour = parseInt(hourStr, 10);
    }
  }

  // Best / Worst trading windows (by win rate within each hour bucket)
  const hourWindows = Object.entries(hourBuckets).map(([hourStr, data]) => ({
    hour: parseInt(hourStr, 10),
    winRate: data.total > 0 ? Math.round((data.wins / data.total) * 100) : 0,
    trades: data.total,
    pl: data.pl,
  }));

  let bestWindow = "";
  let bestWinRate = -1;
  let worstWindow = "";
  let worstWinRate = 101;

  for (const w of hourWindows) {
    const label = hourWindowLabel(w.hour);
    if (w.winRate > bestWinRate && w.trades >= 2) {
      bestWinRate = w.winRate;
      bestWindow = label;
    }
    if (w.winRate < worstWinRate && w.trades >= 2) {
      worstWinRate = w.winRate;
      worstWindow = label;
    }
  }

  // Fallback if no window with 2+ trades
  if (!bestWindow && hourWindows.length > 0) {
    const sorted = [...hourWindows].sort((a, b) => b.winRate - a.winRate);
    bestWindow = hourWindowLabel(sorted[0].hour);
  }
  if (!worstWindow && hourWindows.length > 0) {
    const sorted = [...hourWindows].sort((a, b) => a.winRate - b.winRate);
    worstWindow = hourWindowLabel(sorted[0].hour);
  }

  const morningWinRate = morningCount > 0 ? Math.round((morningWinsCount / morningCount) * 100) : 0;
  const afternoonWinRate = afternoonCount > 0 ? Math.round((afternoonWinsCount / afternoonCount) * 100) : 0;

  // ── Per-ticker P&L ──
  const tickerPL: Record<string, number> = {};
  for (const t of trades) {
    const ticker = (t.ticker || '').toUpperCase();
    const pl = t.realized_pl !== null && t.realized_pl !== 'null' ? parseFloat(t.realized_pl) : null;
    if (pl !== null && !isNaN(pl) && ticker) {
      tickerPL[ticker] = (tickerPL[ticker] || 0) + pl;
    }
  }

  let bestPerformingTicker = "";
  let worstPerformingTicker = "";
  let bestPL = -Infinity;
  let worstPL = Infinity;

  for (const [ticker, pl] of Object.entries(tickerPL)) {
    if (pl > bestPL) {
      bestPL = pl;
      bestPerformingTicker = ticker;
    }
    if (pl < worstPL) {
      worstPL = pl;
      worstPerformingTicker = ticker;
    }
  }

  // ── Discipline ──
  let totalDisciplineScore = 0;
  let disciplineCount = 0;
  let totalViolations = 0;
  let totalViolationCostNum = 0;

  for (const t of trades) {
    if (t.discipline_score !== null && t.discipline_score !== undefined) {
      totalDisciplineScore += t.discipline_score;
      disciplineCount++;
    }
    totalViolations += t.violationsCount || 0;
    const cost = t.violation_cost ? parseFloat(t.violation_cost) : 0;
    if (!isNaN(cost)) totalViolationCostNum += cost;
  }

  const averageDisciplineScore = disciplineCount > 0
    ? Math.round(totalDisciplineScore / disciplineCount)
    : 100;

  // ── Tags ──
  const tags = buildTags(trades, {
    averagePositionSize,
    averageHoldTimeMinutes,
    averageWinner,
    averageLoser,
    largestWinner,
    largestLoser,
    longTrades,
    shortTrades,
  });

  return {
    // Basic stats
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    totalProfitLoss: Math.round(totalProfitLoss * 100) / 100,
    averageWinner: Math.round(averageWinner * 100) / 100,
    averageLoser: Math.round(averageLoser * 100) / 100,
    largestWinner: Math.round(largestWinner * 100) / 100,
    largestLoser: Math.round(largestLoser * 100) / 100,
    profitFactor,

    // Trading style
    longTrades,
    shortTrades,
    longWins,
    shortWins,
    longWinRate,
    shortWinRate,
    averageHoldTime,
    averageHoldTimeMinutes,
    averagePositionSize,
    mostTradedTickers,

    // Timing behavior
    averageEntryHour,
    commonTradingHour,
    morningTrades: morningCount,
    afternoonTrades: afternoonCount,
    morningWins: morningWinsCount,
    afternoonWins: afternoonWinsCount,
    morningWinRate,
    afternoonWinRate,
    bestTradingWindow: bestWindow || "N/A",
    worstTradingWindow: worstWindow || "N/A",

    // Per-ticker
    bestPerformingTicker,
    worstPerformingTicker,

    // Discipline
    averageDisciplineScore,
    totalViolations,
    totalViolationCost: Math.round(totalViolationCostNum * 100) / 100,

    // Tags
    tags,
  };
}

// ─── Tag System ──────────────────────────────────────────────────────────────

interface TagContext {
  averagePositionSize: number;
  averageHoldTimeMinutes: number;
  averageWinner: number;
  averageLoser: number;
  largestWinner: number;
  largestLoser: number;
  longTrades: number;
  shortTrades: number;
}

function buildTags(trades: AnalyticsTrade[], ctx: TagContext): TradeTag[] {
  const tagMap = new Map<string, TradeTag>();

  const addTag = (category: TradeTag['category'], label: string, description: string) => {
    const key = `${category}:${label}`;
    if (!tagMap.has(key)) {
      tagMap.set(key, { category, label, description, count: 0 });
    }
  };

  const incrementTag = (category: TradeTag['category'], label: string) => {
    const key = `${category}:${label}`;
    const tag = tagMap.get(key);
    if (tag) tag.count++;
  };

  // Pre-register all possible tags
  addTag('position', 'Oversized position', 'Position size significantly above average');
  addTag('position', 'Small position', 'Position size significantly below average');
  addTag('position', 'Average position', 'Position size around typical average');
  addTag('behavior', 'Quick scalp', 'Trade held less than 5 minutes');
  addTag('behavior', 'Intraday hold', 'Trade held between 5 minutes and 2 hours');
  addTag('behavior', 'Extended hold', 'Trade held more than 2 hours');
  addTag('outcome', 'Big winner', 'Trade with exceptionally large profit');
  addTag('outcome', 'Big loser', 'Trade with exceptionally large loss');
  addTag('outcome', 'Small win', 'Trade with small profit');
  addTag('outcome', 'Small loss', 'Trade with small loss');
  addTag('direction', 'Long trader', 'Primarily trades long direction');
  addTag('direction', 'Short trader', 'Primarily trades short direction');

  // Classify each trade
  for (const t of trades) {
    // Position behavior
    const size = parseFloat(t.size);
    if (!isNaN(size) && ctx.averagePositionSize > 0) {
      const ratio = size / ctx.averagePositionSize;
      if (ratio >= 2) {
        incrementTag('position', 'Oversized position');
      } else if (ratio <= 0.5) {
        incrementTag('position', 'Small position');
      } else {
        incrementTag('position', 'Average position');
      }
    }

    // Trade behavior (hold time)
    const holdMins = parseHoldTimeToMinutes(t.holdTime || '');
    if (holdMins > 0) {
      if (holdMins < 5) {
        incrementTag('behavior', 'Quick scalp');
      } else if (holdMins <= 120) {
        incrementTag('behavior', 'Intraday hold');
      } else {
        incrementTag('behavior', 'Extended hold');
      }
    }

    // Outcome behavior
    const pl = t.realized_pl !== null && t.realized_pl !== 'null' ? parseFloat(t.realized_pl) : null;
    if (pl !== null && !isNaN(pl)) {
      if (pl > 0) {
        if (ctx.averageWinner > 0 && pl >= ctx.averageWinner * 1.5) {
          incrementTag('outcome', 'Big winner');
        } else {
          incrementTag('outcome', 'Small win');
        }
      } else if (pl < 0) {
        const absPL = Math.abs(pl);
        if (ctx.averageLoser > 0 && absPL >= ctx.averageLoser * 1.5) {
          incrementTag('outcome', 'Big loser');
        } else {
          incrementTag('outcome', 'Small loss');
        }
      }
    }
  }

  // Direction tag for the profile
  if (ctx.longTrades > ctx.shortTrades) {
    incrementTag('direction', 'Long trader');
  } else if (ctx.shortTrades > ctx.longTrades) {
    incrementTag('direction', 'Short trader');
  }

  // Remove tags with count === 0
  const result: TradeTag[] = [];
  for (const tag of tagMap.values()) {
    if (tag.count > 0) {
      result.push(tag);
    }
  }

  // Sort: most frequent categories first, then by count desc
  const categoryOrder: Record<string, number> = {
    direction: 0,
    behavior: 1,
    outcome: 2,
    position: 3,
  };

  result.sort((a, b) => {
    const catDiff = (categoryOrder[a.category] ?? 99) - (categoryOrder[b.category] ?? 99);
    if (catDiff !== 0) return catDiff;
    return b.count - a.count;
  });

  return result;
}

// ─── Insights Generation ────────────────────────────────────────────────────

/**
 * Generate deterministic strengths, weaknesses, and tendencies from a TraderProfile.
 *
 * No AI — all rules are purely based on the computed statistics.
 */
export function generateInsights(profile: TraderProfile): TraderInsights {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const tendencies: string[] = [];

  // ── Win Rate ──
  if (profile.winRate >= 65) {
    strengths.push(`High overall win rate of ${profile.winRate}%`);
  } else if (profile.winRate <= 40 && profile.totalTrades >= 10) {
    weaknesses.push(`Low overall win rate of ${profile.winRate}%`);
  }

  // ── Profit Factor ──
  if (profile.profitFactor >= 2) {
    strengths.push(`Strong profit factor of ${profile.profitFactor} — you make $${profile.profitFactor} for every $1 lost`);
  } else if (profile.profitFactor < 1 && profile.totalTrades >= 10) {
    weaknesses.push(`Profit factor below 1.0 (${profile.profitFactor}) — losses exceed gains`);
  }

  // ── Side Performance ──
  if (profile.shortTrades >= 5 && profile.shortWinRate >= 60) {
    strengths.push(`Strong short-side performance (${profile.shortWinRate}% win rate on ${profile.shortTrades} trades)`);
  } else if (profile.shortTrades >= 5 && profile.shortWinRate <= 35) {
    weaknesses.push(`Weak short-side performance (${profile.shortWinRate}% win rate on ${profile.shortTrades} trades)`);
  }

  if (profile.longTrades >= 5 && profile.longWinRate >= 60) {
    strengths.push(`Strong long-side performance (${profile.longWinRate}% win rate on ${profile.longTrades} trades)`);
  } else if (profile.longTrades >= 5 && profile.longWinRate <= 35) {
    weaknesses.push(`Weak long-side performance (${profile.longWinRate}% win rate on ${profile.longTrades} trades)`);
  }

  // ── Morning vs Afternoon ──
  if (profile.morningTrades >= 5 && profile.morningWinRate >= 60) {
    strengths.push(`Strong performance during morning session (${profile.morningWinRate}% win rate)`);
  } else if (profile.morningTrades >= 5 && profile.morningWinRate <= 35) {
    weaknesses.push(`Weak performance during morning session (${profile.morningWinRate}% win rate)`);
  }

  if (profile.afternoonTrades >= 5 && profile.afternoonWinRate >= 60) {
    strengths.push(`Strong performance during afternoon session (${profile.afternoonWinRate}% win rate)`);
  } else if (profile.afternoonTrades >= 5 && profile.afternoonWinRate <= 35) {
    weaknesses.push(`Weak performance during afternoon session (${profile.afternoonWinRate}% win rate)`);
  }

  // ── Risk / Reward ──
  if (profile.averageWinner > 0 && profile.averageLoser > 0) {
    const ratio = profile.averageWinner / profile.averageLoser;
    if (ratio >= 2) {
      strengths.push(`Excellent risk/reward ratio — average winner ($${profile.averageWinner.toFixed(0)}) is ${ratio.toFixed(1)}x average loser ($${profile.averageLoser.toFixed(0)})`);
    } else if (ratio <= 0.7 && profile.totalTrades >= 10) {
      weaknesses.push(`Average loser ($${profile.averageLoser.toFixed(0)}) is larger than average winner ($${profile.averageWinner.toFixed(0)}) — consider cutting losses sooner`);
    }
  }

  // ── Discipline ──
  if (profile.averageDisciplineScore >= 90 && profile.totalTrades >= 5) {
    strengths.push(`High discipline score (${profile.averageDisciplineScore}/100) — strong process adherence`);
  } else if (profile.averageDisciplineScore <= 60 && profile.totalTrades >= 5) {
    weaknesses.push(`Low discipline score (${profile.averageDisciplineScore}/100) — rules violations are frequent`);
  }

  // ── Largest Loser ──
  if (profile.largestLoser > 0 && profile.averageWinner > 0) {
    const loserToWinnerRatio = profile.largestLoser / profile.averageWinner;
    if (loserToWinnerRatio >= 3 && profile.totalTrades >= 5) {
      weaknesses.push(`Largest loss ($${profile.largestLoser.toFixed(0)}) is ${loserToWinnerRatio.toFixed(1)}x your average win — consider a hard stop-loss`);
    }
  }

  // ── Consistency ──
  if (profile.totalTrades >= 10) {
    const winRateRounded = profile.winRate;
    if (winRateRounded >= 45 && winRateRounded <= 60) {
      tendencies.push('Balanced win rate suggests consistent, methodical trading');
    }
  }

  // ── Timing Patterns ──
  if (profile.bestTradingWindow && profile.bestTradingWindow !== "N/A") {
    tendencies.push(`Best trading window: ${profile.bestTradingWindow}`);
  }
  if (profile.worstTradingWindow && profile.worstTradingWindow !== "N/A") {
    tendencies.push(`Worst trading window: ${profile.worstTradingWindow}`);
  }

  // ── Position Sizing ──
  const oversizedTag = profile.tags.find(t => t.label === 'Oversized position');
  const scalpTag = profile.tags.find(t => t.label === 'Quick scalp');
  const extendedTag = profile.tags.find(t => t.label === 'Extended hold');

  if (oversizedTag && oversizedTag.count >= 3) {
    weaknesses.push(`Frequent oversized positions (${oversizedTag.count} trades) — consider standardizing position size`);
  }

  if (scalpTag && scalpTag.count >= 5 && profile.totalTrades >= 10) {
    tendencies.push(`Frequent scalping (${scalpTag.count} trades under 5 minutes)`);
  }

  if (extendedTag && extendedTag.count >= 3) {
    tendencies.push(`Extended hold times on ${extendedTag.count} trades — may indicate reluctance to close`);
  }

  // ── Direction Tendency ──
  const longTag = profile.tags.find(t => t.label === 'Long trader');
  const shortTag = profile.tags.find(t => t.label === 'Short trader');

  if (longTag) {
    tendencies.push('Primarily trades long direction');
  } else if (shortTag) {
    tendencies.push('Primarily trades short direction');
  }

  // ── Ticker Focus ──
  if (profile.mostTradedTickers.length > 0) {
    tendencies.push(`Most traded: ${profile.mostTradedTickers.slice(0, 3).join(', ')}`);
  }

  // ── Overall Assessment (only with enough data) ──
  if (profile.totalTrades >= 20) {
    if (profile.winRate >= 55 && profile.profitFactor >= 1.5) {
      strengths.push('Consistently profitable across a significant sample size');
    } else if (profile.winRate < 40 && profile.profitFactor < 1) {
      weaknesses.push('Overall trading strategy needs review — below breakeven across many trades');
    }
  }

  return {
    strengths,
    weaknesses,
    tendencies,
    statistics: profile,
  };
}
