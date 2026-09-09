/**
 * GET /api/analytics/coach/student/trades?orgId=...&membershipId=...
 *
 * Lightweight trade list for a student — Level 2.
 *
 * Returns trade metadata only: id, ticker, side, entry_time, exit_time,
 * realized_pl, size, discipline_score, setup_type, violations (summary), etc.
 * NO chart_data, NO ai_replay, NO decision_quality.
 *
 * The coach clicks individual trades to load Level 3 (replay data).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/server';
import { getCoachContext, firmNoStoreJson } from '@/lib/firm/context';
import { listAuthorizedStudents } from '@/lib/firm/reads';

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

    const students = await listAuthorizedStudents(supabase, orgId);
    const student = students.find(s => s.membership_id === membershipId);
    if (!student) {
      return firmNoStoreJson({ error: 'Not found' }, { status: 404 });
    }

    // Lightweight trade list — NO chart_data, NO ai_replay, NO decision_quality
    const { data: tradesData, error: tradesError } = await supabase
      .from('trades')
      .select([
        'id',
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
      ].join(','))
      .eq('user_id', student.student_user_id)
      .order('created_at', { ascending: false });

    if (tradesError) {
      console.error('Student trades fetch error:', tradesError.message);
      return firmNoStoreJson({ error: 'Failed to load trades' }, { status: 500 });
    }

    const trades = (tradesData || []).map(t => {
      const violations = (() => {
        if (Array.isArray(t.violations)) return t.violations;
        if (typeof t.violations === 'string' && t.violations.trim()) {
          try {
            const parsed = JSON.parse(t.violations);
            return Array.isArray(parsed) ? parsed.map(String) : [];
          } catch {
            return [];
          }
        }
        return [];
      })();

      return {
        id: t.id,
        ticker: t.ticker ?? null,
        side: t.side ?? null,
        size: t.size != null ? String(t.size) : null,
        realized_pl: typeof t.realized_pl === 'number' ? t.realized_pl : (parseFloat(t.realized_pl as string) ?? null),
        entry_price: typeof t.entry_price === 'number' ? t.entry_price : (parseFloat(t.entry_price as string) ?? null),
        exit_price: typeof t.exit_price === 'number' ? t.exit_price : (parseFloat(t.exit_price as string) ?? null),
        discipline_score: t.discipline_score ?? null,
        setup_type: t.setup_type ?? null,
        entry_time: t.entry_time ?? null,
        exit_time: t.exit_time ?? null,
        created_at: t.created_at,
        violations,
        violation_count: violations.length,
      };
    });

    // Filter to join-window
    const threshold = new Date(student.joined_at).getTime();
    const windowedTrades = trades.filter(t => {
      const tradeTime = t.entry_time ? new Date(t.entry_time).getTime() : new Date(t.created_at).getTime();
      return tradeTime >= threshold;
    });

    return firmNoStoreJson({
      organization_id: orgId,
      membership_id: membershipId,
      pseudonym: student.pseudonym,
      trades: windowedTrades,
      tradeCount: windowedTrades.length,
    });
  } catch (e) {
    console.error('Student trades error:', e);
    return firmNoStoreJson({ error: 'Failed to load trades' }, { status: 500 });
  }
}
