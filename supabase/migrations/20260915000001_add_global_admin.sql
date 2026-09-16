-- Baywater GLOBAL admin role.
--
-- There is exactly ONE admin in the entire Baywater system, bound to the
-- Supabase Auth account with email `iappinijacob@gmail.com`. Admin is NOT a
-- firm membership role and NOT per-organization.
--
-- Hierarchy:
--   GLOBAL ADMIN  (single account)  : manage coaches across firms
--   COACH         (per organization): highest authority inside their firm
--   STUDENT       (per organization): unchanged
--
-- Security model:
--   * `public.baywater_admins` holds exactly one row (singleton + email-bound
--     guard trigger), so no second admin can ever exist.
--   * Runtime authorization always compares the authenticated `auth.uid()`
--     against that row — never the email string.
--   * Nothing in the invitation / firm-creation / membership / assignment paths
--     can create an admin. `organization_memberships.role` stays ('coach',
--     'student'); invitations stay ('coach','student').
--
-- This migration is safe on a database that never saw the earlier
-- firm-level-admin revision AND on one that did: section 1 collapses any
-- firm-level admin artifacts before installing the global mechanism.

-- ===========================================================================
-- 1. Collapse any firm-level admin artifacts (defensive / idempotent)
-- ===========================================================================
DROP INDEX IF EXISTS public.idx_organization_memberships_active_admin;
DROP FUNCTION IF EXISTS public.firm_is_active_admin(UUID, UUID);
DROP FUNCTION IF EXISTS public.firm_active_admin_count(UUID);

DO $$
DECLARE
  v_conname TEXT;
BEGIN
  -- Drop the role CHECK without assuming its generated name.
  SELECT con.conname INTO v_conname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'organization_memberships'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%role%'
    AND pg_get_constraintdef(con.oid) ILIKE '%student%'
  LIMIT 1;

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.organization_memberships DROP CONSTRAINT %I', v_conname);
  END IF;

  -- Demote any firm-level admin rows to coach (or drop exact duplicates).
  -- Demoting admin -> coach can only *create* valid references for the
  -- coach_student_assignments composite FK, never break one.
  DELETE FROM public.organization_memberships a
  WHERE a.role = 'admin'
    AND EXISTS (
      SELECT 1 FROM public.organization_memberships c
      WHERE c.organization_id = a.organization_id
        AND c.user_id = a.user_id
        AND c.role = 'coach'
    );

  UPDATE public.organization_memberships
  SET role = 'coach'
  WHERE role = 'admin';
END $$;

ALTER TABLE public.organization_memberships
  ADD CONSTRAINT organization_memberships_role_check
  CHECK (role IN ('coach', 'student'));

COMMENT ON COLUMN public.organization_memberships.role IS
  'coach (firm authority) or student. Admin is global, not a membership role.';

-- ===========================================================================
-- 2. The one global admin identity (single-row, email-bound)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.baywater_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  -- Constant column + unique constraint = at most ONE admin row, ever.
  singleton BOOLEAN NOT NULL DEFAULT TRUE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT,
  CONSTRAINT baywater_admins_singleton_unique UNIQUE (singleton),
  CONSTRAINT baywater_admins_singleton_true CHECK (singleton)
);

COMMENT ON TABLE public.baywater_admins IS
  'Single global Baywater administrator; exactly one row, bound to one auth.users identity';

ALTER TABLE public.baywater_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.baywater_admins FORCE ROW LEVEL SECURITY;

-- Bind the stored identity to the designated email at write time, so neither
-- the app, an RPC, nor a stray SQL statement can install a different admin.
CREATE OR REPLACE FUNCTION baywater_admins_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT lower(u.email) INTO v_email
  FROM auth.users u
  WHERE u.id = NEW.user_id;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'global admin identity % does not exist in auth.users', NEW.user_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_email <> 'iappinijacob@gmail.com' THEN
    RAISE EXCEPTION 'only iappinijacob@gmail.com may hold global admin (attempted %)', v_email
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  NEW.email := v_email;
  NEW.singleton := TRUE;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_baywater_admins_guard ON public.baywater_admins;
CREATE TRIGGER trg_baywater_admins_guard
BEFORE INSERT OR UPDATE ON public.baywater_admins
FOR EACH ROW
EXECUTE FUNCTION baywater_admins_guard();

-- A user may only ever read their OWN admin row (no admin enumeration).
CREATE POLICY baywater_admins_select_own
  ON public.baywater_admins
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.baywater_admins FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.baywater_admins FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON TABLE public.baywater_admins FROM authenticated';
    EXECUTE 'GRANT SELECT ON TABLE public.baywater_admins TO authenticated';
  END IF;
