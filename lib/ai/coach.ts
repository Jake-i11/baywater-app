/**
 * AI Trading Coach
 *
 * Structured coaching layer that combines:
 * - The current trade details
 * - The trader's historical profile (TraderProfile)
 * - The trader's behavioral patterns (BehaviorReport)
 *
 * Produces a structured TradeCoachingResponse with sections:
 *   summary, grade, whatWentWell, mistakes, behavioralInsight, actionItems, coachNote
 *
 * No raw database dumps are sent to the AI.
 * All context is summarized and structured before prompting.
 */

import "server-only";
import { getOpenRouterClient } from "./client";
import { AI_MODELS } from "./models";

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface CoachCurrentTrade {
  ticker: string;
  side: string;
  direction: string;
  entry_price: string | null;
  exit_price: string | null;
  size: string;
  entry_time: string | null;
  exit_time: string | null;
  realized_pl: string | null;
  holdTime: string;
  violations: string[];
  discipline_score: number | null;
  violation_cost: string | null;
  tradeMetrics?: {
    mfe?: number | null;
    mae?: number | null;
    missedAmount?: number | null;
    entryContext?: string;
  } | null;
}

export interface CoachTraderProfileSnapshot {
  totalTrades: number;
  winRate: number;
  totalProfitLoss: number;
  profitFactor: number;
  bestSide?: string;
  averagePositionSize: number;
  averageHoldTime: string;
  averageWinner: number | null;
  averageLoser: number | null;
  longWinRate: number;
  shortWinRate: number;
  morningWinRate: number;
  afternoonWinRate: number;
  bestTradingWindow: string;
  worstTradingWindow: string;
  averageDisciplineScore: number;
  mostTradedTickers: string[];
}

export interface CoachBehaviorSnapshot {
  strengths: string[];
  weaknesses: string[];
  tendencies: string[];
}

export interface CoachContext {
  currentTrade: CoachCurrentTrade;
  traderProfile: CoachTraderProfileSnapshot | null;
  behaviorReport: CoachBehaviorSnapshot | null;
  traderRules?: string[];
  /** Per-trade behavior tags computed deterministically */
  behaviorTags?: string[];
  /** Summary of recent trade history patterns */
  recentTradeSummary?: string;
  /** Persistent trader profile state from TraderProfileState */
  traderProfileState?: {
    strengths: string[];
    weaknesses: string[];
    personalRules: string[];
    improvementScore: number;
  };
}

export interface TradeCoachingResponse {
  /** One-line headline summarizing the trade quality */
  headline: string;
  /** Detailed review of what happened in this trade */
  tradeReview: string;
  /** How this trade connects to the trader's historical patterns */
  patternConnection: string;
  /** Key lesson from this trade */
  lesson: string;
  /** A new personal rule derived from this trade */
  newRule: string;
  /** A challenge for the next set of trades */
  challenge: string;
  /** Legacy fields for backward compatibility */
  summary?: string;
  grade?: { score?: number; reasoning?: string };
  whatWentWell?: string[];
  mistakes?: string[];
  behavioralInsight?: string[];
  actionItems?: string[];
  coachNote?: string;
}

// ─── Context Builder ─────────────────────────────────────────────────────────

/**
 * Build a structured CoachContext from the current trade + analytics data.
 *
 * This summarizes data before sending to the AI — no raw trade history.
 */
