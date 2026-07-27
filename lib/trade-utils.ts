/**
 * Client-safe Trade Utility Functions
 *
 * Utility functions that can be safely imported by both client and server components
 * These functions contain no server-only dependencies or API key usage
 */


/**
 * Calculate trade outcome category
 * @param realizedPl Realized profit/loss
 * @param violations Array of violation strings
 * @returns Trade category: A, B, C, or D
 */
export function calculateTradeOutcomeCategory(realizedPl: number | null, violations: string[]): string {
  if (realizedPl === null) return 'Unknown';

  const isProfitable = realizedPl > 0;
  const isDisciplined = violations.length === 0;

  if (isProfitable && isDisciplined) return 'A';
  if (isProfitable && !isDisciplined) return 'B';
  if (!isProfitable && isDisciplined) return 'C';
  if (!isProfitable && !isDisciplined) return 'D';

  return 'Unknown';
}

/**
 * Get discipline statistics from trades
 * @param trades Array of trade objects
 * @returns Discipline statistics
 */
export function getDisciplineStatistics(trades: any[]): {
  currentDisciplineScore: number;
  averageDisciplineScore: number;
  disciplineTrend: 'improving' | 'declining' | 'stable' | 'unknown';
  totalViolations: number;
} {
  if (trades.length === 0) {
    return {
      currentDisciplineScore: 100,
      averageDisciplineScore: 100,
      disciplineTrend: 'unknown',
      totalViolations: 0
    };
  }

  // Get all valid discipline scores
  const disciplineScores = trades
    .map(t => t.discipline_score !== null && t.discipline_score !== undefined ? t.discipline_score : 100)
    .filter(score => !isNaN(score));

  // Count total violations
  const totalViolations = trades.reduce((count, trade) => {
    try {
      const violations = JSON.parse(trade.violations || "[]");
      return count + violations.length;
    } catch {
      return count;
    }
  }, 0);

  // Calculate trend (simple comparison of first vs last 25% of trades)
  const currentDisciplineScore = disciplineScores.length > 0
    ? disciplineScores[disciplineScores.length - 1]
    : 100;

  const averageDisciplineScore = disciplineScores.length > 0
    ? Math.round(disciplineScores.reduce((sum, score) => sum + score, 0) / disciplineScores.length)
    : 100;

  // Simple trend analysis
  let disciplineTrend: 'improving' | 'declining' | 'stable' | 'unknown' = 'unknown';

  if (disciplineScores.length >= 4) {
    const recentScores = disciplineScores.slice(-Math.floor(disciplineScores.length / 4));
    const olderScores = disciplineScores.slice(0, Math.floor(disciplineScores.length / 4));

    const recentAvg = recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length;
    const olderAvg = olderScores.reduce((sum, score) => sum + score, 0) / olderScores.length;

    if (recentAvg > olderAvg + 5) {
      disciplineTrend = 'improving';
    } else if (recentAvg < olderAvg - 5) {
      disciplineTrend = 'declining';
    } else {
      disciplineTrend = 'stable';
    }
  }

  return {
    currentDisciplineScore,
    averageDisciplineScore,
    disciplineTrend,
    totalViolations
  };
}

/**
 * Get violation statistics from trades
 * @param trades Array of trade objects
 * @returns Violation statistics
 */
export function getViolationStatistics(trades: any[]): {
  totalViolationTrades: number;
  totalViolationCost: number;
  mostExpensiveViolation: number;
  dangerousWinsCount: number;
} {
  const violationTrades = trades.filter(trade => {
    try {
      const violations = JSON.parse(trade.violations || "[]");
      return violations.length > 0;
    } catch {
      return false;
    }
  });

  const violationCosts = violationTrades.map(trade =>
    trade.violation_cost ? parseFloat(trade.violation_cost) : 0
  );

  const dangerousWins = violationTrades.filter(trade => {
    try {
      const violations = JSON.parse(trade.violations || "[]");
      const hasDangerousWin = violations.includes('DANGEROUS_WIN');
      const realizedPl = trade.realized_pl ? parseFloat(trade.realized_pl) : 0;
      return hasDangerousWin && realizedPl > 0;
    } catch {
      return false;
    }
  });

  return {
    totalViolationTrades: violationTrades.length,
    totalViolationCost: violationCosts.reduce((sum, cost) => sum + cost, 0),
    mostExpensiveViolation: violationCosts.length > 0
      ? Math.min(...violationCosts.filter(cost => cost < 0))
      : 0,
    dangerousWinsCount: dangerousWins.length
  };
}

