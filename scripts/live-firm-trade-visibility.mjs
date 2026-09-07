/**
 * Focused live check: post-accept trade visibility + identity leak scan.
 */
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(__dirname, "../.env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const stamp = Date.now();
const password = `Test-${randomBytes(12).toString("base64url")}!aA1`;

const results = [];
const assert = (name, cond, detail = "") => {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
};

function client() {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function ensureUser(email) {
  const sb = client();
  await sb.auth.signUp({ email, password });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { sb, user: data.user };
}

function hashToken(raw) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function identityLeak(payload) {
  return /"(name|email|avatar|avatar_url|username|full_name|screenshot|chart_data)"\s*:/.test(
    JSON.stringify(payload ?? {}).toLowerCase()
  );
}

const coachEmail = `firm.vis.coach.${stamp}@example.com`;
const studentEmail = `firm.vis.student.${stamp}@example.com`;

const coach = await ensureUser(coachEmail);
const student = await ensureUser(studentEmail);

const { data: org, error: orgErr } = await coach.sb.rpc("firm_create_organization", {
  p_name: `Vis Firm ${stamp}`,
});
assert("create org", !orgErr && org?.id, orgErr?.message);

const raw = randomBytes(32).toString("base64url");
const hash = hashToken(raw);
await coach.sb.rpc("firm_create_invitation", {
  p_organization_id: org.id,
  p_role: "student",
  p_email: studentEmail,
  p_token_hash: hash,
  p_expires_at: new Date(Date.now() + 86400000).toISOString(),
});

const { data: accept, error: accErr } = await student.sb.rpc("firm_accept_invitation", {
  p_token_hash: hash,
});
assert("accept", !accErr && accept?.membership_id, accErr?.message);
assert("joined_at present", !!accept?.joined_at, accept?.joined_at);

// Wait briefly then insert trade AFTER join
await new Promise((r) => setTimeout(r, 1500));
const tradeTime = new Date().toISOString();
const { data: trade, error: tradeErr } = await student.sb
  .from("trades")
  .insert({
    user_id: student.user.id,
    ticker: "AFTERJOIN",
    realized_pl: "42",
    discipline_score: 88,
    entry_time: tradeTime,
    created_at: tradeTime,
    setup_type: "breakout",
    violations: "[]",
    ai_review: JSON.stringify({ summary: "after join", trade_grade: "A" }),
  })
  .select("id, ticker, entry_time, created_at")
  .single();
assert("insert post-join trade", !tradeErr && trade?.id, tradeErr?.message);
console.log("joined_at:", accept.joined_at, "trade entry_time:", trade?.entry_time);

const { data: coachSees, error: seeErr } = await coach.sb
  .from("trades")
  .select("id, ticker, realized_pl, ai_review, user_id")
  .eq("user_id", student.user.id);
assert("coach select no error", !seeErr, seeErr?.message);
assert(
  "coach sees AFTERJOIN trade",
  (coachSees ?? []).some((t) => t.ticker === "AFTERJOIN"),
  `n=${coachSees?.length} tickers=${(coachSees ?? []).map((t) => t.ticker).join(",")}`
);
assert("payload no identity/screenshot fields", !identityLeak(coachSees));

// Simulate overview-shaped payload from RPC roster + trades
const { data: roster } = await coach.sb.rpc("firm_coach_authorized_students", {
  p_organization_id: org.id,
});
const overviewShape = {
  organization_id: org.id,
  organization_name: org.name,
  student_count: roster?.length ?? 0,
  metrics: { trade_count: coachSees?.length ?? 0, total_pl: 42 },
  students: (roster ?? []).map((r) => ({
    membership_id: r.membership_id,
    pseudonym: r.pseudonym,
    joined_at: r.joined_at,
  })),
  trades: (coachSees ?? []).map((t) => ({
    id: t.id,
    ticker: t.ticker,
    realized_pl: t.realized_pl,
    ai_review: t.ai_review ? { summary: "x" } : null,
  })),
};
assert("overview-shaped payload clean", !identityLeak(overviewShape));

const failed = results.filter((r) => !r.ok).length;
console.log(`\nPassed: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