export function buildCoachContext(
  currentTrade: CoachCurrentTrade,
  traderProfileSnapshot: CoachTraderProfileSnapshot | null,
  behaviorSnapshot: CoachBehaviorSnapshot | null,
  traderRules?: string[],
  behaviorTags?: string[],
  recentTradeSummary?: string,
  traderProfileState?: CoachContext['traderProfileState']
): CoachContext {
  return {
    currentTrade: {
      ticker: currentTrade.ticker,
      side: currentTrade.side,
      direction: currentTrade.direction,
      entry_price: currentTrade.entry_price,
      exit_price: currentTrade.exit_price,
      size: currentTrade.size,
      entry_time: currentTrade.entry_time,
      exit_time: currentTrade.exit_time,
      realized_pl: currentTrade.realized_pl,
      holdTime: currentTrade.holdTime,
      violations: currentTrade.violations || [],
      discipline_score: currentTrade.discipline_score,
      violation_cost: currentTrade.violation_cost,
      tradeMetrics: currentTrade.tradeMetrics || null,
    },
    traderProfile: traderProfileSnapshot
      ? {
          totalTrades: traderProfileSnapshot.totalTrades,
          winRate: traderProfileSnapshot.winRate,
          totalProfitLoss: traderProfileSnapshot.totalProfitLoss,
          profitFactor: traderProfileSnapshot.profitFactor,
          bestSide: traderProfileSnapshot.bestSide,
          averagePositionSize: traderProfileSnapshot.averagePositionSize,
          averageHoldTime: traderProfileSnapshot.averageHoldTime,
          averageWinner: traderProfileSnapshot.averageWinner,
          averageLoser: traderProfileSnapshot.averageLoser,
          longWinRate: traderProfileSnapshot.longWinRate,
          shortWinRate: traderProfileSnapshot.shortWinRate,
          morningWinRate: traderProfileSnapshot.morningWinRate,
          afternoonWinRate: traderProfileSnapshot.afternoonWinRate,
          bestTradingWindow: traderProfileSnapshot.bestTradingWindow,
          worstTradingWindow: traderProfileSnapshot.worstTradingWindow,
          averageDisciplineScore: traderProfileSnapshot.averageDisciplineScore,
          mostTradedTickers: traderProfileSnapshot.mostTradedTickers,
        }
      : null,
    behaviorReport: behaviorSnapshot
      ? {
          strengths: behaviorSnapshot.strengths,
          weaknesses: behaviorSnapshot.weaknesses,
          tendencies: behaviorSnapshot.tendencies,
        }
      : null,
    traderRules: traderRules,
    behaviorTags,
    recentTradeSummary,
    traderProfileState,
  };
}

/**
 * Build a TraderProfile snapshot from a full analytics profile for sending to the AI.
 * Also determines bestSide.
 */
export function buildTraderProfileSnapshot(profile: {
  totalTrades: number;
  winRate: number;
  totalProfitLoss: number;
  profitFactor: number;
  averagePositionSize: number;
  averageHoldTime: string;
  averageWinner: number;
  averageLoser: number;
  longWinRate: number;
  shortWinRate: number;
  longTrades: number;
  shortTrades: number;
  morningWinRate: number;
  afternoonWinRate: number;
  bestTradingWindow: string;
  worstTradingWindow: string;
  averageDisciplineScore: number;
  mostTradedTickers: string[];
}): CoachTraderProfileSnapshot {
  let bestSide: string | undefined;
  if (profile.longTrades >= 3 && profile.shortTrades >= 3) {
    bestSide = profile.longWinRate > profile.shortWinRate ? "LONG" : "SHORT";
  } else if (profile.longTrades >= 3) {
    bestSide = "LONG";
  } else if (profile.shortTrades >= 3) {
    bestSide = "SHORT";
  }

  return {
    totalTrades: profile.totalTrades,
    winRate: profile.winRate,
    totalProfitLoss: profile.totalProfitLoss,
    profitFactor: profile.profitFactor,
    bestSide,
    averagePositionSize: profile.averagePositionSize,
    averageHoldTime: profile.averageHoldTime,
    averageWinner: profile.averageWinner > 0 ? profile.averageWinner : null,
    averageLoser: profile.averageLoser > 0 ? profile.averageLoser : null,
    longWinRate: profile.longWinRate,
    shortWinRate: profile.shortWinRate,
    morningWinRate: profile.morningWinRate,
    afternoonWinRate: profile.afternoonWinRate,
    bestTradingWindow: profile.bestTradingWindow,
    worstTradingWindow: profile.worstTradingWindow,
    averageDisciplineScore: profile.averageDisciplineScore,
    mostTradedTickers: profile.mostTradedTickers,
  };
}

// ─── Prompt Builder ──────────────────────────────────────────────────────────

/**
 * Build a coaching-style prompt from a structured CoachContext.
 *
 * The AI receives summarized, structured data — not raw database dumps.
 */