/**
 * Get trade quality breakdown
 * @param trades Array of trade objects
 * @returns Trade quality breakdown counts
 */
export function getTradeQualityBreakdown(trades: any[]): {
  categoryA: number;
  categoryB: number;
  categoryC: number;
  categoryD: number;
} {
  let categoryA = 0;
  let categoryB = 0;
  let categoryC = 0;
  let categoryD = 0;

  trades.forEach(trade => {
    try {
      const realizedPl = trade.realized_pl ? parseFloat(trade.realized_pl) : null;
      const violations = JSON.parse(trade.violations || "[]");

      if (realizedPl === null) return;

      const isProfitable = realizedPl > 0;
      const isDisciplined = violations.length === 0;

      if (isProfitable && isDisciplined) categoryA++;
      else if (isProfitable && !isDisciplined) categoryB++;
      else if (!isProfitable && isDisciplined) categoryC++;
      else if (!isProfitable && !isDisciplined) categoryD++;
    } catch {
      // Skip trades with parsing errors
    }
  });

  return { categoryA, categoryB, categoryC, categoryD };
}

/**
 * Calculate trade metrics for weekly summary
 * @param trades Array of trade objects
 * @returns Structured metrics for weekly summary
 */
export function calculateTradeMetrics(trades: any[]): {
  totalTrades: number;
  winRate: number;
  totalPL: number;
  averageDisciplineScore: number;
  totalViolationCost: number;
  bestSetup: any | null;
  worstSetup: any | null;
} {
  if (!trades || trades.length === 0) {
    return {
      totalTrades: 0,
      winRate: 0,
      totalPL: 0,
      averageDisciplineScore: 100,
      totalViolationCost: 0,
      bestSetup: null,
      worstSetup: null
    };
  }

  const completedTrades = trades.filter(t =>
    t.realized_pl !== null && t.realized_pl !== undefined
  );

  const plValues = completedTrades.map(t => parseFloat(t.realized_pl || '0'));
  const winningTrades = plValues.filter(pl => pl > 0);
  const disciplineScores = trades
    .map(t => t.discipline_score !== null && t.discipline_score !== undefined ? t.discipline_score : 100)
    .filter(score => !isNaN(score));

  const violationCosts = trades
    .map(t => t.violation_cost ? parseFloat(t.violation_cost) : 0)
    .filter(cost => !isNaN(cost));

  // Find best and worst setups
  const setupTrades = trades.filter(t => t.setup_quality !== null && t.setup_quality !== undefined);
  const bestSetup = setupTrades.length > 0
    ? setupTrades.reduce((best, current) =>
        (current.setup_quality > (best?.setup_quality || 0)) ? current : best
      )
    : null;

  const worstSetup = setupTrades.length > 0
    ? setupTrades.reduce((worst, current) =>
        (current.setup_quality < (worst?.setup_quality || 100)) ? current : worst
      )
    : null;

  return {
    totalTrades: trades.length,
    winRate: completedTrades.length > 0
      ? Math.round((winningTrades.length / completedTrades.length) * 100)
      : 0,
    totalPL: plValues.reduce((sum, pl) => sum + pl, 0),
    averageDisciplineScore: disciplineScores.length > 0
      ? Math.round(disciplineScores.reduce((sum, score) => sum + score, 0) / disciplineScores.length)
      : 100,
    totalViolationCost: violationCosts.reduce((sum, cost) => sum + cost, 0),
    bestSetup,
    worstSetup
  };
}

/**
 * Calculate discipline streak statistics
 * @param trades Array of trade objects (sorted by date, newest first)
 * @returns Discipline streak statistics
 */
