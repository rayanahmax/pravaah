// Apply Supabase SQL migrations from the command line.
//
// Credentials come from frontend/.env.local (git-ignored) — never hardcode them
// in this file. The database password is not a Supabase API key: set
// SUPABASE_DB_PASSWORD to the value from Dashboard -> Project Settings -> Database.
//
//   node supabase/run-migration.js 003_foo.sql     # apply named file(s) from migrations/
//
// There is no bulk mode: 001 is not idempotent, and migrations already applied
// through the dashboard are not recorded anywhere this script could read.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "migrations");
const envFile = join(here, "..", ".env.local");

function loadEnv(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(
      `Missing ${file}. Copy .env.local.example to .env.local and fill it in.`
    );
  }
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
      .map((line) => [
        line.slice(0, line.indexOf("=")).trim(),
        line.slice(line.indexOf("=") + 1).trim(),
      ])
  );
}

const env = loadEnv(envFile);
const projectUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const dbPassword = env.SUPABASE_DB_PASSWORD;

if (!projectUrl || !dbPassword) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_DB_PASSWORD must both be set in .env.local"
  );
}

// The project ref is the first hostname label: https://abc123.supabase.co -> abc123.
const projectRef = new URL(projectUrl).hostname.split(".")[0];

const selected = process.argv.slice(2);

if (process.argv.length < 3) {
  // No bulk mode, deliberately. 001 creates tables without IF NOT EXISTS, so a
  // blanket "apply everything" run fails partway through the first file on any
  // database that is already set up, and the later files were applied through the
  // dashboard rather than recorded anywhere this script could consult.
  console.error(
    "Name the migration to apply, e.g.:\n" +
      `  node supabase/run-migration.js ${
        readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()[0] ?? "NNN_name.sql"
      }\n\nAvailable in ${migrationsDir}:\n` +
      readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort()
        .map((f) => `  ${f}`)
        .join("\n")
  );
  process.exit(1);
}

/**
 * Supabase exposes three paths. The poolers require the project ref inside the
 * username, and their hostname encodes the AWS **region**: asking the wrong
 * region is answered "tenant/user ... not found", which looks like a credential
 * problem but is not one. The region is therefore discovered rather than
 * assumed, with an optional SUPABASE_POOLER_REGION to skip the search.
 * Direct :5432 only works when the project has no IP restriction, so it is tried
 * first but treated as optional.
 */
const POOLER_REGIONS = [
  "ap-south-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ap-northeast-2",
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-north-1",
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "ca-central-1",
  "sa-east-1",
];

const configuredRegion = env.SUPABASE_POOLER_REGION;
const regions = configuredRegion
  ? [configuredRegion, ...POOLER_REGIONS.filter((region) => region !== configuredRegion)]
  : POOLER_REGIONS;

const connectionAttempts = [
  {
    label: "direct",
    host: `${projectRef}.supabase.co`,
    user: "postgres",
    port: 5432,
    ssl: { rejectUnauthorized: false },
  },
  ...regions.map((region) => ({
    label: `session pooler (${region})`,
    host: `aws-0-${region}.pooler.supabase.com`,
    user: `postgres.${projectRef}`,
    port: 5432,
    ssl: { rejectUnauthorized: false, servername: `${projectRef}.supabase.co` },
  })),
];

let client = null;
const failures = [];

for (const attempt of connectionAttempts) {
  const candidate = new Client({
    host: attempt.host,
    database: "postgres",
    user: attempt.user,
    password: dbPassword,
    port: attempt.port,
    ssl: attempt.ssl,
  });
  try {
    await candidate.connect();
    console.log(`Connected via ${attempt.label}.`);
    client = candidate;
    break;
  } catch (error) {
    failures.push(`${attempt.label}: ${error.message || error.code}`);
    try {
      await candidate.end();
    } catch {
      // the socket is already gone
    }
  }
}

if (!client) {
  console.error(
    "Could not connect. If direct access is blocked by the project's IP " +
      "restriction and the poolers reject the tenant, then the password is wrong " +
      "or the pooler is disabled in Dashboard -> Project Settings -> Database.\n" +
      failures.map((entry) => `  - ${entry}`).join("\n")
  );
  process.exit(1);
}

try {
  for (const file of selected) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    console.log(`Applying ${file}...`);
    await client.query(sql);
    console.log("  ok");
  }
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
