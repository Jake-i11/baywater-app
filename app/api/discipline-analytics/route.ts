/**
 * Discipline Confluence Analytics API
 *
 * Endpoints for retrieving discovered behavioral patterns, discipline trends,
 * biggest behavioral leaks, and the financial cost of mistakes.
 */

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { loadDisciplineEvents, detectAndStorePatterns, getDisciplineAnalytics } from "@/lib/discipline-utils";
import { interpretPattern } from "@/lib/ai-pattern-interpretation";

/**
 * GET /api/discipline-analytics?userId=...
 * Returns discovered patterns, discipline trends, biggest leaks, and
 * estimated financial cost of mistakes.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // Refresh pattern detection from stored events.
    const events = await loadDisciplineEvents(userId);
    const patterns = await detectAndStorePatterns(userId, events);
    const analytics = await getDisciplineAnalytics(userId);

    // Fetch stored patterns (with AI interpretations) from the DB.
    const { data: storedPatterns, error } = await supabase
      .from("behavior_patterns")
      .select("*")
      .eq("user_id", userId)
      .order("last_occurrence", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Failed to load behavior patterns:", error);
      return NextResponse.json({ error: "Failed to load patterns" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      analytics,
      discoveredPatterns: storedPatterns,
      livePatternCount: patterns.length,
    });
  } catch (error) {
    console.error("Discipline analytics error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/discipline-analytics
 * Body: { userId, patternType }
 * Interprets the requested pattern with the AI coach and returns coaching insight.
 */
export async function POST(request: Request) {
  try {
    const { userId, patternType } = await request.json();
    if (!userId || !patternType) {
      return NextResponse.json({ error: "userId and patternType are required" }, { status: 400 });
    }

    const { data: patternRow, error } = await supabase
      .from("behavior_patterns")
      .select("*")
      .eq("user_id", userId)
      .eq("pattern_type", patternType)
      .single();

    if (error || !patternRow) {
      return NextResponse.json({ error: "Pattern not found" }, { status: 404 });
    }

    const interpretation = await interpretPattern(
      {
        userId,
        title: patternRow.title ?? patternRow.pattern_type,
        description: patternRow.description ?? patternRow.ai_summary,
        patternType: patternRow.pattern_type,
        confidenceScore: patternRow.confidence_score ?? 0,
        sampleSize: patternRow.frequency ?? 0,
        affectedTrades: patternRow.affected_trades ?? [],
        estimatedFinancialImpact: Number(patternRow.estimated_financial_impact ?? 0),
        createdAt: new Date(patternRow.first_occurrence),
        updatedAt: new Date(patternRow.last_occurrence),
      },
      userId
    );

    return NextResponse.json({ success: true, interpretation });
  } catch (error) {
    console.error("Pattern interpretation error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}