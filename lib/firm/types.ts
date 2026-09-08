/**
 * Explicit shared types for firm coach read APIs.
 * Intentionally exclude name, email, avatar, and screenshot fields.
 */

import type { AggregateMetrics, DimensionBucket } from "@/lib/firm/metrics";

export type FirmCoachOrgSummary = {
  organization_id: string;
  organization_name: string;
  membership_id: string;
  joined_at: string;
};

export type FirmCoachContext = {
  user_id: string;
  organizations: FirmCoachOrgSummary[];
  /** Organization in scope for the current request (when orgId provided and authorized). */
  active: FirmCoachOrgSummary | null;
};
export type CoachContextResult =
  | { ok: true; context: FirmCoachContext }
  | { ok: false; status: 401 | 404; error: string };


export type FirmCoachOverviewResponse = {
  organization_id: string;
  organization_name: string;
  student_count: number;
  metrics: AggregateMetrics;
};

export type FirmCoachRosterStudent = {
  membership_id: string;
  pseudonym: string;
  joined_at: string;
  trade_count: number;
  total_pl: number;
  win_rate: number | null;
  average_discipline_score: number | null;
  last_trade_at: string | null;
};

export type FirmCoachRosterResponse = {
  organization_id: string;
  students: FirmCoachRosterStudent[];
  sort: "discipline" | "recent" | "pl" | "pseudonym";
};

export type FirmCoachPerformanceResponse = {
  organization_id: string;
  by_setup_type: DimensionBucket[];
  by_entry_hour: DimensionBucket[];
  by_position_sizing: DimensionBucket[];
  by_violation_type: Array<{ key: string; label: string; count: number }>;
};

export type FirmCoachStudentTrade = {
  id: string;
  ticker: string | null;
  side: string | null;
  size: string | null;
  realized_pl: number | null;
  discipline_score: number | null;
  setup_type: string | null;
  entry_time: string | null;
  exit_time: string | null;
  created_at: string;
  violations: string[];
  ai_review: {
    summary: string | null;
    trade_grade: string | null;
    strengths: string[];
    mistakes: string[];
    lesson: string | null;
  } | null;
};

export type FirmCoachStudentDetailResponse = {
  organization_id: string;
  membership_id: string;
  pseudonym: string;
  joined_at: string;
  metrics: AggregateMetrics;
  trades: FirmCoachStudentTrade[];
  /** Screenshots / chart_data intentionally omitted (PII risk). */
  screenshots_included: false;
};
