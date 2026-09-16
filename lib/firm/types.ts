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
  /** True only for the single global Baywater admin account (not a firm role). */
  is_global_admin: boolean;
  organizations: FirmCoachOrgSummary[];
  /** Organization in scope for the current request (when orgId provided and authorized). */
  active: FirmCoachOrgSummary | null;
};
export type CoachContextResult =
  | { ok: true; context: FirmCoachContext }
  | { ok: false; status: 401 | 404; error: string };

/**
 * Global-admin context for coach management paths. Admin is a single global
 * identity (not a firm membership), so this only asserts the caller is the
 * global admin and that the requested firm exists.
 */
export type FirmGlobalAdminContext = {
  user_id: string;
  is_global_admin: true;
  organization_id: string;
  organization_name: string;
};

export type GlobalAdminContextResult =
  | { ok: true; context: FirmGlobalAdminContext }
  | { ok: false; status: 401 | 403 | 404; error: string };

export type FirmAdminOrgSummary = {
  organization_id: string;
  organization_name: string;
  created_at: string;
};

/**
 * Resolved access to ONE firm: an active coach of that firm, or the single
 * global admin (who is intentionally not a member of any firm).
 *
 * `access` records HOW access was granted so routes can apply stricter rules
 * for admin-only actions (e.g. coach invitations) without re-querying.
 */
export type FirmOrgAccessContext = {
  user_id: string;
  is_global_admin: boolean;
  organization_id: string;
  organization_name: string;
  access: "coach" | "admin";
};

/**
 * Firm organization access result.
 * Anonymous -> 401, authenticated but neither coach nor admin -> 404 (generic),
 * indirection/RPC failure for a known admin -> 403.
 */
export type FirmOrgAccessResult =
  | { ok: true; context: FirmOrgAccessContext }
  | { ok: false; status: 401 | 403 | 404; error: string };

export type FirmDeleteOrganizationResponse = {
  organization_id: string;
  organization_name: string;
  deleted: {
    memberships: number;
    assignments: number;
    invitations: number;
    pseudonym_labels: number;
    audit_events: number;
  };
};


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

export type FirmCoachOption = {
  id: string;
  pseudonym: string;
  /** 'coach' or 'admin' for the coach management list; 'coach' for assignable. */
  role?: "coach" | "admin";
  /** Membership join date (present on the admin coach list). */
  joined_at?: string;
};

export type FirmCoachStudentDetailResponse = {
  organization_id: string;
  membership_id: string;
  pseudonym: string;
  joined_at: string;
  metrics: AggregateMetrics;
  trades: FirmCoachStudentTrade[];
  /** Active coaches of the organization, used by the assignment picker. */
  assignable_coaches: FirmCoachOption[];
  /** Screenshots / chart_data intentionally omitted (PII risk). */
  screenshots_included: false;
};

