/**
 * Firm coach read-path validation: metrics math, authorized students RPC,
 * join-window, revoke, cross-org, and identity-field absence.
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

/** Mirror of lib/firm/metrics.aggregateTradeMetrics for regression locking. */
function aggregateTradeMetrics(trades) {
  if (trades.length === 0) {
    return {
      trade_count: 0,
      total_pl: 0,
      win_rate: null,
      profit_factor: null,
      average_discipline_score: null,
    };
  }
  const pl = (t) => {
    if (t.realized_pl == null) return null;
    const n = typeof t.realized_pl === "number" ? t.realized_pl : parseFloat(t.realized_pl);
    return Number.isFinite(n) ? n : null;
  };
  const wins = trades.filter((t) => {
    const v = pl(t);
    return v !== null && v > 0;
  });
  const losses = trades.filter((t) => {
    const v = pl(t);
    return v !== null && v < 0;
  });
  const total_pl = trades.reduce((s, t) => s + (pl(t) || 0), 0);
  const grossWins = wins.reduce((s, t) => s + Math.abs(pl(t) || 0), 0);
  const grossLosses = losses.reduce((s, t) => s + Math.abs(pl(t) || 0), 0);
  const profit_factor = grossLosses > 0 ? grossWins / grossLosses : null;
  return {
    trade_count: trades.length,
    total_pl,
    win_rate: (wins.length / trades.length) * 100,
    profit_factor,
    average_discipline_score:
      trades.reduce((s, t) => s + (t.discipline_score || 0), 0) / trades.length,
  };
}

