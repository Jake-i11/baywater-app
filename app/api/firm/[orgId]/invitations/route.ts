import { createClient } from "@/lib/server";
import { firmNoStoreJson, getOrgAccessContext } from "@/lib/firm/context";
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

/**
 * Lists invitations for the organization (token hashes intentionally omitted).
 *
 * Access: an ACTIVE coach of this exact firm, or the global admin. A coach of
 * another firm (or an anonymous caller) gets no context and therefore no data.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await context.params;
  const access = await getOrgAccessContext(orgId);
  if (!access.ok) {
    return firmNoStoreJson({ error: access.error }, { status: access.status });
  }

  try {
    const supabase = await createClient();
    const invitations = await listCoachInvitations(
      supabase,
      access.context.organization_id
    );
    return firmNoStoreJson({
      invitations,
      organization_id: access.context.organization_id,
      is_global_admin: access.context.is_global_admin,
    });
  } catch (e) {
    console.error("firm invitations list error:", e);
    return firmNoStoreJson({ error: "Failed to load invitations" }, { status: 500 });
  }
}

/**
 * Creates an invitation. The raw invite token is generated and hashed on the
 * server; the shareable link is returned exactly once in this response.
 *
 * Role authorization:
 *   * coach   -> GLOBAL ADMIN ONLY (enforced here AND inside the RPC)
 *   * student -> an active coach of this firm, or the global admin
 *
 * The global admin is not a member of any firm, so a coach-membership check
 * alone would make admin invitations impossible; access is resolved through
 * getOrgAccessContext, which also validates orgId for coaches.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await context.params;
  const access = await getOrgAccessContext(orgId);
  if (!access.ok) {
    return firmNoStoreJson({ error: access.error }, { status: access.status });
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

  // Coach invitations may only be created by the single GLOBAL admin. Student
  // invitations keep the existing coach-level authorization (coaches must retain
  // the ability to invite students into their own firm). The database RPC
  // (firm_create_invitation) enforces the same rule independently.
  if (parsed.role === "coach" && !access.context.is_global_admin) {
    return firmNoStoreJson(
      { error: "Only the Baywater global admin can invite coaches" },
      { status: 403 }
    );
  }

  // Same 7-day expiry the coach UI has always applied.
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  try {
    const result = await createInvitationWithToken({
      organizationId: access.context.organization_id,
      role: parsed.role,
      email: parsed.email,
      expiresAt: expiresAt.toISOString(),
      origin: new URL(request.url).origin,
    });
    if (result.error) {
      return firmNoStoreJson({ error: result.error.message }, { status: 400 });
    }
    return firmNoStoreJson({
      inviteUrl: result.inviteUrl ?? null,
      role: parsed.role,
    });
  } catch (e) {
    console.error("firm invitation create error:", e);
    return firmNoStoreJson({ error: "Failed to create invitation" }, { status: 500 });
  }
}
