-- Baywater Firm feature — apply once in Supabase SQL Editor (in this order).
-- Generated for remote deploy. Safe to re-run only if objects do not already exist;
-- if partially applied, apply remaining migration files individually instead.


-- ######################################################################
-- SOURCE: supabase/migrations/20260907_create_firm_foundation_tables.sql
-- ######################################################################

-- Firm / Coach foundation: organizations, memberships, assignments,
-- invitations, pseudonym labels, and audit log.
-- Additive only â€” does not alter existing student tables (e.g. trades).

-- ---------------------------------------------------------------------------
-- 1. organizations
-- ---------------------------------------------------------------------------
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Per-organization counter for coach-facing labels (e.g. "Student 1042").
  -- Incremented under row lock so concurrent membership accepts cannot collide.
  next_pseudonym_number INTEGER NOT NULL DEFAULT 1001
    CHECK (next_pseudonym_number >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE organizations IS 'Firms / coaching organizations';
COMMENT ON COLUMN organizations.next_pseudonym_number IS
  'Next integer to allocate for organization-scoped Student N labels';

-- ---------------------------------------------------------------------------
-- 2. organization_memberships
-- ---------------------------------------------------------------------------
CREATE TABLE organization_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('coach', 'student')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'left', 'revoked')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  CONSTRAINT organization_memberships_org_user_role_unique
    UNIQUE (organization_id, user_id, role),
  -- Composite uniques enable same-organization FKs from assignments.
  CONSTRAINT organization_memberships_id_org_unique
    UNIQUE (id, organization_id),
  CONSTRAINT organization_memberships_id_org_role_unique
    UNIQUE (id, organization_id, role),
  CONSTRAINT organization_memberships_ended_when_inactive
    CHECK (
      (status = 'active' AND ended_at IS NULL)
      OR (status IN ('left', 'revoked') AND ended_at IS NOT NULL)
    )
);

COMMENT ON TABLE organization_memberships IS
  'User membership in a firm as coach or student';
COMMENT ON COLUMN organization_memberships.role IS 'coach or student';
COMMENT ON COLUMN organization_memberships.status IS
  'active, left, or revoked â€” inactive statuses remove authorization';

-- ---------------------------------------------------------------------------
-- 3. coach_student_assignments
-- ---------------------------------------------------------------------------
-- Composite FKs pin both memberships to the same organization_id.
-- Role columns are constrained to constants so FKs can only reference the
-- matching membership role (coach vs student).
CREATE TABLE coach_student_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  coach_membership_id UUID NOT NULL,
  coach_role TEXT NOT NULL DEFAULT 'coach' CHECK (coach_role = 'coach'),
  student_membership_id UUID NOT NULL,
  student_role TEXT NOT NULL DEFAULT 'student' CHECK (student_role = 'student'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coach_student_assignments_distinct_memberships
    CHECK (coach_membership_id <> student_membership_id),
  CONSTRAINT coach_student_assignments_unique_pair
    UNIQUE (organization_id, coach_membership_id, student_membership_id),
  CONSTRAINT coach_student_assignments_coach_fk
    FOREIGN KEY (coach_membership_id, organization_id, coach_role)
    REFERENCES organization_memberships (id, organization_id, role)
    ON DELETE CASCADE,
  CONSTRAINT coach_student_assignments_student_fk
    FOREIGN KEY (student_membership_id, organization_id, student_role)
    REFERENCES organization_memberships (id, organization_id, role)
    ON DELETE CASCADE
);

COMMENT ON TABLE coach_student_assignments IS
  'Links a coach membership to a student membership within one organization';

-- ---------------------------------------------------------------------------
-- 4. invitations
-- ---------------------------------------------------------------------------
-- Store only SHA-256 (or equivalent) hashes of invitation tokens â€” never plaintext.
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('coach', 'student')),
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invitations_token_hash_unique UNIQUE (token_hash),
  CONSTRAINT invitations_accepted_fields_consistent
    CHECK (
      (status = 'accepted' AND accepted_by IS NOT NULL AND accepted_at IS NOT NULL)
      OR (status <> 'accepted' AND accepted_by IS NULL AND accepted_at IS NULL)
    )
);

COMMENT ON TABLE invitations IS
  'Coach/student invitations; token_hash only â€” never store raw tokens';
COMMENT ON COLUMN invitations.token_hash IS
  'SHA-256 hash of the invitation token; plaintext must never be persisted';

-- ---------------------------------------------------------------------------
-- 5. pseudonym_labels
-- ---------------------------------------------------------------------------
CREATE TABLE pseudonym_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pseudonym_labels_org_user_unique UNIQUE (organization_id, user_id),
  CONSTRAINT pseudonym_labels_org_label_unique UNIQUE (organization_id, label)
);

COMMENT ON TABLE pseudonym_labels IS
  'Organization-scoped coach-facing labels (e.g. Student 1042); not derived from PII';

