import { createClient } from "@/lib/server";
import { firmNoStoreJson, getGlobalAdminContext } from "@/lib/firm/context";
import { firmDeleteOrganization } from "@/lib/firm/rpc";
import type { FirmDeleteOrganizationResponse } from "@/lib/firm/types";

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
 * DELETE /api/firm/[orgId]
 *
 * GLOBAL-ADMIN-ONLY: delete a firm and all firm-owned rows.
 *
 * Authorization is enforced server-side here (getGlobalAdminContext) and again
 * inside the firm_delete_organization SECURITY DEFINER RPC, so a coach — or any
 * caller hitting the API/RPC directly — cannot delete a firm. Student-owned data
 * (trades, profiles, auth users) is never touched: only rows reachable through
 * organizations' ON DELETE CASCADE graph are removed.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await context.params;

  const admin = await getGlobalAdminContext(orgId);
  if (!admin.ok) {
    return firmNoStoreJson(
      { error: admin.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: admin.status }
    );
  }

  try {
    const supabase = await createClient();
    const { data, error } = await firmDeleteOrganization(
      supabase,
      admin.context.organization_id
    );
    if (error) {
      return firmNoStoreJson(
        { error: error.message },
        { status: statusForRpcError(error) }
      );
    }
    return firmNoStoreJson({
      success: true,
      deleted: (data ?? null) as FirmDeleteOrganizationResponse | null,
    });
  } catch (e) {
    console.error("firm delete error:", e);
    return firmNoStoreJson({ error: "Failed to delete firm" }, { status: 500 });
  }
}
