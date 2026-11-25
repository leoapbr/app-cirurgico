import { createHash, randomBytes } from "node:crypto";
import { Pool, type PoolClient } from "pg";

function testDatabaseUrl() {
  const url = new URL(process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432/postgres");
  url.pathname = `/${process.env.TEST_DATABASE_NAME ?? "app_cirurgico_test"}`;
  return url.toString();
}

export const pool = new Pool({ connectionString: testDatabaseUrl(), max: 4 });

export type TestUser = { id: string; email: string };
export type Aal = "aal1" | "aal2";

/** Executa um comando como o usuário dado (ou anônimo), numa transação própria, sob RLS. */
export async function as<T = Record<string, unknown>>(
  user: TestUser | null,
  sql: string,
  params: unknown[] = [],
  aal: Aal = "aal1",
): Promise<T[]> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query("begin");
    if (user) {
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: user.id, email: user.email, role: "authenticated", aal }),
      ]);
    } else {
      await client.query("set local role anon");
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    }
    const res = await client.query(sql, params);
    await client.query("commit");
    return res.rows as T[];
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/** Atalho para o admin com MFA verificado. */
export const asAal2 = <T = Record<string, unknown>>(user: TestUser, sql: string, params: unknown[] = []) =>
  as<T>(user, sql, params, "aal2");

/** Consulta como superusuário (ignora RLS) — só para preparar e conferir dados. */
export async function superQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const res = await pool.query(sql, params);
  return res.rows as T[];
}

let seq = 0;
export async function createUser(label: string, opts: { confirmed?: boolean } = {}): Promise<TestUser> {
  seq += 1;
  const email = `${label}.${seq}.${Date.now()}@exemplo.test`;
  const [row] = await superQuery<{ id: string }>(
    "insert into auth.users (email, email_confirmed_at, raw_user_meta_data) values ($1, $2, $3) returning id",
    [email, opts.confirmed === false ? null : new Date(), { full_name: `Pessoa ${label}` }],
  );
  return { id: row.id, email };
}

export async function createOrg(owner: TestUser, name: string, extraRoles: string[] = []): Promise<string> {
  const [row] = await as<{ id: string }>(
    owner,
    "select public.create_organization($1, 'grupo_medico', $2::public.member_role[]) as id",
    [name, `{${extraRoles.join(",")}}`],
  );
  return row.id;
}

export function newToken() {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token, "utf8").digest("hex");
  return { token, hash };
}

export async function invite(admin: TestUser, orgId: string, email: string, roles: string[]): Promise<string> {
  const { token, hash } = newToken();
  await asAal2(
    admin,
    "insert into public.org_invitations (organization_id, email, roles, token_hash) values ($1, $2, $3::public.member_role[], $4)",
    [orgId, email.toLowerCase(), `{${roles.join(",")}}`, hash],
  );
  return token;
}

export async function addMember(admin: TestUser, orgId: string, user: TestUser, roles: string[]) {
  const token = await invite(admin, orgId, user.email, roles);
  await as(user, "select public.accept_org_invitation($1)", [token]);
}

/** Espera que a promessa falhe; devolve a mensagem/código para conferência. */
export async function expectDenied(p: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await p;
  } catch (err) {
    const e = err as { code?: string; message: string };
    return { code: e.code, message: e.message };
  }
  throw new Error("Era esperado que a operação fosse negada, mas ela foi aceita");
}
