/**
 * Bidirectional RLS + trades coach-access validation for the firm feature.
 * Uses PGlite only — does not touch the remote Baywater database.
 */
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../supabase/migrations");

const results = [];
const assert = (name, cond, detail = "") => {
  results.push({ name, ok: !!cond, detail });
  if (!cond) console.error(`FAIL: ${name}${detail ? " — " + detail : ""}`);
  else console.log(`PASS: ${name}${detail ? " — " + detail : ""}`);
};

async function asUser(db, userId, email, fn) {
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userId]);
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: userId, email, role: "authenticated" }),
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

async function countAs(db, userId, email, sql, params = []) {
  return asUser(db, userId, email, async () => {
    const r = await db.query(sql, params);
    return Number(r.rows[0].n);
  });
}

async function main() {
  const db = new PGlite();

  // Supabase-like auth stubs + roles (must exist before policies TO authenticated)
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;

    CREATE TABLE auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT
    );

    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS UUID
    LANGUAGE sql
    STABLE
    AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;

    CREATE OR REPLACE FUNCTION auth.jwt()
    RETURNS JSONB
    LANGUAGE sql
    STABLE
    AS $$
      SELECT COALESCE(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
    $$;

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOBYPASSRLS NOINHERIT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOBYPASSRLS NOINHERIT;
      END IF;
    END $$;

    GRANT USAGE ON SCHEMA public TO authenticated, anon;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon;
  `);

  // Stub trades mirroring remote columns used by policies (confirmed via PostgREST probe)
  await db.exec(`
    CREATE TABLE public.trades (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      entry_time TIMESTAMPTZ,
      ticker TEXT
    );

    ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

    -- Pre-existing student own-trades policy (must remain untouched by firm migration)
    CREATE POLICY trades_select_own
      ON public.trades
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);

    GRANT SELECT ON public.trades TO authenticated;
  `);

  const foundationSql = fs.readFileSync(
    path.join(migrationsDir, "20260907000001_create_firm_foundation_tables.sql"),
    "utf8"
  );
  const rlsSql = fs.readFileSync(
    path.join(migrationsDir, "20260907000002_firm_rls_policies_and_trades_access.sql"),
    "utf8"
  );

  try {
    await db.exec(foundationSql);
    await db.exec(rlsSql);
    assert("migrations apply cleanly", true);
  } catch (e) {
    assert("migrations apply cleanly", false, e.message);
    printSummary();
    process.exit(1);
  }

  // Existing student policy untouched; coach policy additive
  const tradePolicies = await db.query(`
    SELECT policyname, cmd, roles::text
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'trades'
    ORDER BY policyname
  `);
  const names = tradePolicies.rows.map((r) => r.policyname);
  assert("trades_select_own still present", names.includes("trades_select_own"));
  assert(
    "trades_select_authorized_coach added",
    names.includes("trades_select_authorized_coach")
  );
  assert("exactly two trades SELECT policies", names.length === 2, names.join(","));

  // Seed users
  const coach = (
    await db.query(
      `INSERT INTO auth.users (email) VALUES ('coach@firm.test') RETURNING id, email`
    )
  ).rows[0];
  const student = (
    await db.query(
      `INSERT INTO auth.users (email) VALUES ('student@firm.test') RETURNING id, email`
    )
  ).rows[0];
  const outsider = (
    await db.query(
      `INSERT INTO auth.users (email) VALUES ('outsider@other.test') RETURNING id, email`
    )
  ).rows[0];
  const coach2 = (
    await db.query(
      `INSERT INTO auth.users (email) VALUES ('coach2@firm.test') RETURNING id, email`
    )
  ).rows[0];
  const otherOrgStudent = (
    await db.query(
      `INSERT INTO auth.users (email) VALUES ('student@other.test') RETURNING id, email`
    )
  ).rows[0];

  // Create org via RPC as coach
  const org = await asUser(db, coach.id, coach.email, async () => {
    const r = await db.query(`SELECT * FROM firm_create_organization($1)`, ["Bay Firm"]);
    return r.rows[0];
  });
  assert("firm_create_organization works", !!org.id, org.name);

  const coachMem = (
    await db.query(
      `SELECT id, joined_at FROM organization_memberships
       WHERE organization_id = $1 AND user_id = $2 AND role = 'coach'`,
      [org.id, coach.id]
    )
  ).rows[0];

  // Direct INSERT as authenticated must fail (writes via RPC only)
  let directInsertBlocked = false;
  try {
    await asUser(db, coach.id, coach.email, async () => {
      await db.query(`INSERT INTO organizations (name) VALUES ('hack')`);
    });
  } catch {
    directInsertBlocked = true;
  }
  assert("direct organization INSERT blocked for authenticated", directInsertBlocked);

  // Seed student membership + pseudonym as table owner (invite-accept is next milestone)
  const joinedAt = new Date("2026-06-01T00:00:00Z").toISOString();
  const studentMem = (
    await db.query(
      `INSERT INTO organization_memberships
         (organization_id, user_id, role, status, joined_at)
       VALUES ($1, $2, 'student', 'active', $3::timestamptz)
       RETURNING id, joined_at`,
      [org.id, student.id, joinedAt]
    )
  ).rows[0];

  const pseudo = (
    await db.query(
      `INSERT INTO pseudonym_labels (organization_id, user_id)
       VALUES ($1, $2) RETURNING label, user_id`,
      [org.id, student.id]
    )
  ).rows[0];
  assert("pseudonym allocated", pseudo.label === "Student 1001", pseudo.label);

  // Second org (unauthorized for primary coach)
  const otherOrg = await asUser(db, outsider.id, outsider.email, async () => {
    const r = await db.query(`SELECT * FROM firm_create_organization($1)`, ["Other Firm"]);
    return r.rows[0];
  });
  await db.query(
    `INSERT INTO organization_memberships
       (organization_id, user_id, role, status, joined_at)
     VALUES ($1, $2, 'student', 'active', NOW())`,
    [otherOrg.id, otherOrgStudent.id]
  );
  await db.query(
    `INSERT INTO pseudonym_labels (organization_id, user_id) VALUES ($1, $2)`,
    [otherOrg.id, otherOrgStudent.id]
  );

  // Trades: before join, on/after join
  const beforeTrade = (
    await db.query(
      `INSERT INTO trades (user_id, ticker, entry_time, created_at)
       VALUES ($1, 'OLD', '2026-05-01T15:00:00Z', '2026-05-01T15:00:00Z')
       RETURNING id`,
      [student.id]
    )
  ).rows[0];
  const afterTrade = (
    await db.query(
      `INSERT INTO trades (user_id, ticker, entry_time, created_at)
       VALUES ($1, 'NEW', '2026-07-01T15:00:00Z', '2026-07-01T15:00:00Z')
       RETURNING id`,
      [student.id]
    )
  ).rows[0];
  const otherStudentTrade = (
    await db.query(
      `INSERT INTO trades (user_id, ticker, entry_time, created_at)
       VALUES ($1, 'X', NOW(), NOW()) RETURNING id`,
      [otherOrgStudent.id]
    )
  ).rows[0];

  // --- organizations RLS ---
  assert(
    "coach reads own org",
    (await countAs(
      db,
      coach.id,
      coach.email,
      `SELECT count(*)::int AS n FROM organizations WHERE id = $1`,
      [org.id]
    )) === 1
  );
  assert(
    "coach cannot read other org",
    (await countAs(
      db,
      coach.id,
      coach.email,
      `SELECT count(*)::int AS n FROM organizations WHERE id = $1`,
      [otherOrg.id]
    )) === 0
  );
  assert(
    "outsider cannot read coach org",
    (await countAs(
      db,
      outsider.id,
      outsider.email,
      `SELECT count(*)::int AS n FROM organizations WHERE id = $1`,
      [org.id]
    )) === 0
  );

  // --- memberships RLS ---
  assert(
    "user reads own membership",
    (await countAs(
      db,
      student.id,
      student.email,
      `SELECT count(*)::int AS n FROM organization_memberships WHERE user_id = $1`,
      [student.id]
    )) === 1
  );
  assert(
    "coach reads active student membership in org",
    (await countAs(
      db,
      coach.id,
      coach.email,
      `SELECT count(*)::int AS n FROM organization_memberships
       WHERE organization_id = $1 AND role = 'student' AND status = 'active'`,
      [org.id]
    )) === 1
  );
  assert(
    "coach cannot read other-org student membership",
    (await countAs(
      db,
      coach.id,
      coach.email,
      `SELECT count(*)::int AS n FROM organization_memberships
       WHERE organization_id = $1 AND user_id = $2`,
      [otherOrg.id, otherOrgStudent.id]
    )) === 0
  );

  // --- invitations ---
  const inv = await asUser(db, coach.id, coach.email, async () => {
    const r = await db.query(
      `SELECT * FROM firm_create_invitation($1, 'student', $2, $3, NOW() + interval '2 days')`,
      [org.id, "invitee@firm.test", "sha256-deadbeef"]
    );
    return r.rows[0];
  });
  assert("firm_create_invitation works", inv.status === "pending");

  assert(
    "creator reads invitation",
    (await countAs(
      db,
      coach.id,
      coach.email,
      `SELECT count(*)::int AS n FROM invitations WHERE id = $1`,
      [inv.id]
    )) === 1
  );
  assert(
    "unrelated user cannot read invitation",
    (await countAs(
      db,
      outsider.id,
      outsider.email,
      `SELECT count(*)::int AS n FROM invitations WHERE id = $1`,
      [inv.id]
    )) === 0
  );
  assert(
    "addressee reads invitation by email",
    (await countAs(
      db,
      outsider.id,
      "invitee@firm.test",
      `SELECT count(*)::int AS n FROM invitations WHERE id = $1`,
      [inv.id]
    )) === 1
  );

  // --- pseudonyms ---
  assert(
    "student reads own pseudonym",
    (await countAs(
      db,
      student.id,
      student.email,
      `SELECT count(*)::int AS n FROM pseudonym_labels WHERE user_id = $1`,
      [student.id]
    )) === 1
  );
  assert(
    "single-coach org: coach reads student pseudonym without assignment",
    (await countAs(
      db,
      coach.id,
      coach.email,
      `SELECT count(*)::int AS n FROM pseudonym_labels
       WHERE organization_id = $1 AND user_id = $2`,
      [org.id, student.id]
    )) === 1
  );
  assert(
    "outsider cannot read pseudonym",
    (await countAs(
      db,
      outsider.id,
      outsider.email,
      `SELECT count(*)::int AS n FROM pseudonym_labels WHERE user_id = $1`,
      [student.id]
    )) === 0
  );

  // Pseudonym table has no identity columns
  const pseudoCols = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pseudonym_labels'
  `);
  const colSet = new Set(pseudoCols.rows.map((r) => r.column_name));
  assert(
    "pseudonym_labels has no name/email/avatar columns",
    !colSet.has("name") && !colSet.has("email") && !colSet.has("avatar") && !colSet.has("avatar_url")
  );

  // --- audit log ---
  assert(
    "coach reads audit log",
    (await countAs(
      db,
      coach.id,
      coach.email,
      `SELECT count(*)::int AS n FROM audit_log WHERE organization_id = $1`,
      [org.id]
    )) >= 1
  );
  assert(
    "student cannot read audit log",
    (await countAs(
      db,
      student.id,
      student.email,
      `SELECT count(*)::int AS n FROM audit_log WHERE organization_id = $1`,
      [org.id]
    )) === 0
  );
  let auditInsertBlocked = false;
  try {
    await asUser(db, coach.id, coach.email, async () => {
      await db.query(
        `INSERT INTO audit_log (organization_id, actor_id, action)
         VALUES ($1, $2, 'hack')`,
        [org.id, coach.id]
      );
    });
  } catch {
    auditInsertBlocked = true;
  }
  assert("direct audit_log INSERT blocked", auditInsertBlocked);

  // --- trades: student own access unaffected ---
  const studentSees = await asUser(db, student.id, student.email, async () => {
    const r = await db.query(
      `SELECT id, ticker FROM trades WHERE user_id = $1 ORDER BY ticker`,
      [student.id]
    );
    return r.rows;
  });
  assert(
    "student still sees all own trades",
    studentSees.length === 2 && studentSees.some((t) => t.id === beforeTrade.id),
    `n=${studentSees.length}`
  );

  // --- trades: single-coach visibility (no assignment required) ---
  const coachSees = await asUser(db, coach.id, coach.email, async () => {
    const r = await db.query(
      `SELECT id, ticker FROM trades WHERE user_id = $1 ORDER BY ticker`,
      [student.id]
    );
    return r.rows;
  });
  assert(
    "coach sees post-join student trade",
    coachSees.length === 1 && coachSees[0].id === afterTrade.id,
    coachSees.map((t) => t.ticker).join(",")
  );
  assert(
    "coach does not see pre-join student trade",
    !coachSees.some((t) => t.id === beforeTrade.id)
  );

  // Manipulated user_id for other-org student
  const crossOrg = await asUser(db, coach.id, coach.email, async () => {
    const r = await db.query(`SELECT id FROM trades WHERE user_id = $1`, [
      otherOrgStudent.id,
    ]);
    return r.rows;
  });
  assert(
    "coach cannot read other-org trades even with exact user_id",
    crossOrg.length === 0
  );
  assert(
    "other-org trade exists in DB",
    (
      await db.query(`SELECT count(*)::int AS n FROM trades WHERE id = $1`, [
        otherStudentTrade.id,
      ])
    ).rows[0].n === 1
  );

  // --- revoked membership removes access ---
  await db.query(
    `UPDATE organization_memberships
     SET status = 'revoked', ended_at = NOW()
     WHERE id = $1`,
    [coachMem.id]
  );
  assert(
    "revoked coach cannot read student trades",
    (await countAs(
      db,
      coach.id,
      coach.email,
      `SELECT count(*)::int AS n FROM trades WHERE user_id = $1`,
      [student.id]
    )) === 0
  );
  assert(
    "revoked coach cannot read org",
    (await countAs(
      db,
      coach.id,
      coach.email,
      `SELECT count(*)::int AS n FROM organizations WHERE id = $1`,
      [org.id]
    )) === 0
  );

  // Restore coach for multi-coach assignment tests
  await db.query(
    `UPDATE organization_memberships
     SET status = 'active', ended_at = NULL
     WHERE id = $1`,
    [coachMem.id]
  );

  // --- multi-coach: assignment required ---
  const coach2Mem = (
    await db.query(
      `INSERT INTO organization_memberships
         (organization_id, user_id, role, status, joined_at)
       VALUES ($1, $2, 'coach', 'active', NOW())
       RETURNING id`,
      [org.id, coach2.id]
    )
  ).rows[0];

  assert(
    "multi-coach without assignment: coach2 cannot see trades",
    (await countAs(
      db,
      coach2.id,
      coach2.email,
      `SELECT count(*)::int AS n FROM trades WHERE user_id = $1`,
      [student.id]
    )) === 0
  );
  assert(
    "multi-coach without assignment: coach2 cannot see pseudonym",
    (await countAs(
      db,
      coach2.id,
      coach2.email,
      `SELECT count(*)::int AS n FROM pseudonym_labels WHERE user_id = $1`,
      [student.id]
    )) === 0
  );

  // Original coach also needs assignment now that count > 1
  assert(
    "multi-coach without assignment: original coach blocked until assigned",
    (await countAs(
      db,
      coach.id,
      coach.email,
      `SELECT count(*)::int AS n FROM trades WHERE user_id = $1`,
      [student.id]
    )) === 0
  );

  await asUser(db, coach.id, coach.email, async () => {
    await db.query(
      `SELECT * FROM firm_assign_coach_student($1, $2, $3)`,
      [org.id, coachMem.id, studentMem.id]
    );
  });

  assert(
    "assigned coach regains trade access",
    (await countAs(
      db,
      coach.id,
      coach.email,
      `SELECT count(*)::int AS n FROM trades WHERE user_id = $1 AND ticker = 'NEW'`,
      [student.id]
    )) === 1
  );
  assert(
    "unassigned coach2 still blocked after other coach assigned",
    (await countAs(
      db,
      coach2.id,
      coach2.email,
      `SELECT count(*)::int AS n FROM trades WHERE user_id = $1`,
      [student.id]
    )) === 0
  );

  // Assignments visibility
  assert(
    "coach reads own assignments",
    (await countAs(
      db,
      coach.id,
      coach.email,
      `SELECT count(*)::int AS n FROM coach_student_assignments WHERE coach_membership_id = $1`,
      [coachMem.id]
    )) === 1
  );
  assert(
    "coach2 cannot read other coach assignments",
    (await countAs(
      db,
      coach2.id,
      coach2.email,
      `SELECT count(*)::int AS n FROM coach_student_assignments WHERE coach_membership_id = $1`,
      [coachMem.id]
    )) === 0
  );

  // Cross-org assignment attempt via RPC should fail
  let crossAssignBlocked = false;
  try {
    await asUser(db, coach.id, coach.email, async () => {
      await db.query(
        `SELECT * FROM firm_assign_coach_student($1, $2, $3)`,
        [otherOrg.id, coachMem.id, studentMem.id]
      );
    });
  } catch {
    crossAssignBlocked = true;
  }
  assert("RPC blocks cross-org assignment attempt", crossAssignBlocked);

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
