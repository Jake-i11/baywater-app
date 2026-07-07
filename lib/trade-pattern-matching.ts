/**
 * Automatic Trade Pattern Matching Engine
 *
 * Analyzes trades automatically and compares them against the trader's historical winners and losers
 * without requiring any manual input from the trader.
 */

import { supabase } from "@/lib/supabase";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Main pattern matching function
 * Analyzes a trade and finds similar historical patterns
 * @param tradeId Trade ID to analyze
 * @returns Pattern matching results
 */
export async function analyzeTradePatterns(tradeId: string) {
  try {
    // Fetch the trade to analyze
    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .single();

    if (tradeError || !trade) {
      throw new Error('Trade not found');
    }

    // Fetch user's historical trades for comparison
    const { data: historicalTrades, error: historyError } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', trade.user_id)
      .neq('id', tradeId) // Exclude the current trade
      .is('realized_pl', 'not.null') // Only completed trades
      .order('created_at', { ascending: false });

    if (historyError) {
      throw new Error('Failed to fetch historical trades');
    }

    if (!historicalTrades || historicalTrades.length === 0) {
      return {
        success: true,
        winner_similarity_score: 0,
        loser_similarity_score: 0,
        matching_factors: [],
        difference_factors: [],
        historical_winner_matches: 0,
        historical_loser_matches: 0,
        edge_conditions_present: [],
        warning_conditions_present: [],
        message: 'No historical trades available for pattern analysis'
      };
    }

    // Separate historical trades into winners and losers
    const winners = historicalTrades.filter(t => parseFloat(t.realized_pl || '0') > 0);
    const losers = historicalTrades.filter(t => parseFloat(t.realized_pl || '0') < 0);

    // Calculate similarity scores
    const winnerSimilarity = calculateSimilarityScore(trade, winners);
    const loserSimilarity = calculateSimilarityScore(trade, losers);

    // Find specific matching trades
    const winnerMatches = findSimilarTrades(trade, winners, 0.7);
    const loserMatches = findSimilarTrades(trade, losers, 0.7);

    // Generate factors and conditions
    const { matchingFactors, differenceFactors } = generatePatternFactors(trade, winnerMatches, loserMatches);
    const { edgeConditions, warningConditions } = generateTradeConditions(trade, winnerMatches, loserMatches);

    // Generate AI explanation
    const aiExplanation = await generatePatternExplanation(trade, winnerMatches, loserMatches, winnerSimilarity, loserSimilarity);

    // Store results in database
    const analysisResult = await storePatternAnalysis({
      trade_id: tradeId,
      user_id: trade.user_id,
      winner_similarity_score: winnerSimilarity,
      loser_similarity_score: loserSimilarity,
      matching_factors: matchingFactors,
      difference_factors: differenceFactors,
      ai_summary: aiExplanation.summary,
      edge_conditions: edgeConditions,
      risk_flags: warningConditions,
      historical_winner_matches: winnerMatches.length,
      historical_loser_matches: loserMatches.length
    });

    return {
      success: true,
      ...analysisResult,
      winner_matches: winnerMatches,
      loser_matches: loserMatches,
      ai_explanation: aiExplanation
    };

  } catch (error) {
    console.error('Pattern matching error:', error);
    return {
      success: false,
      error: 'Failed to analyze trade patterns',
      winner_similarity_score: 0,
      loser_similarity_score: 0,
      matching_factors: [],
      difference_factors: [],
      historical_winner_matches: 0,
      historical_loser_matches: 0,
      edge_conditions_present: [],
      warning_conditions_present: []
    };
  }
}

/**
 * Calculate similarity score between a trade and historical trades
 * @param trade Trade to compare
 * @param historicalTrades Array of historical trades
 * @returns Similarity score (0-100)
 */
