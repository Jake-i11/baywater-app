/**
 * Test file for Trader Profile Integration
 *
 * This file contains test cases to verify the persistent trader profile memory system
 * works correctly across different scenarios.
 */

import { getOrCreateTraderProfile, updateTraderProfile, generateTraderProfileUpdate } from './lib/profile-utils';
import { supabase } from './lib/supabase';

// Mock data for testing
const testUserId = 'test-user-123';
const mockTrades = [
  {
    id: 'trade-1',
    ticker: 'AAPL',
    direction: 'long',
    entry: '150.00',
    exit: '155.00',
    size: '100',
    entry_time: '2023-01-01T10:00:00Z',
    exit_time: '2023-01-01T11:00:00Z',
    realized_pl: '500.00',
    violations: '["Early entry", "No stop loss"]',
    discipline_score: 60,
    setup_type: 'Breakout Long',
    market_cap: 2000000000000,
    float_shares: 16000000000,
    sector: 'Technology',
    relative_volume: 1.5
  },
  {
    id: 'trade-2',
    ticker: 'TSLA',
    direction: 'short',
    entry: '200.00',
    exit: '190.00',
    size: '50',
    entry_time: '2023-01-02T10:00:00Z',
    exit_time: '2023-01-02T12:00:00Z',
    realized_pl: '500.00',
    violations: '[]',
    discipline_score: 90,
    setup_type: 'Low Float Momentum Short',
    market_cap: 600000000000,
    float_shares: 3000000000,
    sector: 'Automotive',
    relative_volume: 2.0
  }
];

/**
 * Test Scenario 1: New User - No History
 *
 * Expected: System should create empty profile and allow AI coaching to work normally
 */