export function calculateDisciplineStreaks(trades: any[]): {
  currentStreak: number;
  bestStreak: number;
  streakActive: boolean;
  currentViolationStreak: number;
  longestViolationStreak: number;
  mostCommonViolation: string | null;
} {
  if (trades.length === 0) {
    return {
      currentStreak: 0,
      bestStreak: 0,
      streakActive: false,
      currentViolationStreak: 0,
      longestViolationStreak: 0,
      mostCommonViolation: null
    };
  }

  let currentStreak = 0;
  let bestStreak = 0;
  let streakActive = false;
  let currentViolationStreak = 0;
  let longestViolationStreak = 0;
  const violationCounts: Record<string, number> = {};

  // Process trades in chronological order (oldest to newest)
  const sortedTrades = [...trades].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  for (const trade of sortedTrades) {
    const isDisciplined = isDisciplinedTrade(trade);

    // Track violations
    try {
      const violations = JSON.parse(trade.violations || "[]");
      violations.forEach((v: string) => {
        violationCounts[v] = (violationCounts[v] || 0) + 1;
      });

      if (violations.length > 0) {
        currentViolationStreak++;
        longestViolationStreak = Math.max(longestViolationStreak, currentViolationStreak);
      } else {
        currentViolationStreak = 0;
      }
    } catch {
      // Skip if violations can't be parsed
    }

    // Track discipline streaks
    if (isDisciplined) {
      currentStreak++;
      bestStreak = Math.max(bestStreak, currentStreak);
      streakActive = true;
    } else {
      currentStreak = 0;
      streakActive = false;
    }
  }

  // Find most common violation
  const mostCommonViolation = Object.entries(violationCounts).length > 0
    ? Object.entries(violationCounts).reduce((mostCommon, current) =>
        current[1] > (mostCommon?.[1] || 0) ? current : mostCommon
      )[0]
    : null;

  return {
    currentStreak,
    bestStreak,
    streakActive,
    currentViolationStreak,
    longestViolationStreak,
    mostCommonViolation
  };
}

/**
 * Calculate discipline trend by comparing recent vs older trades
 * @param trades Array of trade objects
 * @returns Discipline trend analysis
 */
export function calculateDisciplineTrend(trades: any[]): {
  recentAverage: number;
  olderAverage: number;
  trendPercentage: number;
  trendDirection: 'improving' | 'declining' | 'stable' | 'unknown';
  trendDescription: string;
} {
  if (trades.length < 10) {
    return {
      recentAverage: 100,
      olderAverage: 100,
      trendPercentage: 0,
      trendDirection: 'unknown',
      trendDescription: 'Not enough data to calculate trend'
    };
  }

  // Get discipline scores
  const disciplineScores = trades
    .map(t => t.discipline_score !== null && t.discipline_score !== undefined ? t.discipline_score : 100)
    .filter(score => !isNaN(score));

  if (disciplineScores.length < 10) {
    return {
      recentAverage: 100,
      olderAverage: 100,
      trendPercentage: 0,
      trendDirection: 'unknown',
      trendDescription: 'Not enough data to calculate trend'
    };
  }

  // Split into recent (last 10) and older (previous 10)
  const recentScores = disciplineScores.slice(-10);
  const olderScores = disciplineScores.slice(-20, -10);

  const recentAverage = recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length;
  const olderAverage = olderScores.reduce((sum, score) => sum + score, 0) / olderScores.length;

  const trendPercentage = ((recentAverage - olderAverage) / olderAverage) * 100;
  const absTrend = Math.abs(trendPercentage);

  let trendDirection: 'improving' | 'declining' | 'stable' | 'unknown' = 'stable';
  let trendDescription = 'Your discipline is stable';

  if (absTrend >= 5) {
    if (trendPercentage > 0) {
      trendDirection = 'improving';
      trendDescription = `Your discipline is improving +${Math.round(absTrend)}% over your last 10 trades`;
    } else {
      trendDirection = 'declining';
      trendDescription = `Your discipline is declining ${Math.round(absTrend)}% over your last 10 trades`;
    }
  }

  return {
    recentAverage: Math.round(recentAverage),
    olderAverage: Math.round(olderAverage),
    trendPercentage: Math.round(trendPercentage),
    trendDirection,
    trendDescription
  };
}

