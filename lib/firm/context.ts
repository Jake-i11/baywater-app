/**
 * Server-side firm context resolution for /firm/[orgId] routes.
 * RLS remains the enforcement layer; this only scopes the request.
 *
 * Three distinct identities:
 *   * global admin — the single Baywater admin account (public.baywater_admins)
 *   * coach        — an active organization_memberships row with role 'coach'
 *   * student      — unchanged
 *
 * The global admin is NOT a firm membership and never becomes one.
 */
import { createClient } from "@/lib/server";
import type {
  FirmAdminOrgSummary,
  FirmCoachContext,
  FirmCoachOrgSummary,
  FirmGlobalAdminContext,
  FirmOrgAccessContext,
  FirmOrgAccessResult,
  GlobalAdminContextResult,
} from "@/lib/firm/types";

export type CoachContextResult =
  | { ok: true; context: FirmCoachContext }
  | { ok: false; status: 401 | 404; error: string };

type CoachMembershipRow = {
  id: string;
  organization_id: string;
  joined_at: string;
};

type StudentMembershipRow = {
  id: string;
  organization_id: string;
  joined_at: string;
};

/**
 * Organization as seen by a STUDENT (joined via accepted invitations only).
 * Mirrors FirmCoachOrgSummary so the /firm listing can render rows identically
 * without exposing coach-only surfaces (invite links, coach management).
 */
export type FirmStudentOrgSummary = {
  organization_id: string;
  organization_name: string;
  membership_id: string;
  joined_at: string;
};

/**
 * True when the AUTHENTICATED caller currently holds an ACTIVE student
 * membership in any organization. This is the system's only reliable
 * per-user student signal — roles live per-membership in
 * organization_memberships, and creation is what makes a coach.
 *
 * Reads the caller's own rows through RLS (organization_memberships_select_own),
 * so it can never be satisfied by client-supplied data.
 */
export async function isActiveStudentAnywhere(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return false;

  const { data, error } = await supabase
    .from("organization_memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", "student")
    .eq("status", "active")
    .limit(1);

  if (error) {
    // Fail closed: unreadable membership state must not grant creation.
    console.error("isActiveStudentAnywhere error:", error.message);
    return true;
  }
  return (data ?? []).length > 0;
}

/** True when the authenticated caller holds the single global admin row. */
export async function isGlobalAdminUser(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return false;

  const { data, error } = await supabase
    .from("baywater_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("isGlobalAdminUser error:", error.message);
    return false;
  }
  return Boolean(data);
}

/** All organizations — global admin only (enforced by the RPC). */
export async function listAdminOrganizations(): Promise<FirmAdminOrgSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("firm_admin_list_organizations");
  if (error) throw error;
  return (data ?? []) as FirmAdminOrgSummary[];
}

/**
 * Student-facing firm list: ONLY organizations where the authenticated user
 * holds an ACTIVE student membership (joined via accepted invitations).
 * RLS (organizations_select_active_member) scopes the join server-side, so no
 * unaffiliated organization can leak into the result regardless of inputs.
 */
export async function getStudentOrganizations(): Promise<FirmStudentOrgSummary[]> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return [];

  const { data, error } = await supabase
    .from("organization_memberships")
    .select("id, organization_id, joined_at, organizations!inner(id, name)")
    .eq("user_id", user.id)
    .eq("role", "student")
    .eq("status", "active");

  if (error) {
    console.error("getStudentOrganizations error:", error.message);
    return [];
  }

  return ((data ?? []) as Array<
    StudentMembershipRow & { organizations: { id: string; name: string }[] }
  >)
    .map((row) => ({
      organization_id: row.organization_id,
      organization_name: row.organizations[0]?.name ?? "",
      membership_id: row.id,
      joined_at: row.joined_at,
    }));
}

/**
 * Coach-facing context. Requires an ACTIVE coach membership (admin is not a
 * membership role). `is_global_admin` is reported separately so the admin UI
 * can appear without granting any firm-level privileges.
 */
export async function getCoachContext(orgId?: string | null): Promise<CoachContextResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const { data: adminRow, error: adminError } = await supabase
    .from("baywater_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminError) {
    console.error("getCoachContext global-admin lookup error:", adminError.message);
  }
  const is_global_admin = Boolean(adminRow);

  const { data: memberships, error: memError } = await supabase
    .from("organization_memberships")
    .select("id, organization_id, joined_at")
    .eq("user_id", user.id)
    .eq("role", "coach")
    .eq("status", "active");

  if (memError) {
    console.error("getCoachContext memberships error:", memError.message);
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const rows = (memberships ?? []) as CoachMembershipRow[];
  const orgIds = [...new Set(rows.map((m) => m.organization_id))];
  let orgNameById = new Map<string, string>();
  if (orgIds.length > 0) {
    const { data: orgs, error: orgError } = await supabase
      .from("organizations")
      .select("id, name")
      .in("id", orgIds);
    if (orgError) {
      console.error("getCoachContext organizations error:", orgError.message);
      return { ok: false, status: 401, error: "Unauthorized" };
    }
    orgNameById = new Map((orgs ?? []).map((o: { id: string; name: string }) => [o.id, o.name]));
  }

  const organizations: FirmCoachOrgSummary[] = rows
    .map((row) => {
      const name = orgNameById.get(row.organization_id);
      if (!name) return null;
      return {
        organization_id: row.organization_id,
        organization_name: name,
        membership_id: row.id,
        joined_at: row.joined_at,
      };
    })
    .filter(Boolean) as FirmCoachOrgSummary[];

  if (!orgId) {
    return {
      ok: true,
      context: {
        user_id: user.id,
        is_global_admin,
        organizations,
        active: organizations[0] ?? null,
      },
    };
  }

  const active = organizations.find((o) => o.organization_id === orgId) ?? null;
  if (!active) {
    // Generic not-found — do not reveal whether the org exists.
    return { ok: false, status: 404, error: "Not found" };
  }

  return {
    ok: true,
    context: {
      user_id: user.id,
      is_global_admin,
      organizations,
      active,
    },
  };
}

