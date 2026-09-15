import { createClient } from "@/lib/server";
import { firmNoStoreJson, getCoachContext } from "@/lib/firm/context";
import { firmAssignCoachStudent } from "@/lib/firm/rpc";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Assign a student membership to a coach (authorization enforced by the RPC). */
export async function POST(
  request: Request,
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

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return firmNoStoreJson({ error: "Invalid JSON body" }, { status: 400 });
  }

  const body = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const coachMembershipId =
    typeof body.coachMembershipId === "string" ? body.coachMembershipId : "";
  if (coachMembershipId === "") {
    return firmNoStoreJson({ error: "coachMembershipId is required" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { error } = await firmAssignCoachStudent(supabase, {
      organizationId: ctx.context.active.organization_id,
      coachMembershipId,
      studentMembershipId: membershipId,
    });
    if (error) {
      return firmNoStoreJson({ error: error.message }, { status: 400 });
    }
    return firmNoStoreJson({ success: true });
  } catch (e) {
    console.error("firm assign error:", e);
    return firmNoStoreJson({ error: "Failed to assign student" }, { status: 500 });
  }
}