export function buildCoachPrompt(ctx: CoachContext): string {
  const trade = ctx.currentTrade;
  const pl = trade.realized_pl !== null && trade.realized_pl !== 'null'
    ? parseFloat(trade.realized_pl)
    : null;
  const plDisplay = pl !== null && !isNaN(pl) ? `$${pl.toFixed(2)}` : "N/A";
  const isProfit = pl !== null && pl > 0;

  const violationsText = trade.violations.length > 0
    ? trade.violations.map(v => `  - ${v}`).join('\n')
    : "  None";

  // Build profile section (if available)
  let profileSection = "";
  if (ctx.traderProfile) {
    const p = ctx.traderProfile;
    profileSection = `
HISTORICAL PROFILE:
- Total trades analyzed: ${p.totalTrades}
- Overall win rate: ${p.winRate}%
- Net P&L: ${p.totalProfitLoss >= 0 ? '+' : ''}$${p.totalProfitLoss.toFixed(0)}
- Profit factor: ${p.profitFactor === 999 ? '∞ (no losses)' : p.profitFactor.toFixed(2)}
- Average win: ${p.averageWinner !== null ? '$' + p.averageWinner.toFixed(0) : 'N/A'}
- Average loss: ${p.averageLoser !== null ? '$' + p.averageLoser.toFixed(0) : 'N/A'}
${p.bestSide ? `- Best side: ${p.bestSide}` : ''}
- Avg position: ${p.averagePositionSize} shares
- Avg hold time: ${p.averageHoldTime}
- Long win rate: ${p.longWinRate}%
- Short win rate: ${p.shortWinRate}%
- Morning win rate: ${p.morningWinRate}%
- Afternoon win rate: ${p.afternoonWinRate}%
${p.bestTradingWindow && p.bestTradingWindow !== 'N/A' ? `- Best window: ${p.bestTradingWindow}` : ''}
${p.worstTradingWindow && p.worstTradingWindow !== 'N/A' ? `- Worst window: ${p.worstTradingWindow}` : ''}
- Avg discipline score: ${p.averageDisciplineScore}/100
- Most traded: ${p.mostTradedTickers.slice(0, 3).join(', ') || 'N/A'}`;
  } else {
    profileSection = "\nHISTORICAL PROFILE: Not enough data yet.";
  }

  // Build behavior section (if available)
  let behaviorSection = "";
  if (ctx.behaviorReport) {
    const b = ctx.behaviorReport;
    behaviorSection = `
BEHAVIORAL PATTERNS:
${b.strengths.length > 0 ? 'Strengths detected:\n' + b.strengths.map(s => `  + ${s}`).join('\n') : '  No strengths detected yet.'}
${b.weaknesses.length > 0 ? '\nWeaknesses detected:\n' + b.weaknesses.map(w => `  - ${w}`).join('\n') : ''}
${b.tendencies.length > 0 ? '\nTendencies:\n' + b.tendencies.map(t => `  ~ ${t}`).join('\n') : ''}`;
  } else {
    behaviorSection = "\nBEHAVIORAL PATTERNS: Not enough data yet.";
  }

  // Build trade metrics section (if available)
  let metricsSection = "";
  if (trade.tradeMetrics) {
    const m = trade.tradeMetrics;
    metricsSection = `
CHART METRICS:
- MFE (best possible): ${m.mfe !== null && m.mfe !== undefined ? '$' + m.mfe.toFixed(2) : 'N/A'}
- MAE (worst drawdown): ${m.mae !== null && m.mae !== undefined ? '$' + Math.abs(m.mae).toFixed(2) : 'N/A'}
- Missed opportunity: ${m.missedAmount !== null && m.missedAmount !== undefined ? '$' + m.missedAmount.toFixed(2) : 'N/A'}
${m.entryContext ? `- Entry context: ${m.entryContext}` : ''}`;
  } else {
    metricsSection = "\nCHART METRICS: Not available for this trade.";
  }

  // Build behavior tags section (if available)
  let behaviorTagsSection = '';
  if (ctx.behaviorTags && ctx.behaviorTags.length > 0) {
    behaviorTagsSection = `\nBEHAVIOR TAGS (this trade):\n${ctx.behaviorTags.map(t => `  \u2022 ${t}`).join('\n')}\n${ctx.recentTradeSummary ? `- ${ctx.recentTradeSummary}` : ''}`;
  } else {
    behaviorTagsSection = '\nBEHAVIOR TAGS: Not available for this trade.';
  }

  // Build trader profile state section (persistent coach profile)
  let traderStateSection = '';
  if (ctx.traderProfileState) {
    const s = ctx.traderProfileState;
    const parts: string[] = [];
    if (s.strengths && s.strengths.length > 0) parts.push(`Strengths: ${s.strengths.join(', ')}`);
    if (s.weaknesses && s.weaknesses.length > 0) parts.push(`Weaknesses: ${s.weaknesses.join(', ')}`);
    if (s.personalRules && s.personalRules.length > 0) parts.push(`Rules: ${s.personalRules.join(', ')}`);
    if (s.improvementScore !== undefined) parts.push(`Progress score: ${s.improvementScore}/100`);
    if (parts.length > 0) {
      traderStateSection = `
PERSISTENT COACH PROFILE:
${parts.map(p => `  ~ ${p}`).join('\n')}`;
    }
  }

  // Build coaching-specific prompt section
  const coachingSection = ctx.behaviorTags && ctx.behaviorTags.length > 0
    ? `
BEHAVIORAL TAGS ANALYSIS:
This trade was flagged with: ${ctx.behaviorTags.join(', ')}.
${ctx.recentTradeSummary ? `Recent trend: ${ctx.recentTradeSummary}` : 'Consider if this behavior is part of a recurring pattern.'}
Use these tags to inform your analysis below — connect them to the trader's history and known weaknesses when applicable.`
    : '';

  return `You are an elite trading performance coach. Your job is to coach this trader based on this specific trade AND everything you know about their history and patterns.

CURRENT TRADE:
- Ticker: ${trade.ticker}
- Direction: ${trade.side || trade.direction || 'UNKNOWN'}
- Entry: ${trade.entry_price ? '$' + trade.entry_price : 'N/A'}
- Exit: ${trade.exit_price ? '$' + trade.exit_price : 'Open'}
- Size: ${trade.size || 'N/A'} shares
- Hold time: ${trade.holdTime || 'N/A'}
- P&L: ${plDisplay}
- Discipline score: ${trade.discipline_score !== null ? trade.discipline_score + '/100' : 'N/A'}
- Violations:
${violationsText}  ${metricsSection}${profileSection}${behaviorSection}${traderStateSection}${behaviorTagsSection}${coachingSection}

COACHING INSTRUCTIONS:
Analyze this trade in the context of the trader's history. Be specific, not generic. You are a personal trading coach who knows this trader's patterns.

Return a coaching review with the following structure:

1. headline: A one-line summary that captures the essence of this trade.
   Example: "You repeated your most common mistake."

2. tradeReview: A detailed analysis of what happened in THIS specific trade.
   Include what they did, whether it worked, and whether they followed their rules.

3. patternConnection: How this trade connects to their HISTORICAL patterns.
   Reference specific numbers from their profile.
   Example: "This trade followed the same pattern as 5 previous losing trades. You tend to exit shorts immediately after large drops."

4. lesson: The key lesson from this trade.
   Example: "Your best trades come after consolidation."

5. newRule: A concrete new personal rule derived from this trade.
   Example: "Wait for a lower high before entering."

6. challenge: A specific challenge for the next set of trades.
   Example: "Next 5 trades: avoid chasing momentum."

RULES:
- Be specific. Use numbers from their profile. Example: "You held 45 min vs your average 22 min on winners."
- NEVER say "manage risk better" without explaining WHY.
- If there are violations, connect them to the trader's history.
- If no violations and profitable, acknowledge good process.
- If profile data is limited, work with what's available.
- Match your tone to the situation — direct and firm for repeated mistakes, encouraging for improvement.

RESPONSE FORMAT (JSON only, no additional text):
{
  "headline": "One-line headline.",
  "tradeReview": "Detailed review of this specific trade.",
  "patternConnection": "How this connects to their history.",
  "lesson": "Key lesson.",
  "newRule": "New personal rule.",
  "challenge": "Challenge for next trades."
}`;
}

