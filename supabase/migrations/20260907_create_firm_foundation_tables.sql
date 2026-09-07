-- Firm / Coach foundation: organizations, memberships, assignments,
-- invitations, pseudonym labels, and audit log.
-- Additive only — does not alter existing student tables (e.g. trades).

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
  'active, left, or revoked — inactive statuses remove authorization';

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
-- Store only SHA-256 (or equivalent) hashes of invitation tokens — never plaintext.
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
  'Coach/student invitations; token_hash only — never store raw tokens';
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
