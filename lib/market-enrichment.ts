/**
 * Market Enrichment Helper
 *
 * Server-side helper for fetching market data from Finnhub API
 * and enriching trade data with additional market context
 */

import { supabase } from "@/lib/supabase";
import { generateTradeReview } from "@/lib/ai-review";

interface CompanyProfile {
  floatShares?: number;
  marketCapitalization?: number;
  sector?: string;
}

interface QuoteData {
  c?: number; // current price
  dp?: number; // change percent
  d?: number; // change
  h?: number; // high price of the day
  l?: number; // low price of the day
  o?: number; // open price of the day
  pc?: number; // previous close price
  t?: number; // timestamp
  v?: number; // volume
  avgVolume?: number; // average volume
}

/**
 * Fetch market data from Finnhub API
 * @param ticker Stock symbol
 * @param date Trade date (used for historical context if needed)
 * @returns Enriched market data or null if unavailable
 */
export async function fetchMarketData(ticker: string, date: string): Promise<{
  float_shares?: number;
  market_cap?: number;
  sector?: string;
  day_volume?: number;
  avg_volume?: number;
  relative_volume?: number;
} | null> {
  try {
    const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
    if (!FINNHUB_API_KEY) {
      console.warn('Finnhub API key not configured');
      return null;
    }

    // Fetch company profile
    const profileResponse = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${FINNHUB_API_KEY}`
    );

    if (!profileResponse.ok) {
      console.warn(`Failed to fetch profile for ${ticker}: ${profileResponse.statusText}`);
      return null;
    }

    const profileData: CompanyProfile = await profileResponse.json();

    // Fetch quote data
    const quoteResponse = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_API_KEY}`
    );

    if (!quoteResponse.ok) {
      console.warn(`Failed to fetch quote for ${ticker}: ${quoteResponse.statusText}`);
      return null;
    }

    const quoteData: QuoteData = await quoteResponse.json();

    // Calculate relative volume if we have both current and average volume
    let relativeVolume: number | undefined;
    if (quoteData.v && quoteData.avgVolume && quoteData.avgVolume > 0) {
      relativeVolume = quoteData.v / quoteData.avgVolume;
    }

    return {
      float_shares: profileData.floatShares,
      market_cap: profileData.marketCapitalization,
      sector: profileData.sector,
      day_volume: quoteData.v,
      avg_volume: quoteData.avgVolume,
      relative_volume: relativeVolume
    };

  } catch (error) {
    console.error(`Market data fetch error for ${ticker}:`, error);
    return null; // Never throw, return null on error
  }
}

/**
 * Enrich trade data with market information
 * @param tradeId ID of the trade to enrich
 * @param ticker Stock symbol
 * @param date Trade date
 */
export async function enrichTradeWithMarketData(tradeId: string, ticker: string, date: string): Promise<void> {
  try {
    const marketData = await fetchMarketData(ticker, date);

    if (!marketData) {
      console.log(`No market data available for ${ticker}, skipping enrichment`);
      return;
    }

    // Update the trade in Supabase with market data
    const { error } = await supabase
      .from('trades')
      .update({
        float_shares: marketData.float_shares,
        market_cap: marketData.market_cap,
        sector: marketData.sector,
        day_volume: marketData.day_volume,
        avg_volume: marketData.avg_volume,
        relative_volume: marketData.relative_volume,
        // Set initial values for AI fields
        ai_review: null,
        ai_replay: null,
        setup_quality: null
      })
      .eq('id', tradeId);

    if (error) {
      console.error(`Failed to update trade ${tradeId} with market data:`, error);
    }
  } catch (error) {
    console.error(`Trade enrichment error for ${tradeId}:`, error);
    // Never throw, fail silently
  }
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
 * Generate AI review and update trade with AI data
 * @param tradeId ID of the trade to analyze
 * @returns Promise that resolves when AI processing is complete
 */
export async function generateAndStoreAIReview(tradeId: string): Promise<void> {
  try {
    // Fetch the complete trade data from Supabase
    const { data: trade, error: fetchError } = await supabase
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .single();

    if (fetchError || !trade) {
      console.error(`Failed to fetch trade ${tradeId} for AI review:`, fetchError);
      return;
    }

    // Prepare trade data for AI review
    const tradeData: any = {
      ticker: trade.ticker,
      direction: trade.direction || 'unknown',
      entry_price: trade.entry || trade.entry_price || 0,
      exit_price: trade.exit || trade.exit_price || null,
      entry_time: trade.entry_time || trade.time || new Date().toISOString(),
      exit_time: trade.exit_time || null,
      size: trade.size || 0,
      realized_pl: trade.realized_pl ? parseFloat(trade.realized_pl) : null,
      discipline_score: trade.discipline_score || 100,
      violations: trade.violations ? JSON.parse(trade.violations) : [],
      float_shares: trade.float_shares,
      market_cap: trade.market_cap,
      sector: trade.sector,
      relative_volume: trade.relative_volume,
      day_volume: trade.day_volume,
      avg_volume: trade.avg_volume
    };

    // Generate AI review
    const review = await generateTradeReview(tradeData);

    if (!review) {
      console.log(`AI review generation failed for trade ${tradeId}, skipping AI update`);
      return;
    }

    // Update trade with AI review data
    const { error: updateError } = await supabase
      .from('trades')
      .update({
        ai_review: JSON.stringify(review),
        ai_replay: review.replay,
        setup_quality: review.setup_quality,
        trade_grade: review.trade_grade
      })
      .eq('id', tradeId);

    if (updateError) {
      console.error(`Failed to update trade ${tradeId} with AI review:`, updateError);
    } else {
      console.log(`Successfully generated AI review for trade ${tradeId}`);
    }

  } catch (error) {
    console.error(`AI review processing error for trade ${tradeId}:`, error);
    // Never throw, fail gracefully
  }
}
