/**
 * GET /api/analytics/coach/overview?orgId=...
 *
 * Firm-wide aggregate analytics across all authorized students.
 * Level 1: aggregate statistics only — NO trade detail, NO chart data.
 *
 * Calculates analytics server-side from authorized trades using the shared
 * calculator, then returns the computed StudentAnalytics (firm aggregate view).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/server';
import { getCoachContext, firmNoStoreJson } from '@/lib/firm/context';
import { listAuthorizedStudents } from '@/lib/firm/reads';
import { adaptStudentTrades, type StudentRawTrade } from '@/lib/analytics/adapters';
import { calculateStudentAnalytics } from '@/lib/analytics/calculator';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get('orgId');

  if (!orgId) {
    return firmNoStoreJson({ error: 'organizationId is required' }, { status: 400 });
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

    // Get authorized students
    const students = await listAuthorizedStudents(supabase, orgId);
    if (students.length === 0) {
      return firmNoStoreJson({
        organization_id: orgId,
        organization_name: ctx.context.active.organization_name,
        student_count: 0,
        firmAnalytics: null,
        studentCount: 0,
      });
    }

    // Fetch trades for all authorized students (lightweight columns only)
    const userIds = students.map(s => s.student_user_id);
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
      .in('user_id', userIds)
      .order('created_at', { ascending: false });

    if (tradesError) {
      console.error('Firm analytics trades fetch error:', tradesError.message);
      return firmNoStoreJson({ error: 'Failed to load analytics' }, { status: 500 });
    }

    const rawTrades = (tradesData || []) as StudentRawTrade[];

    // Filter to join-window trades
    const joinedByUser = new Map(students.map(s => [s.student_user_id, s.joined_at]));
    const windowedTrades = rawTrades.filter(t => {
      const joined = joinedByUser.get(t.user_id);
      if (!joined) return false;
      const tradeTime = t.entry_time ? new Date(t.entry_time).getTime() : new Date(t.created_at).getTime();
      return tradeTime >= new Date(joined).getTime();
    });

    // Adapt and calculate
    const adapted = adaptStudentTrades(windowedTrades);
    const firmAnalytics = calculateStudentAnalytics(adapted);

    return firmNoStoreJson({
      organization_id: orgId,
      organization_name: ctx.context.active.organization_name,
      student_count: students.length,
      firmAnalytics,
      studentCount: students.length,
    });
  } catch (e) {
    console.error('Firm analytics error:', e);
    return firmNoStoreJson({ error: 'Failed to load analytics' }, { status: 500 });
  }
}