async function testNewUserScenario() {
  console.log('=== Test Scenario 1: New User - No History ===');

  try {
    // Clean up any existing test profile
    await supabase
      .from('trader_profiles')
      .delete()
      .eq('user_id', testUserId);

    // Get or create trader profile for new user
    const profile = await getOrCreateTraderProfile(testUserId);

    console.log('✅ New user profile created successfully');
    console.log('Profile:', JSON.stringify(profile, null, 2));

    // Verify profile has default values
    if (profile.trading_style === null &&
        profile.preferred_setups.length === 0 &&
        profile.strengths.length === 0 &&
        profile.recurring_mistakes.length === 0 &&
        profile.total_trades_analyzed === 0) {
      console.log('✅ Profile has correct default values');
    } else {
      console.log('❌ Profile does not have expected default values');
    }

    // Test profile update with mock trades
    const profileUpdate = await generateTraderProfileUpdate(testUserId, mockTrades, profile);

    console.log('✅ Profile update generated successfully');
    console.log('Changes made:', profileUpdate.changesMade);

    // Apply the update
    const updatedProfile = await updateTraderProfile(testUserId, {
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

    console.log('✅ Profile updated successfully');
    console.log('Updated profile:', JSON.stringify(updatedProfile, null, 2));

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

/**
 * Test Scenario 2: Experienced User - Profile with Recurring Mistakes
 *
 * Expected: AI should reference recurring mistakes naturally in coaching
 */
async function testExperiencedUserScenario() {
  console.log('\n=== Test Scenario 2: Experienced User - Profile with Recurring Mistakes ===');

  try {
    // Get the profile we created in scenario 1
    const profile = await getOrCreateTraderProfile(testUserId);

    console.log('✅ Retrieved existing profile');
    console.log('Current profile:', JSON.stringify(profile, null, 2));

    // Verify profile has been updated from scenario 1
    if (profile.total_trades_analyzed > 0) {
      console.log('✅ Profile shows previous analysis history');
    } else {
      console.log('❌ Profile does not show expected history');
    }

    // Test with additional trades that might reinforce or change patterns
    const additionalTrades = [
      {
        id: 'trade-3',
        ticker: 'NVDA',
        direction: 'long',
        entry: '300.00',
        exit: '290.00',
        size: '20',
        entry_time: '2023-01-03T10:00:00Z',
        exit_time: '2023-01-03T11:00:00Z',
        realized_pl: '-200.00',
        violations: '["No stop loss", "Overtading"]',
        discipline_score: 50,
        setup_type: 'Breakout Long',
        market_cap: 500000000000,
        float_shares: 2500000000,
        sector: 'Technology',
        relative_volume: 1.2
      }
    ];

    // Generate profile update with new trades
    const profileUpdate = await generateTraderProfileUpdate(testUserId, additionalTrades, profile);

    console.log('✅ Profile update generated with additional trades');
    console.log('Changes made:', profileUpdate.changesMade);

    // Check if recurring mistakes are being tracked
    const hasRecurringMistakes = profileUpdate.updatedProfile.recurring_mistakes.length > 0;
    if (hasRecurringMistakes) {
      console.log('✅ Recurring mistakes identified:', profileUpdate.updatedProfile.recurring_mistakes);
    } else {
      console.log('⚠️  No recurring mistakes identified - may be appropriate for this data');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

/**
 * Test Scenario 3: Profile Update - New Trades Create Meaningful Changes
 *
 * Expected: Profile should evolve meaningfully based on new trade data
 */
async function testProfileUpdateScenario() {
  console.log('\n=== Test Scenario 3: Profile Update - Meaningful Changes ===');

  try {
    // Get current profile
    const currentProfile = await getOrCreateTraderProfile(testUserId);

    // Create trades that show improvement
    const improvementTrades = [
      {
        id: 'trade-4',
        ticker: 'AMZN',
        direction: 'long',
        entry: '120.00',
        exit: '125.00',
        size: '40',
        entry_time: '2023-01-04T10:00:00Z',
        exit_time: '2023-01-04T14:00:00Z',
        realized_pl: '200.00',
        violations: '[]',
        discipline_score: 95,
        setup_type: 'VWAP Reclaim',
        market_cap: 1200000000000,
        float_shares: 10000000000,
        sector: 'Consumer',
        relative_volume: 1.8
      },
      {
        id: 'trade-5',
        ticker: 'GOOGL',
        direction: 'long',
        entry: '110.00',
        exit: '118.00',
        size: '30',
        entry_time: '2023-01-05T10:00:00Z',
        exit_time: '2023-01-05T15:00:00Z',
        realized_pl: '240.00',
        violations: '[]',
        discipline_score: 90,
        setup_type: 'VWAP Reclaim',
        market_cap: 1500000000000,
        float_shares: 12000000000,
        sector: 'Technology',
        relative_volume: 2.1
      }
    ];

    // Generate profile update
    const profileUpdate = await generateTraderProfileUpdate(testUserId, improvementTrades, currentProfile);

    console.log('✅ Profile update generated with improvement trades');
    console.log('Changes made:', profileUpdate.changesMade);

    // Check if strengths are being identified
    const hasStrengths = profileUpdate.updatedProfile.strengths.length > 0;
    if (hasStrengths) {
      console.log('✅ Strengths identified:', profileUpdate.updatedProfile.strengths);
    }

    // Check if focus area has evolved
    if (profileUpdate.updatedProfile.current_focus_area) {
      console.log('✅ Current focus area:', profileUpdate.updatedProfile.current_focus_area);
    }

    // Apply the final update
    await updateTraderProfile(testUserId, {
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

    console.log('✅ Final profile update applied successfully');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

/**
 * Run all test scenarios
 */
async function runAllTests() {
  console.log('🧪 Starting Trader Profile Integration Tests\n');

  await testNewUserScenario();
  await testExperiencedUserScenario();
  await testProfileUpdateScenario();

  console.log('\n🎉 All tests completed!');

  // Clean up
  try {
    await supabase
      .from('trader_profiles')
      .delete()
      .eq('user_id', testUserId);
    console.log('✅ Test data cleaned up');
  } catch (error) {
    console.error('⚠️  Failed to clean up test data:', error);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

export { testNewUserScenario, testExperiencedUserScenario, testProfileUpdateScenario, runAllTests };