/**
 * Gemini Pattern Coach API
 *
 * Server-side API endpoint for generating AI trading coaching insights
 * Uses existing Gemini integration and pattern analysis foundation
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generatePatternSummaryData } from '@/lib/pattern-analysis';
import { getOrCreateTraderProfile, updateTraderProfile, generateTraderProfileUpdate } from '@/lib/profile-utils';

/**
 * Generate AI coaching prompt with structured pattern data
 * @param patternData Pattern analysis results
 * @param userId User ID
 * @returns Formatted prompt for Gemini API
 */
function buildCoachingPrompt(patternData: any, userId: string, traderProfile: any): string {
  // Format evidence for each pattern category
  const formatEvidence = (items: any[]) => {
    return items.map(item => {
      const evidence = [];

      // Add common metrics
      if (item.trades) evidence.push(`Trades: ${item.trades}`);
      if (item.winRate) evidence.push(`Win rate: ${item.winRate}%`);
      if (item.totalPL) evidence.push(`Total P/L: $${item.totalPL.toFixed(2)}`);
      if (item.avgPL) evidence.push(`Avg P/L: $${item.avgPL.toFixed(2)}`);
      if (item.avgDisciplineScore) evidence.push(`Avg discipline: ${item.avgDisciplineScore}/100`);

      // Add specific metrics based on category
      if (item.setup) evidence.push(`Setup: ${item.setup}`);
      if (item.tier) evidence.push(`Market cap: ${item.tier} (${item.range})`);
      if (item.bucket) evidence.push(`Float: ${item.bucket} (${item.range})`);
      if (item.timeRange) evidence.push(`Time: ${item.timeRange}`);
      if (item.range && !item.timeRange) evidence.push(`Range: ${item.range}`);

      return evidence.join(' | ');
    }).join('\\n');
  };

  return `
You are an elite trading performance coach analyzing a trader's personal historical data with long-term memory.

DISCIPLINE CONFLUENCE CONTEXT (highest priority - behavioral leaks):
${patternData.biggestBehavioralLeaks?.length > 0 ? patternData.biggestBehavioralLeaks.map((l: any) => `- ${l.title}: ${l.description} (confidence ${l.confidenceScore}%, ~$${Math.abs(l.estimatedFinancialImpact)} cost, ${l.sampleSize} trades)`).join('\n') : 'No discipline patterns detected yet'}

FINANCIAL COST OF MISTAKES: ${patternData.financialCostOfMistakes != null ? '$' + patternData.financialCostOfMistakes : 'unknown'}
>>>>>>> PRIORITIZE the discipline confluence leaks above in every coaching response. Reference specific percentages and dollar amounts.
>>>>>>> Example good coaching: "You have lost $2,840 from overtrading after your first losing trade. This happened in 73% of your red days."
>>>>>>> Example bad coaching: "You should avoid overtrading."
>>>>>>> 
>>>>>>> 
You are an elite trading performance coach analyzing a trader's personal historical data with long-term memory.

IMPORTANT RULES:
1. Never make unsupported claims. Every insight must cite specific statistics.
2. Separate true edge from random short-term results.
3. Be specific about sample sizes and confidence levels.
4. Focus on process quality, not just outcomes.
5. Never invent insights - only analyze the provided data.
6. Reference the trader's history and patterns when relevant.
7. Act as a long-term coach who remembers this specific trader.

TRADER PROFILE CONTEXT:
${traderProfile ? `
- Trading Style: ${traderProfile.trading_style || 'Not yet established'}
- Preferred Setups: ${traderProfile.preferred_setups?.length > 0 ? traderProfile.preferred_setups.join(', ') : 'None identified'}
- Risk Profile: ${traderProfile.risk_profile || 'Not yet established'}
- Strengths: ${traderProfile.strengths?.length > 0 ? traderProfile.strengths.join(' | ') : 'None identified'}
- Recurring Mistakes: ${traderProfile.recurring_mistakes?.length > 0 ? traderProfile.recurring_mistakes.join(' | ') : 'None identified'}
- Behavioral Patterns: ${traderProfile.behavioral_patterns?.length > 0 ? traderProfile.behavioral_patterns.join(' | ') : 'None identified'}
- Current Focus Area: ${traderProfile.current_focus_area || 'Not yet established'}
- Total Trades Analyzed: ${traderProfile.total_trades_analyzed || 0}
` : 'No previous trading history available - establishing baseline'}

TRADE PATTERN ANALYSIS:

SETUP PERFORMANCE:
${patternData.bestSetups.length > 0 ? 'Best Setups:\\n' + formatEvidence(patternData.bestSetups) : 'No best setup data'}
${patternData.worstSetups.length > 0 ? '\\nWorst Setups:\\n' + formatEvidence(patternData.worstSetups) : '\\nNo worst setup data'}

MARKET CONDITIONS:
${patternData.marketCapPerformance.length > 0 ? 'Market Cap Performance:\\n' + formatEvidence(patternData.marketCapPerformance) : 'No market cap data'}
${patternData.floatPerformance.length > 0 ? '\\nFloat Performance:\\n' + formatEvidence(patternData.floatPerformance) : '\\nNo float data'}
${patternData.volumePerformance.length > 0 ? '\\nVolume Performance:\\n' + formatEvidence(patternData.volumePerformance) : '\\nNo volume data'}

TIMING:
${patternData.timePerformance.length > 0 ? 'Time of Day Performance:\\n' + formatEvidence(patternData.timePerformance) : 'No time data'}
${patternData.holdingPeriodPerformance.length > 0 ? '\\nHolding Period Performance:\\n' + formatEvidence(patternData.holdingPeriodPerformance) : '\\nNo holding period data'}

TICKERS:
${patternData.bestTickers.length > 0 ? 'Best Tickers:\\n' + formatEvidence(patternData.bestTickers) : 'No best ticker data'}
${patternData.worstTickers.length > 0 ? '\\nWorst Tickers:\\n' + formatEvidence(patternData.worstTickers) : '\\nNo worst ticker data'}

CONFIDENCE RULES:
- High confidence: 50+ trades
- Medium confidence: 20-49 trades
- Low confidence: 5-19 trades
- No confidence: <5 trades

RESPONSE FORMAT (JSON only, no additional text):
{
  "trading_identity": {
    "statement": "Concise description of trader's identity based on strongest patterns",
    "evidence": [
      {
        "metric": "Primary pattern",
        "value": "Supporting statistics"
      }
    ]
  },
  "core_edges": [
    {
      "edge": "Specific edge description",
      "why": "Explanation based on data",
      "supporting_stats": [
        "Stat 1",
        "Stat 2"
      ],
      "confidence": "High/Medium/Low"
    }
  ],
  "biggest_strengths": [
    {
      "strength": "Specific strength",
      "evidence": [
        "Supporting statistic 1",
        "Supporting statistic 2"
      ]
    }
  ],
  "biggest_leaks": [
    {
      "problem": "Specific weakness",
      "evidence": [
        "Supporting statistic 1",
        "Supporting statistic 2"
      ],
      "recommendation": "Actionable improvement suggestion"
    }
  ],
  "conditions_to_seek": [
    {
      "condition": "Specific condition to seek",
      "reason": "Why this condition works well",
      "stats": [
        "Supporting statistic 1",
        "Supporting statistic 2"
      ]
    }
  ],
  "conditions_to_avoid": [
    {
      "condition": "Specific condition to avoid",
      "reason": "Why this condition performs poorly",
      "stats": [
        "Supporting statistic 1",
        "Supporting statistic 2"
      ]
    }
  ],
  "next_focus": "Single most impactful improvement opportunity based on the data"
}`;
}

