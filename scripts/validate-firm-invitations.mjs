/**
 * Invitation lifecycle validation (create / accept / decline / revoke / atomicity).
 * PGlite only — does not touch the remote Baywater database.
 */
import { PGlite } from "@electric-sql/pglite";
import { createHash, randomBytes } from "crypto";
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

function hashToken(raw) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function newToken() {
  return randomBytes(32).toString("base64url");
}

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

    CREATE TABLE public.trades (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      entry_time TIMESTAMPTZ,
      ticker TEXT,
      ai_review TEXT
    );
    ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
    CREATE POLICY trades_select_own ON public.trades
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
    GRANT SELECT ON public.trades TO authenticated;
  `);

  const files = [
    "20260907_create_firm_foundation_tables.sql",
    "20260907_firm_rls_policies_and_trades_access.sql",
    "20260907_firm_invitation_lifecycle.sql",
  ];
  try {
    for (const f of files) {
      await db.exec(fs.readFileSync(path.join(migrationsDir, f), "utf8"));
    }
    assert("lifecycle migrations apply", true);
  } catch (e) {
    assert("lifecycle migrations apply", false, e.message);
    printSummary();
    process.exit(1);
  }

  const coach = (
    await db.query(`INSERT INTO auth.users (email) VALUES ('coach@firm.test') RETURNING id, email`)
  ).rows[0];
  const student = (
    await db.query(
      `INSERT INTO auth.users (email) VALUES ('student@firm.test') RETURNING id, email`
    )
  ).rows[0];
  const wrongEmailUser = (
    await db.query(
      `INSERT INTO auth.users (email) VALUES ('other@firm.test') RETURNING id, email`
    )
  ).rows[0];
  const coach2 = (
    await db.query(
      `INSERT INTO auth.users (email) VALUES ('coach2@firm.test') RETURNING id, email`
    )
  ).rows[0];

  const org = await asUser(db, coach.id, coach.email, async () => {
    const r = await db.query(`SELECT * FROM firm_create_organization($1)`, ["Lifecycle Firm"]);
    return r.rows[0];
  });

  // Existing student trades must remain untouched through accept
  await db.query(
    `INSERT INTO trades (user_id, ticker, entry_time, created_at, ai_review)
     VALUES ($1, 'AAPL', '2026-01-10T15:00:00Z', '2026-01-10T15:00:00Z', 'keep-me')`,
    [student.id]
  );
  const tradeBefore = (
    await db.query(`SELECT id, ticker, ai_review FROM trades WHERE user_id = $1`, [student.id])
  ).rows[0];

  // --- create invitation ---
  const raw = newToken();
  const hash = hashToken(raw);
  const inv = await asUser(db, coach.id, coach.email, async () => {
    const r = await db.query(
      `SELECT * FROM firm_create_invitation($1, 'student', $2, $3, NOW() + interval '3 days')`,
      [org.id, student.email, hash]
    );
    return r.rows[0];
  });
  assert("create invitation stores hash only", inv.token_hash === hash && !("raw" in inv));

  // Preview (anon)
  await db.query(`SET ROLE anon`);
  const preview = await db.query(`SELECT * FROM firm_preview_invitation($1)`, [hash]);
  await db.query(`RESET ROLE`);
  assert(
    "anon preview returns org name",
    preview.rows[0]?.organization_name === "Lifecycle Firm",
    preview.rows[0]?.organization_name
  );

  // Wrong email cannot accept
  let wrongEmailBlocked = false;
  try {
    await asUser(db, wrongEmailUser.id, wrongEmailUser.email, async () => {
      await db.query(`SELECT firm_accept_invitation($1)`, [hash]);
    });
  } catch {
    wrongEmailBlocked = true;
  }
  assert("wrong email cannot accept", wrongEmailBlocked);

  // Decline path then recreate
  const rawDecline = newToken();
  const hashDecline = hashToken(rawDecline);
  await asUser(db, coach.id, coach.email, async () => {
    await db.query(
      `SELECT * FROM firm_create_invitation($1, 'student', $2, $3, NOW() + interval '3 days')`,
      [org.id, "decline@firm.test", hashDecline]
    );
  });
  const decliner = (
    await db.query(
      `INSERT INTO auth.users (email) VALUES ('decline@firm.test') RETURNING id, email`
    )
  ).rows[0];
  await asUser(db, decliner.id, decliner.email, async () => {
    await db.query(`SELECT firm_decline_invitation($1)`, [hashDecline]);
  });
  const declineMem = await db.query(
    `SELECT count(*)::int AS n FROM organization_memberships WHERE user_id = $1`,
    [decliner.id]
  );
  assert("decline creates no membership", declineMem.rows[0].n === 0);

  let redeclineBlocked = false;
  try {
    await asUser(db, decliner.id, decliner.email, async () => {
      await db.query(`SELECT firm_accept_invitation($1)`, [hashDecline]);
    });
  } catch {
    redeclineBlocked = true;
  }
  assert("declined invite cannot be accepted", redeclineBlocked);

  // Expired (unique email so pending unique index is not hit)
  const expiredUser = (
    await db.query(
      `INSERT INTO auth.users (email) VALUES ('expired@firm.test') RETURNING id, email`
    )
  ).rows[0];
  const rawExp = newToken();
  const hashExp = hashToken(rawExp);
  await asUser(db, coach.id, coach.email, async () => {
    await db.query(
      `SELECT * FROM firm_create_invitation($1, 'student', $2, $3, NOW() + interval '1 hour')`,
      [org.id, expiredUser.email, hashExp]
    );
  });
  await db.query(`UPDATE invitations SET expires_at = NOW() - interval '1 minute' WHERE token_hash = $1`, [
    hashExp,
  ]);
  let expiredBlocked = false;
  try {
    await asUser(db, expiredUser.id, expiredUser.email, async () => {
      await db.query(`SELECT firm_accept_invitation($1)`, [hashExp]);
    });
  } catch {
    expiredBlocked = true;
  }
  assert("expired token cannot accept", expiredBlocked);

  // Unknown hash
  let unknownBlocked = false;
  try {
    await asUser(db, student.id, student.email, async () => {
      await db.query(`SELECT firm_accept_invitation($1)`, [hashToken("nope")]);
    });
  } catch {
    unknownBlocked = true;
  }
  assert("unknown token fails cleanly", unknownBlocked);

  // Atomicity: force pseudonym failure mid-accept
  const rawAtomic = newToken();
  const hashAtomic = hashToken(rawAtomic);
  await asUser(db, coach.id, coach.email, async () => {
    await db.query(
      `SELECT * FROM firm_create_invitation($1, 'student', $2, $3, NOW() + interval '2 days')`,
      [org.id, "atomic@firm.test", hashAtomic]
    );
  });
  const atomicUser = (
    await db.query(
      `INSERT INTO auth.users (email) VALUES ('atomic@firm.test') RETURNING id, email`
    )
  ).rows[0];

  await db.exec(`
    CREATE OR REPLACE FUNCTION allocate_pseudonym_label()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      RAISE EXCEPTION 'simulated pseudonym failure' USING ERRCODE = 'check_violation';
    END;
    $$;
  `);

  let atomicFailed = false;
  try {
    await asUser(db, atomicUser.id, atomicUser.email, async () => {
      await db.query(`SELECT firm_accept_invitation($1)`, [hashAtomic]);
    });
  } catch {
    atomicFailed = true;
  }
  assert("accept fails when pseudonym allocation fails", atomicFailed);

  const atomicMem = await db.query(
    `SELECT count(*)::int AS n FROM organization_memberships WHERE user_id = $1`,
    [atomicUser.id]
  );
  const atomicInv = await db.query(
    `SELECT status FROM invitations WHERE token_hash = $1`,
    [hashAtomic]
  );
  assert("atomicity: no membership after failed accept", atomicMem.rows[0].n === 0);
  assert(
    "atomicity: invitation remains pending after failed accept",
    atomicInv.rows[0].status === "pending",
    atomicInv.rows[0].status
  );

  // Restore real pseudonym allocator from foundation migration snippet
  await db.exec(`
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
  `);

  // Full accept path (existing user with trades)
  const acceptResult = await asUser(db, student.id, student.email, async () => {
    const r = await db.query(`SELECT firm_accept_invitation($1) AS result`, [hash]);
    return r.rows[0].result;
  });
  assert("accept returns membership", !!acceptResult.membership_id);
  assert(
    "accept allocates pseudonym",
    typeof acceptResult.pseudonym === "string" &&
      acceptResult.pseudonym.startsWith("Student "),
    acceptResult.pseudonym
  );

  const mem = await db.query(
    `SELECT * FROM organization_memberships WHERE id = $1`,
    [acceptResult.membership_id]
  );
  assert("membership active", mem.rows[0].status === "active");

  const tradeAfter = (
    await db.query(`SELECT id, ticker, ai_review FROM trades WHERE id = $1`, [tradeBefore.id])
  ).rows[0];
  assert(
    "existing trades unchanged after accept",
    tradeAfter.ticker === tradeBefore.ticker &&
      tradeAfter.ai_review === tradeBefore.ai_review &&
      tradeAfter.id === tradeBefore.id
  );

  let reacceptBlocked = false;
  try {
    await asUser(db, student.id, student.email, async () => {
      await db.query(`SELECT firm_accept_invitation($1)`, [hash]);
    });
  } catch {
    reacceptBlocked = true;
  }
  assert("already-accepted cannot re-accept", reacceptBlocked);

  // Single-coach: assignment not required; coach can see post-join trades
  await db.query(
    `INSERT INTO trades (user_id, ticker, entry_time, created_at)
     VALUES ($1, 'NEW', NOW(), NOW())`,
    [student.id]
  );
  const coachSees = await asUser(db, coach.id, coach.email, async () => {
    const r = await db.query(
      `SELECT count(*)::int AS n FROM trades WHERE user_id = $1 AND ticker = 'NEW'`,
      [student.id]
    );
    return r.rows[0].n;
  });
  assert("coach sees student trade after accept (single-coach)", coachSees === 1);

  // Multi-coach assignment on new invite
  await asUser(db, coach2.id, coach2.email, async () => {
    // join coach2 via direct membership (simulating prior accept)
    await db.query(`RESET ROLE`);
  });
  await db.query(
    `INSERT INTO organization_memberships (organization_id, user_id, role, status)
     VALUES ($1, $2, 'coach', 'active')`,
    [org.id, coach2.id]
  );

  const newStudent = (
    await db.query(
      `INSERT INTO auth.users (email) VALUES ('student2@firm.test') RETURNING id, email`
    )
  ).rows[0];
  const raw2 = newToken();
  const hash2 = hashToken(raw2);
  await asUser(db, coach.id, coach.email, async () => {
    await db.query(
      `SELECT * FROM firm_create_invitation($1, 'student', $2, $3, NOW() + interval '2 days')`,
      [org.id, newStudent.email, hash2]
    );
  });
  const accept2 = await asUser(db, newStudent.id, newStudent.email, async () => {
    const r = await db.query(`SELECT firm_accept_invitation($1) AS result`, [hash2]);
    return r.rows[0].result;
  });
  assert(
    "multi-coach accept creates assignment to inviting coach",
    !!accept2.assignment_id,
    String(accept2.assignment_id)
  );

  const assignRow = await db.query(
    `SELECT a.*, c.user_id AS coach_user
     FROM coach_student_assignments a
     JOIN organization_memberships c ON c.id = a.coach_membership_id
     WHERE a.id = $1`,
    [accept2.assignment_id]
  );
  assert(
    "assignment targets inviting coach",
    assignRow.rows[0]?.coach_user === coach.id
  );

  // Revocation removes trade access on next query
  const studentMemId = acceptResult.membership_id;
  await asUser(db, coach.id, coach.email, async () => {
    await db.query(`SELECT firm_revoke_membership($1)`, [studentMemId]);
  });
  const afterRevoke = await asUser(db, coach.id, coach.email, async () => {
    const r = await db.query(
      `SELECT count(*)::int AS n FROM trades WHERE user_id = $1`,
      [student.id]
    );
    return r.rows[0].n;
  });
  assert("revocation removes coach trade access immediately", afterRevoke === 0);

  const status = await db.query(
    `SELECT status, ended_at IS NOT NULL AS ended FROM organization_memberships WHERE id = $1`,
    [studentMemId]
  );
  assert(
    "revoked membership has ended_at",
    status.rows[0].status === "revoked" && status.rows[0].ended === true
  );

  // Student still sees own trades
  const studentOwn = await asUser(db, student.id, student.email, async () => {
    const r = await db.query(
      `SELECT count(*)::int AS n FROM trades WHERE user_id = $1`,
      [student.id]
    );
    return r.rows[0].n;
  });
  assert("student still sees own trades after revoke", studentOwn >= 2);

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