function calculateSimilarityScore(trade: any, historicalTrades: any[]): number {
  if (historicalTrades.length === 0) return 0;

  // Calculate individual factor scores
  const factorScores = historicalTrades.map(histTrade => {
    let score = 0;

    // Setup type match (high weight)
    if (trade.setup_type && histTrade.setup_type && trade.setup_type === histTrade.setup_type) {
      score += 20;
    }

    // Ticker match (high weight)
    if (trade.ticker && histTrade.ticker && trade.ticker === histTrade.ticker) {
      score += 15;
    }

    // Sector match
    if (trade.sector && histTrade.sector && trade.sector === histTrade.sector) {
      score += 10;
    }

    // Market cap similarity (within 50% range)
    if (trade.market_cap && histTrade.market_cap) {
      const capRatio = Math.abs(trade.market_cap / histTrade.market_cap);
      if (capRatio >= 0.5 && capRatio <= 2) {
        score += 10;
      }
    }

    // Float similarity (within 50% range)
    if (trade.float_shares && histTrade.float_shares) {
      const floatRatio = Math.abs(trade.float_shares / histTrade.float_shares);
      if (floatRatio >= 0.5 && floatRatio <= 2) {
        score += 10;
      }
    }

    // Relative volume similarity
    if (trade.relative_volume && histTrade.relative_volume) {
      const volDiff = Math.abs(trade.relative_volume - histTrade.relative_volume);
      if (volDiff < 1) score += 10;
      else if (volDiff < 2) score += 5;
    }

    // Direction match
    if (trade.direction && histTrade.direction && trade.direction === histTrade.direction) {
      score += 5;
    }

    // Time of day similarity (within 2 hours)
    if (trade.entry_time && histTrade.entry_time) {
      try {
        const tradeTime = new Date(trade.entry_time);
        const histTime = new Date(histTrade.entry_time);
        const hoursDiff = Math.abs(tradeTime.getHours() - histTime.getHours());
        if (hoursDiff <= 2) score += 5;
      } catch (e) {
        // Time parsing failed, skip
      }
    }

    // Holding period similarity (within 50%)
    if (trade.entry_time && trade.exit_time && histTrade.entry_time && histTrade.exit_time) {
      try {
        const tradeDuration = new Date(trade.exit_time).getTime() - new Date(trade.entry_time).getTime();
        const histDuration = new Date(histTrade.exit_time).getTime() - new Date(histTrade.entry_time).getTime();
        const durationRatio = tradeDuration / histDuration;
        if (durationRatio >= 0.5 && durationRatio <= 2) {
          score += 5;
        }
      } catch (e) {
        // Duration calculation failed, skip
      }
    }

    return Math.min(100, Math.max(0, score));
  });

  // Return average score
  const averageScore = factorScores.reduce((sum, score) => sum + score, 0) / factorScores.length;
  return Math.round(averageScore);
}

/**
 * Find similar trades with similarity score above threshold
 * @param trade Trade to compare
 * @param historicalTrades Array of historical trades
 * @param threshold Similarity threshold (0-1)
 * @returns Array of similar trades with scores
 */
function findSimilarTrades(trade: any, historicalTrades: any[], threshold: number): any[] {
  return historicalTrades
    .map(histTrade => {
      const score = calculateSimilarityScore(trade, [histTrade]);
      return {
        ...histTrade,
        similarity_score: score
      };
    })
    .filter(t => t.similarity_score >= threshold * 100)
    .sort((a, b) => b.similarity_score - a.similarity_score);
}

/**
 * Generate pattern factors (matching and differing)
 * @param trade Current trade
 * @param winnerMatches Similar winning trades
 * @param loserMatches Similar losing trades
 * @returns Pattern factors
 */
