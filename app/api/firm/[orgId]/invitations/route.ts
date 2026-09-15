import { createClient } from "@/lib/server";
import { firmNoStoreJson, getCoachContext } from "@/lib/firm/context";
import { createInvitationWithToken } from "@/lib/firm/rpc.server";
import { listCoachInvitations } from "@/lib/firm/reads";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ParsedCreateInvitation =
  | { ok: true; email: string; role: "coach" | "student" }
  | { ok: false; error: string };

function parseCreateInvitationBody(raw: unknown): ParsedCreateInvitation {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "Invalid request body" };
  }
  const body = raw as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const role =
    body.role === "coach" ? ("coach" as const) : body.role === "student" ? ("student" as const) : null;

  if (email === "") return { ok: false, error: "Email is required" };
  if (role === null) return { ok: false, error: "Role must be coach or student" };
  return { ok: true, email, role };
}

/** Lists invitations for the organization (token hashes intentionally omitted). */
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
    const invitations = await listCoachInvitations(
      supabase,
      ctx.context.active.organization_id
    );
    return firmNoStoreJson({ invitations });
  } catch (e) {
    console.error("firm invitations list error:", e);
    return firmNoStoreJson({ error: "Failed to load invitations" }, { status: 500 });
  }
}

/**
 * Creates an invitation. The raw invite token is generated and hashed on the
 * server; the shareable link is returned exactly once in this response.
 */
export async function POST(
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

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return firmNoStoreJson({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseCreateInvitationBody(raw);
  if (!parsed.ok) {
    return firmNoStoreJson({ error: parsed.error }, { status: 400 });
  }

  // Same 7-day expiry the coach UI has always applied.
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  try {
    const result = await createInvitationWithToken({
      organizationId: ctx.context.active.organization_id,
      role: parsed.role,
      email: parsed.email,
      expiresAt: expiresAt.toISOString(),
      origin: new URL(request.url).origin,
    });
    if (result.error) {
      return firmNoStoreJson({ error: result.error.message }, { status: 400 });
    }
    return firmNoStoreJson({ inviteUrl: result.inviteUrl ?? null });
  } catch (e) {
    console.error("firm invitation create error:", e);
    return firmNoStoreJson({ error: "Failed to create invitation" }, { status: 500 });
  }
}