// ─── Response Parser ─────────────────────────────────────────────────────────

/**
 * Parse and validate the AI's JSON response into a TradeCoachingResponse.
 * Returns a fallback response if parsing fails.
 */
export function parseCoachResponse(responseText: string): TradeCoachingResponse {
  const fallback: TradeCoachingResponse = {
    headline: "Could not parse AI coaching response.",
    tradeReview: "The AI response could not be read.",
    patternConnection: "N/A",
    lesson: "N/A",
    newRule: "Try again later.",
    challenge: "Re-select this trade to regenerate.",
    summary: "Could not parse AI coaching response.",
    grade: { score: 50, reasoning: "Response parsing error." },
    whatWentWell: [],
    mistakes: ["Unable to analyze at this time."],
    behavioralInsight: [],
    actionItems: ["Try again later."],
    coachNote: "The AI coach encountered an issue. Please try again.",
  };

  try {
    const cleanedText = responseText.trim();
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[Coach] No JSON found in AI response');
      return fallback;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate required fields (new coaching format)
    if (!parsed.headline || !parsed.tradeReview) {
      console.warn('[Coach] Missing required new-format fields in AI response');
      // Fall back to legacy format check
      if (!parsed.summary || !parsed.grade) {
        return fallback;
      }
      // Convert legacy format to new format
      return {
        headline: parsed.summary || fallback.headline,
        tradeReview: parsed.grade?.reasoning || parsed.summary || fallback.tradeReview,
        patternConnection: (parsed.behavioralInsight && Array.isArray(parsed.behavioralInsight) && parsed.behavioralInsight.length > 0)
          ? parsed.behavioralInsight[0]
          : 'N/A',
        lesson: (parsed.mistakes && Array.isArray(parsed.mistakes) && parsed.mistakes.length > 0)
          ? parsed.mistakes[0]
          : 'Keep tracking your trades.',
        newRule: (parsed.actionItems && Array.isArray(parsed.actionItems) && parsed.actionItems.length > 0)
          ? parsed.actionItems[0]
          : 'Stay disciplined.',
        challenge: (parsed.actionItems && Array.isArray(parsed.actionItems) && parsed.actionItems.length > 1)
          ? parsed.actionItems[1]
          : 'Focus on consistency.',
        summary: parsed.summary,
        grade: parsed.grade ? {
          score: Math.max(0, Math.min(100, parsed.grade.score || 50)),
          reasoning: parsed.grade.reasoning || '',
        } : fallback.grade,
        whatWentWell: Array.isArray(parsed.whatWentWell) ? parsed.whatWentWell : [],
        mistakes: Array.isArray(parsed.mistakes) ? parsed.mistakes : [],
        behavioralInsight: Array.isArray(parsed.behavioralInsight) ? parsed.behavioralInsight : [],
        actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
        coachNote: parsed.coachNote || '',
      };
    }

    // Validate the new format fields
    if (typeof parsed.headline !== 'string' || typeof parsed.tradeReview !== 'string') {
      console.warn('[Coach] Invalid types in new-format AI response');
      return fallback;
    }

    return {
      headline: parsed.headline || fallback.headline,
      tradeReview: parsed.tradeReview || fallback.tradeReview,
      patternConnection: parsed.patternConnection || 'N/A',
      lesson: parsed.lesson || 'Keep tracking your trades.',
      newRule: parsed.newRule || 'Stay disciplined.',
      challenge: parsed.challenge || 'Focus on consistency.',
      // Preserve legacy fields for backward-compatible rendering
      summary: parsed.headline,
      grade: { score: 50, reasoning: parsed.tradeReview },
      whatWentWell: [],
      mistakes: [],
      behavioralInsight: parsed.patternConnection ? [parsed.patternConnection] : [],
      actionItems: parsed.newRule ? [parsed.newRule] : [],
      coachNote: parsed.challenge || '',
    };
  } catch (error) {
    console.warn('[Coach] Failed to parse AI response:', error);
    return fallback;
  }
}