function generatePatternFactors(trade: any, winnerMatches: any[], loserMatches: any[]): {
  matchingFactors: string[],
  differenceFactors: string[]
} {
  const matchingFactors: string[] = [];
  const differenceFactors: string[] = [];

  // Setup type matching
  if (winnerMatches.length > 0 && winnerMatches[0].setup_type === trade.setup_type) {
    matchingFactors.push(`Same setup type as ${winnerMatches.length} previous winners`);
  }

  // Sector matching
  if (winnerMatches.length > 0 && winnerMatches[0].sector === trade.sector) {
    matchingFactors.push(`Same sector as ${winnerMatches.length} previous winners`);
  }

  // Market cap range
  if (trade.market_cap) {
    const capRange = getMarketCapRange(trade.market_cap);
    const winnerCapMatches = winnerMatches.filter(w => {
      const wCapRange = getMarketCapRange(w.market_cap);
      return wCapRange === capRange;
    });
    if (winnerCapMatches.length > 0) {
      matchingFactors.push(`Similar market cap range (${capRange}) as ${winnerCapMatches.length} previous winners`);
    }
  }

  // Float range
  if (trade.float_shares) {
    const floatRange = getFloatRange(trade.float_shares);
    const winnerFloatMatches = winnerMatches.filter(w => {
      const wFloatRange = getFloatRange(w.float_shares);
      return wFloatRange === floatRange;
    });
    if (winnerFloatMatches.length > 0) {
      matchingFactors.push(`Similar float range (${floatRange}) as ${winnerFloatMatches.length} previous winners`);
    }
  }

  // Relative volume
  if (trade.relative_volume) {
    const volRange = getVolumeRange(trade.relative_volume);
    const winnerVolMatches = winnerMatches.filter(w => {
      const wVolRange = getVolumeRange(w.relative_volume);
      return wVolRange === volRange;
    });
    if (winnerVolMatches.length > 0) {
      matchingFactors.push(`Similar relative volume (${volRange}) as ${winnerVolMatches.length} previous winners`);
    }
  }

  // Time of day
  if (trade.entry_time) {
    try {
      const tradeHour = new Date(trade.entry_time).getHours();
      const timeRange = getTimeRange(tradeHour);
      const winnerTimeMatches = winnerMatches.filter(w => {
        try {
          const wHour = new Date(w.entry_time).getHours();
          return getTimeRange(wHour) === timeRange;
        } catch {
          return false;
        }
      });
      if (winnerTimeMatches.length > 0) {
        matchingFactors.push(`Similar time of day (${timeRange}) as ${winnerTimeMatches.length} previous winners`);
      }
    } catch {
      // Time parsing failed
    }
  }

  // Look for differences from winners
  if (loserMatches.length > 0) {
    // Entry timing differences
    if (trade.entry_time) {
      try {
        const tradeHour = new Date(trade.entry_time).getHours();
        const loserEntryHours = loserMatches.map(l => {
          try {
            return new Date(l.entry_time).getHours();
          } catch {
            return null;
          }
        }).filter(h => h !== null);

        if (loserEntryHours.length > 0) {
          const avgLoserHour = loserEntryHours.reduce((sum, h) => sum + h!, 0) / loserEntryHours.length;
          if (Math.abs(tradeHour - avgLoserHour) > 2) {
            differenceFactors.push(`Losing trades usually entered at different times (you: ${tradeHour}:00, losers: ~${Math.round(avgLoserHour)}:00)`);
          }
        }
      } catch {
        // Time comparison failed
      }
    }

    // Holding period differences
    if (trade.entry_time && trade.exit_time) {
      try {
        const tradeDuration = new Date(trade.exit_time).getTime() - new Date(trade.entry_time).getTime();
        const loserDurations = loserMatches
          .map(l => {
            try {
              return new Date(l.exit_time).getTime() - new Date(l.entry_time).getTime();
            } catch {
              return null;
            }
          })
          .filter(d => d !== null);

        if (loserDurations.length > 0) {
          const avgLoserDuration = loserDurations.reduce((sum, d) => sum + d!, 0) / loserDurations.length;
          const durationRatio = tradeDuration / avgLoserDuration;
          if (durationRatio > 2) {
            differenceFactors.push(`Losing trades usually had shorter holding periods (${Math.round(avgLoserDuration/60000)} min vs your ${Math.round(tradeDuration/60000)} min)`);
          } else if (durationRatio < 0.5) {
            differenceFactors.push(`Losing trades usually had longer holding periods (${Math.round(avgLoserDuration/60000)} min vs your ${Math.round(tradeDuration/60000)} min)`);
          }
        }
      } catch {
        // Duration comparison failed
      }
    }
  }

  return { matchingFactors, differenceFactors };
}

/**
 * Generate edge and warning conditions
 * @param trade Current trade
 * @param winnerMatches Similar winning trades
 * @param loserMatches Similar losing trades
 * @returns Trade conditions
 */
