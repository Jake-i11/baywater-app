/**
 * Trade Utilities
 *
 * Reusable helper functions for trade analysis and pattern recognition
 * Foundation for Section 2 pattern recognition engine
 */

import { supabase } from "@/lib/supabase";

/**
 * Ensure all required fields exist for pattern recognition
 * @param trade Trade object
 * @returns Trade object with all required fields populated
 */
export function ensureTradeDataConsistency(trade: any): any {
  return {
    id: trade.id || '',
    ticker: trade.ticker || '',
    direction: trade.direction || 'unknown',
    entry_price: trade.entry || trade.entry_price || 0,
    exit_price: trade.exit || trade.exit_price || null,
    entry_time: trade.entry_time || trade.time || new Date().toISOString(),
    exit_time: trade.exit_time || null,
    size: trade.size || 0,
    realized_pl: trade.realized_pl ? parseFloat(trade.realized_pl) : null,
    discipline_score: trade.discipline_score !== null && trade.discipline_score !== undefined ? trade.discipline_score : 100,
    violation_count: Array.isArray(trade.violations) ? trade.violations.length : (trade.violations ? JSON.parse(trade.violations || "[]").length : 0),
    setup_type: trade.setup_type || null,
    setup_confidence: trade.setup_confidence !== null && trade.setup_confidence !== undefined ? trade.setup_confidence : null,
    market_cap: trade.market_cap || null,
    float_shares: trade.float_shares || null,
    relative_volume: trade.relative_volume || null,
    sector: trade.sector || null
  };
}

/**
 * Calculate comprehensive trade metrics for pattern analysis
 * @param trades Array of trade objects
 * @returns Structured metrics for pattern recognition
 */
