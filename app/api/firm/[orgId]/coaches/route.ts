import { createClient } from "@/lib/server";
import { firmNoStoreJson, getGlobalAdminContext } from "@/lib/firm/context";
import { listOrgCoaches } from "@/lib/firm/reads";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GLOBAL-ADMIN-ONLY: active coaches of the firm, for the coach management page.
 *
 * Authorization is enforced server-side (getGlobalAdminContext) and again inside
 * the firm_coach_list SECURITY DEFINER RPC — a coach cannot call this even
 * directly against Supabase, and hiding the nav item is not relied upon.
 */
export async function GET(
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
    const coaches = await listOrgCoaches(supabase, admin.context.organization_id);
    return firmNoStoreJson({
      organization_id: admin.context.organization_id,
      organization_name: admin.context.organization_name,
      is_global_admin: true,
      coaches,
    });
  } catch (e) {
    console.error("firm coaches list error:", e);
    return firmNoStoreJson({ error: "Failed to load coaches" }, { status: 500 });
  }
}
