/**
 * GLOBAL ADMIN validation.
 *
 * Proves the single-admin model:
 *   * exactly ONE admin exists, bound to iappinijacob@gmail.com's auth.users.id
 *   * a second admin can never be created (trigger + singleton constraint)
 *   * admin is NOT an organization membership role
 *   * a firm creator becomes a COACH, never the admin
 *   * only the global admin can list/invite/revoke coaches
 *   * a coach keeps student invitations, assignment picker and coach reads
 *   * cross-firm isolation holds for coaches and students
 *
 * PGlite only — does not touch the remote Baywater database.
 */
import { PGlite } from "@electric-sql/pglite";
import { createHash, randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../supabase/migrations");

const GLOBAL_ADMIN_EMAIL = "iappinijacob@gmail.com";

const results = [];
const assert = (name, cond, detail = "") => {
  results.push({ name, ok: !!cond, detail });
  if (!cond) console.error(`FAIL: ${name}${detail ? " — " + detail : ""}`);
  else console.log(`PASS: ${name}${detail ? " — " + detail : ""}`);
};

const SQLSTATE = {
  insufficient_privilege: "42501",
  no_data_found: "P0002",
  check_violation: "23514",
  unique_violation: "23505",
  foreign_key_violation: "23503",
};

const hashToken = (raw) => createHash("sha256").update(raw, "utf8").digest("hex");

async function asUser(db, user, fn) {
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [user.id]);
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: user.id, email: user.email, role: "authenticated" }),
  ]);
  await db.query(`SET ROLE authenticated`);
  try {
    return await fn();
  } finally {
    await db.query(`RESET ROLE`);
    await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
    await db.query(`SELECT set_config('request.jwt.claims', '{}', false)`);
  }
}

async function run(db, user, sql, params = []) {
  try {
    const rows = await asUser(db, user, async () => (await db.query(sql, params)).rows);
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: `${e.code ?? ""} ${e.message}`.trim() };
  }
}

async function scalar(db, user, sql, params = []) {
  const r = await run(db, user, sql, params);
  if (!r.ok) throw new Error(r.error);
  const row = r.rows[0] ?? {};
  return row[Object.keys(row)[0]];
}

const failedAs = (r, code) =>
  !r.ok && (!code || r.error.includes(SQLSTATE[code] ?? code));

