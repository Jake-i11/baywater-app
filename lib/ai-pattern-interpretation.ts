/**
 * AI Pattern Interpretation
 *
 * Transforms raw statistical behavioral patterns into coaching insights.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { BehavioralPattern } from "./discipline-engine";

export interface PatternInterpretation {
  what: string;
  whyItMatters: string;
  actionableImprovement: string;
}

/**
 * Send a detected behavioral pattern to the AI for interpretation.
 */
export async function interpretPattern(
  pattern: BehavioralPattern,
  userId: string
): Promise<PatternInterpretation> {
  try {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return fallbackInterpretation(pattern);
    }

    const prompt = `You are an elite trading psychology coach. Turn the following raw statistical pattern into a concise coaching insight.

PATTERN: ${pattern.title}
DESCRIPTION: ${pattern.description}
SAMPLE SIZE: ${pattern.sampleSize}
CONFIDENCE SCORE: ${pattern.confidenceScore}/100
ESTIMATED FINANCIAL IMPACT: $${pattern.estimatedFinancialImpact}

Respond ONLY with JSON:
{
  "what": "Plain-language explanation of what is happening",
  "whyItMatters": "Why this behavior is costing the trader",
  "actionableImprovement": "One specific, concrete action to fix it"
}`;

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text);
    if (!parsed.what || !parsed.whyItMatters || !parsed.actionableImprovement) {
      return fallbackInterpretation(pattern);
    }
    return parsed as PatternInterpretation;
  } catch (error) {
    console.error("Pattern interpretation failed:", error);
    return fallbackInterpretation(pattern);
  }
}

function fallbackInterpretation(pattern: BehavioralPattern): PatternInterpretation {
  return {
    what: pattern.description,
    whyItMatters: `This pattern has been detected across ${pattern.sampleSize} trades with a confidence of ${pattern.confidenceScore}%, costing an estimated $${pattern.estimatedFinancialImpact.toFixed(0)}.`,
    actionableImprovement: "Review this pattern before each trading session and pre-commit to the corrective behavior in writing.",
  };
}