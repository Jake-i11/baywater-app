/**
 * GET /api/analytics/coach/student/trade/[tradeId]?orgId=...&membershipId=...
 *
 * Individual trade with full replay data — Level 3 (lazy-loaded).
 *
 * This is the ONLY endpoint that returns chart_data, ai_replay, and decision_quality.
 * It is called ONLY when the coach explicitly clicks a specific trade to view its replay.
 *
 * The trade MUST belong to the requested student and the coach MUST be authorized
 * to view that student.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/server';
import { getCoachContext, firmNoStoreJson } from '@/lib/firm/context';
import { listAuthorizedStudents } from '@/lib/firm/reads';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tradeId: string }> }
) {
  const { tradeId } = await params;
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get('orgId');
  const membershipId = searchParams.get('membershipId');

  if (!orgId || !membershipId || !tradeId) {
    return firmNoStoreJson({ error: 'organizationId, membershipId, and tradeId are required' }, { status: 400 });
  }

  const ctx = await getCoachContext(orgId);
  if (!ctx.ok) {
    return firmNoStoreJson({ error: ctx.error }, { status: ctx.status });
  }
  if (!ctx.context.active) {
    return firmNoStoreJson({ error: 'Not found' }, { status: 404 });
  }

  try {
    const supabase = await createClient();

    const students = await listAuthorizedStudents(supabase, orgId);
    const student = students.find(s => s.membership_id === membershipId);
    if (!student) {
      return firmNoStoreJson({ error: 'Not found' }, { status: 404 });
    }

    // Full trade record — includes chart_data, ai_replay, decision_quality
    // This is the expensive fetch that happens ONLY on explicit trade click
    const { data: tradeData, error: tradesError } = await supabase
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .eq('user_id', student.student_user_id)
      .single();

    if (tradesError || !tradeData) {
      return firmNoStoreJson({ error: 'Trade not found' }, { status: 404 });
    }

    // Verify trade is within join window
    const threshold = new Date(student.joined_at).getTime();
    const tradeTime = tradeData.entry_time ? new Date(tradeData.entry_time).getTime() : new Date(tradeData.created_at).getTime();
    if (tradeTime < threshold) {
      return firmNoStoreJson({ error: 'Trade not found' }, { status: 404 });
    }

    // Parse violations
    const violations = (() => {
      if (Array.isArray(tradeData.violations)) return tradeData.violations;
      if (typeof tradeData.violations === 'string' && tradeData.violations.trim()) {
        try {
          const parsed = JSON.parse(tradeData.violations);
          return Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
          return [];
        }
      }
      return [];
    })();

    // Parse decision_quality if present
    let decisionQuality = null;
    if (tradeData.decision_quality) {
      try {
        decisionQuality = typeof tradeData.decision_quality === 'string'
          ? JSON.parse(tradeData.decision_quality)
          : tradeData.decision_quality;
      } catch {
        decisionQuality = null;
      }
    }

    // Parse ai_review if present (sanitize to text fields only)
    let aiReview = null;
    if (tradeData.ai_review) {
      try {
        const raw = typeof tradeData.ai_review === 'string'
          ? JSON.parse(tradeData.ai_review)
          : tradeData.ai_review;
        if (raw && typeof raw === 'object') {
          aiReview = {
            summary: typeof raw.summary === 'string' ? raw.summary : null,
            trade_grade: typeof raw.trade_grade === 'string' ? raw.trade_grade : null,
            strengths: Array.isArray(raw.strengths) ? raw.strengths.map(String) : [],
            mistakes: Array.isArray(raw.mistakes) ? raw.mistakes.map(String) : [],
            lesson: typeof raw.lesson === 'string' ? raw.lesson : null,
          };
        }
      } catch {
        aiReview = null;
      }
    }

    return firmNoStoreJson({
      organization_id: orgId,
      membership_id: membershipId,
      pseudonym: student.pseudonym,
      trade: {
        id: tradeData.id,
        ticker: tradeData.ticker ?? null,
        side: tradeData.side ?? null,
        size: tradeData.size != null ? String(tradeData.size) : null,
        realized_pl: typeof tradeData.realized_pl === 'number' ? tradeData.realized_pl : (parseFloat(tradeData.realized_pl as string) ?? null),
        entry_price: typeof tradeData.entry_price === 'number' ? tradeData.entry_price : (parseFloat(tradeData.entry_price as string) ?? null),
        exit_price: typeof tradeData.exit_price === 'number' ? tradeData.exit_price : (parseFloat(tradeData.exit_price as string) ?? null),
        discipline_score: tradeData.discipline_score ?? null,
        setup_type: tradeData.setup_type ?? null,
        entry_time: tradeData.entry_time ?? null,
        exit_time: tradeData.exit_time ?? null,
        created_at: tradeData.created_at,
        violations,
        violation_count: violations.length,
        /** Chart data (candles) — ONLY loaded at Level 3 */
        chart_data: tradeData.chart_data ?? null,
        /** AI replay narrative — ONLY loaded at Level 3 */
        ai_replay: typeof tradeData.ai_replay === 'string' ? tradeData.ai_replay : null,
        /** Decision quality with replay events — ONLY loaded at Level 3 */
        decision_quality: decisionQuality,
        /** Sanitized AI review — ONLY loaded at Level 3 */
        ai_review: aiReview,
        /** Market enrichment fields */
        float_shares: tradeData.float_shares ?? null,
        market_cap: tradeData.market_cap ?? null,
        relative_volume: tradeData.relative_volume ?? null,
        sector: tradeData.sector ?? null,
      },
    });
  } catch (e) {
    console.error('Trade replay error:', e);
    return firmNoStoreJson({ error: 'Failed to load trade' }, { status: 500 });
  }
}