export function calculateTradeMetricsForPatternAnalysis(trades: any[]): {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPL: number;
  avgWin: number;
  avgLoss: number;
  avgDisciplineScore: number;
  totalViolationCount: number;
  avgSetupQuality: number;
  bestPerformingSector: string | null;
  worstPerformingSector: string | null;
  mostCommonViolation: string | null;
  dangerousWinCount: number;
  categoryACount: number;
  categoryBCount: number;
  categoryCCount: number;
  categoryDCount: number;
} {
  if (!trades || trades.length === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPL: 0,
      avgWin: 0,
      avgLoss: 0,
      avgDisciplineScore: 100,
      totalViolationCount: 0,
      avgSetupQuality: 0,
      bestPerformingSector: null,
      worstPerformingSector: null,
      mostCommonViolation: null,
      dangerousWinCount: 0,
      categoryACount: 0,
      categoryBCount: 0,
      categoryCCount: 0,
      categoryDCount: 0
    };
  }

  // Filter completed trades
  const completedTrades = trades.filter(t =>
    t.realized_pl !== null && t.realized_pl !== undefined
  );

  const plValues = completedTrades.map(t => parseFloat(t.realized_pl || '0'));
  const winningTrades = plValues.filter(pl => pl > 0);
  const losingTrades = plValues.filter(pl => pl < 0);

  // Calculate discipline scores
  const disciplineScores = trades
    .map(t => t.discipline_score !== null && t.discipline_score !== undefined ? t.discipline_score : 100)
    .filter(score => !isNaN(score));

  // Calculate setup qualities
  const setupQualities = trades
    .map(t => t.setup_quality !== null && t.setup_quality !== undefined ? t.setup_quality : null)
    .filter(quality => quality !== null);

  // Calculate violation counts and dangerous wins
  let totalViolationCount = 0;
  let dangerousWinCount = 0;
  const violationCounts: Record<string, number> = {};

  trades.forEach(trade => {
    try {
      const violations = Array.isArray(trade.violations)
        ? trade.violations
        : JSON.parse(trade.violations || "[]");

      totalViolationCount += violations.length;

      // Track violation types
      violations.forEach((v: string) => {
        violationCounts[v] = (violationCounts[v] || 0) + 1;
      });

      // Check for dangerous wins
      const realizedPl = trade.realized_pl ? parseFloat(trade.realized_pl) : 0;
      if (realizedPl > 0 && violations.length > 0) {
        dangerousWinCount++;
      }
    } catch {
      // Skip trades with parsing errors
    }
  });

  // Calculate sector performance
  const sectorPerformance: Record<string, { totalPL: number; count: number }> = {};

  trades.forEach(trade => {
    if (trade.sector && trade.realized_pl) {
      const pl = parseFloat(trade.realized_pl);
      if (!sectorPerformance[trade.sector]) {
        sectorPerformance[trade.sector] = { totalPL: 0, count: 0 };
      }
      sectorPerformance[trade.sector].totalPL += pl;
      sectorPerformance[trade.sector].count++;
    }
  });

  const bestPerformingSector = Object.entries(sectorPerformance).length > 0
    ? Object.entries(sectorPerformance).reduce((best, current) =>
        current[1].totalPL > (best?.[1]?.totalPL || -Infinity) ? current : best
      )[0]
    : null;

  const worstPerformingSector = Object.entries(sectorPerformance).length > 0
    ? Object.entries(sectorPerformance).reduce((worst, current) =>
        current[1].totalPL < (worst?.[1]?.totalPL || Infinity) ? current : worst
      )[0]
    : null;

  // Find most common violation
  const mostCommonViolation = Object.entries(violationCounts).length > 0
    ? Object.entries(violationCounts).reduce((mostCommon, current) =>
        current[1] > (mostCommon?.[1] || 0) ? current : mostCommon
      )[0]
    : null;

  // Calculate trade quality breakdown
  let categoryACount = 0;
  let categoryBCount = 0;
  let categoryCCount = 0;
  let categoryDCount = 0;

  trades.forEach(trade => {
    try {
      const realizedPl = trade.realized_pl ? parseFloat(trade.realized_pl) : null;
      const violations = Array.isArray(trade.violations)
        ? trade.violations
        : JSON.parse(trade.violations || "[]");

      if (realizedPl === null) return;

      const isProfitable = realizedPl > 0;
      const isDisciplined = violations.length === 0;

      if (isProfitable && isDisciplined) categoryACount++;
      else if (isProfitable && !isDisciplined) categoryBCount++;
      else if (!isProfitable && isDisciplined) categoryCCount++;
      else if (!isProfitable && !isDisciplined) categoryDCount++;
    } catch {
      // Skip trades with parsing errors
    }
  });

  return {
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: completedTrades.length > 0
      ? Math.round((winningTrades.length / completedTrades.length) * 100)
      : 0,
    totalPL: plValues.reduce((sum, pl) => sum + pl, 0),
    avgWin: winningTrades.length > 0
      ? winningTrades.reduce((sum, pl) => sum + pl, 0) / winningTrades.length
      : 0,
    avgLoss: losingTrades.length > 0
      ? losingTrades.reduce((sum, pl) => sum + pl, 0) / losingTrades.length
      : 0,
    avgDisciplineScore: disciplineScores.length > 0
      ? disciplineScores.reduce((sum, score) => sum + score, 0) / disciplineScores.length
      : 100,
    totalViolationCount,
    avgSetupQuality: setupQualities.length > 0
      ? setupQualities.reduce((sum, quality) => sum + (quality || 0), 0) / setupQualities.length
      : 0,
    bestPerformingSector,
    worstPerformingSector,
    mostCommonViolation,
    dangerousWinCount,
    categoryACount,
    categoryBCount,
    categoryCCount,
    categoryDCount
  };
}

/**
 * Get weekly summary data for AI coaching foundation
 * @param trades Array of trade objects
 * @param startDate Start date for the week
 * @param endDate End date for the week
 * @returns Structured weekly summary data
 */