/**
 * Get current process status
 * @param trades Array of trade objects
 * @returns Current process status
 */
export function getCurrentProcessStatus(trades: any[]): {
  status: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
  description: string;
  lastTradeDisciplined: boolean;
} {
  if (trades.length === 0) {
    return {
      status: 'unknown',
      description: 'No trades to analyze',
      lastTradeDisciplined: false
    };
  }

  // Get the most recent trade
  const recentTrades = [...trades].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const lastTrade = recentTrades[0];

  const lastTradeDisciplined = isDisciplinedTrade(lastTrade);

  // Calculate overall discipline rate
  const disciplinedTrades = trades.filter(isDisciplinedTrade);
  const disciplineRate = Math.round((disciplinedTrades.length / trades.length) * 100);

  let status: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown' = 'unknown';
  let description = '';

  if (disciplineRate >= 80) {
    status = 'excellent';
    description = 'Excellent process consistency';
  } else if (disciplineRate >= 60) {
    status = 'good';
    description = 'Good process consistency';
  } else if (disciplineRate >= 40) {
    status = 'fair';
    description = 'Fair process consistency - room for improvement';
  } else {
    status = 'poor';
    description = 'Poor process consistency - needs significant improvement';
  }

  if (!lastTradeDisciplined) {
    description += ' | Last trade broke discipline';
  }

  return {
    status,
    description,
    lastTradeDisciplined
  };
}

/**
 * Calculate violation cost based on trade outcome and violations
 * @param violations Array of violation strings
 * @param realizedPl Realized profit/loss
 * @returns Violation cost (negative P/L if loss with violations, 0 otherwise)
 */
export function calculateViolationCost(violations: string[], realizedPl: number | null): number {
  if (violations.length === 0) {
    return 0;
  }

  if (realizedPl === null) {
    return 0;
  }

  // If there are violations and the trade lost money, the violation cost is the loss
  if (realizedPl < 0) {
    return realizedPl;
  }

  // If there are violations but the trade made money (dangerous win), violation cost is 0
  // (The dangerous win will be marked separately)
  return 0;
}

/**
 * Calculate discipline score based on violations
 * @param violations Array of violation strings
 * @returns Discipline score (0-100, where 100 = no violations)
 */
export function calculateDisciplineScore(violations: string[]): number {
  const baseScore = 100;
  const pointsPerViolation = 20;

  const score = Math.max(0, baseScore - (violations.length * pointsPerViolation));
  return score;
}

/**
 * Check for dangerous wins (profitable trades with violations)
 * @param violations Array of violation strings
 * @param realizedPl Realized profit/loss
 * @returns Updated violations array with DANGEROUS_WIN flag if applicable
 */
export function checkDangerousWin(violations: string[], realizedPl: number | null): string[] {
  const updatedViolations = [...violations];

  if (realizedPl !== null && realizedPl > 0 && violations.length > 0) {
    updatedViolations.push('DANGEROUS_WIN');
  }

  return updatedViolations;
}

/**
 * Check if a trade is disciplined
 * @param trade Trade object
 * @returns True if disciplined (discipline_score >= 80 and no violations)
 */
function isDisciplinedTrade(trade: any): boolean {
  try {
    const violations = JSON.parse(trade.violations || "[]");
    const disciplineScore = trade.discipline_score !== null && trade.discipline_score !== undefined
      ? trade.discipline_score
      : 100;

    return disciplineScore >= 80 && violations.length === 0;
  } catch {
    return false;
  }
}

/**
 * Helper functions for process review display
 */
export function getDisciplineDescription(score: number): string {
  if (score >= 80) return "Excellent discipline";
  if (score >= 60) return "Good discipline";
  if (score >= 40) return "Fair discipline";
  if (score >= 20) return "Poor discipline";
  return "Very poor discipline";
}