function generateTradeConditions(trade: any, winnerMatches: any[], loserMatches: any[]): {
  edgeConditions: string[],
  warningConditions: string[]
} {
  const edgeConditions: string[] = [];
  const warningConditions: string[] = [];

  // Calculate statistics for winner matches
  if (winnerMatches.length > 0) {
    const winnerPLs = winnerMatches.map(w => parseFloat(w.realized_pl || '0')).filter(p => !isNaN(p));
    const totalWinnerPL = winnerPLs.reduce((sum, p) => sum + p, 0);
    const winRate = (winnerPLs.filter(p => p > 0).length / winnerPLs.length) * 100;

    edgeConditions.push(
      `Your similar trades have produced +$${totalWinnerPL.toFixed(2)} across ${winnerMatches.length} trades with ${winRate.toFixed(0)}% win rate`
    );

    // Setup-specific edge
    if (trade.setup_type) {
      const setupWinners = winnerMatches.filter(w => w.setup_type === trade.setup_type);
      if (setupWinners.length >= 3) {
        const setupWinnerPLs = setupWinners.map(w => parseFloat(w.realized_pl || '0')).filter(p => !isNaN(p));
        const setupTotalPL = setupWinnerPLs.reduce((sum, p) => sum + p, 0);
        const setupWinRate = (setupWinnerPLs.filter(p => p > 0).length / setupWinnerPLs.length) * 100;

        edgeConditions.push(
          `Your ${trade.setup_type} setups have produced +$${setupTotalPL.toFixed(2)} across ${setupWinners.length} trades with ${setupWinRate.toFixed(0)}% win rate`
        );
      }
    }
  }

  // Calculate statistics for loser matches
  if (loserMatches.length > 0) {
    const loserPLs = loserMatches.map(l => parseFloat(l.realized_pl || '0')).filter(p => !isNaN(p));
    const totalLoserPL = loserPLs.reduce((sum, p) => sum + p, 0);

    warningConditions.push(
      `Similar losing trades resulted in -$${Math.abs(totalLoserPL).toFixed(2)} across ${loserMatches.length} trades`
    );

    // Entry timing warnings
    if (trade.entry_time && loserMatches.length >= 3) {
      try {
        const tradeHour = new Date(trade.entry_time).getHours();
        const loserHours = loserMatches.map(l => {
          try {
            return new Date(l.entry_time).getHours();
          } catch {
            return null;
          }
        }).filter(h => h !== null);

        if (loserHours.length > 0) {
          const commonHour = findMostCommonValue(loserHours);
          if (commonHour && Math.abs(tradeHour - commonHour) <= 1) {
            warningConditions.push(
              `Your losing examples usually entered around ${commonHour}:00 (you entered at ${tradeHour}:00)`
            );
          }
        }
      } catch {
        // Time analysis failed
      }
    }

    // Volume warnings
    if (trade.relative_volume && loserMatches.length >= 3) {
      const loserVolumes = loserMatches.map(l => l.relative_volume).filter(v => v);
      if (loserVolumes.length > 0) {
        const avgLoserVolume = loserVolumes.reduce((sum, v) => sum + v, 0) / loserVolumes.length;
        if (Math.abs(trade.relative_volume - avgLoserVolume) < 1) {
          warningConditions.push(
            `Losing trades usually had similar relative volume (${avgLoserVolume.toFixed(1)}x vs your ${trade.relative_volume.toFixed(1)}x)`
          );
        }
      }
    }
  }

  return { edgeConditions, warningConditions };
}

/**
 * Generate AI explanation using Gemini
 * @param trade Current trade
 * @param winnerMatches Similar winning trades
 * @param loserMatches Similar losing trades
 * @param winnerSimilarity Winner similarity score
 * @param loserSimilarity Loser similarity score
 * @returns AI-generated explanation
 */
