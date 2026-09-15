import { createClient } from "@/lib/server";
import { firmNoStoreJson, getCoachContext } from "@/lib/firm/context";
import { firmRevokeMembership } from "@/lib/firm/rpc";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Revoke an organization membership (active-coach enforcement lives in the RPC). */
export async function POST(
  _request: Request,
  context: { params: Promise<{ orgId: string; membershipId: string }> }
) {
  const { orgId, membershipId } = await context.params;
  const ctx = await getCoachContext(orgId);
  if (!ctx.ok) {
    return firmNoStoreJson({ error: ctx.error }, { status: ctx.status });
  }
  if (!ctx.context.active) {
    return firmNoStoreJson({ error: "Not found" }, { status: 404 });
  }

  try {
    const supabase = await createClient();
    const { error } = await firmRevokeMembership(supabase, membershipId);
    if (error) {
      return firmNoStoreJson({ error: error.message }, { status: 400 });
    }
    return firmNoStoreJson({ success: true });
  } catch (e) {
    console.error("firm revoke error:", e);
    return firmNoStoreJson({ error: "Failed to revoke membership" }, { status: 500 });
  }
}
