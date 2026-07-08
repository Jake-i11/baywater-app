/**
 * AI Pattern Interpretation
 *
 * Transforms raw statistical behavioral patterns into coaching insights.
 */

import { getOpenRouterClient } from "@/lib/ai/client";
import { AI_MODELS } from "@/lib/ai/models";
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

    // Use OpenRouter client
    const client = getOpenRouterClient();

    // Generate the interpretation using OpenRouter
    const response = await client.chat.completions.create({
      model: AI_MODELS.default,
      messages: [
        {
          role: "system",
          content: "You are an elite trading psychology coach. Respond only with valid JSON in the specified format."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 1000
    });

    const responseText = response.choices[0].message.content || '{}';
    const parsed = JSON.parse(responseText);

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