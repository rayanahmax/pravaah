// Provision and seed the SIH demo so a judge can try the app without registering.
//
//   node supabase/seed-demo.js      (run from the frontend/ directory)
//
// It creates two throwaway accounts, gives the operator the DEPARTMENT_OPERATOR
// profile role, and builds one dedicated destination plus a spread of permits in
// every state a screen can show (pending, approved-and-scannable, checked-in,
// completed, rejected, cancelled). Reads all credentials from ../.env.local.
//
// Idempotent: re-running resets the demo tourist's permits and refreshes the
// destination, then rebuilds the same states. It only ever touches these two
// demo accounts and the "PRAVAAH Demo Ridge" destination — never a real user.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, "..", ".env.local");

function loadEnv(file) {
  const text = readFileSync(file, "utf8");
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
  );
}

const env = loadEnv(envFile);
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const T_EMAIL = env.DEMO_TOURIST_EMAIL;
const T_PASS = env.DEMO_TOURIST_PASSWORD;
const O_EMAIL = env.DEMO_OPERATOR_EMAIL;
const O_PASS = env.DEMO_OPERATOR_PASSWORD;

for (const [name, value] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  DEMO_TOURIST_EMAIL: T_EMAIL,
  DEMO_TOURIST_PASSWORD: T_PASS,
  DEMO_OPERATOR_EMAIL: O_EMAIL,
  DEMO_OPERATOR_PASSWORD: O_PASS,
})) {
  if (!value) throw new Error(`Missing ${name} in .env.local`);
}

const DEST_NAME = "PRAVAAH Demo Ridge";
const clientOpts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(SUPABASE_URL, SERVICE_KEY, clientOpts);

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const D_TODAY = iso(new Date());
const D_PLUS3 = addDays(3);
const D_PLUS7 = addDays(7);

async function findUserIdByEmail(email) {
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const match = (data?.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if ((data?.users ?? []).length < 1000) break;
  }
  return null;
}

