/**
 * Server-only Firm RPC helpers.
 *
 * These self-client using the authenticated server Supabase client
 * (next/headers-backed), so they must never be imported from a client
 * component. Client-safe pure wrappers live in lib/firm/rpc.ts; browser
 * flows go through API routes that call into these helpers.
 *
 * Uses the existing user-scoped server client — no service-role key.
 * Authorization is enforced by the SECURITY DEFINER RPCs themselves
 * (active-coach checks, org scoping, audit logging all live in the
 * database functions).
 */
import { createClient } from "@/lib/server";
import {
  firmCreateInvitationWithToken,
  firmCreateOrganization as firmCreateOrganizationRpc,
} from "@/lib/firm/rpc";
import {
  generateInvitationToken,
  hashInvitationToken,
} from "@/lib/firm/tokens.server";

/** Create an organization on behalf of the authenticated coach. */
export async function firmCreateOrganization(name: string) {
  const supabase = await createClient();
  return firmCreateOrganizationRpc(supabase, name);
}

/**
 * Server-side invitation creation: generate the raw token here, hash it,
 * store only the hash, and return the raw token once for the shareable link.
 * The raw token is intentionally never persisted or sent back by the
 * database; it lives only in this server execution context.
 */
export async function createInvitationWithToken(input: {
  organizationId: string;
  role: "coach" | "student";
  email: string;
  expiresAt: string;
  origin?: string;
}) {
  const rawToken = generateInvitationToken();
  const tokenHash = hashInvitationToken(rawToken);
  const supabase = await createClient();

  return firmCreateInvitationWithToken(supabase, {
    organizationId: input.organizationId,
    role: input.role,
    email: input.email,
    tokenHash,
    rawToken,
    expiresAt: input.expiresAt,
    origin: input.origin,
  });
}
