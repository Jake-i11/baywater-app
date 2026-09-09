/**
 * GET /api/analytics/coach/student?orgId=...&membershipId=...
 *
 * Student-level analytics for a coach.
 * Level 1: aggregate analytics only — NO trade detail, NO chart data.
 *
 * Returns the same StudentAnalytics shape as the firm overview, but filtered
 * to one student's trades. Also includes firm aggregate for comparison.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/server';
import { getCoachContext, firmNoStoreJson } from '@/lib/firm/context';
import { listAuthorizedStudents } from '@/lib/firm/reads';
import { adaptStudentTrades, type StudentRawTrade } from '@/lib/analytics/adapters';
import { calculateStudentAnalytics, compareStudentToFirm } from '@/lib/analytics/calculator';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get('orgId');
  const membershipId = searchParams.get('membershipId');

  if (!orgId || !membershipId) {
    return firmNoStoreJson({ error: 'organizationId and membershipId are required' }, { status: 400 });
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

    // Get authorized students and find the requested one
    const students = await listAuthorizedStudents(supabase, orgId);
    const student = students.find(s => s.membership_id === membershipId);
    if (!student) {
      return firmNoStoreJson({ error: 'Not found' }, { status: 404 });
    }

    // Fetch trades for this student only (lightweight columns)
    const { data: tradesData, error: tradesError } = await supabase
      .from('trades')
      .select([
        'id',
        'user_id',
        'ticker',
        'side',
        'size',
        'realized_pl',
        'entry_price',
        'exit_price',
        'discipline_score',
        'setup_type',
        'entry_time',
        'exit_time',
        'created_at',
        'violations',
        'float_shares',
        'relative_volume',
        'day_volume',
        'market_cap',
        // NOTE: 'behaviorTags' is intentionally NOT selected — the trades table has no such
        // column (verified against the insert path in lib/analyze/supabaseTradeInsert.ts and
        // all migrations). Selecting it would make PostgREST reject the query (PGRST204).
        // The execution score's setup-quality component therefore runs without tag data,
        // exactly matching the student implementation (which also always sees empty tags).
      ].join(','))
      .eq('user_id', student.student_user_id)
      .order('created_at', { ascending: false });

    if (tradesError) {
      console.error('Student analytics trades fetch error:', tradesError.message);
      return firmNoStoreJson({ error: 'Failed to load analytics' }, { status: 500 });
    }

    const rawTrades = (tradesData || []) as StudentRawTrade[];

    // Filter to join-window trades
    const tradeTimeThreshold = new Date(student.joined_at).getTime();
    const windowedTrades = rawTrades.filter(t => {
      const tradeTime = t.entry_time ? new Date(t.entry_time).getTime() : new Date(t.created_at).getTime();
      return tradeTime >= tradeTimeThreshold;
    });

    // Adapt and calculate student analytics
    const adapted = adaptStudentTrades(windowedTrades);
    const studentAnalytics = calculateStudentAnalytics(adapted);

    // Also fetch firm aggregate for comparison
    const allUserIds = students.map(s => s.student_user_id);
    const joinedByUser = new Map(students.map(s => [s.student_user_id, s.joined_at]));
    const { data: allTradesData } = await supabase
      .from('trades')
      .select([
        'id',
        'user_id',
        'ticker',
        'side',
        'size',
        'realized_pl',
        'entry_price',
        'exit_price',
        'discipline_score',
        'setup_type',
        'entry_time',
        'exit_time',
        'created_at',
        'violations',
        'float_shares',
        'relative_volume',
        'day_volume',
        'market_cap',
        // NOTE: 'behaviorTags' is intentionally NOT selected — same reason as above.
      ].join(','))
      .in('user_id', allUserIds)
      .order('created_at', { ascending: false });

    const allRawTrades = (allTradesData || []) as StudentRawTrade[];
    // Filter firm trades to join-window using each student's joined_at
    const allWindowedFiltered = allRawTrades.filter(t => {
      const joined = joinedByUser.get(t.user_id);
      if (!joined) return false;
      const tradeTime = t.entry_time ? new Date(t.entry_time).getTime() : new Date(t.created_at).getTime();
      return tradeTime >= new Date(joined).getTime();
    });

    const firmAdapted = adaptStudentTrades(allWindowedFiltered);
    const firmAnalytics = calculateStudentAnalytics(firmAdapted);

    // Compare student to firm
    const comparison = compareStudentToFirm(studentAnalytics.core, firmAnalytics.core);

    return firmNoStoreJson({
      organization_id: orgId,
      membership_id: membershipId,
      pseudonym: student.pseudonym,
      joined_at: student.joined_at,
      studentAnalytics,
      firmAnalytics,
      comparison,
    });
  } catch (e) {
    console.error('Student analytics error:', e);
    return firmNoStoreJson({ error: 'Failed to load analytics' }, { status: 500 });
  }
}
