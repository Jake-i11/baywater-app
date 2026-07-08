/**
 * Profile Utilities
 *
 * Helper functions for managing user profiles, onboarding status, and trader profiles
 */
import { supabase } from "@/lib/supabase";
import { getOpenRouterClient } from "@/lib/ai/client";
import { AI_MODELS } from "@/lib/ai/models";

/**
 * Get or create a user profile
 * @param userId User ID
 * @returns Profile data
 */
export async function getOrCreateProfile(userId: string) {
  try {
    // Check if profile exists
    const { data: existingProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error fetching profile:', fetchError);
      throw fetchError;
    }

    // If profile exists, return it
    if (existingProfile) {
      return existingProfile;
    }

    // Create new profile
    const { data: newProfile, error: createError } = await supabase
      .from('profiles')
      .insert([
        {
          user_id: userId,
          onboarding_completed: false
        }
      ])
      .select()
      .single();

    if (createError) {
      console.error('Error creating profile:', createError);
      throw createError;
    }

    return newProfile;

  } catch (error) {
    console.error('Profile operation error:', error);
    throw error;
  }
}

/**
 * Update user profile
 * @param userId User ID
 * @param updates Profile updates
 * @returns Updated profile data
 */
export async function updateProfile(userId: string, updates: { onboarding_completed?: boolean }) {
  try {
    const { data: updatedProfile, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      throw error;
    }

    return updatedProfile;

  } catch (error) {
    console.error('Profile update error:', error);
    throw error;
  }
}

/**
 * Check if user has completed onboarding
 * @param userId User ID
 * @returns Promise with onboarding status
 */
export async function hasCompletedOnboarding(userId: string): Promise<boolean> {
  try {
    const profile = await getOrCreateProfile(userId);
    return profile.onboarding_completed || false;
  } catch (error) {
    console.error('Error checking onboarding status:', error);
    return false;
  }
}

/**
 * Mark onboarding as completed
 * @param userId User ID
 * @returns Promise that resolves when complete
 */
export async function completeOnboarding(userId: string): Promise<void> {
  try {
    await updateProfile(userId, { onboarding_completed: true });
  } catch (error) {
    console.error('Error completing onboarding:', error);
    throw error;
  }
}

/**
 * Get or create a trader profile for AI coaching memory
 * @param userId User ID
 * @returns Trader profile data
 */
export async function getOrCreateTraderProfile(userId: string) {
  try {
    // Check if trader profile exists
    const { data: existingProfile, error: fetchError } = await supabase
      .from('trader_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error fetching trader profile:', fetchError);
      throw fetchError;
    }

    // If profile exists, return it
    if (existingProfile) {
      return existingProfile;
    }

    // Create new trader profile with default values
    const { data: newProfile, error: createError } = await supabase
      .from('trader_profiles')
      .insert([
        {
          user_id: userId,
          trading_style: null,
          preferred_setups: [],
          risk_profile: null,
          strengths: [],
          recurring_mistakes: [],
          behavioral_patterns: [],
          current_focus_area: null,
          coaching_notes: null,
          total_trades_analyzed: 0
        }
      ])
      .select()
      .single();

    if (createError) {
      console.error('Error creating trader profile:', createError);
      throw createError;
    }

    return newProfile;

  } catch (error) {
    console.error('Trader profile operation error:', error);
    throw error;
  }
}

/**
 * Update trader profile
 * @param userId User ID
 * @param updates Profile updates
 * @returns Updated trader profile data
 */
export async function updateTraderProfile(userId: string, updates: {
  trading_style?: string | null;
  preferred_setups?: string[] | null;
  risk_profile?: string | null;
  strengths?: string[] | null;
  recurring_mistakes?: string[] | null;
  behavioral_patterns?: string[] | null;
  current_focus_area?: string | null;
  coaching_notes?: string | null;
  total_trades_analyzed?: number | null;
}) {
  try {
    const { data: updatedProfile, error } = await supabase
      .from('trader_profiles')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating trader profile:', error);
      throw error;
    }

    return updatedProfile;

  } catch (error) {
    console.error('Trader profile update error:', error);
    throw error;
  }
}

/**
 * Generate AI-powered trader profile update
 * @param userId User ID
 * @param recentTrades Recent trades to analyze
 * @param previousProfile Previous trader profile (if available)
 * @returns Updated trader profile data
 */
