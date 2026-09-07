/**
 * Isolated validation of the firm foundation migration.
 * Uses PGlite (in-process Postgres) — does not touch the remote Baywater DB.
 */
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const db = new PGlite();
  const results = [];

  const assert = (name, cond, detail = "") => {
    results.push({ name, ok: !!cond, detail });
    if (!cond) {
      console.error(`FAIL: ${name}${detail ? " — " + detail : ""}`);
    } else {
      console.log(`PASS: ${name}${detail ? " — " + detail : ""}`);
    }
  };

  // Minimal auth.users stub matching Supabase FK targets
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid()
    );
  `);

  const migrationPath = path.join(
    __dirname,
    "../supabase/migrations/20260907_create_firm_foundation_tables.sql"
  );
  const sql = fs.readFileSync(migrationPath, "utf8");

  try {
    await db.exec(sql);
    assert("migration applies cleanly", true);
  } catch (e) {
    assert("migration applies cleanly", false, e.message);
    printSummary(results);
    process.exit(1);
  }

  // Tables exist + RLS enabled
  const tables = await db.query(`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname IN (
        'organizations',
        'organization_memberships',
        'coach_student_assignments',
        'invitations',
        'pseudonym_labels',
        'audit_log'
      )
    ORDER BY c.relname;
  `);

  assert("six firm tables created", tables.rows.length === 6, `found ${tables.rows.length}`);
  for (const row of tables.rows) {
    assert(`RLS enabled on ${row.table_name}`, row.rls === true);
    assert(`FORCE RLS on ${row.table_name}`, row.force_rls === true);
  }

  // No permissive policies
  const policies = await db.query(`
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'organizations',
        'organization_memberships',
        'coach_student_assignments',
        'invitations',
        'pseudonym_labels',
        'audit_log'
      );
  `);
  assert("no permissive policies yet", policies.rows.length === 0, `count=${policies.rows.length}`);

  // Existing student tables untouched (none created by this migration)
  const trades = await db.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'trades'
  `);
  assert("does not create/alter trades", trades.rows.length === 0);

  // Seed users + org
  const u1 = (await db.query(`INSERT INTO auth.users DEFAULT VALUES RETURNING id`)).rows[0].id;
  const u2 = (await db.query(`INSERT INTO auth.users DEFAULT VALUES RETURNING id`)).rows[0].id;
  const u3 = (await db.query(`INSERT INTO auth.users DEFAULT VALUES RETURNING id`)).rows[0].id;
  const org = (
    await db.query(
      `INSERT INTO organizations (name, created_by) VALUES ('Test Firm', $1) RETURNING id, next_pseudonym_number`,
      [u1]
    )
  ).rows[0];
  assert("organization insert", !!org.id, `next=${org.next_pseudonym_number}`);

  const coachMem = (
    await db.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role, status)
       VALUES ($1, $2, 'coach', 'active') RETURNING id`,
      [org.id, u1]
    )
  ).rows[0];

  const studentMem = (
    await db.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role, status)
       VALUES ($1, $2, 'student', 'active') RETURNING id`,
      [org.id, u2]
    )
  ).rows[0];

  // Duplicate membership should fail
  try {
    await db.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role, status)
       VALUES ($1, $2, 'coach', 'active')`,
      [org.id, u1]
    );
    assert("unique org+user+role", false, "duplicate allowed");
  } catch {
    assert("unique org+user+role", true);
  }

  // Valid assignment
  await db.query(
    `INSERT INTO coach_student_assignments
      (organization_id, coach_membership_id, student_membership_id)
     VALUES ($1, $2, $3)`,
    [org.id, coachMem.id, studentMem.id]
  );
  assert("valid coach-student assignment", true);

  // Cross-org assignment blocked by composite FK
  const org2 = (
    await db.query(`INSERT INTO organizations (name) VALUES ('Other Firm') RETURNING id`)
  ).rows[0];
  const coach2 = (
    await db.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role)
       VALUES ($1, $2, 'coach') RETURNING id`,
      [org2.id, u1]
    )
  ).rows[0];
  try {
    await db.query(
      `INSERT INTO coach_student_assignments
        (organization_id, coach_membership_id, student_membership_id)
       VALUES ($1, $2, $3)`,
      [org.id, coach2.id, studentMem.id]
    );
    assert("blocks cross-org assignment", false, "cross-org insert succeeded");
  } catch {
    assert("blocks cross-org assignment", true);
  }

  // Role mismatch: student as coach_membership_id
  try {
    await db.query(
      `INSERT INTO coach_student_assignments
        (organization_id, coach_membership_id, student_membership_id)
       VALUES ($1, $2, $3)`,
      [org.id, studentMem.id, coachMem.id]
    );
    assert("blocks role-mismatched assignment", false);
  } catch {
    assert("blocks role-mismatched assignment", true);
  }

  // Invitation token uniqueness + status
  await db.query(
    `INSERT INTO invitations
      (organization_id, role, email, token_hash, status, created_by, expires_at)
     VALUES ($1, 'student', 'a@example.com', 'hash1', 'pending', $2, NOW() + interval '1 day')`,
    [org.id, u1]
  );
  try {
    await db.query(
      `INSERT INTO invitations
        (organization_id, role, email, token_hash, status, created_by, expires_at)
       VALUES ($1, 'coach', 'b@example.com', 'hash1', 'pending', $2, NOW() + interval '1 day')`,
      [org.id, u1]
    );
    assert("unique token_hash", false);
  } catch {
    assert("unique token_hash", true);
  }

  // Pseudonym allocation + concurrency
  const label1 = (
    await db.query(
      `INSERT INTO pseudonym_labels (organization_id, user_id) VALUES ($1, $2) RETURNING label`,
      [org.id, u2]
    )
  ).rows[0].label;
  assert("pseudonym auto label", label1 === "Student 1001", label1);

  // Reject client-supplied labels (prevents PII / spoofing)
  try {
    await db.query(
      `INSERT INTO pseudonym_labels (organization_id, user_id, label)
       VALUES ($1, $2, 'Student SecretName')`,
      [org.id, u3]
    );
    assert("rejects supplied labels", false);
  } catch {
    assert("rejects supplied labels", true);
  }

  // Concurrent-style sequential allocations (transactional row lock path)
  const users = [];
  for (let i = 0; i < 20; i++) {
    users.push((await db.query(`INSERT INTO auth.users DEFAULT VALUES RETURNING id`)).rows[0].id);
  }

  // Simulate concurrent pressure with overlapping transactions via Promise.all
  // PGlite is single-connection; still validates sequential uniqueness under rapid inserts.
  const labels = [];
  for (const uid of users) {
    const row = await db.query(
      `INSERT INTO pseudonym_labels (organization_id, user_id) VALUES ($1, $2) RETURNING label`,
      [org.id, uid]
    );
    labels.push(row.rows[0].label);
  }
  const unique = new Set(labels);
  assert(
    "pseudonym labels unique under burst inserts",
    unique.size === labels.length,
    `n=${labels.length}`
  );
  assert(
    "pseudonym labels sequential from 1002",
    labels[0] === "Student 1002" && labels[19] === "Student 1021",
    `${labels[0]}..${labels[19]}`
  );

  // Audit log insert
  await db.query(
    `INSERT INTO audit_log (organization_id, actor_id, action, target_user_id, metadata)
     VALUES ($1, $2, 'invitation.created', $3, '{"role":"student"}'::jsonb)`,
    [org.id, u1, u2]
  );
  assert("audit_log insert", true);

  // RLS deny-by-default for a non-BYPASSRLS role
  await db.exec(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'firm_rls_tester') THEN
        CREATE ROLE firm_rls_tester NOBYPASSRLS;
      END IF;
    END $$;
    GRANT USAGE ON SCHEMA public TO firm_rls_tester;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO firm_rls_tester;
  `);

  let denied = false;
  try {
    await db.query(`SET ROLE firm_rls_tester`);
    await db.query(`SELECT * FROM organizations`);
    const visible = await db.query(`SELECT count(*)::int AS n FROM organizations`);
    // With RLS and no policies, should see 0 rows (not an error on SELECT)
    if (visible.rows[0].n === 0) denied = true;
    await db.query(`INSERT INTO organizations (name) VALUES ('should fail')`);
  } catch {
    denied = true;
  } finally {
    try {
      await db.query(`RESET ROLE`);
    } catch {
      /* ignore */
    }
  }
  assert("RLS denies broad authenticated-style access", denied);

  // Indexes present for key paths
  const idxs = await db.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'idx_organization_memberships_active_coach',
        'idx_organization_memberships_active_student',
        'idx_invitations_token_hash',
        'idx_invitations_organization_status',
        'idx_audit_log_organization_created_at',
        'idx_coach_student_assignments_coach_membership_id'
      )
  `);
  assert("key indexes created", idxs.rows.length === 6, `found ${idxs.rows.length}`);

  // FK inventory for firm tables
  const fks = await db.query(`
    SELECT conrelid::regclass::text AS tbl, conname
    FROM pg_constraint
    WHERE contype = 'f'
      AND conrelid::regclass::text IN (
        'organizations',
        'organization_memberships',
        'coach_student_assignments',
        'invitations',
        'pseudonym_labels',
        'audit_log'
      )
    ORDER BY 1, 2
  `);
  assert("foreign keys present", fks.rows.length >= 10, `count=${fks.rows.length}`);

  printSummary(results);
  const failed = results.filter((r) => !r.ok).length;
  process.exit(failed === 0 ? 0 : 1);
}

function printSummary(results) {
  const failed = results.filter((r) => !r.ok).length;
  console.log("\n---");
  console.log(`Passed: ${results.length - failed}/${results.length}`);
  if (failed) {
    console.log("Failed checks:");
    for (const r of results.filter((x) => !x.ok)) {
      console.log(` - ${r.name}: ${r.detail}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
