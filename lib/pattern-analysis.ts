/**
 * Pattern Analysis Engine
 *
 * Statistical intelligence layer for analyzing trade patterns
 * Foundation for Section 2 post-pattern recognition intelligence
 * Do NOT use Gemini/AI - pure statistical analysis only
 */

import { supabase } from "@/lib/supabase";

/**
 * Filter completed trades only
 * @param trades Array of trade objects
 * @returns Filtered array of completed trades
 */
function filterCompletedTrades(trades: any[]): any[] {
  return trades.filter(trade =>
    trade.entry !== null &&
    trade.entry !== undefined &&
    trade.exit !== null &&
    trade.exit !== undefined &&
    trade.realized_pl !== null &&
    trade.realized_pl !== undefined
  );
}

/**
 * Calculate basic performance metrics for a trade group
 * @param trades Array of trade objects
 * @returns Performance metrics
 */
function calculatePerformanceMetrics(trades: any[]): {
  trades: number;
  winRate: number;
  totalPL: number;
  avgPL: number;
  avgDisciplineScore: number;
} {
  if (trades.length === 0) {
    return {
      trades: 0,
      winRate: 0,
      totalPL: 0,
      avgPL: 0,
      avgDisciplineScore: 100
    };
  }

  const plValues = trades.map(t => parseFloat(t.realized_pl || '0'));
  const winningTrades = plValues.filter(pl => pl > 0);

  const disciplineScores = trades
    .map(t => t.discipline_score !== null && t.discipline_score !== undefined ? t.discipline_score : 100)
    .filter(score => !isNaN(score));

  return {
    trades: trades.length,
    winRate: Math.round((winningTrades.length / trades.length) * 100),
    totalPL: plValues.reduce((sum, pl) => sum + pl, 0),
    avgPL: plValues.reduce((sum, pl) => sum + pl, 0) / trades.length,
    avgDisciplineScore: disciplineScores.length > 0
      ? Math.round(disciplineScores.reduce((sum, score) => sum + score, 0) / disciplineScores.length)
      : 100
  };
}

/**
 * Analyze setup performance by setup_type
 * @param trades Array of trade objects
 * @returns Setup performance analysis
 */
export function analyzeSetupPerformance(trades: any[]): Array<{
  setup: string;
  trades: number;
  winRate: number;
  totalPL: number;
  avgPL: number;
  avgDisciplineScore: number;
}> {
  const completedTrades = filterCompletedTrades(trades);

  // Group trades by setup_type
  const setupGroups: Record<string, any[]> = {};

  completedTrades.forEach(trade => {
    const setupType = trade.setup_type || 'Unknown';
    if (!setupGroups[setupType]) {
      setupGroups[setupType] = [];
    }
    setupGroups[setupType].push(trade);
  });

  // Calculate metrics for each setup type
  const results: Array<{
    setup: string;
    trades: number;
    winRate: number;
    totalPL: number;
    avgPL: number;
    avgDisciplineScore: number;
  }> = [];

  for (const [setupType, setupTrades] of Object.entries(setupGroups)) {
    if (setupTrades.length >= 5) { // Minimum 5 trades to show
      const metrics = calculatePerformanceMetrics(setupTrades);
      results.push({
        setup: setupType,
        ...metrics
      });
    }
  }

  // Sort by total PL (descending)
  return results.sort((a, b) => b.totalPL - a.totalPL);
}

/**
 * Analyze market cap performance
 * @param trades Array of trade objects
 * @returns Market cap performance analysis
 */
export function analyzeMarketCapPerformance(trades: any[]): Array<{
  tier: string;
  range: string;
  trades: number;
  winRate: number;
  totalPL: number;
  avgPL: number;
  avgDisciplineScore: number;
}> {
  const completedTrades = filterCompletedTrades(trades);

  // Define market cap tiers
  const marketCapTrades: Record<string, any[]> = {
    'Micro': [],
    'Small': [],
    'Mid': [],
    'Large': []
  };

  completedTrades.forEach(trade => {
    const marketCap = trade.market_cap;
    if (marketCap === null || marketCap === undefined) return;

    if (marketCap < 50_000_000) {
      marketCapTrades['Micro'].push(trade);
    } else if (marketCap < 300_000_000) {
      marketCapTrades['Small'].push(trade);
    } else if (marketCap < 2_000_000_000) {
      marketCapTrades['Mid'].push(trade);
    } else {
      marketCapTrades['Large'].push(trade);
    }
  });

  // Calculate metrics for each tier
  const results: Array<{
    tier: string;
    range: string;
    trades: number;
    winRate: number;
    totalPL: number;
    avgPL: number;
    avgDisciplineScore: number;
  }> = [];

  const tierDefinitions = [
    { tier: 'Micro', range: '<$50M' },
    { tier: 'Small', range: '$50M-$300M' },
    { tier: 'Mid', range: '$300M-$2B' },
    { tier: 'Large', range: '>$2B' }
  ];

  tierDefinitions.forEach(definition => {
    const tierTrades = marketCapTrades[definition.tier];
    if (tierTrades.length >= 5) { // Minimum 5 trades to show
      const metrics = calculatePerformanceMetrics(tierTrades);
      results.push({
        tier: definition.tier,
        range: definition.range,
        ...metrics
      });
    }
  });

  return results.sort((a, b) => b.totalPL - a.totalPL);
}