async function generatePatternExplanation(trade: any, winnerMatches: any[], loserMatches: any[], winnerSimilarity: number, loserSimilarity: number) {
  try {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return {
        summary: "AI explanation unavailable",
        looks_like_winners_because: [],
        looks_like_losers_because: [],
        historical_edge: "",
        risk_flags: []
      };
    }

    // Prepare trade statistics
    const winnerStats = calculateTradeStatistics(winnerMatches);
    const loserStats = calculateTradeStatistics(loserMatches);

    // Build the prompt
    const prompt = `
You are a trading performance analyst comparing a trader's current trade with their historical patterns.

IMPORTANT RULES:
1. Never give investment advice
2. Never predict price movement
3. Never recommend buying, selling, or holding
4. Only analyze historical patterns
5. Every claim must include specific statistics
6. Focus on what the trader has actually done in the past

CURRENT TRADE:
- Ticker: ${trade.ticker || 'N/A'}
- Setup: ${trade.setup_type || 'N/A'}
- Direction: ${trade.direction || 'N/A'}
- Market Cap: ${trade.market_cap ? `$${(trade.market_cap/1000000000).toFixed(1)}B` : 'N/A'}
- Float: ${trade.float_shares ? `${(trade.float_shares/1000000).toFixed(1)}M` : 'N/A'}
- Relative Volume: ${trade.relative_volume ? `${trade.relative_volume.toFixed(1)}x` : 'N/A'}
- Sector: ${trade.sector || 'N/A'}

HISTORICAL WINNERS (${winnerMatches.length} trades):
- Total P/L: $${winnerStats.totalPL.toFixed(2)}
- Win Rate: ${winnerStats.winRate}%
- Avg Win: $${winnerStats.avgWin.toFixed(2)}
- Avg Loss: $${winnerStats.avgLoss.toFixed(2)}
- Similarity Score: ${winnerSimilarity}/100

HISTORICAL LOSERS (${loserMatches.length} trades):
- Total P/L: $${loserStats.totalPL.toFixed(2)}
- Win Rate: ${loserStats.winRate}%
- Avg Win: $${loserStats.avgWin.toFixed(2)}
- Avg Loss: $${loserStats.avgLoss.toFixed(2)}
- Similarity Score: ${loserSimilarity}/100

MATCHING FACTORS:
${winnerMatches.length > 0 ? winnerMatches.slice(0, 3).map((w, i) => `
${i+1}. ${w.ticker} - ${w.setup_type} - $${parseFloat(w.realized_pl || '0').toFixed(2)} - ${w.relative_volume ? w.relative_volume.toFixed(1) + 'x vol' : ''}`).join('') : 'None'}

RESPONSE FORMAT (JSON only):
{
  "summary": "Concise summary of pattern match (1-2 sentences)",
  "looks_like_winners_because": [
    "Specific reason with statistics",
    "Another specific reason with statistics"
  ],
  "looks_like_losers_because": [
    "Specific reason with statistics",
    "Another specific reason with statistics"
  ],
  "historical_edge": "Your [setup type] setups have produced [total P/L] across [count] trades with [win rate]% win rate",
  "risk_flags": [
    "Warning based on historical losing patterns",
    "Another warning with specific statistics"
  ]
}`;

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.3,
        maxOutputTokens: 2000
      }
    });

    // Generate the explanation
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text();

    // Parse the response
    try {
      const cleanedText = responseText.trim();
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      } else {
        return JSON.parse(cleanedText);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return {
        summary: "Pattern analysis completed",
        looks_like_winners_because: winnerMatches.length > 0
          ? [`Matches ${winnerMatches.length} previous winning trades with similar characteristics`]
          : [],
        looks_like_losers_because: loserMatches.length > 0
          ? [`Resembles ${loserMatches.length} previous losing trades in some aspects`]
          : [],
        historical_edge: winnerMatches.length > 0
          ? `Your similar trades have produced +$${winnerStats.totalPL.toFixed(2)} across ${winnerMatches.length} trades`
          : "No historical edge detected",
        risk_flags: loserMatches.length > 0
          ? [`Similar losing trades resulted in -$${Math.abs(loserStats.totalPL).toFixed(2)} across ${loserMatches.length} trades`]
          : []
      };
    }

  } catch (error) {
    console.error('AI explanation generation error:', error);
    return {
      summary: "AI analysis unavailable",
      looks_like_winners_because: [],
      looks_like_losers_because: [],
      historical_edge: "",
      risk_flags: []
    };
  }
}

/**
 * Store pattern analysis results in database
 * @param analysis Analysis data
 * @returns Stored analysis result
 */
