/**
 * Discipline Confluence Engine - Utilities
 *
 * Helper functions for persisting discipline events, detected behavioral
 * patterns, and connecting them to the trader profile system.
 */

import { supabase } from "@/lib/supabase";
import { DisciplineEvent, BehavioralPattern, PatternDetectionEngine } from "./discipline-engine";
import { updateTraderProfile } from "./profile-utils";

/**
 * Persist a batch of discipline events to the discipline_violations table.
 * Each event becomes one row tagged with full behavioral context.
 */
export async function storeDisciplineEvents(events: DisciplineEvent[]): Promise<void> {
  if (!events.length) return;

  const rows = events.map(e => ({
    trade_id: e.tradeId,
    user_id: e.userId,
    violation_type: e.violationType,
    severity_score: e.severity,
    severity_category: e.severity >= 7 ? "high" : e.severity >= 4 ? "medium" : "low",
    ticker: e.ticker,
    setup_type: e.setupType,
    day_of_week: e.dayOfWeek,
    time_of_day: e.timeOfDay,
    market_session: e.marketSession,
    previous_trade_result: e.previousTradeResult,
    consecutive_wins: e.consecutiveWins,
    consecutive_losses: e.consecutiveLosses,
    daily_pl_before_trade: e.dailyPLBeforeTrade,
    position_size: e.positionSize,
    planned_risk: e.plannedRisk,
    actual_risk: e.actualRisk,
    financial_impact: e.financialImpact,
    created_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("discipline_violations").insert(rows);
  if (error) console.error("Failed to store discipline events:", error);
}

/**
 * Run the pattern detection engine over a user's historical events and
 * persist any statistically meaningful behavioral patterns.
 */
export async function detectAndStorePatterns(userId: string, events: DisciplineEvent[]): Promise<BehavioralPattern[]> {
  const engine = new PatternDetectionEngine();
  const patterns = engine.detectPatterns(events, userId);

  for (const p of patterns) {
    // Upsert by pattern type so we keep one evolving record per pattern.
    const { data: existing } = await supabase
      .from("behavior_patterns")
      .select("id")
      .eq("user_id", userId)
      .eq("pattern_type", p.patternType)
      .single();

    if (existing) {
      await supabase
        .from("behavior_patterns")
        .update({
          frequency: p.sampleSize,
          severity: Math.round((p.confidenceScore / 100) * 10),
          ai_summary: p.description,
          estimated_financial_impact: p.estimatedFinancialImpact,
          last_occurrence: new Date().toISOString(),
        })
        .eq("id", (existing as any).id);
    } else {
      await supabase.from("behavior_patterns").insert({
        user_id: userId,
        pattern_type: p.patternType,
        title: p.title,
        description: p.description,
        frequency: p.sampleSize,
        severity: Math.round((p.confidenceScore / 100) * 10),
        ai_summary: p.description,
        estimated_financial_impact: p.estimatedFinancialImpact,
        confidence_score: p.confidenceScore,
        affected_trades: p.affectedTrades,
        first_occurrence: new Date().toISOString(),
        last_occurrence: new Date().toISOString(),
      });
    }
  }

  // Feed recurring patterns into the long-term trader profile memory.
  if (patterns.length) {
    const recurringMistakes = patterns.map(p => ({
      name: p.title,
      confidence: p.confidenceScore,
      evidence: `${p.sampleSize} occurrences`,
      impact: `$${p.estimatedFinancialImpact.toFixed(0)}`,
    }));
    await updateTraderProfile(userId, { recurring_mistakes: recurringMistakes as any });
  }

  return patterns;
}

/**
 * Load discipline events for a user (from the violations table) so the
 * detection engine can analyze them.
 */
export async function loadDisciplineEvents(userId: string): Promise<DisciplineEvent[]> {
  const { data, error } = await supabase
    .from("discipline_violations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error || !data) {
    console.error("Failed to load discipline events:", error);
    return [];
  }

  return data.map((r: any) => ({
    userId: r.user_id,
    tradeId: r.trade_id,
    violationType: r.violation_type,
    severity: r.severity_score,
    financialImpact: r.financial_impact ?? 0,
    timestamp: new Date(r.created_at),
    ticker: r.ticker ?? "",
    setupType: r.setup_type ?? "",
    dayOfWeek: r.day_of_week ?? "",
    timeOfDay: r.time_of_day ?? "",
    marketSession: r.market_session ?? "",
    previousTradeResult: r.previous_trade_result ?? "loss",
    consecutiveWins: r.consecutive_wins ?? 0,
    consecutiveLosses: r.consecutive_losses ?? 0,
    dailyPLBeforeTrade: r.daily_pl_before_trade ?? 0,
    positionSize: r.position_size ?? 0,
    plannedRisk: r.planned_risk ?? 0,
    actualRisk: r.actual_risk ?? 0,
  }));
}

/**
 * Discipline analytics summary for dashboards / coaching context.
 */
export async function getDisciplineAnalytics(userId: string): Promise<{
  currentDisciplineScore: number;
  disciplineTrend: string;
  totalViolations: number;
  violationBreakdown: Record<string, number>;
  mostCommonViolation: string | null;
  biggestImprovementArea: string | null;
  financialCostOfMistakes: number;
}> {
  const { data: violations, error } = await supabase
    .from("discipline_violations")
    .select("violation_type, severity_score, financial_impact")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !violations) {
    return {
      currentDisciplineScore: 100,
      disciplineTrend: "unknown",
      totalViolations: 0,
      violationBreakdown: {},
      mostCommonViolation: null,
      biggestImprovementArea: null,
      financialCostOfMistakes: 0,
    };
  }

  const breakdown: Record<string, number> = {};
  let financialCost = 0;
  violations.forEach((v: any) => {
    breakdown[v.violation_type] = (breakdown[v.violation_type] || 0) + 1;
    financialCost += Math.abs(v.financial_impact ?? 0);
  });

  const mostCommon = Object.entries(breakdown).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const biggest = Object.entries(breakdown).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    currentDisciplineScore: 100 - Math.min(100, violations.length * 2),
    disciplineTrend: "stable",
    totalViolations: violations.length,
    violationBreakdown: breakdown,
    mostCommonViolation: mostCommon,
    biggestImprovementArea: biggest,
    financialCostOfMistakes: financialCost,
  };
}