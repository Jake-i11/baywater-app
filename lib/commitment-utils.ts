/**
 * Pre-Trade Commitment Utilities
 *
 * Helper functions for managing pre-trade commitments and pattern analysis
 */

import { supabase } from "@/lib/supabase";
import { getOpenRouterClient } from "@/lib/ai/client";
import { AI_MODELS } from "@/lib/ai/models";

/**
 * Create a new pre-trade commitment
 * @param userId User ID
 * @param commitmentData Pre-trade commitment data
 * @returns Created commitment
 */
export async function createPreTradeCommitment(userId: string, commitmentData: {
  screenshot_url?: string;
  thesis: string;
  setup_type: string;
  expected_outcome: string;
  invalidation_reason: string;
  confidence_score: number;
  selected_rules: any[];
  ticker?: string;
  market_cap?: number;
  float_shares?: number;
  sector?: string;
  relative_volume?: number;
  avg_volume?: number;
  day_volume?: number;
}) {
  try {
    const { data: commitment, error } = await supabase
      .from('pre_trade_commitments')
      .insert([
        {
          user_id: userId,
          ...commitmentData,
          selected_rules: commitmentData.selected_rules || [],
          created_at: new Date().toISOString(),
          is_locked: false
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating pre-trade commitment:', error);
      throw error;
    }

    return commitment;

  } catch (error) {
    console.error('Commitment creation error:', error);
    throw error;
  }
}

/**
 * Lock a pre-trade commitment
 * @param commitmentId Commitment ID
 * @returns Updated commitment
 */
export async function lockPreTradeCommitment(commitmentId: number) {
  try {
    const { data: commitment, error } = await supabase
      .from('pre_trade_commitments')
      .update({
        is_locked: true,
        locked_at: new Date().toISOString()
      })
      .eq('id', commitmentId)
      .select()
      .single();

    if (error) {
      console.error('Error locking commitment:', error);
      throw error;
    }

    return commitment;

  } catch (error) {
    console.error('Commitment locking error:', error);
    throw error;
  }
}

/**
 * Get pre-trade commitment by ID
 * @param commitmentId Commitment ID
 * @returns Pre-trade commitment data
 */
export async function getPreTradeCommitment(commitmentId: number) {
  try {
    const { data: commitment, error } = await supabase
      .from('pre_trade_commitments')
      .select('*')
      .eq('id', commitmentId)
      .single();

    if (error) {
      console.error('Error fetching commitment:', error);
      throw error;
    }

    return commitment;

  } catch (error) {
    console.error('Commitment fetch error:', error);
    throw error;
  }
}

/**
 * Get pre-trade commitments by user
 * @param userId User ID
 * @param limit Number of commitments to fetch
 * @returns Array of pre-trade commitments
 */
export async function getUserPreTradeCommitments(userId: string, limit: number = 10) {
  try {
    const { data: commitments, error } = await supabase
      .from('pre_trade_commitments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching user commitments:', error);
      throw error;
    }

    return commitments || [];

  } catch (error) {
    console.error('User commitments fetch error:', error);
    throw error;
  }
}

/**
 * Get unlocked commitments (not yet executed)
 * @param userId User ID
 * @returns Array of unlocked commitments
 */
export async function getUnlockedCommitments(userId: string) {
  try {
    const { data: commitments, error } = await supabase
      .from('pre_trade_commitments')
      .select('*')
      .eq('user_id', userId)
      .eq('is_locked', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching unlocked commitments:', error);
      throw error;
    }

    return commitments || [];

  } catch (error) {
    console.error('Unlocked commitments fetch error:', error);
    throw error;
  }
}

/**
 * Find similar historical trades for pattern analysis
 * @param userId User ID
 * @param commitmentData Pre-trade commitment data
 * @param limit Number of similar trades to find
 * @returns Array of similar trades with similarity scores
 */
export async function findSimilarHistoricalTrades(userId: string, commitmentData: {
  setup_type: string;
  ticker?: string;
  market_cap?: number;
  float_shares?: number;
  sector?: string;
  relative_volume?: number;
}, limit: number = 5) {
  try {
    // Fetch user's completed trades
    const { data: trades, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .is('realized_pl', 'not.null')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching trades for similarity analysis:', error);
      return [];
    }

    if (!trades || trades.length === 0) {
      return [];
    }

    // Simple similarity scoring based on available data
    const similarTrades = trades
      .map(trade => {
        let score = 0;

        // Setup type match (high weight)
        if (trade.setup_type === commitmentData.setup_type) {
          score += 30;
        }

        // Ticker match (high weight if same ticker)
        if (trade.ticker === commitmentData.ticker) {
          score += 25;
        }

        // Sector match
        if (trade.sector === commitmentData.sector) {
          score += 15;
        }

        // Market cap similarity (within 50% range)
        if (commitmentData.market_cap && trade.market_cap) {
          const capRatio = Math.abs(commitmentData.market_cap / trade.market_cap);
          if (capRatio >= 0.5 && capRatio <= 2) {
            score += 10;
          }
        }

        // Float similarity (within 50% range)
        if (commitmentData.float_shares && trade.float_shares) {
          const floatRatio = Math.abs(commitmentData.float_shares / trade.float_shares);
          if (floatRatio >= 0.5 && floatRatio <= 2) {
            score += 10;
          }
        }

        // Relative volume similarity
        if (commitmentData.relative_volume && trade.relative_volume) {
          const volRatio = Math.abs(commitmentData.relative_volume / trade.relative_volume);
          if (volRatio >= 0.7 && volRatio <= 1.3) {
            score += 10;
          }
        }

        return {
          ...trade,
          similarity_score: score
        };
      })
      .filter(trade => trade.similarity_score > 0)
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, limit);

    return similarTrades;

  } catch (error) {
    console.error('Similar trades analysis error:', error);
    return [];
  }
}

