/**
 * Confirm firm objects exist on remote after SQL apply.
 * Does not print secrets.
 */
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
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

async function tableStatus(name) {
  const res = await fetch(`${url}/rest/v1/${name}?select=*&limit=0`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  return { name, status: res.status, ok: res.status === 200, hint: text.slice(0, 120) };
}

async function rpcExists(name, body) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  // 404 PGRST202 = missing; other errors mean the function exists
  const missing = res.status === 404 && text.includes("PGRST202");
  return { name, status: res.status, exists: !missing, hint: text.slice(0, 140) };
}

console.log("host:", new URL(url).host);

const tables = [
  "organizations",
  "organization_memberships",
  "coach_student_assignments",
  "invitations",
  "pseudonym_labels",
  "audit_log",
  "trades",
];

let allTablesOk = true;
for (const t of tables) {
  const r = await tableStatus(t);
  console.log(`table ${r.name}: ${r.ok ? "OK" : "FAIL"} (${r.status})`);
  if (!r.ok && t !== "trades") allTablesOk = false;
}

const rpcs = [
  ["firm_create_organization", { p_name: "probe" }],
  ["firm_preview_invitation", { p_token_hash: "x" }],
  ["firm_coach_authorized_students", { p_organization_id: "00000000-0000-0000-0000-000000000000" }],
  ["firm_accept_invitation", { p_token_hash: "x" }],
  ["firm_revoke_membership", { p_membership_id: "00000000-0000-0000-0000-000000000000" }],
];

let allRpcsOk = true;
for (const [name, body] of rpcs) {
  const r = await rpcExists(name, body);
  console.log(`rpc ${r.name}: ${r.exists ? "OK" : "MISSING"} (${r.status}) ${r.hint.replace(/\s+/g, " ")}`);
  if (!r.exists) allRpcsOk = false;
}

console.log(allTablesOk && allRpcsOk ? "\nREMOTE_OBJECTS: PASS" : "\nREMOTE_OBJECTS: FAIL");
process.exit(allTablesOk && allRpcsOk ? 0 : 1);