export function getSetupQualityDescription(score: number): string {
  if (score >= 80) return "High quality setup";
  if (score >= 60) return "Good setup";
  if (score >= 40) return "Average setup";
  if (score >= 20) return "Weak setup";
  return "Poor setup";
}

export function getTradeGradeColor(grade: string): string {
  switch(grade.toUpperCase()) {
    case 'A': return 'text-emerald-400';
    case 'B': return 'text-green-400';
    case 'C': return 'text-yellow-400';
    case 'D': return 'text-amber-400';
    case 'F': return 'text-red-400';
    default: return 'text-white';
  }
}

export function getCategoryLabel(category: string): string {
  switch(category) {
    case 'A': return 'A) Profitable + Disciplined';
    case 'B': return 'B) Profitable + Undisciplined';
    case 'C': return 'C) Losing + Disciplined';
    case 'D': return 'D) Losing + Undisciplined';
    default: return 'Unknown Category';
  }
}

export function getCategoryDescription(category: string): string {
  switch(category) {
    case 'A': return 'Perfect trade: profitable with good process';
    case 'B': return 'Dangerous win: profitable but violated rules';
    case 'C': return 'Good trade, bad outcome: disciplined but lost money';
    case 'D': return 'Bad trade: lost money and violated rules';
    default: return 'Trade category could not be determined';
  }
}

/**
 * Calculate chart-derived trade metrics for a single trade
 *
 * Computes MFE (Maximum Favorable Excursion), MAE (Maximum Adverse Excursion),
 * best possible exit, and entry context from candle data.
 *
 * @param trade The trade object with entry_price, exit_price, direction, size
 * @param candles Array of candle data (each with time, open, high, low, close)
 * @returns TradeMetrics object or null if insufficient data
 */