-- Allocate "Student N" under an organizations row lock so concurrent inserts
-- cannot emit duplicate labels within the same organization.
-- SECURITY DEFINER so label allocation can update organizations under RLS
-- once coach/student policies exist (invoker may lack UPDATE on organizations).
CREATE OR REPLACE FUNCTION allocate_pseudonym_label()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_number INTEGER;
BEGIN
  IF NEW.label IS NOT NULL AND btrim(NEW.label) <> '' THEN
    RAISE EXCEPTION
      'pseudonym_labels.label must be allocated by the system; do not supply a label'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE organizations
  SET next_pseudonym_number = next_pseudonym_number + 1
  WHERE id = NEW.organization_id
  RETURNING next_pseudonym_number - 1 INTO v_number;

  IF v_number IS NULL THEN
    RAISE EXCEPTION 'organization % not found for pseudonym allocation', NEW.organization_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  NEW.label := 'Student ' || v_number::text;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_allocate_pseudonym_label
BEFORE INSERT ON pseudonym_labels
FOR EACH ROW
EXECUTE FUNCTION allocate_pseudonym_label();

COMMENT ON FUNCTION allocate_pseudonym_label() IS
  'Transaction-safe per-organization Student N label allocation via organizations.next_pseudonym_number';

-- ---------------------------------------------------------------------------
-- 6. audit_log
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE audit_log IS
  'Security-sensitive firm actions (invites, membership changes, etc.)';

-- ---------------------------------------------------------------------------
-- Indexes (authorization and lookup access patterns)
-- ---------------------------------------------------------------------------

-- Memberships: by organization / by user / active coach / active student
CREATE INDEX idx_organization_memberships_organization_id
  ON organization_memberships (organization_id);

CREATE INDEX idx_organization_memberships_user_id
  ON organization_memberships (user_id);

CREATE INDEX idx_organization_memberships_active_coach
  ON organization_memberships (organization_id, user_id)
  WHERE role = 'coach' AND status = 'active';

CREATE INDEX idx_organization_memberships_active_student
  ON organization_memberships (organization_id, user_id)
  WHERE role = 'student' AND status = 'active';

CREATE INDEX idx_organization_memberships_user_active
  ON organization_memberships (user_id, role)
  WHERE status = 'active';

-- Assignments
CREATE INDEX idx_coach_student_assignments_organization_id
  ON coach_student_assignments (organization_id);

CREATE INDEX idx_coach_student_assignments_coach_membership_id
  ON coach_student_assignments (coach_membership_id);

CREATE INDEX idx_coach_student_assignments_student_membership_id
  ON coach_student_assignments (student_membership_id);

-- Invitations: token redemption + org status listing
CREATE INDEX idx_invitations_token_hash
  ON invitations (token_hash);

CREATE INDEX idx_invitations_organization_status
  ON invitations (organization_id, status);

CREATE UNIQUE INDEX idx_invitations_unique_pending_email_role
  ON invitations (organization_id, lower(email), role)
  WHERE status = 'pending';

-- Pseudonyms: primary lookup is covered by UNIQUE (organization_id, user_id);
-- label reverse lookup for coach UI
CREATE INDEX idx_pseudonym_labels_organization_label
  ON pseudonym_labels (organization_id, label);

-- Audit log: org timeline
CREATE INDEX idx_audit_log_organization_created_at
  ON audit_log (organization_id, created_at DESC);

CREATE INDEX idx_organizations_created_by
  ON organizations (created_by);

-- ---------------------------------------------------------------------------
-- RLS foundation
-- Deny-by-default for anon/authenticated: RLS on, no permissive policies.
-- Service role bypasses RLS for trusted server paths later.
-- ---------------------------------------------------------------------------
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_student_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pseudonym_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE organization_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE coach_student_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE pseudonym_labels FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

-- ######################################################################
-- SOURCE: supabase/migrations/20260907_firm_rls_policies_and_trades_access.sql
-- ######################################################################

-- Firm RLS policies, trusted write RPCs, and additive coach SELECT on trades.
-- Does NOT drop/replace existing trades policies. Does NOT copy student trade data.

-- ---------------------------------------------------------------------------
-- Auth helpers (SECURITY DEFINER) â€” avoid RLS recursion on membership reads
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
-- RLS policies â€” firm tables (SELECT for authorized users; writes via RPCs)
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
-- Table contains user_id + label only â€” no name/email/avatar columns.
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
    RAISE NOTICE 'public.trades not present â€” skipping coach trades policy (apply on remote/with trades)';
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
    RAISE NOTICE 'trades_select_authorized_coach already exists â€” leaving unchanged';
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

-- ######################################################################
-- SOURCE: supabase/migrations/20260907_firm_invitation_lifecycle.sql
-- ######################################################################

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
  -- (same check). Prevent self-revoke via this admin path â€” use leave later.
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
  'Safe invite preview by token_hash; returns org name/role/status â€” never raw token';
COMMENT ON FUNCTION firm_accept_invitation(TEXT) IS
  'Atomic accept: membership + pseudonym + optional assignment + invitation + audit';
COMMENT ON FUNCTION firm_decline_invitation(TEXT) IS
  'Decline pending invitation; no membership created';
COMMENT ON FUNCTION firm_revoke_membership(UUID) IS
  'Active coach revokes another member; removes coach trade authorization immediately';

-- ######################################################################
-- SOURCE: supabase/migrations/20260907_firm_coach_read_helpers.sql
-- ######################################################################

-- Firm coach read helpers (authorized student list).
-- Aggregation stays in application code using shared metrics + RLS trade SELECTs.

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
    -- Same generic denial as route layer â€” do not reveal org existence.
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

COMMENT ON FUNCTION firm_coach_authorized_students(UUID) IS
  'Active students a coach may view in an org (assignment-aware); returns membership + pseudonym only';
