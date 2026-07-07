/**
 * AI Trade Review System
 *
 * Server-side helper for generating AI-powered trade reviews using Gemini API
 * This system provides automated trading coaching and performance analysis
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

interface TradeData {
  ticker: string;
  direction: string;
  entry_price: number | string;
  exit_price: number | string | null;
  entry_time: string;
  exit_time: string | null;
  size: number | string;
  realized_pl: number | null;
  discipline_score: number;
  violations: string[];
  float_shares?: number | null;
  market_cap?: number | null;
  sector?: string | null;
  relative_volume?: number | null;
  day_volume?: number | null;
  avg_volume?: number | null;
}

interface AIReview {
  summary: string;
  mistakes: string[];
  strengths: string[];
  confidence: number;
  setup_quality: number;
  emotion_detected: string;
  lesson: string;
  replay: string;
  trade_grade?: string;
}

/**
 * Build a comprehensive prompt for the AI trade review
 * @param trade Complete trade data with market context
 * @returns Formatted prompt string for Gemini API
 */
export function buildTradePrompt(trade: TradeData): string {
  // Format violations for the prompt
  const violationsText = trade.violations.length > 0
    ? trade.violations.join(', ')
    : 'None';

  // Format market data
  const marketData = [
    trade.float_shares ? `Float: ${trade.float_shares.toLocaleString()} shares` : '',
    trade.market_cap ? `Market Cap: $${(trade.market_cap / 1000000000).toFixed(1)}B` : '',
    trade.sector ? `Sector: ${trade.sector}` : '',
    trade.relative_volume ? `Relative Volume: ${trade.relative_volume.toFixed(2)}x` : '',
    trade.day_volume ? `Day Volume: ${trade.day_volume.toLocaleString()}` : ''
  ].filter(Boolean).join(' | ');

  // Calculate P/L percentage if possible
  const entryPrice = typeof trade.entry_price === 'string' ? parseFloat(trade.entry_price) : trade.entry_price;
  const exitPrice = trade.exit_price ? (typeof trade.exit_price === 'string' ? parseFloat(trade.exit_price) : trade.exit_price) : null;
  const size = typeof trade.size === 'string' ? parseFloat(trade.size) : trade.size;
  const plPercentage = entryPrice && exitPrice && size && trade.realized_pl
    ? ((trade.realized_pl / (entryPrice * size)) * 100).toFixed(1)
    : null;

  return `
You are an elite trading performance coach analyzing a completed trade.

TRADE DETAILS:
- Ticker: ${trade.ticker}
- Direction: ${trade.direction.toUpperCase()}
- Entry: $${entryPrice?.toFixed(2)} at ${new Date(trade.entry_time).toLocaleTimeString()}
- Exit: ${exitPrice ? `$${exitPrice.toFixed(2)} at ${new Date(trade.exit_time || '').toLocaleTimeString()}` : 'Open Position'}
- Size: ${size?.toLocaleString()} shares
- Realized P/L: $${trade.realized_pl?.toFixed(2)} ${plPercentage ? `(${plPercentage}%)` : ''}
- Discipline Score: ${trade.discipline_score}/100
- Violations: ${violationsText}
- Market Data: ${marketData || 'Not available'}

ANALYSIS GUIDELINES:
1. Separate process from outcome. A winning trade with violations is still a bad trade.
2. Focus on execution quality, risk management, and rule adherence.
3. Be specific about what the trader did well and what needs improvement.
4. For dangerous wins (profitable trades with violations), explicitly call them out.
5. Keep responses concise (150-250 words total).
6. Write the replay as if you're watching the trade unfold in real-time.
7. Never mention future candles or information the trader couldn't have known at that moment.
8. Analyze only information available at each specific time during the trade.
9. Mention violations clearly and specifically when they occur.
10. Evaluate whether the setup matched historical conditions for the stock.

REPLAY FORMAT:
The replay should be a chronological narrative with timestamps. Example:
"9:30 AM: Market opens with elevated volume
9:34 AM: You enter short position after initial spike
9:39 AM: Buyers begin slowing as price drops
9:41 AM: You cover into weakness, capturing most of the move"

RESPONSE FORMAT (JSON only, no additional text):
{
  "summary": "Brief overall assessment of the trade",
  "mistakes": ["Specific execution errors", "Rule violations", "Risk management issues"],
  "strengths": ["What was done well", "Good decisions", "Proper execution"],
  "confidence": 75, // Your confidence in this assessment (0-100)
  "setup_quality": 68, // Quality of the trade setup (0-100)
  "emotion_detected": "Likely emotional state during trade",
  "lesson": "Key takeaway for improvement",
  "replay": "Real-time narrative of the trade execution with timestamps",
  "trade_grade": "A-F" // Based on rule adherence, execution quality, risk management, NOT just P/L
}

IMPORTANT: The replay should read like you're watching the trade happen live. Describe what you see as it unfolds. Do NOT mention future candles or information the trader couldn't have known at the time. Each line should have a timestamp and describe only what's happening at that moment.
`;
}

/**
 * Parse AI response and validate structure
 * @param responseText Raw response from Gemini API
 * @returns Parsed AIReview object or null if parsing fails
 */
export function parseAIResponse(responseText: string): AIReview | null {
  try {
    // Clean up the response text
    const cleanedText = responseText.trim();

    // Try to extract JSON (Gemini sometimes adds markdown)
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('No JSON found in AI response');
      return null;
    }

    const jsonStr = jsonMatch[0];

    // Parse JSON
    const parsed = JSON.parse(jsonStr);

    // Validate required fields
    if (!parsed.summary || !parsed.mistakes || !parsed.strengths ||
        parsed.confidence === undefined || parsed.setup_quality === undefined ||
        !parsed.emotion_detected || !parsed.lesson || !parsed.replay) {
      console.warn('AI response missing required fields');
      return null;
    }

    // Ensure arrays
    if (!Array.isArray(parsed.mistakes)) parsed.mistakes = [parsed.mistakes];
    if (!Array.isArray(parsed.strengths)) parsed.strengths = [parsed.strengths];

    // Validate ranges
    parsed.confidence = Math.max(0, Math.min(100, parsed.confidence));
    parsed.setup_quality = Math.max(0, Math.min(100, parsed.setup_quality));

    return {
      summary: parsed.summary,
      mistakes: parsed.mistakes,
      strengths: parsed.strengths,
      confidence: parsed.confidence,
      setup_quality: parsed.setup_quality,
      emotion_detected: parsed.emotion_detected,
      lesson: parsed.lesson,
      replay: parsed.replay,
      trade_grade: parsed.trade_grade || undefined
    };

  } catch (error) {
    console.error('Failed to parse AI response:', error);
    return null;
  }
}

/**
 * Generate AI review for a completed trade
 * @param trade Complete trade data with market context
 * @returns AI review object or null if generation fails
 */
export async function generateTradeReview(trade: TradeData): Promise<AIReview | null> {
  try {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      console.warn('Gemini API key not configured');
      return null;
    }

    // Build the prompt
    const prompt = buildTradePrompt(trade);

    // Initialize Gemini client
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.3, // More deterministic responses
        maxOutputTokens: 1000
      }
    });

    // Generate the review
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text();

    // Parse the response
    const review = parseAIResponse(responseText);

    if (!review) {
      console.warn('Failed to generate valid AI review');
      return null;
    }

    return review;

  } catch (error) {
    console.error('AI review generation error:', error);
    return null; // Never throw, fail gracefully
  }
}