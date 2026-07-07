import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getOrCreateTraderProfile, updateTraderProfile, generateTraderProfileUpdate } from '@/lib/profile-utils';

interface TradeData {
  id: string;
  ticker: string;
  direction: string;
  entry: string;
  exit: string | null;
  size: string;
  entry_time: string;
  exit_time: string | null;
  realized_pl: string | null;
  violations: string;
  float_shares: number | null;
  market_cap: number | null;
  sector: string | null;
  relative_volume: number | null;
}

interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface ReplayEvent {
  timestamp: string;
  title: string;
  description: string;
}

interface ReplayAnalysis {
  replay_events: ReplayEvent[];
  setup_type: string;
  setup_confidence: number;
  decision_quality: {
    entry_score: number;
    exit_score: number;
    risk_score: number;
    overall_grade: string;
  };
  decision_vs_outcome: string;
  mistakes: string[];
  strengths: string[];
  lesson: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tradeId = searchParams.get('tradeId');

  if (!tradeId) {
    return NextResponse.json({ error: 'tradeId is required' }, { status: 400 });
  }

  try {
    // Fetch trade data from Supabase
    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .single();

    if (tradeError || !trade) {
      console.error('Failed to fetch trade:', tradeError);
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    // Fetch chart data for the trade
    const chartResponse = await fetch(`${process.env.NEXTAUTH_URL}/api/chart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ticker: trade.ticker,
        startTime: new Date(trade.entry_time).toISOString(),
        endTime: trade.exit_time || new Date(Date.now() + 3600000).toISOString(),
      }),
    });

    if (!chartResponse.ok) {
      console.error('Failed to fetch chart data');
      return NextResponse.json({ error: 'Failed to fetch chart data' }, { status: 500 });
    }

    const chartData = await chartResponse.json();
    const candles: CandleData[] = chartData.candles || [];

    // Get trader profile for personalized analysis
    const traderProfile = await getOrCreateTraderProfile(trade.user_id);

    // Generate replay analysis using Gemini with trader profile context
    const analysis = await generateReplayAnalysis(trade, candles, traderProfile);

    // Update trader profile based on this trade analysis
    try {
      const profileUpdate = await generateTraderProfileUpdate(trade.user_id, [trade], traderProfile);

      await updateTraderProfile(trade.user_id, {
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

      console.log('Trader profile updated from replay analysis:', profileUpdate.changesMade);
    } catch (profileUpdateError) {
      console.error('Failed to update trader profile from replay analysis:', profileUpdateError);
      // Continue even if profile update fails
    }

    return NextResponse.json(analysis);

  } catch (error) {
    console.error('Replay analysis error:', error);
    return NextResponse.json({ error: 'Failed to generate replay analysis' }, { status: 500 });
  }
}

async function generateReplayAnalysis(trade: TradeData, candles: CandleData[], traderProfile: any = null): Promise<ReplayAnalysis> {
  try {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      throw new Error('Gemini API key not configured');
    }

    // Parse trade data
    const entryPrice = parseFloat(trade.entry);
    const exitPrice = trade.exit ? parseFloat(trade.exit) : null;
    const size = parseFloat(trade.size);
    const realizedPl = trade.realized_pl ? parseFloat(trade.realized_pl) : null;
    const violations = trade.violations ? JSON.parse(trade.violations) : [];

    // Calculate P/L percentage
    const plPercentage = entryPrice && exitPrice && size && realizedPl
      ? ((realizedPl / (entryPrice * size)) * 100).toFixed(1)
      : null;

    // Format candle data for AI analysis
    const candleAnalysis = candles.slice(0, 20).map((candle, index) => {
      const time = new Date(candle.time);
      return `
Candle ${index + 1} (${time.toLocaleTimeString()}):
- Open: $${candle.open.toFixed(2)}
- High: $${candle.high.toFixed(2)}
- Low: $${candle.low.toFixed(2)}
- Close: $${candle.close.toFixed(2)}
- Volume: ${candle.volume ? candle.volume.toLocaleString() : 'N/A'}`;
    }).join('\n\n');

    // Build comprehensive prompt for Gemini
    const prompt = `
You are an elite trading performance coach analyzing a completed trade with full candle-by-candle data and long-term memory of this trader.

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

TRADE DETAILS:
- Ticker: ${trade.ticker}
- Direction: ${trade.direction.toUpperCase()}
- Entry: $${entryPrice.toFixed(2)} at ${new Date(trade.entry_time).toLocaleTimeString()}
- Exit: ${exitPrice ? `$${exitPrice.toFixed(2)} at ${new Date(trade.exit_time || '').toLocaleTimeString()}` : 'Open Position'}
- Size: ${size.toLocaleString()} shares
- Realized P/L: $${realizedPl?.toFixed(2)} ${plPercentage ? `(${plPercentage}%)` : ''}
- Violations: ${violations.length > 0 ? violations.join(', ') : 'None'}

MARKET CONTEXT:
- Float: ${trade.float_shares ? `${(trade.float_shares / 1000000).toFixed(1)}M shares` : 'Unavailable'}
- Market Cap: ${trade.market_cap ? `$${(trade.market_cap / 1000000000).toFixed(1)}B` : 'Unavailable'}
- Sector: ${trade.sector || 'Unavailable'}
- Relative Volume: ${trade.relative_volume ? `${trade.relative_volume.toFixed(1)}x` : 'Unavailable'}

CANDLE-BY-CANDLE ANALYSIS:
${candleAnalysis}

ANALYSIS REQUIREMENTS:
1. Analyze the trade candle by candle as it unfolds
2. Never mention future candles before they occur
3. Identify key market structure elements (opening range, volume changes, momentum shifts)
4. Evaluate entry and exit decisions based on available information at the time
5. Classify the setup type and confidence level
6. Score decision quality (entry, exit, risk management)
7. Separate process from outcome - a winning trade with violations is still a bad trade
8. Be specific about what the trader did well and what needs improvement
9. Reference the trader's historical patterns and recurring issues when relevant
10. Provide a clear, actionable lesson that builds on their current focus area

RESPONSE FORMAT (JSON only, no additional text):
{
  "replay_events": [
    {
      "timestamp": "YYYY-MM-DDTHH:MM:SSZ",
      "title": "Event Title",
      "description": "Detailed analysis of what happened at this moment"
    }
  ],
  "setup_type": "Low Float Momentum Short|Breakout Long|VWAP Reclaim|Gap and Go|Mean Reversion|Failed Breakout|Unclassified",
  "setup_confidence": 75,
  "decision_quality": {
    "entry_score": 80,
    "exit_score": 70,
    "risk_score": 65,
    "overall_grade": "B+"
  },
  "decision_vs_outcome": "Good decision with positive outcome|Poor decision with lucky outcome|Good decision with negative outcome|Poor decision with expected negative outcome",
  "mistakes": ["Specific execution errors", "Rule violations"],
  "strengths": ["What was done well", "Good decisions"],
  "lesson": "Key takeaway for improvement"
}

IMPORTANT: Each replay event must have a timestamp matching the candle times. Analyze only information available at each specific moment. Be precise about market structure and price action.
`;

    // Initialize Gemini client
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.3,
        maxOutputTokens: 2000
      }
    });

    // Generate the analysis
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text();

    // Parse and validate the response
    try {
      const parsed = JSON.parse(responseText);

      // Validate required fields
      if (!parsed.replay_events || !Array.isArray(parsed.replay_events) ||
          !parsed.setup_type || parsed.setup_confidence === undefined ||
          !parsed.decision_quality || !parsed.decision_vs_outcome ||
          !parsed.mistakes || !parsed.strengths || !parsed.lesson) {
        throw new Error('Invalid AI response format');
      }

      // Ensure arrays
      if (!Array.isArray(parsed.mistakes)) parsed.mistakes = [parsed.mistakes];
      if (!Array.isArray(parsed.strengths)) parsed.strengths = [parsed.strengths];

      // Validate scores
      parsed.setup_confidence = Math.max(0, Math.min(100, parsed.setup_confidence));
      parsed.decision_quality.entry_score = Math.max(0, Math.min(100, parsed.decision_quality.entry_score));
      parsed.decision_quality.exit_score = Math.max(0, Math.min(100, parsed.decision_quality.exit_score));
      parsed.decision_quality.risk_score = Math.max(0, Math.min(100, parsed.decision_quality.risk_score));

      return parsed;

    } catch (error) {
      console.error('Failed to parse AI response:', error);
      throw new Error('Failed to generate valid replay analysis');
    }

  } catch (error) {
    console.error('Replay analysis generation error:', error);
    throw new Error('Failed to generate replay analysis');
  }
}