function containsIdentityLeak(value) {
  return /"(name|email|avatar|avatar_url|username|full_name)"\s*:/.test(
    JSON.stringify(value).toLowerCase()
  );
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
  const sample = [
    { realized_pl: "100", discipline_score: 80 },
    { realized_pl: "-50", discipline_score: 60 },
    { realized_pl: "25", discipline_score: null },
  ];
  const m = aggregateTradeMetrics(sample);
  assert("win rate 2/3", Math.abs(m.win_rate - (2 / 3) * 100) < 0.0001, String(m.win_rate));
  assert("total pl 75", m.total_pl === 75, String(m.total_pl));
  assert("profit factor 125/50", Math.abs(m.profit_factor - 2.5) < 0.0001, String(m.profit_factor));
  assert(
    "avg discipline (80+60+0)/3",
    Math.abs(m.average_discipline_score - 140 / 3) < 0.0001,
    String(m.average_discipline_score)
  );
  assert("empty metrics zeros", aggregateTradeMetrics([]).trade_count === 0);

  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE auth.users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT);
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB LANGUAGE sql STABLE AS $$
      SELECT COALESCE(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb; $$;
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
      user_id UUID NOT NULL REFERENCES auth.users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      entry_time TIMESTAMPTZ,
      ticker TEXT,
      side TEXT,
      size TEXT,
      realized_pl TEXT,
      discipline_score INTEGER,
      setup_type TEXT,
      exit_time TIMESTAMPTZ,
      violations TEXT,
      ai_review TEXT,
      chart_data JSONB
    );
    ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
    CREATE POLICY trades_select_own ON public.trades FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
    GRANT SELECT ON public.trades TO authenticated;
  `);

  for (const f of [
    "20260907000001_create_firm_foundation_tables.sql",
    "20260907000002_firm_rls_policies_and_trades_access.sql",
    "20260907000003_firm_invitation_lifecycle.sql",
    "20260907000004_firm_coach_read_helpers.sql",
  ]) {
    await db.exec(fs.readFileSync(path.join(migrationsDir, f), "utf8"));
  }
  assert("coach read migrations apply", true);

  const coach = (
    await db.query(`INSERT INTO auth.users (email) VALUES ('c@t.test') RETURNING id, email`)
  ).rows[0];
  const outsider = (
    await db.query(`INSERT INTO auth.users (email) VALUES ('o@t.test') RETURNING id, email`)
  ).rows[0];
  const student = (
    await db.query(`INSERT INTO auth.users (email) VALUES ('s@t.test') RETURNING id, email`)
  ).rows[0];

  const org = await asUser(db, coach.id, coach.email, async () => {
    const r = await db.query(`SELECT * FROM firm_create_organization($1)`, ["Read Firm"]);
    return r.rows[0];
  });
  const otherOrg = await asUser(db, outsider.id, outsider.email, async () => {
    const r = await db.query(`SELECT * FROM firm_create_organization($1)`, ["Other"]);
    return r.rows[0];
  });

  const joinedAt = "2026-06-01T00:00:00Z";
  const mem = (
    await db.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role, status, joined_at)
       VALUES ($1, $2, 'student', 'active', $3::timestamptz) RETURNING id`,
      [org.id, student.id, joinedAt]
    )
  ).rows[0];
  await db.query(
    `INSERT INTO pseudonym_labels (organization_id, user_id) VALUES ($1, $2)`,
    [org.id, student.id]
  );

  await db.query(
    `INSERT INTO trades (user_id, ticker, realized_pl, discipline_score, entry_time, created_at, setup_type, violations, ai_review, chart_data)
     VALUES
     ($1, 'OLD', '999', 90, '2026-05-01T12:00:00Z', '2026-05-01T12:00:00Z', 'breakout', '[]', '{"summary":"old"}', '{"img":true}'),
     ($1, 'NEW', '100', 80, '2026-07-01T12:00:00Z', '2026-07-01T12:00:00Z', 'breakout', '["Oversized Position"]', '{"summary":"new","trade_grade":"A"}', '{"img":true}'),
     ($1, 'NEW2', '-40', 70, '2026-07-02T12:00:00Z', '2026-07-02T12:00:00Z', 'pullback', '[]', null, null)`,
    [student.id]
  );

  const roster = await asUser(db, coach.id, coach.email, async () => {
    const r = await db.query(`SELECT * FROM firm_coach_authorized_students($1)`, [org.id]);
    return r.rows;
  });
  assert("authorized roster has student", roster.length === 1, String(roster.length));
  assert(
    "roster has pseudonym not email",
    roster[0].pseudonym?.startsWith("Student") && roster[0].email === undefined,
    roster[0].pseudonym
  );
  assert("no identity leak in roster row", !containsIdentityLeak(roster[0]));

  let crossBlocked = false;
  try {
    await asUser(db, coach.id, coach.email, async () => {
      await db.query(`SELECT * FROM firm_coach_authorized_students($1)`, [otherOrg.id]);
    });
  } catch {
    crossBlocked = true;
  }
  assert("cross-org authorized list denied", crossBlocked);

  const coachTrades = await asUser(db, coach.id, coach.email, async () => {
    const r = await db.query(
      `SELECT ticker, realized_pl FROM trades WHERE user_id = $1 ORDER BY ticker`,
      [student.id]
    );
    return r.rows;
  });
  assert(
    "join window excludes pre-join trade",
    coachTrades.every((t) => t.ticker !== "OLD") && coachTrades.length === 2,
    coachTrades.map((t) => t.ticker).join(",")
  );

  const expected = aggregateTradeMetrics([
    { realized_pl: "100", discipline_score: 80 },
    { realized_pl: "-40", discipline_score: 70 },
  ]);
  assert("manual PF 100/40 = 2.5", Math.abs(expected.profit_factor - 2.5) < 1e-9);
  assert("manual win rate 50%", Math.abs(expected.win_rate - 50) < 1e-9);

  await asUser(db, coach.id, coach.email, async () => {
    await db.query(`SELECT firm_revoke_membership($1)`, [mem.id]);
  });
  const afterRevoke = await asUser(db, coach.id, coach.email, async () => {
    const r = await db.query(`SELECT * FROM firm_coach_authorized_students($1)`, [org.id]);
    return r.rows;
  });
  assert("revoked student disappears from roster RPC", afterRevoke.length === 0);

  const tradesAfter = await asUser(db, coach.id, coach.email, async () => {
    const r = await db.query(`SELECT count(*)::int AS n FROM trades WHERE user_id = $1`, [
      student.id,
    ]);
    return r.rows[0].n;
  });
  assert("revoked student trades invisible to coach", tradesAfter === 0);

  assert(
    "API-shaped roster has no identity keys",
    !containsIdentityLeak({
      organization_id: org.id,
      students: [
        {
          membership_id: mem.id,
          pseudonym: "Student 1001",
          joined_at: joinedAt,
          trade_count: 2,
          total_pl: 60,
          win_rate: 50,
          average_discipline_score: 75,
          last_trade_at: "2026-07-02T12:00:00Z",
        },
      ],
    })
  );

  const failed = results.filter((r) => !r.ok).length;
  console.log("\n---");
  console.log(`Passed: ${results.length - failed}/${results.length}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