export interface CandleStick {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface TradeMetricsResult {
  mfe: number | null;
  mfeDisplay: string;
  mae: number | null;
  maeDisplay: string;
  bestExitPrice: number | null;
  bestExitDisplay: string;
  missedAmount: number | null;
  missedDisplay: string;
  entryContext: string;
}

export function calculateTradeMetricsForTrade(
  trade: {
    entry_price: string | null | undefined;
    exit_price: string | null | undefined;
    direction: string | null | undefined;
    size: string | null | undefined;
    entry_time: string | null | undefined;
    exit_time: string | null | undefined;
  },
  candles: CandleStick[]
): TradeMetricsResult {
  const defaultResult: TradeMetricsResult = {
    mfe: null,
    mfeDisplay: '\u2014',
    mae: null,
    maeDisplay: '\u2014',
    bestExitPrice: null,
    bestExitDisplay: '\u2014',
    missedAmount: null,
    missedDisplay: '\u2014',
    entryContext: 'Insufficient candle data',
  };

  if (!candles || candles.length === 0) return defaultResult;

  const entryPrice = trade.entry_price ? parseFloat(trade.entry_price) : null;
  const exitPrice = trade.exit_price ? parseFloat(trade.exit_price) : null;
  const size = trade.size ? parseFloat(trade.size) : null;
  const isShort = trade.direction?.toLowerCase() === 'short' || trade.direction?.toLowerCase() === 'sell';

  if (entryPrice === null) return defaultResult;
  // Find the relevant candle window: from entry time to exit time (or end of data)
  let startIdx = 0;
  let endIdx = candles.length;

  if (trade.entry_time) {
    const entryMs = new Date(trade.entry_time).getTime();
    if (!isNaN(entryMs)) {
      // Find first candle after entry
      const entryIdx = candles.findIndex(c => new Date(c.time).getTime() >= entryMs);
      if (entryIdx !== -1) startIdx = entryIdx;
    }
  }

  if (trade.exit_time && exitPrice !== null) {
    const exitMs = new Date(trade.exit_time).getTime();
    if (!isNaN(exitMs)) {
      // Find last candle before exit
      const exitIdx = candles.findIndex(c => new Date(c.time).getTime() > exitMs);
      if (exitIdx !== -1) endIdx = exitIdx;
    }
  }

  const relevantCandles = candles.slice(startIdx, endIdx);
  if (relevantCandles.length === 0) {
    return { ...defaultResult, entryContext: 'No candles found in trade window' };
  }

  // --- MFE: Maximum Favorable Excursion ---
  let bestPrice: number;
  if (isShort) {
    // For SHORT: best is lowest price
    bestPrice = Math.min(...relevantCandles.map(c => c.low));
  } else {
    // For LONG: best is highest price
    bestPrice = Math.max(...relevantCandles.map(c => c.high));
  }

  let mfe: number | null;
  if (isShort) {
    mfe = (entryPrice - bestPrice) * (size || 1);
  } else {
    mfe = (bestPrice - entryPrice) * (size || 1);
  }

  // --- MAE: Maximum Adverse Excursion ---
  let worstPrice: number;
  if (isShort) {
    // For SHORT: worst is highest price
    worstPrice = Math.max(...relevantCandles.map(c => c.high));
  } else {
    // For LONG: worst is lowest price
    worstPrice = Math.min(...relevantCandles.map(c => c.low));
  }

  let mae: number | null;
  if (isShort) {
    mae = (worstPrice - entryPrice) * (size || 1);
    mae = -Math.abs(mae); // Always negative for MAE
  } else {
    mae = (entryPrice - worstPrice) * (size || 1);
    mae = -Math.abs(mae); // Always negative for MAE
  }

  // --- Best possible exit ---
  let bestExitPrice: number | null = null;
  let bestExitDisplay = '\u2014';
  let missedAmount: number | null = null;
  let missedDisplay = '\u2014';

  if (exitPrice !== null && relevantCandles.length > 0) {
    if (isShort) {
      // For SHORT: best exit is the lowest price available
      bestExitPrice = Math.min(...relevantCandles.map(c => c.low));
    } else {
      // For LONG: best exit is the highest price available
      bestExitPrice = Math.max(...relevantCandles.map(c => c.high));
    }

    if (bestExitPrice !== null) {
      bestExitDisplay = `$${bestExitPrice.toFixed(2)}`;
      // Missed amount: difference between actual exit and best possible exit
      if (isShort) {
        // Short: missed = (actual - best) * size  (actual higher = worse)
        missedAmount = (exitPrice - bestExitPrice) * (size || 1);
      } else {
        // Long: missed = (best - actual) * size  (if best is higher, missed opportunity)
        missedAmount = (bestExitPrice - exitPrice) * (size || 1);
      }
      missedDisplay = missedAmount >= 0 ? `+$${missedAmount.toFixed(2)}` : `-$${Math.abs(missedAmount).toFixed(2)}`;
    }
  }

  // --- Entry context ---
  const firstCandle = relevantCandles[0];
  let entryContext: string;
  if (firstCandle) {
    const priceChangePct = ((entryPrice - firstCandle.open) / firstCandle.open) * 100;
    if (isShort) {
      if (priceChangePct > 0) {
        entryContext = `Price was already up ${priceChangePct.toFixed(1)}% before short entry`;
      } else if (priceChangePct < 0) {
        entryContext = `Price was already down ${Math.abs(priceChangePct).toFixed(1)}% before short entry`;
      } else {
        entryContext = 'Price was flat entering the short';
      }
    } else {
      if (priceChangePct > 0) {
        entryContext = `Price was trending upward into long entry (+${priceChangePct.toFixed(1)}%)`;
      } else if (priceChangePct < 0) {
        entryContext = `Price was trending downward into long entry (${priceChangePct.toFixed(1)}%)`;
      } else {
        entryContext = 'Price was flat entering the long';
      }
    }
  } else {
    entryContext = 'Price data unavailable for entry context';
  }

  return {
    mfe: mfe !== null ? Math.abs(mfe) : null,
    mfeDisplay: mfe !== null ? `+$${Math.abs(mfe).toFixed(2)}` : '\u2014',
    mae: mae !== null ? mae : null,
    maeDisplay: mae !== null ? `-$${Math.abs(mae).toFixed(2)}` : '\u2014',
    bestExitPrice,
    bestExitDisplay,
    missedAmount,
    missedDisplay,
    entryContext,
  };
}

