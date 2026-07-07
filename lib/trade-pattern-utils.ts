/**
 * Trade Pattern Analysis Utilities
 *
 * Helper functions for fetching and working with trade pattern analysis data
 */
import { supabase } from "@/lib/supabase";

/**
 * Get trade pattern analysis for a specific trade
 * @param tradeId Trade ID
 * @returns Promise with pattern analysis data or null if not found
 */
export async function getTradePatternAnalysis(tradeId: string) {
  try {
    const { data, error } = await supabase
      .from('trade_pattern_analysis')
      .select('*')
      .eq('trade_id', tradeId)
      .single();

    if (error) {
      console.log('No pattern analysis found for trade:', tradeId);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error fetching trade pattern analysis:', error);
    return null;
  }
}

/**
 * Get recent pattern analysis for dashboard summary
 * @param userId User ID
 * @param limit Number of recent trades to analyze
 * @returns Promise with recent pattern analysis summary
 */
export async function getRecentPatternAnalysisSummary(userId: string, limit = 5) {
  try {
    // Fetch recent trades with pattern analysis
    const { data: analyses, error } = await supabase
      .from('trade_pattern_analysis')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !analyses || analyses.length === 0) {
      return {
        patternScore: 0,
        recentStrengths: [],
        recentWarnings: [],
        recentTradeSummary: 'No recent pattern analysis available',
        totalAnalyzed: 0,
        winnerMatches: 0,
        loserMatches: 0
      };
    }

    // Calculate pattern score (average of winner similarity scores)
    const winnerScores = analyses
      .map(a => a.winner_similarity_score || 0)
      .filter(score => score > 0);

    const patternScore = winnerScores.length > 0
      ? Math.round(winnerScores.reduce((sum, score) => sum + score, 0) / winnerScores.length)
      : 0;

    // Extract strengths from matching factors
    const allMatchingFactors = analyses.flatMap(a => a.matching_factors || []);
    const uniqueStrengths = [...new Set(allMatchingFactors)];

    // Extract warnings from risk flags
    const allRiskFlags = analyses.flatMap(a => a.risk_flags || []);
    const uniqueWarnings = [...new Set(allRiskFlags)];

    // Count winner vs loser matches
    const totalWinnerMatches = analyses.reduce((sum, a) => sum + (a.winning_pattern_matches || 0), 0);
    const totalLoserMatches = analyses.reduce((sum, a) => sum + (a.losing_pattern_matches || 0), 0);

    // Generate summary
    const recentTradeSummary = generateRecentTradeSummary(analyses.length, totalWinnerMatches, totalLoserMatches);

    return {
      patternScore,
      recentStrengths: uniqueStrengths.slice(0, 3),
      recentWarnings: uniqueWarnings.slice(0, 3),
      recentTradeSummary,
      totalAnalyzed: analyses.length,
      winnerMatches: totalWinnerMatches,
      loserMatches: totalLoserMatches
    };

  } catch (error) {
    console.error('Error fetching recent pattern analysis:', error);
    return {
      patternScore: 0,
      recentStrengths: [],
      recentWarnings: [],
      recentTradeSummary: 'Error loading pattern analysis',
      totalAnalyzed: 0,
      winnerMatches: 0,
      loserMatches: 0
    };
  }
}

/**
 * Generate summary text for recent trades
 * @param totalTrades Total number of trades analyzed
 * @param winnerMatches Total winner matches
 * @param loserMatches Total loser matches
 * @returns Summary text
 */
function generateRecentTradeSummary(totalTrades: number, winnerMatches: number, loserMatches: number): string {
  if (totalTrades === 0) {
    return 'No recent pattern analysis available';
  }

  if (winnerMatches > loserMatches) {
    return `Your last ${totalTrades} trades matched your historical winners (${winnerMatches} matches vs ${loserMatches} loser matches)`;
  } else if (loserMatches > winnerMatches) {
    return `Your last ${totalTrades} trades are showing patterns similar to previous losses (${loserMatches} loser matches vs ${winnerMatches} winner matches)`;
  } else {
    return `Your last ${totalTrades} trades show mixed historical patterns (${winnerMatches} winner matches, ${loserMatches} loser matches)`;
  }
}