export async function generateTraderProfileUpdate(userId: string, recentTrades: any[], previousProfile: any = null) {
  try {
    // No need to check GEMINI_API_KEY anymore

    // Build context for AI analysis
    const context = {
      userId,
      recentTrades,
      previousProfile: previousProfile || {
        trading_style: null,
        preferred_setups: [],
        risk_profile: null,
        strengths: [],
        recurring_mistakes: [],
        behavioral_patterns: [],
        current_focus_area: null,
        coaching_notes: null,
        total_trades_analyzed: 0
      }
    };

    // Build AI prompt for profile evolution
    const prompt = `
You are an elite trading performance coach analyzing a trader's behavior and patterns to evolve their persistent profile.

ANALYSIS CONTEXT:
- User ID: ${userId}
- Number of trades to analyze: ${recentTrades.length}
- Previous profile exists: ${previousProfile !== null}

RECENT TRADES SUMMARY:
${recentTrades.map((trade, index) => {
  const violations = Array.isArray(trade.violations) ? trade.violations : JSON.parse(trade.violations || "[]");
  return `
Trade ${index + 1}:
- Ticker: ${trade.ticker}
- Direction: ${trade.direction}
- Entry: $${parseFloat(trade.entry).toFixed(2)}
- Exit: ${trade.exit ? '$' + parseFloat(trade.exit).toFixed(2) : 'Open'}
- P/L: ${trade.realized_pl ? '$' + parseFloat(trade.realized_pl).toFixed(2) : 'Open'}
- Discipline Score: ${trade.discipline_score || 100}/100
- Violations: ${violations.length > 0 ? violations.join(', ') : 'None'}
- Setup: ${trade.setup_type || 'Unclassified'}`;
}).join('\n')}

PREVIOUS PROFILE (if available):
${previousProfile ? `
- Trading Style: ${previousProfile.trading_style || 'Not established'}
- Preferred Setups: ${previousProfile.preferred_setups?.length > 0 ? previousProfile.preferred_setups.join(', ') : 'None identified'}
- Risk Profile: ${previousProfile.risk_profile || 'Not established'}
- Strengths: ${previousProfile.strengths?.length > 0 ? previousProfile.strengths.join(' | ') : 'None identified'}
- Recurring Mistakes: ${previousProfile.recurring_mistakes?.length > 0 ? previousProfile.recurring_mistakes.join(' | ') : 'None identified'}
- Behavioral Patterns: ${previousProfile.behavioral_patterns?.length > 0 ? previousProfile.behavioral_patterns.join(' | ') : 'None identified'}
- Current Focus Area: ${previousProfile.current_focus_area || 'Not established'}
- Total Trades Analyzed: ${previousProfile.total_trades_analyzed || 0}
` : 'No previous profile available - this is the first analysis'}

ANALYSIS INSTRUCTIONS:
1. Analyze the recent trades for patterns, strengths, and weaknesses
2. Compare with previous profile (if available) to identify evolution
3. Only update profile elements when there is clear evidence from the data
4. Preserve useful historical information
5. Focus on actionable insights that help the trader improve
6. Be specific about behavioral patterns and recurring issues
7. Identify meaningful focus areas for improvement

RESPONSE FORMAT (JSON only, no additional text):
{
  "updatedProfile": {
    "trading_style": "Concise description of trading style based on data",
    "preferred_setups": ["Setup 1", "Setup 2"],
    "risk_profile": "Description of risk tolerance and management style",
    "strengths": ["Strength 1 with evidence", "Strength 2 with evidence"],
    "recurring_mistakes": ["Mistake 1 with evidence", "Mistake 2 with evidence"],
    "behavioral_patterns": ["Pattern 1 with evidence", "Pattern 2 with evidence"],
    "current_focus_area": "Single most impactful area for improvement",
    "coaching_notes": "Detailed observations and recommendations",
    "total_trades_analyzed": ${context.previousProfile.total_trades_analyzed + recentTrades.length}
  },
  "changesMade": [
    "Description of change 1",
    "Description of change 2"
  ]
}

IMPORTANT RULES:
- Only make changes supported by clear evidence in the trade data
- Preserve existing accurate information from previous profile
- Focus on actionable, specific insights
- Use concrete examples from the trades when possible
- If no meaningful changes are needed, return empty changesMade array
`;

    // Use OpenRouter client
    const client = getOpenRouterClient();

    // Generate the profile update using OpenRouter
    const response = await client.chat.completions.create({
      model: AI_MODELS.default,
      messages: [
        {
          role: "system",
          content: "You are an elite trading performance coach. Respond only with valid JSON in the specified format."
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

    // Get the response text
    const responseText = response.choices[0].message.content || '{}';

    // Parse and validate the response
    try {
      const parsed = JSON.parse(responseText);

      // Validate required fields
      if (!parsed.updatedProfile || !parsed.changesMade) {
        throw new Error('Invalid AI response format');
      }

      // Ensure arrays
      if (!Array.isArray(parsed.updatedProfile.preferred_setups)) {
        parsed.updatedProfile.preferred_setups = [];
      }
      if (!Array.isArray(parsed.updatedProfile.strengths)) {
        parsed.updatedProfile.strengths = [];
      }
      if (!Array.isArray(parsed.updatedProfile.recurring_mistakes)) {
        parsed.updatedProfile.recurring_mistakes = [];
      }
      if (!Array.isArray(parsed.updatedProfile.behavioral_patterns)) {
        parsed.updatedProfile.behavioral_patterns = [];
      }
      if (!Array.isArray(parsed.changesMade)) {
        parsed.changesMade = [];
      }

      return parsed;

    } catch (error) {
      console.error('Failed to parse AI profile update response:', error);
      throw new Error('Failed to generate valid profile update');
    }

  } catch (error) {
    console.error('Trader profile update generation error:', error);
    throw error;
  }
}