/**
 * Generate AI trading coaching insights
 * @param userId User ID
 * @returns Structured coaching insights
 */
export async function POST(request: Request) {
  try {
    const { user_id } = await request.json();

    if (!user_id) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Check if we have a recent coaching result cached in Supabase
    const { data: cachedCoaching, error: cacheError } = await supabase
      .from('coach_insights')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (cachedCoaching && cachedCoaching.length > 0 && !cacheError) {
      const cachedResult = cachedCoaching[0];
      const lastAnalyzed = new Date(cachedResult.created_at);

      // If cached result is less than 24 hours old, return it
      if (Date.now() - lastAnalyzed.getTime() < 24 * 60 * 60 * 1000) {
        return NextResponse.json({
          ...cachedResult,
          last_analyzed: lastAnalyzed.toISOString(),
          source: 'cache'
        });
      }
    }

    // Fetch user's trades
    const { data: trades, error: fetchError } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    if (fetchError || !trades) {
      console.error('Failed to fetch trades for coaching:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch trade data' },
        { status: 500 }
      );
    }

    if (trades.length < 10) {
      return NextResponse.json({
        message: 'Not enough trade data for coaching analysis',
        required_trades: 10,
        current_trades: trades.length,
        last_analyzed: null
      });
    }

    // Generate pattern statistics
    const patternData = await generatePatternSummaryData(user_id);

    // Enrich pattern data with discipline confluence analytics.
    try {
      const { getDisciplineAnalytics, loadDisciplineEvents, detectAndStorePatterns } = await import("@/lib/discipline-utils");
      const events = await loadDisciplineEvents(user_id);
      await detectAndStorePatterns(user_id, events);
      const discipline = await getDisciplineAnalytics(user_id);

      const { data: disciplinePatterns } = await supabase
        .from("behavior_patterns")
        .select("title, description, confidence_score, estimated_financial_impact, frequency")
        .eq("user_id", user_id)
        .order("last_occurrence", { ascending: false })
        .limit(10);

      (patternData as any).biggestBehavioralLeaks = (disciplinePatterns || []).map((p: any) => ({
        title: p.title ?? p.pattern_type,
        description: p.description ?? p.ai_summary,
        confidenceScore: p.confidence_score ?? 0,
        estimatedFinancialImpact: Number(p.estimated_financial_impact ?? 0),
        sampleSize: p.frequency ?? 0,
      }));
      (patternData as any).financialCostOfMistakes = discipline.financialCostOfMistakes;
    } catch (disciplineError) {
      console.error("Failed to enrich coach prompt with discipline data:", disciplineError);
      (patternData as any).biggestBehavioralLeaks = [];
      (patternData as any).financialCostOfMistakes = null;
    }

    // Get or create trader profile
    const traderProfile = await getOrCreateTraderProfile(user_id);

    // Build the coaching prompt with trader profile context
    const prompt = buildCoachingPrompt(patternData, user_id, traderProfile);

    // Generate AI coaching using Gemini
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      console.error('Gemini API key not configured');
      return NextResponse.json(
        { error: 'AI coaching service unavailable' },
        { status: 503 }
      );
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.3,
        maxOutputTokens: 2000
      }
    });

    // Generate the coaching insights
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text();

    // Parse the AI response
    let coachingInsights;
    try {
      const cleanedText = responseText.trim();
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        coachingInsights = JSON.parse(jsonMatch[0]);
      } else {
        coachingInsights = JSON.parse(cleanedText);
      }
    } catch (parseError) {
      console.error('Failed to parse AI coaching response:', parseError);
      return NextResponse.json(
        { error: 'Failed to process AI coaching response' },
        { status: 500 }
      );
    }

    // Store the coaching results in Supabase
    const { error: storeError } = await supabase
      .from('coach_insights')
      .insert([
        {
          user_id: user_id,
          trading_identity: coachingInsights.trading_identity,
          core_edges: coachingInsights.core_edges,
          strengths: coachingInsights.biggest_strengths,
          weaknesses: coachingInsights.biggest_leaks,
          conditions: {
            seek: coachingInsights.conditions_to_seek,
            avoid: coachingInsights.conditions_to_avoid
          },
          next_focus: coachingInsights.next_focus
        }
      ]);

    // Update trader profile based on this coaching session
    try {
      // Get recent trades for profile update
      const recentTrades = trades.slice(0, 20); // Use last 20 trades for profile update

      // Generate AI-powered profile update
      const profileUpdate = await generateTraderProfileUpdate(user_id, recentTrades, traderProfile);

      // Apply the profile update
      await updateTraderProfile(user_id, {
        trading_style: profileUpdate.updatedProfile.trading_style,
        preferred_setups: profileUpdate.updatedProfile.preferred_setups,
        risk_profile: profileUpdate.updatedProfile.risk_profile,
        strengths: profileUpdate.updatedProfile.strengths,
        recurring_mistakes: profileUpdate.updatedProfile.recurring_mistakes,
        behavioral_patterns: profileUpdate.updatedProfile.behavioral_patterns,
        current_focus_area: profileUpdate.updatedProfile.current_focus_area,
        coaching_notes: profileUpdate.updatedProfile.coaching_notes,
        total_trades_analyzed: profileUpdate.updatedProfile.total_trades_analyzed
      });

      console.log('Trader profile updated with changes:', profileUpdate.changesMade);
    } catch (profileUpdateError) {
      console.error('Failed to update trader profile:', profileUpdateError);
      // Continue even if profile update fails - don't break coaching
    }

    if (storeError) {
      console.error('Failed to store coaching insights:', storeError);
      // Continue even if storage fails
    }

    return NextResponse.json({
      ...coachingInsights,
      last_analyzed: new Date().toISOString(),
      trade_count: trades.length,
      source: 'fresh'
    });

  } catch (error) {
    console.error('Pattern coaching error:', error);
    return NextResponse.json(
      { error: 'Failed to generate coaching insights' },
      { status: 500 }
    );
  }
}

/**
 * Get cached coaching insights
 * @param userId User ID
 * @returns Cached coaching insights or null
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const user_id = searchParams.get('user_id');

    if (!user_id) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Fetch cached coaching results
    const { data: cachedCoaching, error } = await supabase
      .from('coach_insights')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !cachedCoaching || cachedCoaching.length === 0) {
      return NextResponse.json(
        { error: 'No coaching insights found' },
        { status: 404 }
      );
    }

    const result = cachedCoaching[0];
    return NextResponse.json({
      trading_identity: result.trading_identity,
      core_edges: result.core_edges,
      biggest_strengths: result.strengths,
      biggest_leaks: result.weaknesses,
      conditions_to_seek: result.conditions.seek,
      conditions_to_avoid: result.conditions.avoid,
      next_focus: result.next_focus,
      last_analyzed: result.created_at
    });

  } catch (error) {
    console.error('Failed to fetch coaching insights:', error);
    return NextResponse.json(
      { error: 'Failed to fetch coaching insights' },
      { status: 500 }
    );
  }
}