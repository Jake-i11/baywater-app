/**
 * Behavioral Intelligence Engine
 *
 * Pure, deterministic functions for detecting behavioral patterns,
 * recurring mistakes, strengths, and trading tendencies from historical trade data.
 *
 * No API calls, no chart data, no AI — just rule-based pattern detection.
 * Designed to feed structured data into a future AI coaching pipeline.
 */

import { parseHoldTimeToMinutes, extractHourFromTimestamp } from "./trade-analytics";

// ─── Core Interfaces ─────────────────────────────────────────────────────────

export interface BehaviorPattern {
  id: string;
  category: 'mistake' | 'strength' | 'tendency';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  evidence: {
    tradeCount: number;
    percentage?: number;
    value?: number;
  };
}

export interface BehaviorReport {
  patterns: BehaviorPattern[];
  strengths: BehaviorPattern[];
  weaknesses: BehaviorPattern[];
  recurringMistakes: BehaviorPattern[];
  bestHabits: BehaviorPattern[];
}

export interface CoachReadyIssue {
  title: string;
  evidence: string;
}

export interface CoachReadyEdge {
  title: string;
  evidence: string;
}

export interface CoachReadyOutput {
  topIssues: CoachReadyIssue[];
  strongestEdges: CoachReadyEdge[];
}

// ─── Type for the trade shape consumed by behavior analysis ─────────────────