/**
 * Resolve access to ONE firm.
 *
 * Succeeds when the caller is an ACTIVE coach of that exact organization, or
 * when the caller is the single global admin (who is intentionally not a member
 * of any firm). `orgId` is always validated against the caller's authorization,
 * so passing another firm's id never yields that firm's context.
 *
 * Anonymous -> 401. Authenticated but neither a coach of this firm nor the
 * global admin -> 404 (generic; firm existence is never revealed).
 *
 * `is_global_admin` always reports the caller's true admin identity, including
 * when access was granted as a coach, so admin-only actions are not denied to an
 * admin who also coaches the firm.
 */
export async function getOrgAccessContext(
  orgId: string | null | undefined
): Promise<FirmOrgAccessResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  if (!orgId) {
    return { ok: false, status: 404, error: "Not found" };
  }

  // 1) Global admin identity — resolved INDEPENDENTLY of firm membership.
  //
  // An account can legitimately be BOTH the single global admin and an active
  // coach of the same firm. Resolving this first means the admin identity is
  // never lost to the membership branch (which used to hardcode `false`), while
  // granting nothing by itself: access still has to be earned below.
  const { data: adminRow, error: adminError } = await supabase
    .from("baywater_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminError) {
    console.error("getOrgAccessContext admin lookup error:", adminError.message);
  }
  const isGlobalAdmin = Boolean(adminRow);

  // 2) Active coach of this exact firm? This exact-firm, role='coach',
  //    status='active' requirement is what authorizes coach-level data access
  //    (roster, performance, students, trades) and is unchanged.
  const { data: membership, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .eq("role", "coach")
    .eq("status", "active")
    .maybeSingle();

  if (membershipError) {
    console.error("getOrgAccessContext membership error:", membershipError.message);
  } else if (membership) {
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("id", orgId)
      .maybeSingle();

    if (orgError) {
      console.error("getOrgAccessContext organization error:", orgError.message);
    }
    if (org) {
      const context: FirmOrgAccessContext = {
        user_id: user.id,
        // Access is coach-level here, but the admin identity is reported
        // truthfully so admin-only actions (e.g. coach invitations) work.
        is_global_admin: isGlobalAdmin,
        organization_id: org.id,
        organization_name: org.name,
        access: "coach",
      };
      return { ok: true, context };
    }
  }

  // 3) Global admin — manages every firm without holding a membership.
  // Fail closed: a missing/unreadable admin table must never grant access.
  if (adminError) {
    return { ok: false, status: 404, error: "Not found" };
  }

  if (isGlobalAdmin) {
    try {
      const organizations = await listAdminOrganizations();
      const org = organizations.find((o) => o.organization_id === orgId);
      if (org) {
        const context: FirmOrgAccessContext = {
          user_id: user.id,
          is_global_admin: true,
          organization_id: org.organization_id,
          organization_name: org.organization_name,
          access: "admin",
        };
        return { ok: true, context };
      }
    } catch (e) {
      console.error("getOrgAccessContext admin org list error:", e);
      return { ok: false, status: 403, error: "Forbidden" };
    }
    return { ok: false, status: 404, error: "Not found" };
  }

  return { ok: false, status: 404, error: "Not found" };
}

/**
 * Global-admin context for coach management. Requires the single admin identity;
 * the firm only has to exist (the admin manages coaches across firms).
 * Anonymous -> 401, authenticated non-admin -> 403, unknown firm -> 404.
 */
export async function getGlobalAdminContext(
  orgId: string
): Promise<GlobalAdminContextResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  if (!orgId) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const { data: adminRow, error: adminError } = await supabase
    .from("baywater_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminError) {
    console.error("getGlobalAdminContext admin lookup error:", adminError.message);
    return { ok: false, status: 403, error: "Forbidden" };
  }
  if (!adminRow) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  let organizations: FirmAdminOrgSummary[];
  try {
    organizations = await listAdminOrganizations();
  } catch (e) {
    console.error("getGlobalAdminContext organizations error:", e);
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const org = organizations.find((o) => o.organization_id === orgId);
  if (!org) {
    return { ok: false, status: 404, error: "Not found" };
  }

  const context: FirmGlobalAdminContext = {
    user_id: user.id,
    is_global_admin: true,
    organization_id: org.organization_id,
    organization_name: org.organization_name,
  };

  return { ok: true, context };
}

export function firmNoStoreJson(body: unknown, init?: { status?: number }) {
  return Response.json(body, {
    status: init?.status ?? 200,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