async function main() {
  const db = new PGlite();

  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT
    );
    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS UUID LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    CREATE OR REPLACE FUNCTION auth.jwt()
    RETURNS JSONB LANGUAGE sql STABLE AS $$
      SELECT COALESCE(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
    $$;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOBYPASSRLS NOINHERIT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOBYPASSRLS NOINHERIT;
      END IF;
    END $$;
    GRANT USAGE ON SCHEMA public TO authenticated, anon;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon;

    CREATE TABLE public.trades (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      entry_time TIMESTAMPTZ,
      ticker TEXT
    );
    ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
    CREATE POLICY trades_select_own ON public.trades FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
    GRANT SELECT ON public.trades TO authenticated;
  `);

  const mkUser = async (email) =>
    (await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id, email`, [email]))
      .rows[0];

  // The designated admin account MUST exist before the migration runs — the
  // migration is required to fail loudly otherwise.
  const adminIdentity = await mkUser(GLOBAL_ADMIN_EMAIL);
  const coach = await mkUser("coach@bay.test");
  const coach2 = await mkUser("coach2@bay.test");
  const student = await mkUser("student@bay.test");
  const outsider = await mkUser("outsider@other.test");

  try {
    for (const f of [
      "20260907_create_firm_foundation_tables.sql",
      "20260907_firm_rls_policies_and_trades_access.sql",
      "20260907_firm_invitation_lifecycle.sql",
      "20260907_firm_coach_read_helpers.sql",
      "20260915_add_global_admin.sql",
    ]) {
      await db.exec(fs.readFileSync(path.join(migrationsDir, f), "utf8"));
    }
    assert("global admin migration applies cleanly", true);
  } catch (e) {
    assert("global admin migration applies cleanly", false, e.message);
    printSummary();
    process.exit(1);
  }

  // ------------------------------------------------------------------
  // The single global admin identity
  // ------------------------------------------------------------------
  const adminRows = (
    await db.query(`SELECT user_id, email, singleton FROM baywater_admins`)
  ).rows;
  assert("exactly one global admin row", adminRows.length === 1, `n=${adminRows.length}`);
  assert(
    "admin row is bound to the designated auth.users identity",
    adminRows[0]?.user_id === adminIdentity.id
  );
  assert(
    "admin row stores the designated email",
    adminRows[0]?.email === GLOBAL_ADMIN_EMAIL
  );
  assert(
    "firm_is_global_admin true for that identity",
    (await scalar(db, adminIdentity, `SELECT firm_is_global_admin(auth.uid())`)) === true
  );
  assert(
    "firm_is_global_admin false for a coach",
    (await scalar(db, coach, `SELECT firm_is_global_admin(auth.uid())`)) === false
  );

  // A second admin can never exist
  let secondAdminBlocked = false;
  try {
    await db.query(`INSERT INTO baywater_admins (user_id, email) VALUES ($1, $2)`, [
      outsider.id,
      outsider.email,
    ]);
  } catch {
    secondAdminBlocked = true;
  }
  assert("a second admin row cannot be inserted", secondAdminBlocked);

  let reassignBlocked = false;
  try {
    await db.query(`UPDATE baywater_admins SET user_id = $1`, [outsider.id]);
  } catch {
    reassignBlocked = true;
  }
  assert("the admin identity cannot be reassigned", reassignBlocked);

  let authedWriteBlocked = false;
  try {
    await asUser(db, outsider, () =>
      db.query(`INSERT INTO baywater_admins (user_id, email) VALUES ($1, $2)`, [
        outsider.id,
        outsider.email,
      ])
    );
  } catch {
    authedWriteBlocked = true;
  }
  assert("authenticated callers cannot write baywater_admins", authedWriteBlocked);

  // ------------------------------------------------------------------
  // Admin is NOT a membership role
  // ------------------------------------------------------------------
  assert(
    "organization_memberships.role rejects 'admin'",
    await (async () => {
      try {
        await db.query(
          `INSERT INTO organization_memberships (organization_id, user_id, role, status)
           VALUES ((SELECT id FROM organizations LIMIT 1), $1, 'admin', 'active')`,
          [outsider.id]
        );
        return false;
      } catch {
        return true;
      }
    })()
  );

  // ------------------------------------------------------------------
  // Firm creation -> COACH, never admin
  // ------------------------------------------------------------------
  const org = await asUser(db, coach, async () => {
    const r = await db.query(`SELECT * FROM firm_create_organization($1)`, ["Coach Firm"]);
    return r.rows[0];
  });
  assert(
    "firm creator becomes a coach",
    (await scalar(
      db,
      coach,
      `SELECT role FROM organization_memberships WHERE organization_id = $1 AND user_id = $2`,
      [org.id, coach.id]
    )) === "coach"
  );
  assert(
    "firm creator is NOT the global admin",
    (await scalar(db, coach, `SELECT firm_is_global_admin(auth.uid())`)) === false
  );

  const orgB = await asUser(db, outsider, async () => {
    const r = await db.query(`SELECT * FROM firm_create_organization($1)`, ["Other Firm"]);
    return r.rows[0];
  });
  assert(
    "another firm creator is also not the global admin",
    (await scalar(db, outsider, `SELECT firm_is_global_admin(auth.uid())`)) === false
  );
  assert(
    "the global admin is never added as a firm member",
    Number(
      (
        await db.query(
          `SELECT count(*)::int AS n FROM organization_memberships WHERE user_id = $1`,
          [adminIdentity.id]
        )
      ).rows[0].n
    ) === 0
  );

  // ------------------------------------------------------------------
  // Admin manages coaches across firms (not a member of either)
  // ------------------------------------------------------------------
  const adminOrgList = await run(db, adminIdentity, `SELECT * FROM firm_admin_list_organizations()`);
  assert(
    "admin can list every firm",
    adminOrgList.ok &&
      adminOrgList.rows.some((r) => r.organization_id === org.id) &&
      adminOrgList.rows.some((r) => r.organization_id === orgB.id),
    adminOrgList.error
  );
  assert(
    "coach cannot list every firm",
    failedAs(
      await run(db, coach, `SELECT * FROM firm_admin_list_organizations()`),
      "no_data_found"
    )
  );
  assert(
    "admin can list coaches of a firm it does not belong to",
    (
      await run(db, adminIdentity, `SELECT * FROM firm_coach_list($1)`, [org.id])
    ).ok
  );
  assert(
    "coach CANNOT list coaches",
    failedAs(
      await run(db, coach, `SELECT * FROM firm_coach_list($1)`, [org.id]),
      "no_data_found"
    )
  );

  // ------------------------------------------------------------------
  // Coach invitation: admin only, acceptance yields a COACH
  // ------------------------------------------------------------------
  assert(
    "admin can invite a coach",
    (
      await run(
        db,
        adminIdentity,
        `SELECT * FROM firm_create_invitation($1, 'coach', $2, $3, NOW() + interval '7 days')`,
        [org.id, coach2.email, hashToken("coach2-token")]
      )
    ).ok
  );
  assert(
    "coach cannot invite a coach",
    failedAs(
      await run(
        db,
        coach,
        `SELECT * FROM firm_create_invitation($1, 'coach', $2, $3, NOW() + interval '7 days')`,
        [org.id, "someone@bay.test", hashToken("coach-tries")]
      ),
      "insufficient_privilege"
    )
  );

  const accept = await run(db, coach2, `SELECT firm_accept_invitation($1) AS r`, [
    hashToken("coach2-token"),
  ]);
  assert("invited coach can accept", accept.ok, accept.error);
  assert(
    "invitation acceptance creates a COACH, never an admin",
    accept.ok && accept.rows[0].r.role === "coach"
  );
  assert(
    "the invited coach is not the global admin",
    (await scalar(db, coach2, `SELECT firm_is_global_admin(auth.uid())`)) === false
  );

  // No admin invitations are representable
  let adminInviteBlocked = false;
  try {
    await db.query(
      `INSERT INTO invitations (organization_id, role, email, token_hash, status, created_by, expires_at)
       VALUES ($1, 'admin', 'x@bay.test', 'hash-admin', 'pending', $2, NOW() + interval '1 day')`,
      [org.id, adminIdentity.id]
    );
  } catch {
    adminInviteBlocked = true;
  }
  assert("invitations.role rejects 'admin'", adminInviteBlocked);

  // ------------------------------------------------------------------
  // Coaches keep student invitations + the assignment picker
  // ------------------------------------------------------------------
  assert(
    "coach CAN invite a student",
    (
      await run(
        db,
        coach,
        `SELECT * FROM firm_create_invitation($1, 'student', $2, $3, NOW() + interval '7 days')`,
        [org.id, student.email, hashToken("student-token")]
      )
    ).ok
  );
  const studentAccept = await run(db, student, `SELECT firm_accept_invitation($1) AS r`, [
    hashToken("student-token"),
  ]);
  assert("student can accept a coach's invitation", studentAccept.ok, studentAccept.error);

  const picker = await run(db, coach, `SELECT * FROM firm_assignable_coaches($1)`, [org.id]);
  assert(
    "assignment picker returns active coaches (corrected source)",
    picker.ok && picker.rows.length === 2,
    `${picker.rows?.length} rows`
  );
  assert(
    "assignment picker exposes no email/user_id",
    picker.ok && picker.rows.every((r) => !("email" in r) && !("user_id" in r))
  );
  assert(
    "student cannot use the assignment picker",
    failedAs(
      await run(db, student, `SELECT * FROM firm_assignable_coaches($1)`, [org.id]),
      "no_data_found"
    )
  );

  assert(
    "coach retains authorized-student reads",
    (await run(db, coach, `SELECT * FROM firm_coach_authorized_students($1)`, [org.id])).ok
  );

  // ------------------------------------------------------------------
  // Revocation: coach-only for students, admin-only for coaches
  // ------------------------------------------------------------------
  // Resolve ids as the table owner: a coach cannot see another coach's
  // membership row through RLS (and shouldn't be able to).
  const memIdOf = async (user, role, organizationId = org.id) =>
    (
      await db.query(
        `SELECT id FROM organization_memberships
         WHERE organization_id = $1 AND user_id = $2 AND role = $3`,
        [organizationId, user.id, role]
      )
    ).rows[0]?.id;

  const studentMem = await memIdOf(student, "student");
  const coach2Mem = await memIdOf(coach2, "coach");

  assert(
    "coach cannot revoke a coach",
    failedAs(
      await run(db, coach, `SELECT firm_revoke_membership($1)`, [coach2Mem]),
      "insufficient_privilege"
    )
  );
  assert(
    "admin can revoke a coach",
    (await run(db, adminIdentity, `SELECT firm_revoke_membership($1)`, [coach2Mem])).ok
  );
  assert(
    "revoked coach immediately loses coach authorization",
    (await scalar(db, coach2, `SELECT firm_is_active_coach($1, auth.uid())`, [org.id])) === false
  );
  assert(
    "revoked coach loses the assignment picker",
    failedAs(
      await run(db, coach2, `SELECT * FROM firm_assignable_coaches($1)`, [org.id]),
      "no_data_found"
    )
  );
  assert(
    "coach can still revoke a student",
    (await run(db, coach, `SELECT firm_revoke_membership($1)`, [studentMem])).ok
  );
  await db.query(
    `INSERT INTO organization_memberships (organization_id, user_id, role, status)
     VALUES ($1, $2, 'coach', 'active')`,
    [orgB.id, coach2.id]
  );
  assert(
    "admin can also revoke a coach in another firm",
    (
      await run(db, adminIdentity, `SELECT firm_revoke_membership($1)`, [
        await memIdOf(coach2, "coach", orgB.id),
      ])
    ).ok
  );

  // ------------------------------------------------------------------
  // Cross-firm isolation
  // ------------------------------------------------------------------
  const orgBStudentMem = (
    await db.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role, status)
       VALUES ($1, $2, 'student', 'active') RETURNING id`,
      [orgB.id, student.id]
    )
  ).rows[0].id;

  assert(
    "coach of firm A cannot invite for firm B",
    failedAs(
      await run(
        db,
        coach,
        `SELECT * FROM firm_create_invitation($1, 'student', $2, $3, NOW() + interval '7 days')`,
        [orgB.id, "x@bay.test", hashToken("cross-invite")]
      ),
      "insufficient_privilege"
    )
  );
  assert(
    "coach of firm A cannot read firm B's membership role",
    failedAs(
      await run(db, coach, `SELECT firm_membership_role($1)`, [orgBStudentMem]),
      "no_data_found"
    )
  );
  assert(
    "coach of firm A cannot revoke in firm B",
    failedAs(
      await run(db, coach, `SELECT firm_revoke_membership($1)`, [orgBStudentMem]),
      "insufficient_privilege"
    )
  );
  assert(
    "coach of firm A cannot assign inside firm B",
    failedAs(
      await run(db, coach, `SELECT * FROM firm_assign_coach_student($1, $2, $3)`, [
        orgB.id,
        orgBStudentMem,
        orgBStudentMem,
      ]),
      "insufficient_privilege"
    )
  );
  assert(
    "student cannot list coaches",
    failedAs(
      await run(db, student, `SELECT * FROM firm_coach_list($1)`, [org.id]),
      "no_data_found"
    )
  );
  assert(
    "own-firm membership role resolves for a coach",
    (await scalar(db, coach, `SELECT firm_membership_role($1)`, [coach2Mem])) === "coach"
  );
  assert(
    "coach of firm A cannot read firm B authorized students",
    failedAs(
      await run(db, coach, `SELECT * FROM firm_coach_authorized_students($1)`, [orgB.id]),
      "no_data_found"
    )
  );
  assert(
    "coach of firm A cannot read firm B assignable coaches",
    failedAs(
      await run(db, coach, `SELECT * FROM firm_assignable_coaches($1)`, [orgB.id]),
      "no_data_found"
    )
  );
  assert(
    "coach of firm A cannot even see firm B's organization row",
    Number(
      (
        await asUser(db, coach, async () =>
          (await db.query(`SELECT count(*)::int n FROM organizations WHERE id = $1`, [orgB.id])).rows
        )
      )[0].n
    ) === 0
  );
  assert(
    "coach of firm A cannot SELECT firm B memberships",
    Number(
      (
        await asUser(db, coach, async () =>
          (
            await db.query(`SELECT count(*)::int n FROM organization_memberships WHERE organization_id = $1`, [
              orgB.id,
            ])
          ).rows
        )
      )[0].n
    ) === 0
  );
  assert(
    "coach cannot write firm tables directly (RLS blocks bare INSERT)",
    failedAs(
      await run(
        db,
        coach,
        `INSERT INTO invitations (organization_id, role, email, token_hash, status, created_by, expires_at)
         VALUES ($1, 'student', 'raw@bay.test', $2, 'pending', $3, NOW() + interval '1 day')`,
        [org.id, hashToken("raw-insert"), coach.id]
      )
    )
  );
  assert(
    "a revoked coach cannot read the firm they were revoked from",
    Number(
      (
        await asUser(db, coach2, async () =>
          (
            await db.query(`SELECT count(*)::int n FROM organizations WHERE id = $1`, [org.id])
          ).rows
        )
      )[0].n
    ) === 0
  );

  // ------------------------------------------------------------------
  // Global admin invitations (coach AND student) across firms
  // ------------------------------------------------------------------
  // The global admin is intentionally NOT a member of any firm, so a plain
  // active-coach check must not be the only gate for student invitations.
  const adminStudentHash = hashToken("admin-student-token");
  const adminStudentInvite = await run(
    db,
    adminIdentity,
    `SELECT * FROM firm_create_invitation($1, 'student', $2, $3, NOW() + interval '7 days')`,
    [org.id, "admin.invited.student@bay.test", adminStudentHash]
  );
  assert(
    "admin can invite a STUDENT into a firm it does not belong to",
    adminStudentInvite.ok,
    adminStudentInvite.error
  );
  assert(
    "the admin is still not a member of that firm",
    Number(
      (
        await db.query(
          `SELECT count(*)::int AS n FROM organization_memberships WHERE organization_id = $1 AND user_id = $2`,
          [org.id, adminIdentity.id]
        )
      ).rows[0].n
    ) === 0
  );
  assert(
    "admin invitation cannot use an admin role",
    failedAs(
      await run(
        db,
        adminIdentity,
        `SELECT * FROM firm_create_invitation($1, 'admin', $2, $3, NOW() + interval '7 days')`,
        [org.id, "nope@bay.test", hashToken("admin-role-try")]
      ),
      "check_violation"
    )
  );
  assert(
    "coach cannot invite a student into another firm (cross-firm)",
    failedAs(
      await run(
        db,
        coach,
        `SELECT * FROM firm_create_invitation($1, 'student', $2, $3, NOW() + interval '7 days')`,
        [orgB.id, "cross.student@bay.test", hashToken("cross-student-token")]
      ),
      "insufficient_privilege"
    )
  );
  assert(
    "a student cannot invite anyone",
    failedAs(
      await run(
        db,
        student,
        `SELECT * FROM firm_create_invitation($1, 'student', $2, $3, NOW() + interval '7 days')`,
        [org.id, "student.try@bay.test", hashToken("student-invite-try")]
      ),
      "insufficient_privilege"
    )
  );
  assert(
    "invitation into a non-existent firm is rejected",
    failedAs(
      await run(
        db,
        adminIdentity,
        `SELECT * FROM firm_create_invitation($1, 'student', $2, $3, NOW() + interval '7 days')`,
        ["00000000-0000-0000-0000-000000000000", "ghost@bay.test", hashToken("ghost-invite")]
      ),
      "no_data_found"
    )
  );

  // ------------------------------------------------------------------
  // Global admin: delete a firm (cascade) + the denials
  // ------------------------------------------------------------------
  const orgC = await asUser(db, outsider, async () => {
    const r = await db.query(`SELECT * FROM firm_create_organization($1)`, [
      "Deletable Firm",
    ]);
    return r.rows[0];
  });

  await db.query(
    `INSERT INTO organization_memberships (organization_id, user_id, role, status)
     VALUES ($1, $2, 'student', 'active')`,
    [orgC.id, student.id]
  );
  const orgCStudentMem = (
    await db.query(
      `SELECT id FROM organization_memberships
       WHERE organization_id = $1 AND user_id = $2 AND role = 'student'`,
      [orgC.id, student.id]
    )
  ).rows[0].id;
  await db.query(
    `INSERT INTO pseudonym_labels (organization_id, user_id) VALUES ($1, $2)`,
    [orgC.id, student.id]
  );
  await db.query(
    `INSERT INTO invitations (organization_id, role, email, token_hash, status, created_by, expires_at)
     VALUES ($1, 'student', 'orgc@bay.test', $2, 'pending', $3, NOW() + interval '1 day')`,
    [orgC.id, hashToken("orgc-invite"), outsider.id]
  );
  await db.query(
    `INSERT INTO coach_student_assignments (organization_id, coach_membership_id, student_membership_id)
     SELECT $1, m.id, $2 FROM organization_memberships m
     WHERE m.organization_id = $1 AND m.user_id = $3 AND m.role = 'coach' AND m.status = 'active'`,
    [orgC.id, orgCStudentMem, outsider.id]
  );
  await db.query(
    `INSERT INTO audit_log (organization_id, actor_id, action) VALUES ($1, $2, 'seed')`,
    [orgC.id, outsider.id]
  );

  const orgCCounts = async () => ({
    memberships: (
      await db.query(`SELECT count(*)::int n FROM organization_memberships WHERE organization_id = $1`, [orgC.id])
    ).rows[0].n,
    assignments: (
      await db.query(`SELECT count(*)::int n FROM coach_student_assignments WHERE organization_id = $1`, [orgC.id])
    ).rows[0].n,
    invitations: (
      await db.query(`SELECT count(*)::int n FROM invitations WHERE organization_id = $1`, [orgC.id])
    ).rows[0].n,
    pseudonyms: (
      await db.query(`SELECT count(*)::int n FROM pseudonym_labels WHERE organization_id = $1`, [orgC.id])
    ).rows[0].n,
    audit: (
      await db.query(`SELECT count(*)::int n FROM audit_log WHERE organization_id = $1`, [orgC.id])
    ).rows[0].n,
  });

  const orgCBefore = await orgCCounts();
  assert(
    "deletable firm seeded with owned data",
    orgCBefore.memberships >= 2 &&
      orgCBefore.assignments === 1 &&
      orgCBefore.invitations === 1 &&
      orgCBefore.pseudonyms === 1 &&
      orgCBefore.audit >= 1,
    JSON.stringify(orgCBefore)
  );

  const authUsersBefore = (
    await db.query(`SELECT count(*)::int n FROM auth.users`)
  ).rows[0].n;

  assert(
    "a coach cannot delete their own firm",
    failedAs(
      await run(db, outsider, `SELECT firm_delete_organization($1)`, [orgC.id]),
      "no_data_found"
    )
  );
  assert(
    "a coach of another firm cannot delete it",
    failedAs(
      await run(db, coach, `SELECT firm_delete_organization($1)`, [orgC.id]),
      "no_data_found"
    )
  );
  assert(
    "a student cannot delete a firm",
    failedAs(
      await run(db, student, `SELECT firm_delete_organization($1)`, [orgC.id]),
      "no_data_found"
    )
  );
  assert(
    "deleting an unknown firm is denied",
    failedAs(
      await run(db, adminIdentity, `SELECT firm_delete_organization($1)`, [
        "00000000-0000-0000-0000-000000000000",
      ]),
      "no_data_found"
    )
  );

  const del = await run(db, adminIdentity, `SELECT firm_delete_organization($1) AS r`, [orgC.id]);
  assert("admin can delete a firm", del.ok, del.error);
  assert(
    "delete reports the firm-owned rows it removed",
    del.ok &&
      del.rows[0].r.deleted.memberships >= 2 &&
      del.rows[0].r.deleted.assignments === 1 &&
      del.rows[0].r.deleted.invitations === 1 &&
      del.rows[0].r.deleted.pseudonym_labels === 1,
    JSON.stringify(del.rows?.[0]?.r?.deleted)
  );

  const orgCAfter = await orgCCounts();
  assert(
    "delete cascades every firm-owned table to zero",
    orgCAfter.memberships === 0 &&
      orgCAfter.assignments === 0 &&
      orgCAfter.invitations === 0 &&
      orgCAfter.pseudonyms === 0 &&
      orgCAfter.audit === 0,
    JSON.stringify(orgCAfter)
  );
  assert(
    "the deleted organization row is gone",
    Number(
      (await db.query(`SELECT count(*)::int n FROM organizations WHERE id = $1`, [orgC.id])).rows[0].n
    ) === 0
  );
  assert(
    "other firms are untouched",
    Number(
      (await db.query(`SELECT count(*)::int n FROM organization_memberships WHERE organization_id = $1`, [org.id])).rows[0].n
    ) > 0 &&
      Number(
        (await db.query(`SELECT count(*)::int n FROM organizations WHERE id = $1`, [orgB.id])).rows[0].n
      ) === 1
  );
  assert(
    "auth users are untouched by firm deletion",
    Number((await db.query(`SELECT count(*)::int n FROM auth.users`)).rows[0].n) === authUsersBefore
  );

  // ------------------------------------------------------------------
  // Student behavior unchanged
  // ------------------------------------------------------------------
  await db.query(
    `INSERT INTO trades (user_id, ticker, entry_time, created_at)
     VALUES ($1, 'OWN', '2026-07-01T15:00:00Z', '2026-07-01T15:00:00Z')`,
    [student.id]
  );
  const ownTrades = await run(db, student, `SELECT ticker FROM trades WHERE user_id = $1`, [
    student.id,
  ]);
  assert("student still sees own trades", ownTrades.ok && ownTrades.rows.length === 1);

  // ------------------------------------------------------------------
  // Migration failure mode (documented behaviour)
  // ------------------------------------------------------------------
  const fresh = new PGlite();
  await fresh.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE auth.users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT);
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB LANGUAGE sql STABLE AS $$
      SELECT COALESCE(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb; $$;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOBYPASSRLS NOINHERIT; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOBYPASSRLS NOINHERIT; END IF;
    END $$;
    GRANT USAGE ON SCHEMA public TO authenticated, anon;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon;
  `);
  let failedLoudly = false;
  let failureMessage = "";
  try {
    for (const f of [
      "20260907_create_firm_foundation_tables.sql",
      "20260907_firm_rls_policies_and_trades_access.sql",
      "20260907_firm_invitation_lifecycle.sql",
      "20260907_firm_coach_read_helpers.sql",
      "20260915_add_global_admin.sql",
    ]) {
      await fresh.exec(fs.readFileSync(path.join(migrationsDir, f), "utf8"));
    }
  } catch (e) {
    failedLoudly = true;
    failureMessage = e.message ?? "";
  }
  assert(
    "migration fails loudly when the admin auth account is absent",
    failedLoudly && failureMessage.includes(GLOBAL_ADMIN_EMAIL),
    failureMessage.slice(0, 120)
  );

  // ------------------------------------------------------------------
  // Application contract: getOrgAccessContext() must resolve the global-admin
  // identity INDEPENDENTLY of the firm-membership branch. Regression guard for
  // an account that is both the global admin and an active coach of the firm
  // (admin-only actions such as coach invitations used to be denied to them).
  // ------------------------------------------------------------------
  const contextSource = fs
    .readFileSync(path.join(__dirname, "../lib/firm/context.ts"), "utf8")
    .replace(/\r\n/g, "\n");
  const fnStart = contextSource.indexOf("export async function getOrgAccessContext");
  const fnEnd = contextSource.indexOf("export async function getGlobalAdminContext");
  const fnSource = fnStart !== -1 && fnEnd > fnStart ? contextSource.slice(fnStart, fnEnd) : "";
  const adminLookupAt = fnSource.indexOf('from("baywater_admins")');
  const membershipLookupAt = fnSource.indexOf('from("organization_memberships")');
  assert(
    "getOrgAccessContext resolves the global-admin identity before the membership branch",
    adminLookupAt !== -1 && membershipLookupAt !== -1 && adminLookupAt < membershipLookupAt
  );
  assert(
    "getOrgAccessContext never hardcodes is_global_admin: false",
    fnSource !== "" && !/is_global_admin:\s*false/.test(fnSource),
    "the coach branch must forward the resolved admin identity"
  );
  assert(
    "getOrgAccessContext forwards the resolved admin identity to the coach branch",
    /is_global_admin:\s*isGlobalAdmin/.test(fnSource)
  );

  printSummary();
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

function printSummary() {
  const failed = results.filter((r) => !r.ok).length;
  console.log("\n---");
  console.log(`Passed: ${results.length - failed}/${results.length}`);
  if (failed) {
    for (const r of results.filter((x) => !x.ok)) {
      console.log(` - ${r.name}: ${r.detail}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