// ─── AI Review Generator ─────────────────────────────────────────────────────

export interface CoachGenerateOptions {
  temperature?: number;
  maxTokens?: number;
}

/**
 * Generate a coaching review using the AI.
 *
 * Builds a structured CoachContext from the current trade + analytics,
 * sends a compact prompt to OpenRouter, and returns a structured response.
 *
 * Falls back gracefully if any data is missing or the AI call fails.
 */
export async function generateCoachReview(
  ctx: CoachContext,
  options?: CoachGenerateOptions
): Promise<TradeCoachingResponse> {
  const fallbackResponse: TradeCoachingResponse = {
    headline: "AI coaching unavailable at this time.",
    tradeReview: "The coaching service could not be reached.",
    patternConnection: "N/A",
    lesson: "N/A",
    newRule: "Check your connection and try again.",
    challenge: "Re-select this trade to regenerate.",
    summary: "AI coaching unavailable at this time.",
    grade: { score: 0, reasoning: "Coaching service unavailable." },
    whatWentWell: [],
    mistakes: [],
    behavioralInsight: [],
    actionItems: ["Try again later."],
    coachNote: "The coaching service could not be reached. Please check your connection and try again.",
  };

  try {
    const prompt = buildCoachPrompt(ctx);

    const client = getOpenRouterClient();

    const response = await client.chat.completions.create({
      model: AI_MODELS.default,
      messages: [
        {
          role: "system",
          content: "You are an elite trading performance coach who provides specific, data-driven feedback. Respond only with valid JSON in the specified format.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: options?.temperature ?? 0.4,
      max_tokens: options?.maxTokens ?? 1200,
    });

    const responseText = response.choices[0]?.message?.content || "{}";
    return parseCoachResponse(responseText);
  } catch (error) {
    console.error("[Coach] AI review generation error:", error);
    return fallbackResponse;
  }
}

/**
 * Build a minimal fallback response when there isn't enough data for AI coaching.
 */
export function buildMinimalResponse(currentTrade: CoachCurrentTrade): TradeCoachingResponse {
  const pl = currentTrade.realized_pl !== null && currentTrade.realized_pl !== 'null'
    ? parseFloat(currentTrade.realized_pl)
    : null;
  const isProfitable = pl !== null && pl > 0;

  // Simple grade based on available data
  let score = 50;
  const scoreReasons: string[] = [];

  if (isProfitable) {
    score += 20;
    scoreReasons.push("profitable");
  } else if (pl !== null && pl < 0) {
    score -= 10;
    scoreReasons.push("unprofitable");
  }

  if (currentTrade.violations.length === 0) {
    score += 15;
    scoreReasons.push("no violations");
  } else {
    score -= 15;
    scoreReasons.push(`${currentTrade.violations.length} violation(s)`);
  }

  score = Math.max(0, Math.min(100, score));

  const whatWentWell: string[] = [];
  const mistakes: string[] = [];

  if (isProfitable) {
    whatWentWell.push("Trade was profitable");
  }
  if (currentTrade.violations.length === 0) {
    whatWentWell.push("No rule violations — clean execution");
  }
  if (currentTrade.violations.length > 0) {
    currentTrade.violations.forEach(v => {
      mistakes.push(v);
    });
  }
  if (!isProfitable && pl !== null) {
    mistakes.push("Trade resulted in a loss");
  }

  return {
    headline: score >= 70
      ? "Solid execution with room to grow."
      : score >= 50
        ? "Mixed execution — some good, some needs work."
        : "This trade needs significant improvement.",
    tradeReview: `The trade was ${isProfitable ? 'profitable' : 'a loss'} with ${currentTrade.violations.length} violation(s).`,
    patternConnection: "Not enough historical data to identify patterns yet.",
    lesson: score >= 70
      ? "Good process leads to good results. Keep it up."
      : "Focus on following your rules consistently.",
    newRule: "Keep tracking your trades to unlock personalized coaching insights.",
    challenge: "Next trade: execute without violations.",
    // Backward-compatible fields
    summary: score >= 70
      ? "Solid trade execution with room to grow."
      : score >= 50
        ? "Mixed execution — some good, some needs work."
        : "This trade needs significant improvement.",
    grade: {
      score,
      reasoning: `Based on: ${scoreReasons.join(', ') || 'limited data'}. Not enough historical data to identify deeper patterns yet.`,
    },
    whatWentWell,
    mistakes,
    behavioralInsight: ["Not enough historical data to identify patterns yet."],
    actionItems: ["Keep tracking your trades to unlock personalized coaching insights."],
    coachNote: isProfitable
      ? "Good result — as you build more history, I'll be able to connect each trade to your larger patterns."
      : "Every trade is a data point. Keep logging and patterns will emerge.",
  };
}
