/**
 * Firm coach read helpers — authenticated client + RLS + authorized-student RPC.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aggregateTradeMetrics,
  breakdownByEntryHour,
  breakdownByPositionSizing,
  breakdownBySetupType,
  breakdownByViolationType,
  getTradePL,
  getViolations,
  sanitizeAiReviewSummary,
  type TradeLike,
} from "@/lib/firm/metrics";
import type {
  FirmCoachOverviewResponse,
  FirmCoachPerformanceResponse,
  FirmCoachRosterResponse,
  FirmCoachRosterStudent,
  FirmCoachStudentDetailResponse,
  FirmCoachStudentTrade,
} from "@/lib/firm/types";

type AuthorizedStudent = {
  membership_id: string;
  student_user_id: string;
  joined_at: string;
  pseudonym: string;
};

type TradeRow = TradeLike & {
  id: string;
  user_id: string;
  ticker?: string | null;
  side?: string | null;
  size?: string | null;
  setup_type?: string | null;
  entry_time?: string | null;
  exit_time?: string | null;
  created_at: string;
  ai_review?: string | null;
  violations?: string | string[] | null;
  discipline_score?: number | null;
  realized_pl?: string | number | null;
};

function tradeTimestamp(t: TradeRow): Date {
  const raw = t.entry_time || t.created_at;
  return new Date(raw);
}

function inJoinWindow(t: TradeRow, joinedAt: string): boolean {
  return tradeTimestamp(t) >= new Date(joinedAt);
}

async function listAuthorizedStudents(
  supabase: SupabaseClient,
  organizationId: string
): Promise<AuthorizedStudent[]> {
  const { data, error } = await supabase.rpc("firm_coach_authorized_students", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return (data ?? []) as AuthorizedStudent[];
}

async function fetchTradesForUsers(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<TradeRow[]> {
  if (userIds.length === 0) return [];

  // Explicit column list — never select chart_data / screenshot fields.
  const { data, error } = await supabase
    .from("trades")
    .select(
      [
        "id",
        "user_id",
        "ticker",
        "side",
        "size",
        "realized_pl",
        "discipline_score",
        "setup_type",
        "entry_time",
        "exit_time",
        "created_at",
        "violations",
        "ai_review",
      ].join(",")
    )
    .in("user_id", userIds)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as TradeRow[];
}

function windowedTrades(
  trades: TradeRow[],
  students: AuthorizedStudent[]
): TradeRow[] {
  const joinedByUser = new Map(students.map((s) => [s.student_user_id, s.joined_at]));
  return trades.filter((t) => {
    const joined = joinedByUser.get(t.user_id);
    return joined ? inJoinWindow(t, joined) : false;
  });
}

export async function buildCoachOverview(
  supabase: SupabaseClient,
  organizationId: string,
  organizationName: string
): Promise<FirmCoachOverviewResponse> {
  const students = await listAuthorizedStudents(supabase, organizationId);
  const trades = windowedTrades(
    await fetchTradesForUsers(
      supabase,
      students.map((s) => s.student_user_id)
    ),
    students
  );
  const metrics = aggregateTradeMetrics(trades);

  return {
    organization_id: organizationId,
    organization_name: organizationName,
    student_count: students.length,
    metrics:
      students.length === 0
        ? {
            trade_count: 0,
            total_pl: 0,
            win_rate: null,
            profit_factor: null,
            profit_factor_uncapped: false,
            average_discipline_score: null,
            winning_trades: 0,
            losing_trades: 0,
          }
        : metrics,
  };
}

export async function buildCoachRoster(
  supabase: SupabaseClient,
  organizationId: string,
  sort: FirmCoachRosterResponse["sort"] = "discipline"
): Promise<FirmCoachRosterResponse> {
  const students = await listAuthorizedStudents(supabase, organizationId);
  const allTrades = windowedTrades(
    await fetchTradesForUsers(
      supabase,
      students.map((s) => s.student_user_id)
    ),
    students
  );

  const byUser = new Map<string, TradeRow[]>();
  for (const t of allTrades) {
    const list = byUser.get(t.user_id) ?? [];
    list.push(t);
    byUser.set(t.user_id, list);
  }

  let rows: FirmCoachRosterStudent[] = students.map((s) => {
    const trades = byUser.get(s.student_user_id) ?? [];
    const metrics = aggregateTradeMetrics(trades);
    const last = trades[0]?.created_at ?? null;
    return {
      membership_id: s.membership_id,
      pseudonym: s.pseudonym,
      joined_at: s.joined_at,
      trade_count: metrics.trade_count,
      total_pl: metrics.total_pl,
      win_rate: metrics.win_rate,
      average_discipline_score: metrics.average_discipline_score,
      last_trade_at: last,
    };
  });

  rows = [...rows].sort((a, b) => {
    switch (sort) {
      case "recent":
        return (b.last_trade_at ?? "").localeCompare(a.last_trade_at ?? "");
      case "pl":
        return b.total_pl - a.total_pl;
      case "pseudonym":
        return a.pseudonym.localeCompare(b.pseudonym);
      case "discipline":
      default: {
        const ad = a.average_discipline_score ?? -1;
        const bd = b.average_discipline_score ?? -1;
        return bd - ad;
      }
    }
  });

  return { organization_id: organizationId, students: rows, sort };
}

export async function buildCoachPerformance(
  supabase: SupabaseClient,
  organizationId: string
): Promise<FirmCoachPerformanceResponse> {
  const students = await listAuthorizedStudents(supabase, organizationId);
  const trades = windowedTrades(
    await fetchTradesForUsers(
      supabase,
      students.map((s) => s.student_user_id)
    ),
    students
  );

  return {
    organization_id: organizationId,
    by_setup_type: breakdownBySetupType(trades),
    by_entry_hour: breakdownByEntryHour(trades),
    by_position_sizing: breakdownByPositionSizing(trades),
    by_violation_type: breakdownByViolationType(trades),
  };
}

export async function buildCoachStudentDetail(
  supabase: SupabaseClient,
  organizationId: string,
  membershipId: string
): Promise<FirmCoachStudentDetailResponse | null> {
  const students = await listAuthorizedStudents(supabase, organizationId);
  const student = students.find((s) => s.membership_id === membershipId);
  if (!student) return null;

  const trades = windowedTrades(
    await fetchTradesForUsers(supabase, [student.student_user_id]),
    [student]
  );

  const detailTrades: FirmCoachStudentTrade[] = trades.map((t) => ({
    id: t.id,
    ticker: t.ticker ?? null,
    side: t.side ?? null,
    size: t.size != null ? String(t.size) : null,
    realized_pl: getTradePL(t),
    discipline_score: t.discipline_score ?? null,
    setup_type: t.setup_type ?? null,
    entry_time: t.entry_time ?? null,
    exit_time: t.exit_time ?? null,
    created_at: t.created_at,
    violations: getViolations(t),
    ai_review: sanitizeAiReviewSummary(t.ai_review),
  }));

  return {
    organization_id: organizationId,
    membership_id: student.membership_id,
    pseudonym: student.pseudonym,
    joined_at: student.joined_at,
    metrics: aggregateTradeMetrics(trades),
    trades: detailTrades,
    screenshots_included: false,
  };
}
