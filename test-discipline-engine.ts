/**
 * Discipline Confluence Engine - Tests
 *
 * Run with: npx ts-node test-discipline-engine.ts
 */

// @ts-nocheck
import { DisciplineEvent, BehavioralPattern, PatternDetectionEngine, DisciplineContextAnalyzer } from "./lib/discipline-engine";
import { interpretPattern } from "./lib/ai-pattern-interpretation";

let pass = 0;
let fail = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
    console.log(`  PASS: ${msg}`);
  } else {
    fail++;
    console.error(`  FAIL: ${msg}`);
  }
}

function makeEvent(overrides: Partial<DisciplineEvent>): DisciplineEvent {
  return {
    userId: "test-user",
    tradeId: "trade-" + Math.random().toString(36).slice(2),
    violationType: "stop_loss_violation",
    severity: 7,
    financialImpact: -150,
    timestamp: new Date(),
    ticker: "AAPL",
    setupType: "breakout",
    dayOfWeek: "Friday",
    timeOfDay: "afternoon",
    marketSession: "regular",
    previousTradeResult: "loss" as const,
    consecutiveWins: 0,
    consecutiveLosses: 2,
    dailyPLBeforeTrade: -300,
    positionSize: 200,
    plannedRisk: 100,
    actualRisk: 200,
    ...overrides,
  };
}

console.log("\n=== Test 1: Friday + consecutive losses produces a detected pattern ===");
{
  const events: DisciplineEvent[] = [];
  for (let i = 0; i < 10; i++) {
    events.push(makeEvent({ consecutiveLosses: 2 + (i % 3), dayOfWeek: "Friday" }));
  }
  const engine = new PatternDetectionEngine();
  const patterns = engine.detectPatterns(events, "test-user");
  const fridayPattern = patterns.find(p => p.patternType === "day_of_week_consecutive_losses");
  assert(!!fridayPattern, "A Friday + losses pattern was detected");
  assert(!!fridayPattern && fridayPattern.sampleSize >= 5, "Pattern meets minimum sample size (>=5)");
  assert(!!fridayPattern && fridayPattern.confidenceScore > 0, "Pattern has a confidence score");
}

console.log("\n=== Test 2: AI receives behavioral patterns as context ===");
{
  const pattern: BehavioralPattern = {
    userId: "test-user",
    title: "Friday Loss Pattern",
    description: "Friday after 2 losses: 3.1x violation rate",
    patternType: "day_of_week_consecutive_losses",
    confidenceScore: 91,
    sampleSize: 22,
    affectedTrades: ["t1", "t2"],
    estimatedFinancialImpact: -1840,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  // interpretPattern returns structured insight even without API key.
  interpretPattern(pattern, "test-user").then(interp => {
    assert(!!interp.what, "AI interpretation provides a 'what' explanation");
    assert(!!interp.whyItMatters, "AI interpretation provides 'whyItMatters'");
    assert(!!interp.actionableImprovement, "AI interpretation provides 'actionableImprovement'");
  });
}

console.log("\n=== Test 3: No patterns from insufficient data ===");
{
  const events: DisciplineEvent[] = [];
  for (let i = 0; i < 3; i++) {
    events.push(makeEvent({ dayOfWeek: "Friday", consecutiveLosses: 2 }));
  }
  const engine = new PatternDetectionEngine();
  const patterns = engine.detectPatterns(events, "test-user");
  assert(patterns.length === 0, "No patterns surfaced with < minimum sample size");
}

console.log("\n=== Test 4: Discipline Context Analyzer computes behavioral context ===");
{
  const analyzer = new DisciplineContextAnalyzer();
  const event = analyzer.analyzeTrade({
    userId: "test-user",
    tradeId: "t1",
    violationType: "oversized_position",
    severity: 8,
    financialImpact: -500,
    ticker: "TSLA",
    setupType: "momentum",
    dayOfWeek: "Friday",
    timeOfDay: "afternoon",
    marketSession: "regular",
    previousTradeResult: "loss",
    consecutiveWins: 0,
    consecutiveLosses: 3,
    dailyPLBeforeTrade: -800,
    positionSize: 300,
    plannedRisk: 100,
    actualRisk: 300,
  });
  assert(event.previousTradeResult === "loss", "Captures previous trade result");
  assert(event.consecutiveLosses === 3, "Captures consecutive losses");
  assert(event.dailyPLBeforeTrade === -800, "Captures daily P/L before trade");
  assert(event.positionSize > event.plannedRisk, "Detects oversized position");
}

console.log("\n=== Test 5: Oversized-after-loss pattern detection ===");
{
  const events: DisciplineEvent[] = [];
  for (let i = 0; i < 8; i++) {
    events.push(makeEvent({
      violationType: "oversized_position",
      previousTradeResult: "loss",
      plannedRisk: 100,
      actualRisk: 200,
      positionSize: 200,
    }));
  }
  const engine = new PatternDetectionEngine();
  const patterns = engine.detectPatterns(events, "test-user");
  const oversized = patterns.find(p => p.patternType === "position_size_after_losses");
  assert(!!oversized, "Oversized-after-loss pattern detected with sufficient sample");
}

setTimeout(() => {
  console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}, 1500);