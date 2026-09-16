import { createClient } from "@/lib/server";
import { firmNoStoreJson, getCoachContext, getGlobalAdminContext } from "@/lib/firm/context";
import { firmRevokeMembership } from "@/lib/firm/rpc";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Map a PostgREST/SQLSTATE error onto an HTTP status. */
function statusForRpcError(error: { code?: string; message?: string }): number {
  switch (error.code) {
    case "42501": // insufficient_privilege
      return 403;
    case "P0002": // no_data_found
      return 404;
    default:
      return 400;
  }
}

/**
 * Revoke an organization membership.
 *
 * Role-aware authorization:
 *   * student -> an active coach of the firm (or the global admin)
 *   * coach   -> the GLOBAL admin ONLY
 *
 * The route resolves the target role first, then requires global-admin context
 * for coach targets. firm_revoke_membership re-enforces everything in the
 * database, so this cannot be bypassed by calling the RPC directly.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ orgId: string; membershipId: string }> }
) {
  const { orgId, membershipId } = await context.params;

  // The caller must be a coach of this firm, or the global admin (who is not a
  // firm member and must still be able to revoke coaches across firms).
  const coachCtx = await getCoachContext(orgId);
  if (!coachCtx.ok) {
    const adminCtx = await getGlobalAdminContext(orgId);
    if (!adminCtx.ok) {
      return firmNoStoreJson(
        { error: adminCtx.status === 401 ? "Unauthorized" : "Forbidden" },
        { status: adminCtx.status }
      );
    }
  }

  try {
    const supabase = await createClient();

    // Determine the target's role (visible only to a coach of the firm or admin).
    const { data: roleData, error: roleError } = await supabase.rpc(
      "firm_membership_role",
      { p_membership_id: membershipId }
    );
    if (roleError) {
      return firmNoStoreJson(
        { error: roleError.message },
        { status: statusForRpcError(roleError) }
      );
    }

    const targetRole = roleData as string;

    // Revoking a coach is global-admin-only — a coach must receive no path to it.
    if (targetRole === "coach") {
      const admin = await getGlobalAdminContext(orgId);
      if (!admin.ok) {
        return firmNoStoreJson(
          { error: admin.status === 401 ? "Unauthorized" : "Forbidden" },
          { status: admin.status === 401 ? 401 : 403 }
        );
      }
    }

    const { error } = await firmRevokeMembership(supabase, membershipId);
    if (error) {
      return firmNoStoreJson({ error: error.message }, { status: statusForRpcError(error) });
    }
    return firmNoStoreJson({ success: true });
  } catch (e) {
    console.error("firm revoke error:", e);
    return firmNoStoreJson({ error: "Failed to revoke membership" }, { status: 500 });
  }
}
