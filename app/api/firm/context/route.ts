import { firmNoStoreJson, getCoachContext } from "@/lib/firm/context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Lists the caller's active coach organizations (for /firm org picker). */
export async function GET() {
  const ctx = await getCoachContext();
  if (!ctx.ok) {
    return firmNoStoreJson({ error: ctx.error }, { status: ctx.status });
  }
  return firmNoStoreJson({
    user_id: ctx.context.user_id,
    organizations: ctx.context.organizations,
  });
}
