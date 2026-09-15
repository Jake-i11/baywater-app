import { createClient } from "@/lib/server";
import { firmNoStoreJson, getCoachContext } from "@/lib/firm/context";
import { listOrgCoaches } from "@/lib/firm/reads";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Active coaches (id + pseudonym) for the assign-student picker. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await context.params;
  const ctx = await getCoachContext(orgId);
  if (!ctx.ok) {
    return firmNoStoreJson({ error: ctx.error }, { status: ctx.status });
  }
  if (!ctx.context.active) {
    return firmNoStoreJson({ error: "Not found" }, { status: 404 });
  }

  try {
    const supabase = await createClient();
    const coaches = await listOrgCoaches(supabase, ctx.context.active.organization_id);
    return firmNoStoreJson({ coaches });
  } catch (e) {
    console.error("firm coaches list error:", e);
    return firmNoStoreJson({ error: "Failed to load coaches" }, { status: 500 });
  }
}
