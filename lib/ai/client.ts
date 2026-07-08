/**
 * OpenRouter AI Client Configuration
 *
 * Centralized AI client setup using OpenRouter's OpenAI-compatible API.
 * All AI calls should use this client instead of direct Gemini/Google AI calls.
 */

import OpenAI from 'openai';

/**
 * Initialize OpenRouter client with proper configuration
 */
export function createOpenRouterClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OpenRouter API key not configured');
  }

  return new OpenAI({
    apiKey: apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    // OpenRouter requires headers to identify the application
    defaultHeaders: {
      'HTTP-Referer': process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:3000',
      'X-Title': 'Baywater Trading App',
    },
    // Note: OpenRouter uses standard OpenAI API format
    // Response format is controlled per-request
  });
}

/**
 * Get the singleton OpenRouter client instance
 */
let openRouterClient: OpenAI | null = null;

export function getOpenRouterClient(): OpenAI {
  if (!openRouterClient) {
    openRouterClient = createOpenRouterClient();
  }
  return openRouterClient;
}