/**
 * Analyze float performance
 * @param trades Array of trade objects
 * @returns Float performance analysis
 */
export function analyzeFloatPerformance(trades: any[]): Array<{
  bucket: string;
  range: string;
  trades: number;
  winRate: number;
  totalPL: number;
  avgPL: number;
  avgDisciplineScore: number;
}> {
  const completedTrades = filterCompletedTrades(trades);

  // Define float buckets
  const floatTrades: Record<string, any[]> = {
    '<5M': [],
    '5M-20M': [],
    '20M-50M': [],
    '50M+': []
  };

  completedTrades.forEach(trade => {
    const floatShares = trade.float_shares;
    if (floatShares === null || floatShares === undefined) return;

    if (floatShares < 5_000_000) {
      floatTrades['<5M'].push(trade);
    } else if (floatShares < 20_000_000) {
      floatTrades['5M-20M'].push(trade);
    } else if (floatShares < 50_000_000) {
      floatTrades['20M-50M'].push(trade);
    } else {
      floatTrades['50M+'].push(trade);
    }
  });

  // Calculate metrics for each bucket
  const results: Array<{
    bucket: string;
    range: string;
    trades: number;
    winRate: number;
    totalPL: number;
    avgPL: number;
    avgDisciplineScore: number;
  }> = [];

  const bucketDefinitions = [
    { bucket: '<5M', range: '<5M shares' },
    { bucket: '5M-20M', range: '5M-20M shares' },
    { bucket: '20M-50M', range: '20M-50M shares' },
    { bucket: '50M+', range: '50M+ shares' }
  ];

  bucketDefinitions.forEach(definition => {
    const bucketTrades = floatTrades[definition.bucket];
    if (bucketTrades.length >= 5) { // Minimum 5 trades to show
      const metrics = calculatePerformanceMetrics(bucketTrades);
      results.push({
        bucket: definition.bucket,
        range: definition.range,
        ...metrics
      });
    }
  });

  return results.sort((a, b) => b.totalPL - a.totalPL);
}

/**
 * Analyze relative volume performance
 * @param trades Array of trade objects
 * @returns Relative volume performance analysis
 */
export function analyzeRelativeVolumePerformance(trades: any[]): Array<{
  bucket: string;
  range: string;
  trades: number;
  winRate: number;
  totalPL: number;
  avgPL: number;
  avgDisciplineScore: number;
}> {
  const completedTrades = filterCompletedTrades(trades);

  // Define relative volume buckets
  const volumeTrades: Record<string, any[]> = {
    '<2x': [],
    '2-5x': [],
    '5-10x': [],
    '10x+': []
  };

  completedTrades.forEach(trade => {
    const relativeVolume = trade.relative_volume;
    if (relativeVolume === null || relativeVolume === undefined) return;

    if (relativeVolume < 2) {
      volumeTrades['<2x'].push(trade);
    } else if (relativeVolume < 5) {
      volumeTrades['2-5x'].push(trade);
    } else if (relativeVolume < 10) {
      volumeTrades['5-10x'].push(trade);
    } else {
      volumeTrades['10x+'].push(trade);
    }
  });

  // Calculate metrics for each bucket
  const results: Array<{
    bucket: string;
    range: string;
    trades: number;
    winRate: number;
    totalPL: number;
    avgPL: number;
    avgDisciplineScore: number;
  }> = [];

  const bucketDefinitions = [
    { bucket: '<2x', range: '<2x average volume' },
    { bucket: '2-5x', range: '2-5x average volume' },
    { bucket: '5-10x', range: '5-10x average volume' },
    { bucket: '10x+', range: '10x+ average volume' }
  ];

  bucketDefinitions.forEach(definition => {
    const bucketTrades = volumeTrades[definition.bucket];
    if (bucketTrades.length >= 5) { // Minimum 5 trades to show
      const metrics = calculatePerformanceMetrics(bucketTrades);
      results.push({
        bucket: definition.bucket,
        range: definition.range,
        ...metrics
      });
    }
  });

  return results.sort((a, b) => b.totalPL - a.totalPL);
}

/**
 * Analyze time of day performance
 * @param trades Array of trade objects
 * @returns Time of day performance analysis
 */