async function ensureUser(email, password, fullName) {
  const existing = await findUserIdByEmail(email);
  if (existing) return existing;
  const { data: created, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return created.user.id;
}

async function signIn(email, password) {
  const client = createClient(SUPABASE_URL, ANON, clientOpts);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return client;
}

// Unwrap the { ok, permit } / { ok:false, code, message } shape these RPCs return.
function result(res) {
  if (res.error) return { bad: `rpc ${res.error.code} ${res.error.message}` };
  const r = res.data ?? {};
  if (r.ok === false) return { bad: `${r.code} ${r.message}` };
  return { permit: r.permit };
}

async function main() {
  console.log("1. demo accounts + roles");
  const touristId = await ensureUser(T_EMAIL, T_PASS, "Demo Visitor");
  const operatorId = await ensureUser(O_EMAIL, O_PASS, "Field Officer");
  await service.from("profiles").update({ role: "TOURIST", full_name: "Demo Visitor", phone: "+91 90000 00001" }).eq("id", touristId);
  await service.from("profiles").update({ role: "DEPARTMENT_OPERATOR", full_name: "Field Officer", phone: "+91 90000 00002" }).eq("id", operatorId);
  console.log(`   tourist  ${touristId}`);
  console.log(`   operator ${operatorId}  (promoted to DEPARTMENT_OPERATOR)`);

  console.log("2. reset the demo tourist's previous permits");
  const { error: delErr } = await service.from("permits").delete().eq("user_id", touristId);
  if (delErr) console.log("   delete warn:", delErr.message);

  console.log("3. destination + capacity + quotas");
  const operator = await signIn(O_EMAIL, O_PASS);
  const existing = await operator.from("destinations").select("id").eq("name", DEST_NAME).maybeSingle();
  let destId = existing.data?.id;
  if (!destId) {
    const ins = await operator.from("destinations").insert({
      name: DEST_NAME,
      description:
        "A demonstration valley route. Capacity, daily quota, approvals and the checkpoint all behave exactly as they do for a real destination.",
      type: "Valley trek",
      latitude: 32.4,
      longitude: 77.1,
      difficulty: "MODERATE",
      elevation: 3200,
      estimated_duration_minutes: 300,
      access_status: "OPEN",
    }).select("id").single();
    if (ins.error) throw new Error(`insert destination: ${ins.error.message}`);
    destId = ins.data.id;
  } else {
    await operator.from("destinations").update({ access_status: "OPEN" }).eq("id", destId);
  }
  const cap = await operator.from("capacity_configurations").select("id").eq("destination_id", destId).maybeSingle();
  if (!cap.data) {
    await operator.from("capacity_configurations").insert({ destination_id: destId, maximum_capacity: 220 });
  }
  await operator.from("daily_quotas").upsert(
    [D_TODAY, D_PLUS3, D_PLUS7].map((quota_date) => ({ destination_id: destId, quota_date, quota: 220, visitors_admitted: 0 })),
    { onConflict: "destination_id,quota_date" }
  );
  console.log(`   ${DEST_NAME}  id ${destId}  capacity 220  quota ${D_TODAY}/${D_PLUS3}/${D_PLUS7}`);

  const tourist = await signIn(T_EMAIL, T_PASS);
  const CONTACT = { full_name: "A. Sharma", nationality: "IN", gender: "F", date_of_birth: "1999-04-02", id_type: "AADHAAR", id_number: "XXXX-XXXX-1234" };
  const EMERGENCY = { name: "R. Sharma", relation: "Sibling", phone: "+91 98000 00000" };
  const DETAILS = {
    applicant: { full_name: "A. Sharma", nationality: "IN", gender: "F", date_of_birth: "1999-04-02", id_type: "AADHAAR", id_number: "XXXX-XXXX-1234" },
    group: { members: [{ name: "B. Verma", relation: "Friend", age: 27 }] },
    vehicle: { type: "None" },
    equipment: { camera: true },
    consent: { terms: true },
  };

  async function request(label, visitDate, group) {
    const res = await tourist.rpc("request_permit", {
      p_destination_id: destId,
      p_visit_date: visitDate,
      p_group_size: group,
      p_contact_information: CONTACT,
      p_emergency_contact: EMERGENCY,
      p_permit_details: DETAILS,
    });
    const r = result(res);
    if (r.bad) {
      console.log(`   x ${label}: ${r.bad}`);
      return null;
    }
    console.log(`   + ${label}  -> ${r.permit.status}  (${visitDate}, g=${group})`);
    return r.permit.id;
  }
  async function decide(id, decision) {
    const r = result(await operator.rpc("review_permit", { p_permit_id: id, p_decision: decision }));
    if (r.bad) console.log(`   x ${decision}: ${r.bad}`);
    return !r.bad;
  }
  async function tokenOf(id) {
    const s = await service.from("permits").select("qr_token_hash").eq("id", id).maybeSingle();
    return s.data?.qr_token_hash ?? null;
  }
  async function scan(label, id, fn) {
    const token = await tokenOf(id);
    if (!token) return console.log(`   x ${label}: no QR token on the permit`);
    const r = result(await operator.rpc(fn, { p_qr_token: token }));
    console.log(r.bad ? `   x ${label}: ${r.bad}` : `   . ${label} ok`);
  }
  async function cancel(id) {
    const r = result(await tourist.rpc("cancel_permit", { p_permit_id: id }));
    console.log(r.bad ? `   x CANCELLED: ${r.bad}` : "   . cancel ok");
  }

  console.log("4. build the permit states");
  await request("PENDING (today)", D_TODAY, 2);
  await request("PENDING (+3)", D_PLUS3, 5);

  const approved = await request("APPROVED (today, scannable)", D_TODAY, 4);
  if (approved) await decide(approved, "APPROVED");

  const onSite = await request("CHECKED_IN (today)", D_TODAY, 12);
  if (onSite && (await decide(onSite, "APPROVED"))) await scan("CHECKED_IN", onSite, "check_in_permit");

  const done = await request("COMPLETED (today)", D_TODAY, 6);
  if (done && (await decide(done, "APPROVED"))) {
    await scan("check-in", done, "check_in_permit");
    await scan("COMPLETED", done, "process_check_out");
  }

  const rejected = await request("REJECTED (today)", D_TODAY, 3);
  if (rejected) await decide(rejected, "REJECTED");

  const cancelled = await request("CANCELLED (+7)", D_PLUS7, 2);
  if (cancelled) await cancel(cancelled);

  console.log("5. final status tally for the demo tourist");
  const { data: rows } = await service.from("permits").select("status").eq("user_id", touristId);
  const tally = {};
  for (const row of rows ?? []) tally[row.status] = (tally[row.status] || 0) + 1;
  console.log("   ", tally);
  console.log("done. The demo accounts and PRAVAAH Demo Ridge are ready.");
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