export interface BehaviorTrade {
  side: string;
  direction: string;
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
  tradeMetrics?: {
    mfe?: number | null;
    mfeDisplay?: string;
    mae?: number | null;
    maeDisplay?: string;
    bestExitPrice?: number | null;
    bestExitDisplay?: string;
    missedAmount?: number | null;
    missedDisplay?: string;
    entryContext?: string;
  } | null;
  ticker: string;
  [key: string]: any;
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function getNumericPL(t: BehaviorTrade): number | null {
  if (t.realized_pl === null || t.realized_pl === 'null') return null;
  const pl = parseFloat(t.realized_pl);
  return isNaN(pl) ? null : pl;
}

function getNumericSize(t: BehaviorTrade): number {
  const sz = parseFloat(t.size);
  return isNaN(sz) ? 0 : sz;
}

function formatMinutes(mins: number): string {
  if (mins < 1) return "<1m";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ─── Pattern Detection Functions ─────────────────────────────────────────────

/**
 * 1. Oversizing losing trades
 *
 * Detects whether position sizes on losing trades are significantly larger
 * than the trader's average position size.
 */
function detectOversizingLosingTrades(trades: BehaviorTrade[]): BehaviorPattern | null {
  if (trades.length < 3) return null;

  const sizes = trades.map(t => getNumericSize(t)).filter(s => s > 0);
  const avgSize = sizes.length > 0
    ? sizes.reduce((sum, s) => sum + s, 0) / sizes.length
    : 0;

  if (avgSize <= 0) return null;

  // Get losing trades with valid P&L that had a position size
  const losingTrades = trades.filter(t => {
    const pl = getNumericPL(t);
    const sz = getNumericSize(t);
    return pl !== null && pl < 0 && sz > 0;
  });

  if (losingTrades.length < 3) return null;

  const avgLoserSize = losingTrades.reduce((sum, t) => sum + getNumericSize(t), 0) / losingTrades.length;
  const sizeRatio = avgLoserSize / avgSize;

  if (sizeRatio < 1.25) return null; // Not significant enough

  const percentage = Math.round((sizeRatio - 1) * 100);

  let severity: 'low' | 'medium' | 'high' = 'medium';
  if (percentage >= 50) severity = 'high';
  else if (percentage >= 25) severity = 'medium';
  else severity = 'low';

  return {
    id: 'oversizing-losing-trades',
    category: 'mistake',
    title: 'Oversizing losing trades',
    description: `Your losing trades are ${percentage}% larger than your average trade size. This compounds losses unnecessarily.`,
    severity,
    evidence: {
      tradeCount: losingTrades.length,
      percentage,
      value: Math.round(avgLoserSize),
    },
  };
}

/**
 * 2. Holding losers too long
 *
 * Detects whether the average hold time for losing trades significantly
 * exceeds the average hold time for winning trades.
 */
function detectHoldingLosersTooLong(trades: BehaviorTrade[]): BehaviorPattern | null {
  if (trades.length < 3) return null;

  const winnerHoldTimes: number[] = [];
  const loserHoldTimes: number[] = [];

  for (const t of trades) {
    const pl = getNumericPL(t);
    const mins = parseHoldTimeToMinutes(t.holdTime || '');
    if (mins <= 0) continue;

    if (pl !== null && pl > 0) {
      winnerHoldTimes.push(mins);
    } else if (pl !== null && pl < 0) {
      loserHoldTimes.push(mins);
    }
  }

  if (winnerHoldTimes.length < 2 || loserHoldTimes.length < 2) return null;

  const avgWinnerHold = winnerHoldTimes.reduce((sum, m) => sum + m, 0) / winnerHoldTimes.length;
  const avgLoserHold = loserHoldTimes.reduce((sum, m) => sum + m, 0) / loserHoldTimes.length;

  if (avgLoserHold <= avgWinnerHold * 1.3) return null;

  const ratio = avgLoserHold / avgWinnerHold;

  let severity: 'low' | 'medium' | 'high' = 'medium';
  if (ratio >= 2.5) severity = 'high';
  else if (ratio >= 1.5) severity = 'medium';
  else severity = 'low';

  return {
    id: 'holding-losers-too-long',
    category: 'mistake',
    title: 'Holding losing trades longer than winners',
    description: `Your average losing trade lasts ${formatMinutes(avgLoserHold)} compared to ${formatMinutes(avgWinnerHold)} for winners — ${ratio.toFixed(1)}x longer.`,
    severity,
    evidence: {
      tradeCount: loserHoldTimes.length,
      percentage: Math.round((ratio - 1) * 100),
      value: Math.round(avgLoserHold),
    },
  };
}

/**
 * 3. Cutting winners early / leaving profit on the table
 *
 * Uses chart-derived tradeMetrics.missedAmount to detect consistently
 * positive missed amounts (indicating exits that left money behind).
 */
function detectCuttingWinnersEarly(trades: BehaviorTrade[]): BehaviorPattern | null {
  if (trades.length < 2) return null;

  // Only trades with tradeMetrics and a valid missedAmount
  const tradesWithMetrics = trades.filter(t =>
    t.tradeMetrics?.missedAmount !== null &&
    t.tradeMetrics?.missedAmount !== undefined &&
    t.tradeMetrics.missedAmount > 0
  );

  if (tradesWithMetrics.length < 2) return null;

  const missedAmounts = tradesWithMetrics.map(t => t.tradeMetrics!.missedAmount!);
  const avgMissed = missedAmounts.reduce((sum, m) => sum + m, 0) / missedAmounts.length;

  // Calculate average MFE for context
  const mfeValues = tradesWithMetrics
    .map(t => t.tradeMetrics?.mfe)
    .filter((m): m is number => m !== null && m !== undefined && m > 0);

  const avgMfe = mfeValues.length > 0
    ? mfeValues.reduce((sum, m) => sum + m, 0) / mfeValues.length
    : 0;

  // What percentage of the available move did they capture?
  const capturePct = avgMfe > 0
    ? Math.round(((avgMfe - avgMissed) / avgMfe) * 100)
    : 0;

  if (avgMfe <= 0 || capturePct >= 70 || capturePct <= 0) return null;

  let severity: 'low' | 'medium' | 'high' = 'medium';
  if (capturePct <= 40) severity = 'high';
  else if (capturePct <= 55) severity = 'medium';
  else severity = 'low';

  return {
    id: 'cutting-winners-early',
    category: 'mistake',
    title: 'Leaving profit on the table',
    description: `Your average exit captures only ${capturePct}% of the available move, leaving an average $${avgMissed.toFixed(2)} per trade unrealized.`,
    severity,
    evidence: {
      tradeCount: tradesWithMetrics.length,
      percentage: capturePct,
      value: Math.round(avgMissed * 100) / 100,
    },
  };
}

/**
 * 4. Poor performance during specific hours
 *
 * Uses entry timestamps to detect hour windows with significantly lower win rates.
 */
function detectPoorHourPerformance(trades: BehaviorTrade[]): BehaviorPattern | null {
  if (trades.length < 5) return null;

  const hourBuckets: Record<number, { wins: number; total: number }> = {};

  for (const t of trades) {
    const ts = t.entry_time || t.timestamp;
    const hour = extractHourFromTimestamp(ts);
    if (hour < 0) continue;

    if (!hourBuckets[hour]) {
      hourBuckets[hour] = { wins: 0, total: 0 };
    }
    hourBuckets[hour].total++;

    const pl = getNumericPL(t);
    if (pl !== null && pl > 0) hourBuckets[hour].wins++;
  }

  // Find windows with poor performance (win rate < 40% and at least 3 trades)
  const overallWinRate = trades.filter(t => {
    const pl = getNumericPL(t);
    return pl !== null;
  }).length > 0
    ? trades.filter(t => {
        const pl = getNumericPL(t);
        return pl !== null && pl > 0;
      }).length / trades.filter(t => getNumericPL(t) !== null).length
    : 0;

  const poorWindows: { hour: number; winRate: number; trades: number }[] = [];

  for (const [hourStr, data] of Object.entries(hourBuckets)) {
    if (data.total < 3) continue;
    const winRate = data.total > 0 ? data.wins / data.total : 0;
    if (winRate < 0.40 && winRate < overallWinRate * 0.8) {
      poorWindows.push({
        hour: parseInt(hourStr, 10),
        winRate: Math.round(winRate * 100),
        trades: data.total,
      });
    }
  }

  if (poorWindows.length === 0) return null;

  // Pick the worst one
  poorWindows.sort((a, b) => a.winRate - b.winRate);
  const worst = poorWindows[0];

  const fmt = (h: number) => {
    if (h === 0) return "12:00 AM";
    if (h < 12) return `${h}:00 AM`;
    if (h === 12) return "12:00 PM";
    return `${h - 12}:00 PM`;
  };

  const windowLabel = `${fmt(worst.hour)}-${fmt(worst.hour + 1)}`;

  let periodLabel: string;
  if (worst.hour < 12) {
    periodLabel = "morning";
  } else if (worst.hour < 17) {
    periodLabel = "afternoon";
  } else {
    periodLabel = "evening";
  }

  let severity: 'low' | 'medium' | 'high' = 'medium';
  if (worst.winRate <= 25) severity = 'high';
  else if (worst.winRate <= 35) severity = 'medium';
  else severity = 'low';

  return {
    id: 'poor-hour-performance',
    category: 'mistake',
    title: `Poor ${periodLabel} performance (${windowLabel})`,
    description: `Trades entered in the ${windowLabel} window have a ${worst.winRate}% win rate across ${worst.trades} trades.`,
    severity,
    evidence: {
      tradeCount: worst.trades,
      percentage: worst.winRate,
    },
  };
}

/**
 * 5. Revenge trading
 *
 * Detects patterns of:
 * - Loss followed by a larger position on the next trade
 * - Multiple losses in a short period
 * - Loss followed by an immediate next trade
 */
function detectRevengeTrading(trades: BehaviorTrade[]): BehaviorPattern | null {
  if (trades.length < 3) return null;

  // Sort trades by timestamp (chronological)
  const sorted = [...trades]
    .filter(t => t.entry_time || t.timestamp)
    .sort((a, b) => {
      const aTime = new Date(a.entry_time || a.timestamp || '').getTime();
      const bTime = new Date(b.entry_time || b.timestamp || '').getTime();
      if (isNaN(aTime) || isNaN(bTime)) return 0;
      return aTime - bTime;
    });

  if (sorted.length < 3) return null;

  let lossFollowedByLargerSize = 0;
  let totalLossTrades = 0;
  let immediateNextTradeAfterLoss = 0;
  let consecutiveLossClusters = 0;

  // Track position sizing after losses
  const avgSize = sorted.reduce((sum, t) => sum + getNumericSize(t), 0) / sorted.length;

  for (let i = 0; i < sorted.length - 1; i++) {
    const currentPL = getNumericPL(sorted[i]);
    const currentSize = getNumericSize(sorted[i]);
    const nextSize = getNumericSize(sorted[i + 1]);

    if (currentPL !== null && currentPL < 0 && currentSize > 0) {
      totalLossTrades++;

      // Check if the next trade is larger
      if (nextSize > 0 && avgSize > 0 && nextSize > currentSize * 1.3) {
        lossFollowedByLargerSize++;
      }

      // Check if next trade happened immediately (within 15 minutes)
      const currentTime = new Date(sorted[i].entry_time || sorted[i].timestamp || '').getTime();
      const nextTime = new Date(sorted[i + 1].entry_time || sorted[i + 1].timestamp || '').getTime();
      if (!isNaN(currentTime) && !isNaN(nextTime)) {
        const timeDiff = (nextTime - currentTime) / 60000; // minutes
        if (timeDiff <= 15) {
          immediateNextTradeAfterLoss++;
        }
      }
    }
  }

  // Check for consecutive loss clusters (3+ losses in a row)
  let currentLossStreak = 0;
  for (const t of sorted) {
    const pl = getNumericPL(t);
    if (pl !== null && pl < 0) {
      currentLossStreak++;
      if (currentLossStreak >= 3) {
        consecutiveLossClusters++;
      }
    } else {
      currentLossStreak = 0;
    }
  }

  let severity: 'low' | 'medium' | 'high' = 'low';

  if (totalLossTrades >= 3 && avgSize > 0) {
    const largerSizePct = totalLossTrades > 0
      ? Math.round((lossFollowedByLargerSize / totalLossTrades) * 100)
      : 0;

    if (largerSizePct >= 30 || immediateNextTradeAfterLoss >= 3 || consecutiveLossClusters >= 1) {
      // Calculate how much larger the next position tends to be
      let totalSizeIncrease = 0;
      let increaseCount = 0;
      for (let i = 0; i < sorted.length - 1; i++) {
        const currentPL = getNumericPL(sorted[i]);
        const currentSize = getNumericSize(sorted[i]);
        const nextSize = getNumericSize(sorted[i + 1]);
        if (currentPL !== null && currentPL < 0 && nextSize > 0 && currentSize > 0) {
          totalSizeIncrease += nextSize / currentSize;
          increaseCount++;
        }
      }

      const avgIncrease = increaseCount > 0 ? (totalSizeIncrease / increaseCount) : 1;
      const increasePct = Math.round((avgIncrease - 1) * 100);

      if (increasePct >= 30 || immediateNextTradeAfterLoss >= 3 || consecutiveLossClusters >= 1) {
        let desc = '';
        if (increasePct >= 30) {
          desc = `After losing trades, your next position size increases by ${increasePct}% on average.`;
        } else if (consecutiveLossClusters >= 1) {
          desc = `You experienced ${consecutiveLossClusters} instance(s) of 3+ consecutive losses.`;
        } else {
          desc = `${immediateNextTradeAfterLoss} losing trades were followed by another trade within 15 minutes.`;
        }

        severity = increasePct >= 50 ? 'high' : 'medium';

        return {
          id: 'revenge-trading',
          category: 'mistake',
          title: 'Possible revenge trading',
          description: desc,
          severity,
          evidence: {
            tradeCount: totalLossTrades,
            percentage: largerSizePct,
            value: increasePct,
          },
        };
      }
    }
  }

  return null;
}

/**
 * 6. Direction weakness / edge
 *
 * Compares LONG vs SHORT performance and reports whichever is weaker (or stronger).
 */
function detectDirectionIssues(trades: BehaviorTrade[]): BehaviorPattern | null {
  if (trades.length < 3) return null;

  let longPls: number[] = [];
  let shortPls: number[] = [];
  let longTrades = 0;
  let shortTrades = 0;

  for (const t of trades) {
    const side = (t.side || '').toUpperCase();
    const pl = getNumericPL(t);
    if (pl === null) continue;

    if (side === 'SHORT') {
      shortTrades++;
      shortPls.push(pl);
    } else {
      longTrades++;
      longPls.push(pl);
    }
  }

  if (longTrades < 3 && shortTrades < 3) return null;

  const calcWinRate = (pls: number[]) => {
    if (pls.length === 0) return 0;
    return Math.round((pls.filter(p => p > 0).length / pls.length) * 100);
  };

  const longWR = calcWinRate(longPls);
  const shortWR = calcWinRate(shortPls);

  // Report weakness on the worse side (only if significant difference)
  if (longTrades >= 3 && shortTrades >= 3 && Math.abs(longWR - shortWR) >= 15) {
    const weakerSide = longWR < shortWR ? 'long' : 'short';
    const weakerWR = weakerSide === 'long' ? longWR : shortWR;
    const strongerWR = weakerSide === 'long' ? shortWR : longWR;
    const strongerSide = weakerSide === 'long' ? 'SHORT' : 'LONG';

    let severity: 'low' | 'medium' | 'high' = 'medium';
    if (weakerWR <= 30) severity = 'high';
    else if (weakerWR <= 40) severity = 'medium';
    else severity = 'low';

    return {
      id: 'direction-weakness',
      category: 'mistake',
      title: `Weak ${weakerSide}-side performance`,
      description: `Your ${weakerSide} trades win ${weakerWR}% of the time compared to ${strongerWR}% for ${strongerSide}.`,
      severity,
      evidence: {
        tradeCount: weakerSide === 'long' ? longTrades : shortTrades,
        percentage: weakerWR,
      },
    };
  }

  return null;
}

/**
 * 7. Strong morning edge (strength)
 *
 * Detects if morning trades significantly outperform the overall average.
 */
function detectMorningEdge(trades: BehaviorTrade[]): BehaviorPattern | null {
  if (trades.length < 5) return null;

  const morningTrades: BehaviorTrade[] = [];
  const afternoonTrades: BehaviorTrade[] = [];

  for (const t of trades) {
    const ts = t.entry_time || t.timestamp;
    const hour = extractHourFromTimestamp(ts);
    if (hour < 0) continue;

    if (hour < 12) {
      morningTrades.push(t);
    } else {
      afternoonTrades.push(t);
    }
  }

  if (morningTrades.length < 5) return null;

  const calcWR = (subset: BehaviorTrade[]) => {
    const withPL = subset.filter(t => getNumericPL(t) !== null);
    if (withPL.length === 0) return 0;
    const wins = withPL.filter(t => getNumericPL(t)! > 0).length;
    return Math.round((wins / withPL.length) * 100);
  };

  const morningWR = calcWR(morningTrades);
  const overallWR = calcWR(trades);

  if (morningWR < overallWR + 10 || morningWR < 55) return null;

  let severity: 'low' | 'medium' | 'high' = 'medium';
  if (morningWR >= 70) severity = 'high';
  else if (morningWR >= 60) severity = 'medium';
  else severity = 'low';

  return {
    id: 'morning-edge',
    category: 'strength',
    title: 'Strong morning execution',
    description: `Your morning trades (before 12:00 PM) have a ${morningWR}% win rate compared to your overall ${overallWR}% — a clear edge in the early session.`,
    severity,
    evidence: {
      tradeCount: morningTrades.length,
      percentage: morningWR,
    },
  };
}

/**
 * 8. Risk control (strength)
 *
 * Detects if losses are well-contained relative to winners.
 */
function detectRiskControl(trades: BehaviorTrade[]): BehaviorPattern | null {
  if (trades.length < 3) return null;

  const winnerPLs: number[] = [];
  const loserPLs: number[] = [];

  for (const t of trades) {
    const pl = getNumericPL(t);
    if (pl === null) continue;
    if (pl > 0) winnerPLs.push(pl);
    else if (pl < 0) loserPLs.push(Math.abs(pl));
  }

  if (winnerPLs.length < 2 || loserPLs.length < 2) return null;

  const avgWinner = winnerPLs.reduce((sum, p) => sum + p, 0) / winnerPLs.length;
  const avgLoser = loserPLs.reduce((sum, p) => sum + p, 0) / loserPLs.length;

  // Check largest loser relative to average winner
  const maxLoser = Math.max(...loserPLs);

  if (avgLoser <= avgWinner * 0.7 || maxLoser <= avgWinner * 1.5) {
    // Also check that maxLoser isn't catastrophic
    if (maxLoser <= avgWinner * 2) {
      let severity: 'low' | 'medium' | 'high' = 'medium';
      if (avgLoser <= avgWinner * 0.5) severity = 'high';
      else if (avgLoser <= avgWinner * 0.7) severity = 'medium';
      else severity = 'low';

      return {
        id: 'good-risk-control',
        category: 'strength',
        title: 'Good downside control',
        description: `Your average loss ($${avgLoser.toFixed(0)}) is well-contained relative to your average win ($${avgWinner.toFixed(0)}).`,
        severity,
        evidence: {
          tradeCount: loserPLs.length,
          value: Math.round((avgLoser / avgWinner) * 100),
        },
      };
    }
  }

  return null;
}

/**
 * 9. High-conviction ticker performance (strength)
 *
 * Finds the best-performing ticker and reports it as a strength if performance is strong.
 */
function detectTickerStrength(trades: BehaviorTrade[]): BehaviorPattern | null {
  if (trades.length < 3) return null;

  const tickerData: Record<string, { wins: number; total: number; pl: number }> = {};

  for (const t of trades) {
    const ticker = (t.ticker || '').toUpperCase();
    if (!ticker) continue;

    if (!tickerData[ticker]) {
      tickerData[ticker] = { wins: 0, total: 0, pl: 0 };
    }
    tickerData[ticker].total++;

    const pl = getNumericPL(t);
    if (pl !== null) {
      tickerData[ticker].pl += pl;
      if (pl > 0) tickerData[ticker].wins++;
    }
  }

  // Find tickers with 5+ trades and best win rate
  const candidates = Object.entries(tickerData)
    .filter(([_, data]) => data.total >= 5)
    .map(([ticker, data]) => ({
      ticker,
      winRate: data.total > 0 ? Math.round((data.wins / data.total) * 100) : 0,
      trades: data.total,
      pl: Math.round(data.pl * 100) / 100,
    }))
    .sort((a, b) => b.winRate - a.winRate);

  if (candidates.length === 0) return null;

  const best = candidates[0];
  if (best.winRate < 65) return null;

  let severity: 'low' | 'medium' | 'high' = 'medium';
  if (best.winRate >= 75 || best.trades >= 10) severity = 'high';
  else if (best.winRate >= 65) severity = 'medium';

  return {
    id: 'ticker-strength',
    category: 'strength',
    title: `Strong performance on ${best.ticker}`,
    description: `Your ${best.ticker} trades have a ${best.winRate}% win rate across ${best.trades} trades with a total P&L of $${best.pl.toFixed(2)}.`,
    severity,
    evidence: {
      tradeCount: best.trades,
      percentage: best.winRate,
      value: best.pl,
    },
  };
}

/**
 * 10. Consistency tendency
 *
 * Detects if the trader has a balanced, consistent approach.
 */
function detectConsistencyPattern(trades: BehaviorTrade[]): BehaviorPattern | null {
  if (trades.length < 8) return null;

  const pls: number[] = [];
  for (const t of trades) {
    const pl = getNumericPL(t);
    if (pl !== null) pls.push(pl);
  }

  if (pls.length < 10) return null;

  const winCount = pls.filter(p => p > 0).length;
  const lossCount = pls.filter(p => p < 0).length;
  const winRate = Math.round((winCount / pls.length) * 100);

  // Check if win rate is consistently between 40-65% (typical for good traders)
  if (winRate >= 40 && winRate <= 65) {
    // Check if there's low variance in trade outcomes
    const avgPL = pls.reduce((sum, p) => sum + p, 0) / pls.length;
    const variance = pls.reduce((sum, p) => sum + Math.pow(p - avgPL, 2), 0) / pls.length;
    const stdDev = Math.sqrt(variance);
    const cv = Math.abs(stdDev / (avgPL || 1)); // Coefficient of variation

    if (cv < 5) {
      return {
        id: 'consistent-trader',
        category: 'tendency',
        title: 'Consistent trading approach',
        description: `Your ${winRate}% win rate and relatively low outcome variance suggest a methodical, repeatable approach.`,
        severity: 'low',
        evidence: {
          tradeCount: pls.length,
          percentage: winRate,
        },
      };
    }
  }

  return null;
}

/**
 * 11. Frequent trading tendency
 *
 * Detects how active the trader is.
 */
function detectActivityPattern(trades: BehaviorTrade[]): BehaviorPattern | null {
  if (trades.length < 2) return null;

  // Use entry timestamps to detect preferred time
  const hourCounts: Record<number, number> = {};
  for (const t of trades) {
    const ts = t.entry_time || t.timestamp;
    const hour = extractHourFromTimestamp(ts);
    if (hour >= 0) {
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }
  }

  const entries = Object.entries(hourCounts);
  if (entries.length === 0) return null;

  entries.sort((a, b) => b[1] - a[1]);
  const mostActiveHour = parseInt(entries[0][0], 10);

  const fmt = (h: number) => {
    if (h === 0) return "12:00 AM";
    if (h < 12) return `${h}:00 AM`;
    if (h === 12) return "12:00 PM";
    return `${h - 12}:00 PM`;
  };

  return {
    id: 'activity-pattern',
    category: 'tendency',
    title: 'Most active trading window',
    description: `Your most active trading window is around ${fmt(mostActiveHour)} (${entries[0][1]} trades).`,
    severity: 'low',
    evidence: {
      tradeCount: entries[0][1],
      percentage: Math.round((entries[0][1] / entries.length) * 100),
    },
  };
}

// ─── Main Orchestrator ───────────────────────────────────────────────────────

/**
 * Build a full BehaviorReport by running all pattern detection functions.
 *
 * Pure function — no side effects, no API calls, no AI.
 * All detection is deterministic and rule-based.
 */
export function buildBehaviorReport(trades: BehaviorTrade[]): BehaviorReport {
  const patterns: BehaviorPattern[] = [];

  // Run all detection functions
  const detections = [
    detectOversizingLosingTrades,
    detectHoldingLosersTooLong,
    detectCuttingWinnersEarly,
    detectPoorHourPerformance,
    detectRevengeTrading,
    detectDirectionIssues,
    detectMorningEdge,
    detectRiskControl,
    detectTickerStrength,
    detectConsistencyPattern,
    detectActivityPattern,
  ];

  for (const detect of detections) {
    try {
      const result = detect(trades);
      if (result) patterns.push(result);
    } catch (error) {
      console.warn(`Behavior pattern detection error:`, error);
    }
  }

  // Separate into categories
  const strengths = patterns.filter(p => p.category === 'strength');
  const weaknesses = patterns.filter(p => p.category === 'mistake');
  const tendencies = patterns.filter(p => p.category === 'tendency');

  // Sort by severity within each group
  const severityRank = { high: 0, medium: 1, low: 2 };
  const sortBySeverity = (a: BehaviorPattern, b: BehaviorPattern) =>
    severityRank[a.severity] - severityRank[b.severity];

  strengths.sort(sortBySeverity);
  weaknesses.sort(sortBySeverity);
  tendencies.sort(sortBySeverity);

  return {
    patterns,
    strengths,
    weaknesses,
    recurringMistakes: weaknesses.filter(w => w.severity !== 'low'),
    bestHabits: strengths.filter(s => s.severity !== 'low'),
  };
}

/**
 * Build a structured output ready for future AI coaching consumption.
 *
 * No natural language generation — just structured evidence.
 */
export function buildCoachReadyOutput(report: BehaviorReport): CoachReadyOutput {
  const topIssues: CoachReadyIssue[] = report.recurringMistakes.slice(0, 5).map(m => ({
    title: m.title,
    evidence: m.description,
  }));

  const strongestEdges: CoachReadyEdge[] = report.bestHabits.slice(0, 5).map(s => ({
    title: s.title,
    evidence: s.description,
  }));

  return { topIssues, strongestEdges };
}