export function analyzeTimeOfDayPerformance(trades: any[]): Array<{
  period: string;
  timeRange: string;
  trades: number;
  winRate: number;
  totalPL: number;
  avgPL: number;
  avgDisciplineScore: number;
}> {
  const completedTrades = filterCompletedTrades(trades);

  // Define time periods
  const timePeriods: Record<string, any[]> = {
    '9:30-10:00': [],
    '10:00-11:30': [],
    '11:30-14:00': [],
    '14:00-close': []
  };

  completedTrades.forEach(trade => {
    const entryTime = trade.entry_time || trade.created_at;
    if (!entryTime) return;

    const tradeDate = new Date(entryTime);
    const hours = tradeDate.getHours();
    const minutes = tradeDate.getMinutes();
    const totalMinutes = hours * 60 + minutes;

    // Market opens at 9:30 AM
    if (totalMinutes >= 9 * 60 + 30 && totalMinutes < 10 * 60) {
      timePeriods['9:30-10:00'].push(trade);
    }
    // 10:00 AM - 11:30 AM
    else if (totalMinutes >= 10 * 60 && totalMinutes < 11 * 60 + 30) {
      timePeriods['10:00-11:30'].push(trade);
    }
    // 11:30 AM - 2:00 PM
    else if (totalMinutes >= 11 * 60 + 30 && totalMinutes < 14 * 60) {
      timePeriods['11:30-14:00'].push(trade);
    }
    // 2:00 PM - close
    else if (totalMinutes >= 14 * 60) {
      timePeriods['14:00-close'].push(trade);
    }
  });

  // Calculate metrics for each period
  const results: Array<{
    period: string;
    timeRange: string;
    trades: number;
    winRate: number;
    totalPL: number;
    avgPL: number;
    avgDisciplineScore: number;
  }> = [];

  const periodDefinitions = [
    { period: '9:30-10:00', timeRange: '9:30 AM - 10:00 AM' },
    { period: '10:00-11:30', timeRange: '10:00 AM - 11:30 AM' },
    { period: '11:30-14:00', timeRange: '11:30 AM - 2:00 PM' },
    { period: '14:00-close', timeRange: '2:00 PM - Close' }
  ];

  periodDefinitions.forEach(definition => {
    const periodTrades = timePeriods[definition.period];
    if (periodTrades.length >= 5) { // Minimum 5 trades to show
      const metrics = calculatePerformanceMetrics(periodTrades);
      results.push({
        period: definition.period,
        timeRange: definition.timeRange,
        ...metrics
      });
    }
  });

  return results.sort((a, b) => b.totalPL - a.totalPL);
}

/**
 * Analyze holding period performance
 * @param trades Array of trade objects
 * @returns Holding period performance analysis
 */
export function analyzeHoldingPeriodPerformance(trades: any[]): Array<{
  period: string;
  range: string;
  trades: number;
  winRate: number;
  totalPL: number;
  avgPL: number;
  avgDisciplineScore: number;
}> {
  const completedTrades = filterCompletedTrades(trades);

  // Define holding period buckets
  const holdingPeriods: Record<string, any[]> = {
    '<5min': [],
    '5-30min': [],
    '30-120min': [],
    '2hr+': []
  };

  completedTrades.forEach(trade => {
    if (!trade.entry_time || !trade.exit_time) return;

    const entryTime = new Date(trade.entry_time);
    const exitTime = new Date(trade.exit_time);
    const holdingMinutes = (exitTime.getTime() - entryTime.getTime()) / (1000 * 60);

    if (holdingMinutes < 5) {
      holdingPeriods['<5min'].push(trade);
    } else if (holdingMinutes < 30) {
      holdingPeriods['5-30min'].push(trade);
    } else if (holdingMinutes < 120) {
      holdingPeriods['30-120min'].push(trade);
    } else {
      holdingPeriods['2hr+'].push(trade);
    }
  });

  // Calculate metrics for each period
  const results: Array<{
    period: string;
    range: string;
    trades: number;
    winRate: number;
    totalPL: number;
    avgPL: number;
    avgDisciplineScore: number;
  }> = [];

  const periodDefinitions = [
    { period: '<5min', range: '<5 minutes' },
    { period: '5-30min', range: '5-30 minutes' },
    { period: '30-120min', range: '30-120 minutes' },
    { period: '2hr+', range: '2+ hours' }
  ];

  periodDefinitions.forEach(definition => {
    const periodTrades = holdingPeriods[definition.period];
    if (periodTrades.length >= 5) { // Minimum 5 trades to show
      const metrics = calculatePerformanceMetrics(periodTrades);
      results.push({
        period: definition.period,
        range: definition.range,
        ...metrics
      });
    }
  });

  return results.sort((a, b) => b.totalPL - a.totalPL);
}

/**
 * Analyze ticker performance
 * @param trades Array of trade objects
 * @returns Ticker performance analysis
 */
