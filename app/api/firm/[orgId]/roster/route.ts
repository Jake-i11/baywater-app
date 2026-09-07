import { createClient } from "@/lib/server";
import { firmNoStoreJson, getCoachContext } from "@/lib/firm/context";
import { buildCoachRoster } from "@/lib/firm/reads";
import type { FirmCoachRosterResponse } from "@/lib/firm/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: Request,
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

  const sortParam = new URL(request.url).searchParams.get("sort") ?? "discipline";
  const sort = (
    ["discipline", "recent", "pl", "pseudonym"].includes(sortParam)
      ? sortParam
      : "discipline"
  ) as FirmCoachRosterResponse["sort"];

  try {
    const supabase = await createClient();
    const body = await buildCoachRoster(
      supabase,
      ctx.context.active.organization_id,
      sort
    );
    return firmNoStoreJson(body);
  } catch (e) {
    console.error("firm roster error:", e);
    return firmNoStoreJson({ error: "Failed to load roster" }, { status: 500 });
  }
}
