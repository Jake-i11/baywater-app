/**
 * ORGANIZATION CREATION AUTHORIZATION validation.
 *
 * Proves the Part-1 permission model end to end:
 *   * the global admin (iappinijacob@gmail.com) keeps full creation access
 *   * a user with NO memberships can create a firm and becomes its active COACH
 *   * an ACTIVE STUDENT in any firm can NEVER create an organization —
 *     the firm_create_organization RPC rejects them at the database layer
 *   * a coach with existing firms can still create more
 *   * students see only firms they joined; cross-firm reads stay blocked (RLS)
 *   * revoking the student membership re-enables creation (no stuck identities)
 *   * anonymous callers are rejected
 *
 * PGlite only — does not touch the remote Baywater database.
 */
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "crypto";
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
};

const hashToken = (raw) => createHash("sha256").update(raw, "utf8").digest("hex");

const ANON = { id: "", email: "" };

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
    (
      await db.query(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id, email`, [
        email,
      ])
    ).rows[0];

  const adminIdentity = await mkUser(GLOBAL_ADMIN_EMAIL);
  const coach = await mkUser("coach@bay.test");
  const student = await mkUser("student@bay.test");

  try {
    for (const f of [
      "20260907000001_create_firm_foundation_tables.sql",
      "20260907000002_firm_rls_policies_and_trades_access.sql",
      "20260907000003_firm_invitation_lifecycle.sql",
      "20260907000004_firm_coach_read_helpers.sql",
      "20260915000001_add_global_admin.sql",
      "20260918000001_org_creation_authorization.sql",
    ]) {
      await db.exec(fs.readFileSync(path.join(migrationsDir, f), "utf8"));
    }
    assert("all migrations apply cleanly (incl. creation guard)", true);
  } catch (e) {
    assert("all migrations apply cleanly (incl. creation guard)", false, e.message);
    printSummary();
    process.exit(1);
  }

  // ------------------------------------------------------------------
  // Global admin creation path stays open
  // ------------------------------------------------------------------
  const adminOrg = await run(db, adminIdentity, `SELECT * FROM firm_create_organization($1)`, [
    "Admin's Firm",
  ]);
  assert("global admin can create an organization", adminOrg.ok, adminOrg.error);

  // ------------------------------------------------------------------
  // Coach creation path (no prior memberships) stays open
  // ------------------------------------------------------------------
  const coachOrg = await run(db, coach, `SELECT * FROM firm_create_organization($1)`, [
    "Coach Firm",
  ]);
  assert("a prospective coach can create an organization", coachOrg.ok, coachOrg.error);
  const coachOrgId = coachOrg.ok ? coachOrg.rows[0].id : null;

  if (coachOrg.ok) {
    assert(
      "firm creator becomes an ACTIVE coach member",
      (await scalar(
        db,
        coach,
        `SELECT count(*)::int FROM organization_memberships
         WHERE organization_id = $1 AND user_id = $2 AND role = 'coach' AND status = 'active'`,
        [coachOrgId, coach.id]
      )) === 1
    );
    assert(
      "firm creator does not become the global admin",
      (await scalar(db, coach, `SELECT firm_is_global_admin(auth.uid())`)) === false
    );
  }

  // ------------------------------------------------------------------
  // Student joins via the EXISTING invitation system, then is blocked
  // ------------------------------------------------------------------
  const invite = await run(
    db,
    coach,
    `SELECT * FROM firm_create_invitation($1, 'student', $2, $3, NOW() + interval '7 days')`,
    [coachOrgId, student.email, hashToken("student-token")]
  );
  assert("coach can invite a student (invitation system intact)", invite.ok, invite.error);

  const accepted = await run(db, student, `SELECT firm_accept_invitation($1) AS r`, [
    hashToken("student-token"),
  ]);
  assert("student accepts invitation and gets a membership", accepted.ok, accepted.error);
  assert(
    "student holds an ACTIVE student membership after accepting",
    (await scalar(
      db,
      student,
      `SELECT count(*)::int FROM organization_memberships
       WHERE role = 'student' AND status = 'active' AND user_id = $1`,
      [student.id]
    )) === 1
  );

  const studentCreate = await run(db, student, `SELECT * FROM firm_create_organization($1)`, [
    "Sneaky Student Firm",
  ]);
  assert(
    "ACTIVE STUDENT cannot create an organization (RPC rejects)",
    failedAs(studentCreate, "insufficient_privilege"),
    studentCreate.error
  );

  // The guard is the student membership, not a one-shot flag.
  const orgB = await run(db, coach, `SELECT * FROM firm_create_organization($1)`, [
    "Coach Firm B",
  ]);
  assert("coach with existing firms can create another", orgB.ok, orgB.error);
  const orgBId = orgB.ok ? orgB.rows[0].id : null;

  assert(
    "firm_is_active_student_anywhere is true for the student",
    (await scalar(db, student, `SELECT firm_is_active_student_anywhere(auth.uid())`)) === true
  );
  assert(
    "firm_is_active_student_anywhere is false for a coach",
    (await scalar(db, coach, `SELECT firm_is_active_student_anywhere(auth.uid())`)) === false
  );

  // ------------------------------------------------------------------
  // Student visibility: ONLY joined firms; no cross-firm reads (RLS)
  // ------------------------------------------------------------------
  const studentOrgs = await run(
    db,
    student,
    `SELECT o.name FROM organizations o
     JOIN organization_memberships m ON m.organization_id = o.id
     WHERE m.user_id = auth.uid() AND m.role = 'student' AND m.status = 'active'`
  );
  assert(
    "student listing sees exactly the firms they joined",
    studentOrgs.ok &&
      studentOrgs.rows.length === 1 &&
      studentOrgs.rows[0].name === "Coach Firm",
    JSON.stringify(studentOrgs.rows ?? studentOrgs.error)
  );

  const foreignRead = await run(
    db,
    student,
    `SELECT id, name FROM organizations WHERE id = $1`,
    [orgBId]
  );
  assert(
    "student cannot read a firm they never joined (RLS)",
    foreignRead.ok && foreignRead.rows.length === 0,
    JSON.stringify(foreignRead.rows ?? foreignRead.error)
  );

  // ------------------------------------------------------------------
  // Revoked membership un-blocks creation (no stuck identities)
  // ------------------------------------------------------------------
  const studentMemId = (
    await db.query(
      `SELECT id FROM organization_memberships WHERE user_id = $1 AND role = 'student'`,
      [student.id]
    )
  ).rows[0].id;
  const revoke = await run(db, adminIdentity, `SELECT firm_revoke_membership($1) AS r`, [
    studentMemId,
  ]);
  assert("membership revocation still works (admin)", revoke.ok, revoke.error);

  const afterRevoke = await run(db, student, `SELECT * FROM firm_create_organization($1)`, [
    "Student Turned Coach Firm",
  ]);
  assert(
    "former student (revoked membership) may create organizations again",
    afterRevoke.ok,
    afterRevoke.error
  );

  // ------------------------------------------------------------------
  // Anonymous callers are still rejected
  // ------------------------------------------------------------------
  const anonCreate = await run(db, ANON, `SELECT * FROM firm_create_organization($1)`, [
    "Anon Firm",
  ]);
  assert(
    "anonymous callers cannot create organizations",
    failedAs(anonCreate, "insufficient_privilege"),
    anonCreate.error
  );

  printSummary();
}

function printSummary() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
