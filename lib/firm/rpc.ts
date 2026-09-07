/**
 * Thin wrappers for firm SECURITY DEFINER RPCs.
 * Uses the existing user-scoped server client — no service-role key.
 */
import { createClient } from "@/lib/server";
import {
  buildInviteUrl,
  generateInvitationToken,
  hashInvitationToken,
} from "@/lib/firm/tokens";

export type FirmOrganization = {
  id: string;
  name: string;
  created_by: string | null;
  next_pseudonym_number: number;
  created_at: string;
};

export type FirmInvitation = {
  id: string;
  organization_id: string;
  role: "coach" | "student";
  email: string;
  token_hash: string;
  status: "pending" | "accepted" | "declined" | "expired";
  created_by: string | null;
  accepted_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

export type FirmAssignment = {
  id: string;
  organization_id: string;
  coach_membership_id: string;
  student_membership_id: string;
  created_at: string;
};

export type FirmInvitationPreview = {
  invitation_id: string;
  organization_id: string;
  organization_name: string;
  role: "coach" | "student";
  status: string;
  email_bound: string;
  expires_at: string;
  is_expired: boolean;
  created_at: string;
};

export type FirmAcceptResult = {
  invitation_id: string;
  organization_id: string;
  role: "coach" | "student";
  status: string;
  membership_id: string;
  joined_at: string;
  pseudonym: string | null;
  assignment_id: string | null;
};

export async function firmCreateOrganization(name: string) {
  const supabase = await createClient();
  return supabase.rpc("firm_create_organization", { p_name: name });
}

/**
 * Generate a raw invite token, store only its SHA-256 hash via firm_create_invitation,
 * and return the raw token once for the shareable link.
 */
export async function firmCreateInvitationWithToken(input: {
  organizationId: string;
  role: "coach" | "student";
  email: string;
  expiresAt: string;
  origin?: string;
}) {
  const rawToken = generateInvitationToken();
  const tokenHash = hashInvitationToken(rawToken);
  const supabase = await createClient();
  const result = await supabase.rpc("firm_create_invitation", {
    p_organization_id: input.organizationId,
    p_role: input.role,
    p_email: input.email,
    p_token_hash: tokenHash,
    p_expires_at: input.expiresAt,
  });

  if (result.error) {
    return { ...result, rawToken: null as string | null, inviteUrl: null as string | null };
  }

  const origin = input.origin ?? "";
  return {
    ...result,
    rawToken,
    inviteUrl: origin ? buildInviteUrl(rawToken, origin) : null,
  };
}

/** Low-level RPC when caller already hashed the token. Prefer firmCreateInvitationWithToken. */
export async function firmCreateInvitation(input: {
  organizationId: string;
  role: "coach" | "student";
  email: string;
  tokenHash: string;
  expiresAt: string;
}) {
  const supabase = await createClient();
  return supabase.rpc("firm_create_invitation", {
    p_organization_id: input.organizationId,
    p_role: input.role,
    p_email: input.email,
    p_token_hash: input.tokenHash,
    p_expires_at: input.expiresAt,
  });
}

export async function firmPreviewInvitation(tokenHash: string) {
  const supabase = await createClient();
  return supabase.rpc("firm_preview_invitation", { p_token_hash: tokenHash });
}

export async function firmAcceptInvitation(tokenHash: string) {
  const supabase = await createClient();
  return supabase.rpc("firm_accept_invitation", { p_token_hash: tokenHash });
}

export async function firmDeclineInvitation(tokenHash: string) {
  const supabase = await createClient();
  return supabase.rpc("firm_decline_invitation", { p_token_hash: tokenHash });
}

export async function firmRevokeMembership(membershipId: string) {
  const supabase = await createClient();
  return supabase.rpc("firm_revoke_membership", { p_membership_id: membershipId });
}

export async function firmAssignCoachStudent(input: {
  organizationId: string;
  coachMembershipId: string;
  studentMembershipId: string;
}) {
  const supabase = await createClient();
  return supabase.rpc("firm_assign_coach_student", {
    p_organization_id: input.organizationId,
    p_coach_membership_id: input.coachMembershipId,
    p_student_membership_id: input.studentMembershipId,
  });
}

export async function firmLogAuditEvent(input: {
  organizationId: string;
  action: string;
  targetUserId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = await createClient();
  return supabase.rpc("firm_log_audit_event", {
    p_organization_id: input.organizationId,
    p_action: input.action,
    p_target_user_id: input.targetUserId ?? null,
    p_metadata: input.metadata ?? {},
  });
}
