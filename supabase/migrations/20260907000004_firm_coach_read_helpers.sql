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
    -- Same generic denial as route layer — do not reveal org existence.
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
