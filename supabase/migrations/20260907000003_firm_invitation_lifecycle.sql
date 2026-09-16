-- Invitation & membership lifecycle RPCs (accept, decline, revoke, preview).
-- Extends firm write path; does not weaken existing RLS or touch AI-coach tables.

-- ---------------------------------------------------------------------------
-- Preview: safe public lookup by token hash (no raw token stored/returned)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION firm_preview_invitation(p_token_hash TEXT)
RETURNS TABLE (
  invitation_id UUID,
  organization_id UUID,
  organization_name TEXT,
  role TEXT,
  status TEXT,
  email_bound TEXT,
  expires_at TIMESTAMPTZ,
  is_expired BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token_hash IS NULL OR btrim(p_token_hash) = '' THEN
    RAISE EXCEPTION 'token_hash is required' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.organization_id,
    o.name,
    i.role,
    CASE
      WHEN i.status = 'pending' AND i.expires_at <= NOW() THEN 'expired'::text
      ELSE i.status
    END,
    i.email,
    i.expires_at,
    (i.expires_at <= NOW()),
    i.created_at
  FROM invitations i
  JOIN organizations o ON o.id = i.organization_id
  WHERE i.token_hash = p_token_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation not found' USING ERRCODE = 'no_data_found';
  END IF;

  RETURN;
END;
$$;

-- ---------------------------------------------------------------------------
-- Accept invitation (atomic)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION firm_accept_invitation(p_token_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_email TEXT := firm_current_user_email();
  v_inv invitations%ROWTYPE;
  v_membership organization_memberships%ROWTYPE;
  v_inviter_coach_mem UUID;
  v_assignment_id UUID;
  v_pseudonym TEXT;
  v_active_coaches INTEGER;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_token_hash IS NULL OR btrim(p_token_hash) = '' THEN
    RAISE EXCEPTION 'token_hash is required' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_inv
  FROM invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_inv.status = 'accepted' THEN
    RAISE EXCEPTION 'invitation already accepted' USING ERRCODE = 'check_violation';
  END IF;

  IF v_inv.status = 'declined' THEN
    RAISE EXCEPTION 'invitation already declined' USING ERRCODE = 'check_violation';
  END IF;

  IF v_inv.status = 'expired' OR v_inv.expires_at <= NOW() THEN
    IF v_inv.status = 'pending' THEN
      UPDATE invitations SET status = 'expired' WHERE id = v_inv.id;
    END IF;
    RAISE EXCEPTION 'invitation expired' USING ERRCODE = 'check_violation';
  END IF;

  IF v_inv.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'invitation is not pending' USING ERRCODE = 'check_violation';
  END IF;

  -- Email binding: invitations.email is required today; enforce JWT match when set.
  IF v_inv.email IS NOT NULL AND btrim(v_inv.email) <> '' THEN
    IF v_email IS NULL OR lower(v_email) <> lower(v_inv.email) THEN
      RAISE EXCEPTION 'authenticated email does not match invitation'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- Membership: insert or reactivate prior left/revoked row for same org+user+role
  SELECT * INTO v_membership
  FROM organization_memberships
  WHERE organization_id = v_inv.organization_id
    AND user_id = v_actor
    AND role = v_inv.role
  FOR UPDATE;

  IF FOUND THEN
    IF v_membership.status = 'active' THEN
      RAISE EXCEPTION 'already an active member for this organization and role'
        USING ERRCODE = 'unique_violation';
    END IF;

    UPDATE organization_memberships
    SET status = 'active',
        joined_at = NOW(),
        ended_at = NULL
    WHERE id = v_membership.id
    RETURNING * INTO v_membership;
  ELSE
    INSERT INTO organization_memberships (
      organization_id, user_id, role, status, joined_at
    ) VALUES (
      v_inv.organization_id, v_actor, v_inv.role, 'active', NOW()
    )
    RETURNING * INTO v_membership;
  END IF;

  -- Pseudonym for students only (coach-facing label; skip if already allocated)
  IF v_inv.role = 'student' THEN
    SELECT label INTO v_pseudonym
    FROM pseudonym_labels
    WHERE organization_id = v_inv.organization_id
      AND user_id = v_actor;

    IF v_pseudonym IS NULL THEN
      INSERT INTO pseudonym_labels (organization_id, user_id)
      VALUES (v_inv.organization_id, v_actor)
      RETURNING label INTO v_pseudonym;
    END IF;
  END IF;

  -- Multi-coach orgs: assign student to inviting coach when that coach is still active
  v_active_coaches := firm_active_coach_count(v_inv.organization_id);
  IF v_inv.role = 'student' AND v_active_coaches > 1 AND v_inv.created_by IS NOT NULL THEN
    SELECT m.id INTO v_inviter_coach_mem
    FROM organization_memberships m
    WHERE m.organization_id = v_inv.organization_id
      AND m.user_id = v_inv.created_by
      AND m.role = 'coach'
      AND m.status = 'active';

    IF v_inviter_coach_mem IS NOT NULL THEN
      INSERT INTO coach_student_assignments (
        organization_id, coach_membership_id, student_membership_id
      ) VALUES (
        v_inv.organization_id, v_inviter_coach_mem, v_membership.id
      )
      ON CONFLICT ON CONSTRAINT coach_student_assignments_unique_pair DO NOTHING
      RETURNING id INTO v_assignment_id;

      IF v_assignment_id IS NULL THEN
        SELECT id INTO v_assignment_id
        FROM coach_student_assignments
        WHERE organization_id = v_inv.organization_id
          AND coach_membership_id = v_inviter_coach_mem
          AND student_membership_id = v_membership.id;
      END IF;
    END IF;
  END IF;

  UPDATE invitations
  SET status = 'accepted',
      accepted_by = v_actor,
      accepted_at = NOW()
  WHERE id = v_inv.id
  RETURNING * INTO v_inv;

  INSERT INTO audit_log (organization_id, actor_id, action, target_user_id, metadata)
  VALUES (
    v_inv.organization_id,
    v_actor,
    'invitation.accepted',
    v_actor,
    jsonb_build_object(
      'invitation_id', v_inv.id,
      'role', v_inv.role,
      'membership_id', v_membership.id,
      'pseudonym', v_pseudonym,
      'assignment_id', v_assignment_id
    )
  );

  RETURN jsonb_build_object(
    'invitation_id', v_inv.id,
    'organization_id', v_inv.organization_id,
    'role', v_inv.role,
    'status', v_inv.status,
    'membership_id', v_membership.id,
    'joined_at', v_membership.joined_at,
    'pseudonym', v_pseudonym,
    'assignment_id', v_assignment_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Decline invitation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION firm_decline_invitation(p_token_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_email TEXT := firm_current_user_email();
  v_inv invitations%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_token_hash IS NULL OR btrim(p_token_hash) = '' THEN
    RAISE EXCEPTION 'token_hash is required' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_inv
  FROM invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_inv.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'invitation is not pending' USING ERRCODE = 'check_violation';
  END IF;

  IF v_inv.expires_at <= NOW() THEN
    UPDATE invitations SET status = 'expired' WHERE id = v_inv.id;
    RAISE EXCEPTION 'invitation expired' USING ERRCODE = 'check_violation';
  END IF;

  IF v_inv.email IS NOT NULL AND btrim(v_inv.email) <> '' THEN
    IF v_email IS NULL OR lower(v_email) <> lower(v_inv.email) THEN
      RAISE EXCEPTION 'authenticated email does not match invitation'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  UPDATE invitations
  SET status = 'declined'
  WHERE id = v_inv.id
  RETURNING * INTO v_inv;

  INSERT INTO audit_log (organization_id, actor_id, action, target_user_id, metadata)
  VALUES (
    v_inv.organization_id,
    v_actor,
    'invitation.declined',
    v_actor,
    jsonb_build_object('invitation_id', v_inv.id, 'role', v_inv.role)
  );

  RETURN jsonb_build_object(
    'invitation_id', v_inv.id,
    'organization_id', v_inv.organization_id,
    'status', v_inv.status
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Revoke membership (active coach in same org)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION firm_revoke_membership(p_membership_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_target organization_memberships%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_membership_id IS NULL THEN
    RAISE EXCEPTION 'membership_id is required' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_target
  FROM organization_memberships
  WHERE id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT firm_is_active_coach(v_target.organization_id, v_actor) THEN
    RAISE EXCEPTION 'not an active coach for organization' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_target.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'membership is not active' USING ERRCODE = 'check_violation';
  END IF;

  -- Coaches may revoke students; revoking another coach requires being a coach
  -- (same check). Prevent self-revoke via this admin path — use leave later.
  IF v_target.user_id = v_actor THEN
    RAISE EXCEPTION 'cannot revoke your own membership via firm_revoke_membership'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE organization_memberships
  SET status = 'revoked',
      ended_at = NOW()
  WHERE id = v_target.id
  RETURNING * INTO v_target;

  INSERT INTO audit_log (organization_id, actor_id, action, target_user_id, metadata)
  VALUES (
    v_target.organization_id,
    v_actor,
    'membership.revoked',
    v_target.user_id,
    jsonb_build_object(
      'membership_id', v_target.id,
      'role', v_target.role
    )
  );

  RETURN jsonb_build_object(
    'membership_id', v_target.id,
    'organization_id', v_target.organization_id,
    'user_id', v_target.user_id,
    'role', v_target.role,
    'status', v_target.status,
    'ended_at', v_target.ended_at
  );
END;
$$;

REVOKE ALL ON FUNCTION firm_preview_invitation(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION firm_accept_invitation(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION firm_decline_invitation(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION firm_revoke_membership(UUID) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION firm_preview_invitation(TEXT) TO authenticated;
    GRANT EXECUTE ON FUNCTION firm_accept_invitation(TEXT) TO authenticated;
    GRANT EXECUTE ON FUNCTION firm_decline_invitation(TEXT) TO authenticated;
    GRANT EXECUTE ON FUNCTION firm_revoke_membership(UUID) TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    -- Preview only: unauthenticated invitees can see firm name + disclosure context
    GRANT EXECUTE ON FUNCTION firm_preview_invitation(TEXT) TO anon;
  END IF;
END $$;

COMMENT ON FUNCTION firm_preview_invitation(TEXT) IS
  'Safe invite preview by token_hash; returns org name/role/status — never raw token';
COMMENT ON FUNCTION firm_accept_invitation(TEXT) IS
  'Atomic accept: membership + pseudonym + optional assignment + invitation + audit';
COMMENT ON FUNCTION firm_decline_invitation(TEXT) IS
  'Decline pending invitation; no membership created';
COMMENT ON FUNCTION firm_revoke_membership(UUID) IS
  'Active coach revokes another member; removes coach trade authorization immediately';