/**
 * Generate AI pattern analysis for a trade
 * @param tradeId Trade ID
 * @param commitmentId Pre-trade commitment ID
 * @returns Trade pattern analysis
 */
export async function generateTradePatternAnalysis(tradeId: string, commitmentId: number) {
  try {
    // Fetch the trade and commitment data
    const [tradeResponse, commitmentResponse] = await Promise.all([
      supabase.from('trades').select('*').eq('id', tradeId).single(),
      getPreTradeCommitment(commitmentId)
    ]);

    if (tradeResponse.error || !tradeResponse.data) {
      throw new Error('Trade not found');
    }

    if (!commitmentResponse) {
      throw new Error('Commitment not found');
    }

    const trade = tradeResponse.data;
    const commitment = commitmentResponse;

    // Find similar historical trades
    const similarTrades = await findSimilarHistoricalTrades(trade.user_id, {
      setup_type: commitment.setup_type,
      ticker: commitment.ticker,
      market_cap: commitment.market_cap,
      float_shares: commitment.float_shares,
      sector: commitment.sector,
      relative_volume: commitment.relative_volume
    });

    // Calculate alignment scores
    const setupAlignmentScore = calculateSetupAlignment(trade, commitment);
    const ruleAlignmentScore = calculateRuleAlignment(trade, commitment);
    const historicalSimilarityScore = calculateHistoricalSimilarity(similarTrades);

    // Prepare data for AI analysis
    const analysisData = {
      trade,
      commitment,
      similarTrades,
      setupAlignmentScore,
      ruleAlignmentScore,
      historicalSimilarityScore
    };

    // Generate AI insights
    const aiInsights = await generateAIInsights(analysisData);

    // Store the analysis
    const { data: analysis, error } = await supabase
      .from('trade_pattern_analysis')
      .insert([
        {
          trade_id: tradeId,
          commitment_id: commitmentId,
          user_id: trade.user_id,
          similar_trade_ids: similarTrades.map(t => t.id),
          similarity_scores: similarTrades.map(t => t.similarity_score),
          matching_factors: aiInsights.matching_factors,
          differing_factors: aiInsights.differing_factors,
          setup_alignment_score: setupAlignmentScore,
          rule_alignment_score: ruleAlignmentScore,
          historical_similarity_score: historicalSimilarityScore,
          ai_summary: aiInsights.summary,
          ai_insights: aiInsights,
          winning_pattern_matches: countWinningPatternMatches(similarTrades, trade),
          losing_pattern_matches: countLosingPatternMatches(similarTrades, trade)
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Error storing trade pattern analysis:', error);
      throw error;
    }

    return analysis;

  } catch (error) {
    console.error('Trade pattern analysis error:', error);
    throw error;
  }
}

/**
 * Calculate setup alignment score
 * @param trade Trade data
 * @param commitment Commitment data
 * @returns Alignment score (0-100)
 */
function calculateSetupAlignment(trade: any, commitment: any): number {
  let score = 0;

  // Setup type match
  if (trade.setup_type === commitment.setup_type) {
    score += 20;
  }

  // Ticker match
  if (trade.ticker === commitment.ticker) {
    score += 15;
  }

  // Sector match
  if (trade.sector === commitment.sector) {
    score += 10;
  }

  // Market conditions similarity
  if (trade.relative_volume && commitment.relative_volume) {
    const volDiff = Math.abs(trade.relative_volume - commitment.relative_volume);
    if (volDiff < 1) score += 10;
    else if (volDiff < 2) score += 5;
  }

  // Confidence vs outcome alignment
  const pl = parseFloat(trade.realized_pl || '0');
  if (commitment.confidence_score >= 7 && pl > 0) {
    score += 15; // High confidence, positive outcome
  } else if (commitment.confidence_score <= 4 && pl < 0) {
    score += 10; // Low confidence, negative outcome (self-awareness)
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Calculate rule alignment score
 * @param trade Trade data
 * @param commitment Commitment data
 * @returns Alignment score (0-100)
 */
function calculateRuleAlignment(trade: any, commitment: any): number {
  try {
    const tradeViolations = JSON.parse(trade.violations || '[]');
    const selectedRules = commitment.selected_rules || [];

    // If no violations and rules were selected, perfect alignment
    if (tradeViolations.length === 0 && selectedRules.length > 0) {
      return 100;
    }

    // Calculate percentage of rules followed
    const rulesFollowed = selectedRules.length > 0
      ? Math.max(0, 100 - (tradeViolations.length / selectedRules.length) * 100)
      : 50;

    return Math.min(100, Math.max(0, rulesFollowed));
  } catch (error) {
    console.error('Rule alignment calculation error:', error);
    return 50; // Default to medium score on error
  }
}

/**
 * Calculate historical similarity score
 * @param similarTrades Array of similar trades
 * @returns Similarity score (0-100)
 */
function calculateHistoricalSimilarity(similarTrades: any[]): number {
  if (similarTrades.length === 0) return 0;

  const totalScore = similarTrades.reduce((sum, trade) => sum + trade.similarity_score, 0);
  const averageScore = totalScore / similarTrades.length;

  // Normalize to 0-100 scale
  return Math.min(100, Math.max(0, averageScore * 1.5));
}

/**
 * Count winning pattern matches
 * @param similarTrades Array of similar trades
 * @param currentTrade Current trade data
 * @returns Number of winning pattern matches
 */
function countWinningPatternMatches(similarTrades: any[], currentTrade: any): number {
  const pl = parseFloat(currentTrade.realized_pl || '0');
  const isCurrentWin = pl > 0;

  return similarTrades.filter(trade => {
    const tradePl = parseFloat(trade.realized_pl || '0');
    return tradePl > 0 && isCurrentWin;
  }).length;
}

/**
 * Count losing pattern matches
 * @param similarTrades Array of similar trades
 * @param currentTrade Current trade data
 * @returns Number of losing pattern matches
 */
function countLosingPatternMatches(similarTrades: any[], currentTrade: any): number {
  const pl = parseFloat(currentTrade.realized_pl || '0');
  const isCurrentLoss = pl < 0;

  return similarTrades.filter(trade => {
    const tradePl = parseFloat(trade.realized_pl || '0');
    return tradePl < 0 && isCurrentLoss;
  }).length;
}

/**
 * Generate AI insights using Gemini
 * @param analysisData Analysis data
 * @returns AI-generated insights
 */
async function generateAIInsights(analysisData: any) {
  try {
    // Prepare the prompt
    const prompt = buildPatternAnalysisPrompt(analysisData);

    // Use OpenRouter client
    const client = getOpenRouterClient();

    // Generate the insights using OpenRouter
    const response = await client.chat.completions.create({
      model: AI_MODELS.default,
      messages: [
        {
          role: "system",
          content: "You are a trading performance analyst. Respond only with valid JSON in the specified format."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 2000
    });

    // Parse the response
    try {
      const responseText = response.choices[0].message.content || '{}';
      return JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return {
        summary: "Analysis generated but parsing failed",
        matching_factors: [],
        differing_factors: [],
        insights: "AI analysis completed"
      };
    }

  } catch (error) {
    console.error('AI insights generation error:', error);
    return {
      summary: "AI analysis unavailable",
      matching_factors: [],
      differing_factors: [],
      insights: "Pattern analysis completed using statistical methods"
    };
  }
}

/**
 * Build the AI prompt for pattern analysis
 * @param analysisData Analysis data
 * @returns Formatted prompt
 */
function buildPatternAnalysisPrompt(analysisData: any): string {
  const { trade, commitment, similarTrades } = analysisData;

  // Format similar trades
  const formatTrade = (t: any) => {
    const pl = parseFloat(t.realized_pl || '0');
    return `
    Trade ${pl > 0 ? 'WIN' : 'LOSS'}:
    - Date: ${new Date(t.created_at).toLocaleDateString()}
    - Ticker: ${t.ticker}
    - Setup: ${t.setup_type}
    - P/L: $${pl.toFixed(2)}
    - Similarity: ${t.similarity_score}%`;
  };

  return `
You are a trading performance analyst comparing a trader's pre-trade commitment with their actual execution.

IMPORTANT RULES:
1. Never give investment advice
2. Never tell the trader what they should have done
3. Only analyze whether the actual trade matched the pre-trade commitment
4. Focus on process alignment, not outcome judgment
5. Be specific about similarities and differences

TRADE DETAILS:

Pre-Trade Commitment:
- Thesis: "${commitment.thesis}"
- Setup Type: ${commitment.setup_type}
- Expected Outcome: "${commitment.expected_outcome}"
- Invalidation Reason: "${commitment.invalidation_reason}"
- Confidence: ${commitment.confidence_score}/10
- Selected Rules: ${(commitment.selected_rules || []).join(', ')}

Actual Execution:
- Entry: ${trade.entry}
- Exit: ${trade.exit || 'N/A'}
- Position Size: ${trade.size}
- Hold Time: ${calculateHoldTime(trade.entry_time, trade.exit_time)}
- P/L: $${parseFloat(trade.realized_pl || '0').toFixed(2)}
- Violations: ${JSON.parse(trade.violations || '[]').join(', ') || 'None'}

SIMILAR HISTORICAL TRADES:
${similarTrades.length > 0 ? similarTrades.map(formatTrade).join('\\n\\n') : 'No similar trades found'}

RESPONSE FORMAT (JSON only):
{
  "summary": "Concise summary of process alignment",
  "matching_factors": [
    "Factor 1 that matched historical winners",
    "Factor 2 that matched historical winners"
  ],
  "differing_factors": [
    "Factor 1 that differed from historical winners",
    "Factor 2 that differed from historical winners"
  ],
  "insights": "Additional insights about process consistency"
}`;
}

/**
 * Calculate hold time from entry and exit times
 * @param entryTime Entry time
 * @param exitTime Exit time
 * @returns Hold time string
 */
function calculateHoldTime(entryTime: string | undefined, exitTime: string | undefined): string {
  if (!entryTime || !exitTime) return 'Unknown';

  try {
    const entry = new Date(entryTime);
    const exit = new Date(exitTime);
    const minutes = (exit.getTime() - entry.getTime()) / (1000 * 60);

    if (minutes < 60) return `${Math.round(minutes)} minutes`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} hours`;
    return `${Math.round(minutes / 1440)} days`;
  } catch {
    return 'Unknown';
  }
}