export function analyzeTickerPerformance(trades: any[]): {
  bestTickers: Array<{
    ticker: string;
    trades: number;
    winRate: number;
    totalPL: number;
    avgPL: number;
    avgDisciplineScore: number;
  }>;
  worstTickers: Array<{
    ticker: string;
    trades: number;
    winRate: number;
    totalPL: number;
    avgPL: number;
    avgDisciplineScore: number;
  }>;
} {
  const completedTrades = filterCompletedTrades(trades);

  // Group trades by ticker
  const tickerGroups: Record<string, any[]> = {};

  completedTrades.forEach(trade => {
    const ticker = trade.ticker;
    if (!ticker) return;

    if (!tickerGroups[ticker]) {
      tickerGroups[ticker] = [];
    }
    tickerGroups[ticker].push(trade);
  });

  // Calculate metrics for each ticker
  const tickerResults: Array<{
    ticker: string;
    trades: number;
    winRate: number;
    totalPL: number;
    avgPL: number;
    avgDisciplineScore: number;
  }> = [];

  for (const [ticker, tickerTrades] of Object.entries(tickerGroups)) {
    if (tickerTrades.length >= 5) { // Minimum 5 trades to show
      const metrics = calculatePerformanceMetrics(tickerTrades);
      tickerResults.push({
        ticker,
        ...metrics
      });
    }
  }

  // Sort and separate best vs worst
  const bestTickers = [...tickerResults]
    .sort((a, b) => b.totalPL - a.totalPL)
    .slice(0, 5);

  const worstTickers = [...tickerResults]
    .sort((a, b) => a.totalPL - b.totalPL)
    .slice(0, 5);

  return { bestTickers, worstTickers };
}

/**
 * Get confidence level based on sample size
 * @param trades Number of trades
 * @returns Confidence level
 */
export function getConfidenceLevel(trades: number): {
  level: 'high' | 'medium' | 'low' | 'none';
  description: string;
} {
  if (trades >= 50) {
    return {
      level: 'high',
      description: 'High confidence (50+ trades)'
    };
  } else if (trades >= 20) {
    return {
      level: 'medium',
      description: 'Medium confidence (20-49 trades)'
    };
  } else if (trades >= 5) {
    return {
      level: 'low',
      description: 'Low confidence (5-19 trades)'
    };
  } else {
    return {
      level: 'none',
      description: 'Not enough data (<5 trades)'
    };
  }
}

/**
 * Generate pattern summary data for future AI coaching
 * @param userId User ID
 * @returns Promise with structured pattern data
 */
export async function generatePatternSummaryData(userId: string): Promise<{
  bestSetups: any[];
  worstSetups: any[];
  marketCapPerformance: any[];
  floatPerformance: any[];
  volumePerformance: any[];
  timePerformance: any[];
  holdingPeriodPerformance: any[];
  bestTickers: any[];
  worstTickers: any[];
}> {
  try {
    // Fetch all trades for the user
    const { data: trades, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !trades) {
      console.error('Failed to fetch trades for pattern analysis:', error);
      return {
        bestSetups: [],
        worstSetups: [],
        marketCapPerformance: [],
        floatPerformance: [],
        volumePerformance: [],
        timePerformance: [],
        holdingPeriodPerformance: [],
        bestTickers: [],
        worstTickers: []
      };
    }

    // Analyze all patterns
    const setupAnalysis = analyzeSetupPerformance(trades);
    const marketCapAnalysis = analyzeMarketCapPerformance(trades);
    const floatAnalysis = analyzeFloatPerformance(trades);
    const volumeAnalysis = analyzeRelativeVolumePerformance(trades);
    const timeAnalysis = analyzeTimeOfDayPerformance(trades);
    const holdingAnalysis = analyzeHoldingPeriodPerformance(trades);
    const tickerAnalysis = analyzeTickerPerformance(trades);

    // Separate best and worst setups
    const bestSetups = setupAnalysis.slice(0, 3);
    const worstSetups = [...setupAnalysis]
      .sort((a, b) => a.totalPL - b.totalPL)
      .slice(0, 3);

    return {
      bestSetups,
      worstSetups,
      marketCapPerformance: marketCapAnalysis,
      floatPerformance: floatAnalysis,
      volumePerformance: volumeAnalysis,
      timePerformance: timeAnalysis,
      holdingPeriodPerformance: holdingAnalysis,
      bestTickers: tickerAnalysis.bestTickers,
      worstTickers: tickerAnalysis.worstTickers
    };

  } catch (error) {
    console.error('Error generating pattern summary:', error);
    return {
      bestSetups: [],
      worstSetups: [],
      marketCapPerformance: [],
      floatPerformance: [],
      volumePerformance: [],
      timePerformance: [],
      holdingPeriodPerformance: [],
      bestTickers: [],
      worstTickers: []
    };
  }
}