async function storePatternAnalysis(analysis: {
  trade_id: string,
  user_id: string,
  winner_similarity_score: number,
  loser_similarity_score: number,
  matching_factors: string[],
  difference_factors: string[],
  ai_summary: string,
  edge_conditions: string[],
  risk_flags: string[],
  historical_winner_matches: number,
  historical_loser_matches: number
}) {
  try {
    const { data, error } = await supabase
      .from('trade_pattern_analysis')
      .insert([
        {
          trade_id: analysis.trade_id,
          user_id: analysis.user_id,
          winner_similarity_score: analysis.winner_similarity_score,
          loser_similarity_score: analysis.loser_similarity_score,
          matching_factors: analysis.matching_factors,
          differing_factors: analysis.difference_factors,
          ai_summary: analysis.ai_summary,
          ai_insights: {
            looks_like_winners_because: analysis.edge_conditions,
            looks_like_losers_because: analysis.risk_flags,
            historical_edge: analysis.edge_conditions.join(' '),
            risk_flags: analysis.risk_flags
          },
          edge_conditions: analysis.edge_conditions,
          risk_flags: analysis.risk_flags,
          winning_pattern_matches: analysis.historical_winner_matches,
          losing_pattern_matches: analysis.historical_loser_matches,
          created_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Error storing pattern analysis:', error);
      throw error;
    }

    return data;

  } catch (error) {
    console.error('Pattern analysis storage error:', error);
    return {
      ...analysis,
      id: 0,
      created_at: new Date().toISOString()
    };
  }
}

/**
 * Calculate trade statistics
 * @param trades Array of trades
 * @returns Trade statistics
 */
function calculateTradeStatistics(trades: any[]): {
  totalPL: number,
  winRate: number,
  avgWin: number,
  avgLoss: number,
  count: number
} {
  if (trades.length === 0) {
    return {
      totalPL: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      count: 0
    };
  }

  const pls = trades.map(t => parseFloat(t.realized_pl || '0')).filter(p => !isNaN(p));
  const wins = pls.filter(p => p > 0);
  const losses = pls.filter(p => p < 0);

  return {
    totalPL: pls.reduce((sum, p) => sum + p, 0),
    winRate: (wins.length / pls.length) * 100,
    avgWin: wins.length > 0 ? (wins.reduce((sum, p) => sum + p, 0) / wins.length) : 0,
    avgLoss: losses.length > 0 ? (losses.reduce((sum, p) => sum + p, 0) / losses.length) : 0,
    count: pls.length
  };
}

/**
 * Helper function to get market cap range
 * @param marketCap Market cap value
 * @returns Market cap range description
 */
function getMarketCapRange(marketCap: number): string {
  if (marketCap < 300000000) return 'Micro Cap';
  if (marketCap < 2000000000) return 'Small Cap';
  if (marketCap < 10000000000) return 'Mid Cap';
  if (marketCap < 200000000000) return 'Large Cap';
  return 'Mega Cap';
}

/**
 * Helper function to get float range
 * @param floatShares Float shares value
 * @returns Float range description
 */
function getFloatRange(floatShares: number): string {
  if (floatShares < 10000000) return 'Low Float';
  if (floatShares < 50000000) return 'Medium Float';
  if (floatShares < 200000000) return 'High Float';
  return 'Very High Float';
}

/**
 * Helper function to get volume range
 * @param relativeVolume Relative volume value
 * @returns Volume range description
 */
function getVolumeRange(relativeVolume: number): string {
  if (relativeVolume < 1.5) return 'Normal Volume';
  if (relativeVolume < 3) return 'High Volume';
  if (relativeVolume < 5) return 'Very High Volume';
  return 'Extreme Volume';
}

/**
 * Helper function to get time range
 * @param hour Hour of day (0-23)
 * @returns Time range description
 */
function getTimeRange(hour: number): string {
  if (hour < 6) return 'Pre-market';
  if (hour < 10) return 'Market Open';
  if (hour < 12) return 'Morning';
  if (hour < 14) return 'Midday';
  if (hour < 16) return 'Afternoon';
  return 'Market Close';
}

/**
 * Helper function to find most common value in array
 * @param values Array of values
 * @returns Most common value or null
 */
function findMostCommonValue(values: number[]): number | null {
  if (values.length === 0) return null;

  const frequencyMap: Record<number, number> = {};
  let maxCount = 0;
  let mostCommon = values[0];

  for (const value of values) {
    frequencyMap[value] = (frequencyMap[value] || 0) + 1;
    if (frequencyMap[value] > maxCount) {
      maxCount = frequencyMap[value];
      mostCommon = value;
    }
  }

  return mostCommon;
}