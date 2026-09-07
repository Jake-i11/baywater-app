/**
 * Server-side coach context resolution for /firm/[orgId] routes.
 * RLS remains the enforcement layer; this only scopes the request.
 */
import { createClient } from "@/lib/server";
import type { FirmCoachContext, FirmCoachOrgSummary } from "@/lib/firm/types";

export type CoachContextResult =
  | { ok: true; context: FirmCoachContext }
  | { ok: false; status: 401 | 404; error: string };

export async function getCoachContext(orgId?: string | null): Promise<CoachContextResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

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

  const orgIds = [...new Set((memberships ?? []).map((m: { organization_id: string }) => m.organization_id))];
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

  const organizations: FirmCoachOrgSummary[] = (memberships ?? [])
    .map((row: { id: string; organization_id: string; joined_at: string }) => {
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
      organizations,
      active,
    },
  };
}

export function firmNoStoreJson(body: unknown, init?: { status?: number }) {
  return Response.json(body, {
    status: init?.status ?? 200,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
