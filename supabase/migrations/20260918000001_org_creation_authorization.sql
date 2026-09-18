-- Organization creation authorization.
--
-- Before this migration, firm_create_organization allowed ANY authenticated
-- user to create a firm and become its coach (the only check was
-- `auth.uid() IS NOT NULL`). A student who guessed the RPC could silently
-- grant themselves a coach membership in a brand-new firm.
--
-- Requirement: students must never be able to create organizations. The
-- system's only per-user "student" signal is an ACTIVE student membership
-- (roles live per-membership in organization_memberships), so the guard is:
--
--   authenticated (unchanged)  AND
--   NOT an active student in any organization (new)  AND
--   NOT the global admin (explicit pass-through, though admins never create
--   firms from the Firm page)
--
-- A caller with no memberships yet (a prospective coach) may still create a
-- firm — creation is the entry point that makes them a coach.
--
-- Runtime authorization keeps comparing auth.uid() against database state —
-- never client-supplied role, email, or UI visibility.

-- ===========================================================================
-- 1. Student signal helper
-- ===========================================================================
CREATE OR REPLACE FUNCTION firm_is_active_student_anywhere(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_memberships m
    WHERE m.user_id = p_user_id
      AND m.role = 'student'
      AND m.status = 'active'
  );
$$;

COMMENT ON FUNCTION firm_is_active_student_anywhere(UUID) IS
  'True when the identity holds an ACTIVE student membership in any organization';

REVOKE ALL ON FUNCTION firm_is_active_student_anywhere(UUID) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION firm_is_active_student_anywhere(UUID) TO authenticated;
  END IF;
END $$;

-- ===========================================================================
-- 2. Guarded organization creation
-- ===========================================================================
CREATE OR REPLACE FUNCTION firm_create_organization(p_name TEXT)
RETURNS organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_org organizations%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Students must never create organizations. Detected from database state
  -- (active student membership), never from a client-provided role.
  IF firm_is_active_student_anywhere(v_actor) THEN
    RAISE EXCEPTION 'students cannot create organizations'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'organization name is required' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO organizations (name, created_by)
  VALUES (btrim(p_name), v_actor)
  RETURNING * INTO v_org;

  INSERT INTO organization_memberships (
    organization_id, user_id, role, status, joined_at
  ) VALUES (
    v_org.id, v_actor, 'coach', 'active', NOW()
  );

  INSERT INTO audit_log (organization_id, actor_id, action, target_user_id, metadata)
  VALUES (
    v_org.id,
    v_actor,
    'organization.created',
    v_actor,
    jsonb_build_object('name', v_org.name)
  );

  RETURN v_org;
END;
$$;

REVOKE ALL ON FUNCTION firm_create_organization(TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION firm_create_organization(TEXT) TO authenticated;
  END IF;
END $$;

COMMENT ON FUNCTION firm_create_organization(TEXT) IS
  'Trusted write: authenticated non-student creates firm + active coach membership for caller';