export async function getWeeklySummaryData(userId: string, startDate: string, endDate: string): Promise<{
  totalTrades: number;
  winRate: number;
  totalPL: number;
  averageDisciplineScore: number;
  totalViolationCost: number;
  bestSetup: any | null;
  worstSetup: any | null;
  mostCommonViolation: string | null;
  dangerousWinCount: number;
  tradeQualityBreakdown: {
    categoryA: number;
    categoryB: number;
    categoryC: number;
    categoryD: number;
  };
}> {
  try {
    // Fetch trades for the specified date range
    const { data: trades, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: false });

    if (error || !trades) {
      console.error('Failed to fetch trades for weekly summary:', error);
      return {
        totalTrades: 0,
        winRate: 0,
        totalPL: 0,
        averageDisciplineScore: 100,
        totalViolationCost: 0,
        bestSetup: null,
        worstSetup: null,
        mostCommonViolation: null,
        dangerousWinCount: 0,
        tradeQualityBreakdown: {
          categoryA: 0,
          categoryB: 0,
          categoryC: 0,
          categoryD: 0
        }
      };
    }

    // Calculate metrics
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

    // Calculate violation statistics
    const violationCounts: Record<string, number> = {};
    let dangerousWinCount = 0;

    trades.forEach(trade => {
      try {
        const violations = Array.isArray(trade.violations)
          ? trade.violations
          : JSON.parse(trade.violations || "[]");

        violations.forEach((v: string) => {
          violationCounts[v] = (violationCounts[v] || 0) + 1;
        });

        // Check for dangerous wins
        const realizedPl = trade.realized_pl ? parseFloat(trade.realized_pl) : 0;
        if (realizedPl > 0 && violations.length > 0) {
          dangerousWinCount++;
        }
      } catch {
        // Skip trades with parsing errors
      }
    });

    const mostCommonViolation = Object.entries(violationCounts).length > 0
      ? Object.entries(violationCounts).reduce((mostCommon, current) =>
          current[1] > (mostCommon?.[1] || 0) ? current : mostCommon
        )[0]
      : null;

    // Calculate trade quality breakdown
    let categoryA = 0;
    let categoryB = 0;
    let categoryC = 0;
    let categoryD = 0;

    trades.forEach(trade => {
      try {
        const realizedPl = trade.realized_pl ? parseFloat(trade.realized_pl) : null;
        const violations = Array.isArray(trade.violations)
          ? trade.violations
          : JSON.parse(trade.violations || "[]");

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
      worstSetup,
      mostCommonViolation,
      dangerousWinCount,
      tradeQualityBreakdown: {
        categoryA,
        categoryB,
        categoryC,
        categoryD
      }
    };

  } catch (error) {
    console.error('Error generating weekly summary:', error);
    return {
      totalTrades: 0,
      winRate: 0,
      totalPL: 0,
      averageDisciplineScore: 100,
      totalViolationCost: 0,
      bestSetup: null,
      worstSetup: null,
      mostCommonViolation: null,
      dangerousWinCount: 0,
      tradeQualityBreakdown: {
        categoryA: 0,
        categoryB: 0,
        categoryC: 0,
        categoryD: 0
      }
    };
  }
}

/**
 * Verify that all trades have required fields for pattern recognition
 * @param userId User ID
 * @returns Promise with verification results
 */
export async function verifyTradeDataConsistency(userId: string): Promise<{
  totalTrades: number;
  missingFields: Record<string, number>;
  completeTrades: number;
}> {
  try {
    const { data: trades, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId);

    if (error || !trades) {
      return {
        totalTrades: 0,
        missingFields: {},
        completeTrades: 0
      };
    }

    const requiredFields = [
      'ticker', 'direction', 'entry', 'exit', 'size',
      'realized_pl', 'discipline_score', 'violations',
      'setup_quality', 'market_cap', 'float_shares',
      'relative_volume', 'sector'
    ];

    const missingFields: Record<string, number> = {};
    let completeTrades = 0;

    trades.forEach(trade => {
      let tradeComplete = true;

      requiredFields.forEach(field => {
        const value = trade[field];

        if (value === null || value === undefined) {
          missingFields[field] = (missingFields[field] || 0) + 1;
          tradeComplete = false;
        } else if (field === 'violations' && typeof value === 'string') {
          // Check if violations string can be parsed
          try {
            JSON.parse(value);
          } catch {
            missingFields[field] = (missingFields[field] || 0) + 1;
            tradeComplete = false;
          }
        }
      });

      if (tradeComplete) {
        completeTrades++;
      }
    });

    return {
      totalTrades: trades.length,
      missingFields,
      completeTrades
    };

  } catch (error) {
    console.error('Error verifying trade data consistency:', error);
    return {
      totalTrades: 0,
      missingFields: {},
      completeTrades: 0
    };
  }
}