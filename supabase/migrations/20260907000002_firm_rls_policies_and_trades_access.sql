-- Firm RLS policies, trusted write RPCs, and additive coach SELECT on trades.
-- Does NOT drop/replace existing trades policies. Does NOT copy student trade data.

-- ---------------------------------------------------------------------------
-- Auth helpers (SECURITY DEFINER) — avoid RLS recursion on membership reads
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION firm_current_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT auth.uid();
$$;

CREATE OR REPLACE FUNCTION firm_current_user_email()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT lower(nullif(auth.jwt() ->> 'email', ''));
$$;

CREATE OR REPLACE FUNCTION firm_is_active_member(p_organization_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_memberships m
    WHERE m.organization_id = p_organization_id
      AND m.user_id = p_user_id
      AND m.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION firm_is_active_coach(p_organization_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_memberships m
    WHERE m.organization_id = p_organization_id
      AND m.user_id = p_user_id
      AND m.role = 'coach'
      AND m.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION firm_active_coach_count(p_organization_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM organization_memberships m
  WHERE m.organization_id = p_organization_id
    AND m.role = 'coach'
    AND m.status = 'active';
$$;

-- True when p_viewer may coach-view p_student_user_id inside p_organization_id.
-- Assignment is required only when the org has more than one active coach.
-- Single-coach orgs authorize all active students in that org without assignments.
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

-- Earliest active student joined_at across orgs where viewer is an authorized coach.
-- Used by trades SELECT policy (trades has no organization_id column).
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

COMMENT ON FUNCTION firm_can_coach_view_student(UUID, UUID, UUID) IS
  'Coach authorization for a student in an org; assignment required only if multiple active coaches';
COMMENT ON FUNCTION firm_coach_visible_student_joined_at(UUID, UUID) IS
  'Min joined_at among orgs where viewer may coach-view the student; null if unauthorized';

REVOKE ALL ON FUNCTION firm_is_active_member(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION firm_is_active_coach(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION firm_active_coach_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION firm_can_coach_view_student(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION firm_coach_visible_student_joined_at(UUID, UUID) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION firm_is_active_member(UUID, UUID) TO authenticated;
    GRANT EXECUTE ON FUNCTION firm_is_active_coach(UUID, UUID) TO authenticated;
    GRANT EXECUTE ON FUNCTION firm_can_coach_view_student(UUID, UUID, UUID) TO authenticated;
    GRANT EXECUTE ON FUNCTION firm_coach_visible_student_joined_at(UUID, UUID) TO authenticated;
    GRANT EXECUTE ON FUNCTION firm_current_user_id() TO authenticated;
    GRANT EXECUTE ON FUNCTION firm_current_user_email() TO authenticated;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Trusted write path: SECURITY DEFINER RPCs (no service-role client in app yet)
-- Mutations are not opened via broad INSERT policies on firm tables.
-- ---------------------------------------------------------------------------

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

  -- Only active coaches (or org creator during bootstrap via firm_create_organization)
  -- may write audit rows through this RPC.
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

  IF NOT firm_is_active_coach(p_organization_id, v_actor) THEN
    RAISE EXCEPTION 'not an active coach for organization' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_role NOT IN ('coach', 'student') THEN
    RAISE EXCEPTION 'invalid invitation role' USING ERRCODE = 'check_violation';
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

  IF NOT firm_is_active_coach(p_organization_id, v_actor) THEN
    RAISE EXCEPTION 'not an active coach for organization' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT m.id INTO v_actor_membership
  FROM organization_memberships m
  WHERE m.organization_id = p_organization_id
    AND m.user_id = v_actor
    AND m.role = 'coach'
    AND m.status = 'active';

  -- Only the coach who owns the coach membership (or the sole coach) may create the link.
  IF p_coach_membership_id IS DISTINCT FROM v_actor_membership THEN
    RAISE EXCEPTION 'coach_membership_id must be the caller''s active coach membership'
      USING ERRCODE = 'insufficient_privilege';
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

REVOKE ALL ON FUNCTION firm_log_audit_event(UUID, TEXT, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION firm_create_organization(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION firm_create_invitation(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION firm_assign_coach_student(UUID, UUID, UUID) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION firm_log_audit_event(UUID, TEXT, UUID, JSONB) TO authenticated;
    GRANT EXECUTE ON FUNCTION firm_create_organization(TEXT) TO authenticated;
    GRANT EXECUTE ON FUNCTION firm_create_invitation(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;
    GRANT EXECUTE ON FUNCTION firm_assign_coach_student(UUID, UUID, UUID) TO authenticated;
  END IF;
END $$;

COMMENT ON FUNCTION firm_create_organization(TEXT) IS
  'Trusted write: create firm + active coach membership for caller';
COMMENT ON FUNCTION firm_create_invitation(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) IS
  'Trusted write: active coach creates invitation; stores token_hash only';
COMMENT ON FUNCTION firm_log_audit_event(UUID, TEXT, UUID, JSONB) IS
  'Trusted write: active coaches append audit_log rows (no open INSERT policy)';
COMMENT ON FUNCTION firm_assign_coach_student(UUID, UUID, UUID) IS
  'Trusted write: link caller coach membership to a student membership';

-- ---------------------------------------------------------------------------
-- RLS policies — firm tables (SELECT for authorized users; writes via RPCs)
-- ---------------------------------------------------------------------------

-- organizations
CREATE POLICY organizations_select_active_member
  ON organizations
  FOR SELECT
  TO authenticated
  USING (firm_is_active_member(id));

-- organization_memberships
CREATE POLICY organization_memberships_select_own
  ON organization_memberships
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY organization_memberships_select_active_students_for_coach
  ON organization_memberships
  FOR SELECT
  TO authenticated
  USING (
    role = 'student'
    AND status = 'active'
    AND firm_is_active_coach(organization_id)
  );

-- coach_student_assignments
CREATE POLICY coach_student_assignments_select_own_coach
  ON coach_student_assignments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM organization_memberships m
      WHERE m.id = coach_membership_id
        AND m.organization_id = coach_student_assignments.organization_id
        AND m.user_id = auth.uid()
        AND m.role = 'coach'
        AND m.status = 'active'
    )
  );

-- invitations (own created or addressed to caller email)
CREATE POLICY invitations_select_created_or_addressed
  ON invitations
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR (
      firm_current_user_email() IS NOT NULL
      AND lower(email) = firm_current_user_email()
    )
  );

-- pseudonym_labels: student own label, or authorized coaches for that student/org.
-- Table contains user_id + label only — no name/email/avatar columns.
CREATE POLICY pseudonym_labels_select_own
  ON pseudonym_labels
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY pseudonym_labels_select_authorized_coach
  ON pseudonym_labels
  FOR SELECT
  TO authenticated
  USING (firm_can_coach_view_student(organization_id, user_id));

-- audit_log: active coaches read their org; no INSERT policy for authenticated
CREATE POLICY audit_log_select_active_coach
  ON audit_log
  FOR SELECT
  TO authenticated
  USING (firm_is_active_coach(organization_id));

-- ---------------------------------------------------------------------------
-- Additive trades coach SELECT
-- Remote trades columns confirmed via PostgREST: user_id, created_at, entry_time, ...
-- Assumes an existing student own-row SELECT policy remains in place and untouched.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.trades') IS NULL THEN
    RAISE NOTICE 'public.trades not present — skipping coach trades policy (apply on remote/with trades)';
    RETURN;
  END IF;

  -- Enable RLS if somehow off; do not FORCE (preserve existing owner bypass behavior).
  ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trades'
      AND policyname = 'trades_select_authorized_coach'
  ) THEN
    RAISE NOTICE 'trades_select_authorized_coach already exists — leaving unchanged';
    RETURN;
  END IF;

  CREATE POLICY trades_select_authorized_coach
    ON public.trades
    FOR SELECT
    TO authenticated
    USING (
      -- NULL joined_at from helper => unauthorized => predicate fails
      COALESCE(entry_time, created_at) >= firm_coach_visible_student_joined_at(user_id)
    );

  COMMENT ON POLICY trades_select_authorized_coach ON public.trades IS
    'Additive: active coaches may SELECT authorized students'' trades on/after student joined_at; does not replace owner policies';
END $$;

-- Defense in depth: authenticated clients mutate firm tables only via SECURITY DEFINER RPCs.
REVOKE INSERT, UPDATE, DELETE ON TABLE
  organizations,
  organization_memberships,
  coach_student_assignments,
  invitations,
  pseudonym_labels,
  audit_log
FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE $sql$
      REVOKE INSERT, UPDATE, DELETE ON TABLE
        organizations,
        organization_memberships,
        coach_student_assignments,
        invitations,
        pseudonym_labels,
        audit_log
      FROM anon
    $sql$;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE $sql$
      REVOKE INSERT, UPDATE, DELETE ON TABLE
        organizations,
        organization_memberships,
        coach_student_assignments,
        invitations,
        pseudonym_labels,
        audit_log
      FROM authenticated
    $sql$;
    EXECUTE $sql$
      GRANT SELECT ON TABLE
        organizations,
        organization_memberships,
        coach_student_assignments,
        invitations,
        pseudonym_labels,
        audit_log
      TO authenticated
    $sql$;
  END IF;
END $$;
