import { createClient } from "@/lib/server";
import { firmNoStoreJson, getCoachContext } from "@/lib/firm/context";
import { buildCoachStudentDetail } from "@/lib/firm/reads";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
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
    const body = await buildCoachStudentDetail(
      supabase,
      ctx.context.active.organization_id,
      membershipId
    );
    if (!body) {
      return firmNoStoreJson({ error: "Not found" }, { status: 404 });
    }
    return firmNoStoreJson(body);
  } catch (e) {
    console.error("firm student detail error:", e);
    return firmNoStoreJson({ error: "Failed to load student" }, { status: 500 });
  }
}
