import { createClient } from "@/lib/server";
import { firmNoStoreJson, getCoachContext } from "@/lib/firm/context";
import { buildCoachPerformance } from "@/lib/firm/reads";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    const body = await buildCoachPerformance(
      supabase,
      ctx.context.active.organization_id
    );
    return firmNoStoreJson(body);
  } catch (e) {
    console.error("firm performance error:", e);
    return firmNoStoreJson({ error: "Failed to load performance" }, { status: 500 });
  }
}
