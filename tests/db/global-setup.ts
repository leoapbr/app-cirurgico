import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

// Cria um banco limpo, aplica a emulação do Supabase e todas as migrations.
export default async function setup() {
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
  const dbName = process.env.TEST_DATABASE_NAME ?? "app_cirurgico_test";

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`drop database if exists ${dbName} with (force)`);
  await admin.query(`create database ${dbName}`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${dbName}`;
  process.env.TEST_DATABASE_URL = url.toString();

  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  const root = path.resolve(__dirname, "../..");
  await client.query(readFileSync(path.join(root, "tests/db/supabase-shim.sql"), "utf8"));
  const migrationsDir = path.join(root, "supabase/migrations");
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    await client.query(readFileSync(path.join(migrationsDir, file), "utf8"));
  }
  await client.end();
}