END $$;

-- ===========================================================================
-- 3. Global admin authorization helper (UUID-based, never email-based)
-- ===========================================================================
CREATE OR REPLACE FUNCTION firm_is_global_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.baywater_admins a WHERE a.user_id = p_user_id
  );
$$;

-- Active coach of THIS organization, or the global admin (superset used by
-- coach-level reads/actions the admin may also perform).
CREATE OR REPLACE FUNCTION firm_is_active_coach_or_admin(
  p_organization_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT firm_is_active_coach(p_organization_id, p_user_id)
      OR firm_is_global_admin(p_user_id);
$$;

COMMENT ON FUNCTION firm_is_global_admin(UUID) IS
  'True only for the single global Baywater admin identity (UUID-matched)';
COMMENT ON FUNCTION firm_is_active_coach_or_admin(UUID, UUID) IS
  'Active coach of the organization, or the global admin';

REVOKE ALL ON FUNCTION firm_is_global_admin(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION firm_is_active_coach_or_admin(UUID, UUID) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION firm_is_global_admin(UUID) TO authenticated;
    GRANT EXECUTE ON FUNCTION firm_is_active_coach_or_admin(UUID, UUID) TO authenticated;
    GRANT EXECUTE ON FUNCTION firm_is_active_coach(UUID, UUID) TO authenticated;
  END IF;
END $$;

-- ===========================================================================
-- 4. Global-admin reads
-- ===========================================================================

-- Every organization (the admin manages coaches across firms).
CREATE OR REPLACE FUNCTION firm_admin_list_organizations()
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT firm_is_global_admin(v_actor) THEN
    -- Generic denial — do not reveal anything to non-admins.
    RAISE EXCEPTION 'not found' USING ERRCODE = 'no_data_found';
  END IF;

  RETURN QUERY
  SELECT o.id, o.name, o.created_at
  FROM organizations o
  ORDER BY o.name, o.created_at;
END;
$$;

-- Active coaches of a firm. GLOBAL ADMIN ONLY.
-- Returns membership id + a safe label only — never email or raw user id.
CREATE OR REPLACE FUNCTION firm_coach_list(p_organization_id UUID)
RETURNS TABLE (
  membership_id UUID,
  joined_at TIMESTAMPTZ,
  pseudonym TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT firm_is_global_admin(v_actor) THEN
    -- Coaches must not be able to list coaches, even via a direct RPC call.
    RAISE EXCEPTION 'not found' USING ERRCODE = 'no_data_found';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.joined_at,
    COALESCE(p.label, 'Coach')
  FROM organization_memberships m
  LEFT JOIN pseudonym_labels p
    ON p.organization_id = m.organization_id
   AND p.user_id = m.user_id
  WHERE m.organization_id = p_organization_id
    AND m.role = 'coach'
    AND m.status = 'active'
  ORDER BY COALESCE(p.label, ''), m.joined_at;
END;
$$;

-- Active coaches used by the STUDENT ASSIGNMENT PICKER. Available to an active
-- coach of the organization (so the dropdown works) and to the global admin.
-- Corrected source of truth: labels come from pseudonym_labels, never from
-- organization_memberships (which has no pseudonym column).
CREATE OR REPLACE FUNCTION firm_assignable_coaches(p_organization_id UUID)
RETURNS TABLE (
  membership_id UUID,
  pseudonym TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT firm_is_active_coach_or_admin(p_organization_id, v_actor) THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'no_data_found';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    COALESCE(p.label, 'Coach')
  FROM organization_memberships m
  LEFT JOIN pseudonym_labels p
    ON p.organization_id = m.organization_id
   AND p.user_id = m.user_id
  WHERE m.organization_id = p_organization_id
    AND m.role = 'coach'
    AND m.status = 'active'
  ORDER BY COALESCE(p.label, ''), m.joined_at;
END;
$$;

-- Role of a membership, visible only to a coach of its organization or the
-- global admin. Lets the revoke route decide whether global admin is required.
CREATE OR REPLACE FUNCTION firm_membership_role(p_membership_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_role TEXT;
  v_org UUID;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_membership_id IS NULL THEN
    RAISE EXCEPTION 'membership_id is required' USING ERRCODE = 'check_violation';
  END IF;

  SELECT m.role, m.organization_id INTO v_role, v_org
  FROM organization_memberships m
  WHERE m.id = p_membership_id;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'membership not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT firm_is_active_coach_or_admin(v_org, v_actor) THEN
    RAISE EXCEPTION 'membership not found' USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_role;
END;
$$;

COMMENT ON FUNCTION firm_admin_list_organizations() IS
  'Global-admin-only: all organizations';
COMMENT ON FUNCTION firm_coach_list(UUID) IS
  'Global-admin-only: active coaches of a firm with safe labels';
COMMENT ON FUNCTION firm_assignable_coaches(UUID) IS
  'Assignment picker: active coaches of a firm (coach of the firm or global admin)';
COMMENT ON FUNCTION firm_membership_role(UUID) IS
  'Role of a membership for a coach of that firm or the global admin';

REVOKE ALL ON FUNCTION firm_admin_list_organizations() FROM PUBLIC;
REVOKE ALL ON FUNCTION firm_coach_list(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION firm_assignable_coaches(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION firm_membership_role(UUID) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION firm_admin_list_organizations() TO authenticated;
    GRANT EXECUTE ON FUNCTION firm_coach_list(UUID) TO authenticated;
    GRANT EXECUTE ON FUNCTION firm_assignable_coaches(UUID) TO authenticated;
    GRANT EXECUTE ON FUNCTION firm_membership_role(UUID) TO authenticated;
  END IF;
END $$;

-- ===========================================================================
-- 5. Restore STUDENT-facing coach reads to coach-only
--    (admin is a coach-management role, not a student-data role)
-- ===========================================================================
CREATE OR REPLACE FUNCTION firm_can_coach_view_student(
  p_organization_id UUID,
  p_student_user_id UUID,
  p_viewer_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_memberships coach_m
    JOIN organization_memberships student_m
      ON student_m.organization_id = coach_m.organization_id
     AND student_m.role = 'student'
     AND student_m.status = 'active'
     AND student_m.user_id = p_student_user_id
    WHERE coach_m.organization_id = p_organization_id
      AND coach_m.user_id = p_viewer_user_id
      AND coach_m.role = 'coach'
      AND coach_m.status = 'active'
      AND (
        firm_active_coach_count(p_organization_id) <= 1
        OR EXISTS (
          SELECT 1
          FROM coach_student_assignments a
          WHERE a.organization_id = p_organization_id
            AND a.coach_membership_id = coach_m.id
            AND a.student_membership_id = student_m.id
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION firm_coach_visible_student_joined_at(
  p_student_user_id UUID,
  p_viewer_user_id UUID DEFAULT auth.uid()
)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT min(student_m.joined_at)
  FROM organization_memberships coach_m
  JOIN organization_memberships student_m
    ON student_m.organization_id = coach_m.organization_id
   AND student_m.role = 'student'
   AND student_m.status = 'active'
   AND student_m.user_id = p_student_user_id
  WHERE coach_m.user_id = p_viewer_user_id
    AND coach_m.role = 'coach'
    AND coach_m.status = 'active'
    AND (
      firm_active_coach_count(coach_m.organization_id) <= 1
      OR EXISTS (
        SELECT 1
        FROM coach_student_assignments a
        WHERE a.organization_id = coach_m.organization_id
          AND a.coach_membership_id = coach_m.id
          AND a.student_membership_id = student_m.id
      )
    );
$$;

CREATE OR REPLACE FUNCTION firm_coach_authorized_students(p_organization_id UUID)
RETURNS TABLE (
  membership_id UUID,
  student_user_id UUID,
  joined_at TIMESTAMPTZ,
  pseudonym TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT firm_is_active_coach(p_organization_id, v_actor) THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'no_data_found';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.user_id,
    m.joined_at,
    COALESCE(p.label, 'Student')
  FROM organization_memberships m
  LEFT JOIN pseudonym_labels p
    ON p.organization_id = m.organization_id
   AND p.user_id = m.user_id
  WHERE m.organization_id = p_organization_id
    AND m.role = 'student'
    AND m.status = 'active'
    AND firm_can_coach_view_student(p_organization_id, m.user_id, v_actor)
  ORDER BY p.label NULLS LAST, m.joined_at;
END;
$$;

REVOKE ALL ON FUNCTION firm_coach_authorized_students(UUID) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION firm_coach_authorized_students(UUID) TO authenticated;
  END IF;
END $$;

-- Audit log stays readable by the firm's coaches only.
DROP POLICY IF EXISTS audit_log_select_active_coach ON public.audit_log;
CREATE POLICY audit_log_select_active_coach
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (firm_is_active_coach(organization_id));

-- ===========================================================================
-- 6. Write RPCs
-- ===========================================================================

-- Firm creator becomes a COACH (the highest authority inside their firm).
-- Never the admin.
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

-- COACH invitations require the global admin. STUDENT invitations keep the
-- existing coach-level authorization (admins are not required for those).
CREATE OR REPLACE FUNCTION firm_create_invitation(
  p_organization_id UUID,
  p_role TEXT,
  p_email TEXT,
  p_token_hash TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_inv invitations%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = p_organization_id) THEN
    RAISE EXCEPTION 'organization not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_role NOT IN ('coach', 'student') THEN
    RAISE EXCEPTION 'invalid invitation role' USING ERRCODE = 'check_violation';
  END IF;

  IF p_role = 'coach' THEN
    -- ONLY the single global admin may bring a coach into a firm.
    IF NOT firm_is_global_admin(v_actor) THEN
      RAISE EXCEPTION 'coach invitations require the global Baywater admin'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    -- Students: an active coach of THIS firm, OR the global admin. The admin is
    -- intentionally not a member of any firm, so requiring a coach membership
    -- here would make admin student invitations impossible.
    IF NOT firm_is_active_coach_or_admin(p_organization_id, v_actor) THEN
      RAISE EXCEPTION 'not an active coach for organization' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RAISE EXCEPTION 'email is required' USING ERRCODE = 'check_violation';
  END IF;

  IF p_token_hash IS NULL OR btrim(p_token_hash) = '' THEN
    RAISE EXCEPTION 'token_hash is required' USING ERRCODE = 'check_violation';
  END IF;

  IF p_expires_at IS NULL OR p_expires_at <= NOW() THEN
    RAISE EXCEPTION 'expires_at must be in the future' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO invitations (
    organization_id, role, email, token_hash, status, created_by, expires_at
  ) VALUES (
    p_organization_id,
    p_role,
    lower(btrim(p_email)),
    p_token_hash,
    'pending',
    v_actor,
    p_expires_at
  )
  RETURNING * INTO v_inv;

  INSERT INTO audit_log (organization_id, actor_id, action, target_user_id, metadata)
  VALUES (
    p_organization_id,
    v_actor,
    'invitation.created',
    NULL,
    jsonb_build_object(
      'invitation_id', v_inv.id,
      'role', v_inv.role,
      'email_domain', split_part(v_inv.email, '@', 2)
    )
  );

  RETURN v_inv;
END;
$$;

-- Audit writes: active coaches of the organization.
CREATE OR REPLACE FUNCTION firm_log_audit_event(
  p_organization_id UUID,
  p_action TEXT,
  p_target_user_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_id UUID;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_action IS NULL OR btrim(p_action) = '' THEN
    RAISE EXCEPTION 'action is required' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT firm_is_active_coach(p_organization_id, v_actor) THEN
    RAISE EXCEPTION 'not an active coach for organization' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO audit_log (organization_id, actor_id, action, target_user_id, metadata)
  VALUES (
    p_organization_id,
    v_actor,
    p_action,
    p_target_user_id,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Membership revocation:
--   * student -> an active coach of the firm (or the global admin)
--   * coach   -> the GLOBAL ADMIN only
-- Self-revocation is never allowed through this RPC.
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

  IF NOT firm_is_active_coach_or_admin(v_target.organization_id, v_actor) THEN
    RAISE EXCEPTION 'not an active coach for organization' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_target.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'membership is not active' USING ERRCODE = 'check_violation';
  END IF;

  IF v_target.user_id = v_actor THEN
    RAISE EXCEPTION 'cannot revoke your own membership via firm_revoke_membership'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_target.role = 'coach' AND NOT firm_is_global_admin(v_actor) THEN
    RAISE EXCEPTION 'revoking a coach requires the global Baywater admin'
      USING ERRCODE = 'insufficient_privilege';
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

-- Assignment: a coach may only assign to their own membership (unchanged);
-- the global admin may assign to any active coach in the firm.
CREATE OR REPLACE FUNCTION firm_assign_coach_student(
  p_organization_id UUID,
  p_coach_membership_id UUID,
  p_student_membership_id UUID
)
RETURNS coach_student_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_row coach_student_assignments%ROWTYPE;
  v_actor_membership UUID;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT firm_is_active_coach_or_admin(p_organization_id, v_actor) THEN
    RAISE EXCEPTION 'not an active coach for organization' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT m.id INTO v_actor_membership
  FROM organization_memberships m
  WHERE m.organization_id = p_organization_id
    AND m.user_id = v_actor
    AND m.role = 'coach'
    AND m.status = 'active';

  IF v_actor_membership IS NOT NULL THEN
    IF p_coach_membership_id IS DISTINCT FROM v_actor_membership THEN
      RAISE EXCEPTION 'coach_membership_id must be the caller''s active coach membership'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    -- Global admin (no coach membership here): any active coach in the firm.
    IF NOT firm_is_global_admin(v_actor) THEN
      RAISE EXCEPTION 'not an active coach for organization' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM organization_memberships m
      WHERE m.id = p_coach_membership_id
        AND m.organization_id = p_organization_id
        AND m.role = 'coach'
        AND m.status = 'active'
    ) THEN
      RAISE EXCEPTION 'coach_membership_id must be an active coach in this organization'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  INSERT INTO coach_student_assignments (
    organization_id, coach_membership_id, student_membership_id
  ) VALUES (
    p_organization_id, p_coach_membership_id, p_student_membership_id
  )
  RETURNING * INTO v_row;

  INSERT INTO audit_log (organization_id, actor_id, action, target_user_id, metadata)
  VALUES (
    p_organization_id,
    v_actor,
    'assignment.created',
    (
      SELECT user_id FROM organization_memberships WHERE id = p_student_membership_id
    ),
    jsonb_build_object(
      'coach_membership_id', p_coach_membership_id,
      'student_membership_id', p_student_membership_id
    )
  );

  RETURN v_row;
END;
$$;

-- Delete a firm and every row it owns. GLOBAL ADMIN ONLY.
--
-- Deletion strategy: organizations is the root of the firm-owned graph and
-- every child table (organization_memberships, coach_student_assignments,
-- invitations, pseudonym_labels, audit_log) declares
-- `REFERENCES organizations(id) ON DELETE CASCADE`. A single DELETE therefore
-- removes exactly the firm-owned data in one transaction. User-owned data that
-- lives outside the firm graph (trades, profiles, auth.users) is never touched,
-- and other firms are unaffected.
--
-- The caller must be the global admin (UUID match via firm_is_global_admin).
-- Authorization is NOT based on membership, so a coach can never delete a firm.
-- Non-admins get the generic 'not found' denial so firm existence is not
-- revealed, matching the rest of the firm denial surface.
CREATE OR REPLACE FUNCTION firm_delete_organization(p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_org organizations%ROWTYPE;
  v_deleted JSONB;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT firm_is_global_admin(v_actor) THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_org
  FROM organizations
  WHERE id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization not found' USING ERRCODE = 'no_data_found';
  END IF;

  -- Snapshot firm-owned row counts before the cascade removes them.
  SELECT jsonb_build_object(
    'memberships', (SELECT count(*) FROM organization_memberships m WHERE m.organization_id = p_organization_id),
    'assignments', (SELECT count(*) FROM coach_student_assignments a WHERE a.organization_id = p_organization_id),
    'invitations', (SELECT count(*) FROM invitations i WHERE i.organization_id = p_organization_id),
    'pseudonym_labels', (SELECT count(*) FROM pseudonym_labels p WHERE p.organization_id = p_organization_id),
    'audit_events', (SELECT count(*) FROM audit_log l WHERE l.organization_id = p_organization_id)
  ) INTO v_deleted;

  DELETE FROM organizations WHERE id = p_organization_id;

  RETURN jsonb_build_object(
    'organization_id', v_org.id,
    'organization_name', v_org.name,
    'deleted', v_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION firm_delete_organization(UUID) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION firm_delete_organization(UUID) TO authenticated;
  END IF;
END $$;

COMMENT ON FUNCTION firm_delete_organization(UUID) IS
  'Global-admin-only: delete a firm and all ON DELETE CASCADE firm-owned rows in one transaction';
COMMENT ON FUNCTION firm_create_invitation(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) IS
  'Coach invites require the global admin; student invites allow an active coach of the firm or the global admin';

-- ===========================================================================
-- 7. Bootstrap: grant the existing account global admin NOW.
--    Fails loudly when the Auth account is not present in this environment.
-- ===========================================================================
DO $$
DECLARE
  v_email CONSTANT TEXT := 'iappinijacob@gmail.com';
  v_uid UUID;
BEGIN
  SELECT u.id INTO v_uid
  FROM auth.users u
  WHERE lower(u.email) = v_email
  LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION
      'Global admin bootstrap failed: no auth.users account with email % exists in this environment. Confirm the Baywater account exists (Auth users), then re-run this migration.',
      v_email;
  END IF;

  INSERT INTO public.baywater_admins (user_id, email, note)
  VALUES (v_uid, v_email, 'Global Baywater administrator (single-row, email-bound)')
  ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;

  RAISE NOTICE 'Global admin installed: % (auth.users.id = %)', v_email, v_uid;
END $$;
