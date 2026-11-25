/**
 * Testes de isolamento e permissões da fatia A.
 * Rodam contra Postgres real com as policies RLS aplicadas, assumindo o papel
 * `authenticated`/`anon` do Supabase e o JWT de cada pessoa fictícia.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  as,
  asAal2,
  createOrg,
  createUser,
  expectDenied,
  invite,
  newToken,
  pool,
  superQuery,
  type TestUser,
} from "./helpers";

let adminA: TestUser, medA1: TestUser, medA2: TestUser, secA: TestUser, profA: TestUser;
let adminB: TestUser, medB: TestUser, secB: TestUser;
let outsider: TestUser;
let orgA: string, orgB: string;

beforeAll(async () => {
  [adminA, medA1, medA2, secA, profA, adminB, medB, secB, outsider] = await Promise.all([
    createUser("admin-a"),
    createUser("med-a1"),
    createUser("med-a2"),
    createUser("sec-a"),
    createUser("prof-a"),
    createUser("admin-b"),
    createUser("med-b"),
    createUser("sec-b"),
    createUser("outsider"),
  ]);
  orgA = await createOrg(adminA, "Clínica Alfa (fictícia)");
  orgB = await createOrg(adminB, "Grupo Beta (fictício)");
  await addMember(adminA, orgA, medA1, ["medico"]);
  await addMember(adminA, orgA, medA2, ["medico"]);
  await addMember(adminA, orgA, secA, ["secretaria"]);
  await addMember(adminA, orgA, profA, ["profissional"]);
  await addMember(adminB, orgB, medB, ["medico"]);
  await addMember(adminB, orgB, secB, ["secretaria"]);
});

afterAll(async () => {
  await pool.end();
});

const count = async (user: TestUser | null, sql: string, params: unknown[] = [], aal2 = false) =>
  (aal2 ? await asAal2(user as TestUser, sql, params) : await as(user, sql, params)).length;

describe("isolamento entre organizações", () => {
  it("membro de A não vê a organização B, nem pelo ID", async () => {
    expect(await count(medA1, "select id from organizations where id = $1", [orgB])).toBe(0);
    const orgs = await as<{ id: string }>(medA1, "select id from organizations");
    expect(orgs.map((o) => o.id)).toEqual([orgA]);
  });

  it("membro de A não vê vínculos nem perfis de B", async () => {
    expect(await count(medA1, "select 1 from memberships where organization_id = $1", [orgB])).toBe(0);
    expect(await count(medA1, "select 1 from profiles where id = any($1)", [[adminB.id, medB.id, secB.id]])).toBe(0);
  });

  it("admin de A (com MFA) não lê nem altera nada de B", async () => {
    expect(await count(adminA, "select 1 from organizations where id = $1", [orgB], true)).toBe(0);
    expect(await count(adminA, "update organizations set name = 'invadida' where id = $1 returning id", [orgB], true)).toBe(0);
    expect(
      await count(adminA, "update memberships set status = 'inativo' where organization_id = $1 returning id", [orgB], true),
    ).toBe(0);
    expect(await count(adminA, "select 1 from org_invitations where organization_id = $1", [orgB], true)).toBe(0);
    expect(await count(adminA, "select 1 from audit_logs where organization_id = $1", [orgB], true)).toBe(0);
    expect(await count(adminA, "select 1 from delegations where organization_id = $1", [orgB], true)).toBe(0);
    const [{ name }] = await superQuery<{ name: string }>("select name from organizations where id = $1", [orgB]);
    expect(name).toBe("Grupo Beta (fictício)");
  });

  it("admin de A não cria convite nem delegação em B", async () => {
    const { hash } = newToken();
    await expectDenied(
      asAal2(adminA, "insert into org_invitations (organization_id, email, roles, token_hash) values ($1, 'x@exemplo.test', '{admin}', $2)", [
        orgB,
        hash,
      ]),
    );
    await expectDenied(
      asAal2(adminA, "insert into delegations (organization_id, secretary_user_id, doctor_user_id) values ($1, $2, $3)", [
        orgB,
        secB.id,
        medB.id,
      ]),
    );
  });

  it("admin de A não consulta contagens de B", async () => {
    await expectDenied(asAal2(adminA, "select * from org_admin_counts($1)", [orgB]));
  });

  it("ninguém troca a organização ativa para uma da qual não é membro", async () => {
    await expectDenied(as(medA1, "select set_active_organization($1)", [orgB]));
    await expectDenied(as(outsider, "select set_active_organization($1)", [orgA]));
  });

  it("quem não pertence a nenhuma organização não vê nada", async () => {
    for (const table of ["organizations", "memberships", "org_invitations", "delegations", "audit_logs"]) {
      expect(await count(outsider, `select 1 from ${table}`)).toBe(0);
    }
    expect(await count(outsider, "select 1 from profiles where id <> $1", [outsider.id])).toBe(0);
  });

  it("anônimo não tem acesso a nenhuma tabela", async () => {
    for (const table of ["organizations", "profiles", "memberships", "org_invitations", "delegations", "audit_logs"]) {
      const err = await expectDenied(as(null, `select 1 from ${table}`));
      expect(err.code).toBe("42501");
    }
    await expectDenied(as(null, "select create_organization('x')"));
    await expectDenied(as(null, "select accept_org_invitation('x')"));
  });
});

describe("papéis dentro da organização", () => {
  it("médico não altera organização, vínculos, convites nem lê auditoria", async () => {
    expect(await count(medA1, "update organizations set name = 'x' where id = $1 returning id", [orgA])).toBe(0);
    expect(
      await count(medA1, "update memberships set status = 'inativo' where user_id = $1 returning id", [medA2.id]),
    ).toBe(0);
    expect(await count(medA1, "select 1 from org_invitations")).toBe(0);
    expect(await count(medA1, "select 1 from audit_logs")).toBe(0);
    const { hash } = newToken();
    await expectDenied(
      as(medA1, "insert into org_invitations (organization_id, email, roles, token_hash) values ($1, 'y@exemplo.test', '{medico}', $2)", [
        orgA,
        hash,
      ]),
    );
  });

  it("ninguém se promove a admin", async () => {
    for (const user of [medA1, secA, profA]) {
      expect(
        await count(user, "update memberships set roles = '{admin}' where user_id = $1 returning id", [user.id], true),
      ).toBe(0);
    }
    const [m] = await superQuery<{ roles: string }>(
      "select roles::text from memberships where organization_id = $1 and user_id = $2",
      [orgA, medA1.id],
    );
    expect(m.roles).toBe("{medico}");
  });

  it("admin sem MFA (aal1) não executa ações de admin", async () => {
    expect(await count(adminA, "update organizations set name = 'x' where id = $1 returning id", [orgA])).toBe(0);
    expect(await count(adminA, "select 1 from org_invitations where organization_id = $1", [orgA])).toBe(0);
    expect(await count(adminA, "select 1 from audit_logs where organization_id = $1", [orgA])).toBe(0);
    const { hash } = newToken();
    await expectDenied(
      as(adminA, "insert into org_invitations (organization_id, email, roles, token_hash) values ($1, 'z@exemplo.test', '{medico}', $2)", [
        orgA,
        hash,
      ]),
    );
    await expectDenied(as(adminA, "select * from org_admin_counts($1)", [orgA]));
  });

  it("admin com MFA administra a própria organização", async () => {
    expect(
      await count(adminA, "update organizations set name = 'Clínica Alfa (fictícia)' where id = $1 returning id", [orgA], true),
    ).toBe(1);
    const [c] = await asAal2<{ active_members: string }>(adminA, "select * from org_admin_counts($1)", [orgA]);
    expect(Number(c.active_members)).toBe(5);
  });

  it("a organização nunca fica sem admin ativo", async () => {
    const err = await expectDenied(
      asAal2(adminA, "update memberships set roles = '{medico}' where organization_id = $1 and user_id = $2", [orgA, adminA.id]),
    );
    expect(err.message).toMatch(/administrador/);
    await expectDenied(
      asAal2(adminA, "update memberships set status = 'inativo' where organization_id = $1 and user_id = $2", [orgA, adminA.id]),
    );
  });

  it("perfil: cada um edita só o próprio, e só os campos permitidos", async () => {
    expect(await count(medA1, "update profiles set full_name = 'Hack' where id = $1 returning id", [medA2.id])).toBe(0);
    expect(await count(medA1, "update profiles set full_name = 'Dra. Ana Teste' where id = $1 returning id", [medA1.id])).toBe(1);
    await expectDenied(as(medA1, "update profiles set status = 'inativo' where id = $1", [medA1.id]));
    await expectDenied(as(medA1, "update profiles set active_organization_id = $2 where id = $1", [medA1.id, orgB]));
    await expectDenied(as(medA1, "update profiles set email = 'outro@exemplo.test' where id = $1", [medA1.id]));
  });

  it("colegas da mesma organização se veem na lista de membros", async () => {
    expect(await count(secA, "select 1 from memberships where organization_id = $1", [orgA])).toBe(5);
    expect(await count(secA, "select 1 from profiles where id = any($1)", [[medA1.id, medA2.id, adminA.id]])).toBe(3);
  });

  it("hash do token do convite não é legível nem pelo admin", async () => {
    const err = await expectDenied(asAal2(adminA, "select token_hash from org_invitations"));
    expect(err.code).toBe("42501");
  });

  it("vínculo não muda de organização nem de pessoa", async () => {
    await expectDenied(
      asAal2(adminA, "update memberships set organization_id = $1 where organization_id = $2 and user_id = $3", [
        orgB,
        orgA,
        medA1.id,
      ]),
    );
  });
});

describe("convites para a organização", () => {
  it("prévia mostra só o que estava no e-mail, com e-mail mascarado", async () => {
    const guest = await createUser("guest-preview");
    const token = await invite(adminA, orgA, guest.email, ["medico"]);
    const [p] = await as<{ organization_name: string; email_hint: string; status: string }>(
      null,
      "select * from get_org_invitation($1)",
      [token],
    );
    expect(p.organization_name).toBe("Clínica Alfa (fictícia)");
    expect(p.status).toBe("pendente");
    expect(p.email_hint).not.toBe(guest.email);
    expect(await count(null, "select * from get_org_invitation('token-inexistente')")).toBe(0);
  });

  it("aceitar exige o mesmo e-mail, confirmado", async () => {
    const guest = await createUser("guest-email");
    const other = await createUser("other-email");
    const unconfirmed = await createUser("guest-unconfirmed", { confirmed: false });
    const token = await invite(adminA, orgA, guest.email, ["medico"]);
    await expectDenied(as(other, "select accept_org_invitation($1)", [token]));
    const token2 = await invite(adminA, orgA, unconfirmed.email, ["medico"]);
    await expectDenied(as(unconfirmed, "select accept_org_invitation($1)", [token2]));
    await as(guest, "select accept_org_invitation($1)", [token]);
    await expectDenied(as(guest, "select accept_org_invitation($1)", [token]));
    expect(await count(other, "select 1 from organizations where id = $1", [orgA])).toBe(0);
  });

  it("convite expirado, cancelado ou recusado não dá acesso", async () => {
    const g1 = await createUser("guest-expired");
    const g2 = await createUser("guest-revoked");
    const g3 = await createUser("guest-declined");
    const t1 = await invite(adminA, orgA, g1.email, ["secretaria"]);
    await superQuery(
      "alter table org_invitations disable trigger org_invitations_guard; update org_invitations set expires_at = now() - interval '1 minute' where email = '" +
        g1.email +
        "'; alter table org_invitations enable trigger org_invitations_guard;",
    );
    await expectDenied(as(g1, "select accept_org_invitation($1)", [t1]));

    const t2 = await invite(adminA, orgA, g2.email, ["secretaria"]);
    expect(
      await count(adminA, "update org_invitations set revoked_at = now() where email = $1 returning id", [g2.email], true),
    ).toBe(1);
    await expectDenied(as(g2, "select accept_org_invitation($1)", [t2]));

    const t3 = await invite(adminA, orgA, g3.email, ["secretaria"]);
    const [d] = await as<{ ok: boolean }>(null, "select decline_org_invitation($1) as ok", [t3]);
    expect(d.ok).toBe(true);
    await expectDenied(as(g3, "select accept_org_invitation($1)", [t3]));
    for (const g of [g1, g2, g3]) {
      expect(await count(g, "select 1 from organizations where id = $1", [orgA])).toBe(0);
    }
  });

  it("convite encerrado não pode ser reaberto nem prorrogado", async () => {
    const g = await createUser("guest-closed");
    await invite(adminA, orgA, g.email, ["secretaria"]);
    await asAal2(adminA, "update org_invitations set revoked_at = now() where email = $1", [g.email]);
    await expectDenied(
      asAal2(adminA, "update org_invitations set revoked_at = null, expires_at = now() + interval '7 days' where email = $1", [g.email]),
    );
  });

  it("prorrogação registra quem prorrogou e respeita o limite de 30 dias", async () => {
    const g = await createUser("guest-extend");
    await invite(adminA, orgA, g.email, ["secretaria"]);
    const [row] = await asAal2<{ extended_by: string }>(
      adminA,
      "update org_invitations set expires_at = now() + interval '14 days' where email = $1 returning extended_by",
      [g.email],
    );
    expect(row.extended_by).toBe(adminA.id);
    await expectDenied(
      asAal2(adminA, "update org_invitations set expires_at = now() + interval '90 days' where email = $1", [g.email]),
    );
  });
});

describe("delegações secretária → médico", () => {
  it("médico concede a própria delegação; secretária e outros médicos não conseguem", async () => {
    await as(medA1, "insert into delegations (organization_id, secretary_user_id, doctor_user_id) values ($1, $2, $3)", [
      orgA,
      secA.id,
      medA1.id,
    ]);
    await expectDenied(
      as(secA, "insert into delegations (organization_id, secretary_user_id, doctor_user_id) values ($1, $2, $3)", [
        orgA,
        secA.id,
        medA2.id,
      ]),
    );
    await expectDenied(
      as(medA1, "insert into delegations (organization_id, secretary_user_id, doctor_user_id) values ($1, $2, $3)", [
        orgA,
        secA.id,
        medA2.id,
      ]),
    );
  });

  it("delegação só para secretária ativa da mesma organização", async () => {
    await expectDenied(
      as(medA2, "insert into delegations (organization_id, secretary_user_id, doctor_user_id) values ($1, $2, $3)", [
        orgA,
        profA.id,
        medA2.id,
      ]),
    );
    await expectDenied(
      as(medA2, "insert into delegations (organization_id, secretary_user_id, doctor_user_id) values ($1, $2, $3)", [
        orgA,
        secB.id,
        medA2.id,
      ]),
    );
  });

  it("delegação é visível só para a secretária, o médico e o admin com MFA", async () => {
    const q = "select 1 from delegations where organization_id = $1 and doctor_user_id = $2";
    expect(await count(secA, q, [orgA, medA1.id])).toBe(1);
    expect(await count(medA1, q, [orgA, medA1.id])).toBe(1);
    expect(await count(adminA, q, [orgA, medA1.id], true)).toBe(1);
    expect(await count(adminA, q, [orgA, medA1.id])).toBe(0);
    expect(await count(medA2, q, [orgA, medA1.id])).toBe(0);
    expect(await count(profA, q, [orgA, medA1.id])).toBe(0);
    expect(await count(secB, q, [orgA, medA1.id])).toBe(0);
  });

  it("admin com MFA concede delegação em nome do médico; sem MFA, não", async () => {
    await expectDenied(
      as(adminA, "insert into delegations (organization_id, secretary_user_id, doctor_user_id) values ($1, $2, $3)", [
        orgA,
        secA.id,
        medA2.id,
      ]),
    );
    const [d] = await asAal2<{ granted_by: string }>(
      adminA,
      "insert into delegations (organization_id, secretary_user_id, doctor_user_id) values ($1, $2, $3) returning granted_by",
      [orgA, secA.id, medA2.id],
    );
    expect(d.granted_by).toBe(adminA.id);
  });

  it("revogação corta a delegação na hora e é definitiva", async () => {
    const check = "select app_private.has_delegation($1, $2) as ok";
    const [before] = await as<{ ok: boolean }>(secA, check, [orgA, medA2.id]);
    expect(before.ok).toBe(true);
    expect(
      await count(medA2, "update delegations set revoked_at = now() where doctor_user_id = $1 and revoked_at is null returning id", [medA2.id]),
    ).toBe(1);
    const [after] = await as<{ ok: boolean }>(secA, check, [orgA, medA2.id]);
    expect(after.ok).toBe(false);
    await expectDenied(asAal2(adminA, "update delegations set revoked_at = null where doctor_user_id = $1", [medA2.id]));
  });

  it("secretária desativada perde acesso à organização e à delegação", async () => {
    const sec = await createUser("sec-temp");
    await addMember(adminA, orgA, sec, ["secretaria"]);
    await as(medA1, "insert into delegations (organization_id, secretary_user_id, doctor_user_id) values ($1, $2, $3)", [
      orgA,
      sec.id,
      medA1.id,
    ]);
    await asAal2(adminA, "update memberships set status = 'inativo' where organization_id = $1 and user_id = $2", [orgA, sec.id]);
    expect(await count(sec, "select 1 from organizations")).toBe(0);
    expect(await count(sec, "select 1 from delegations")).toBe(0);
    const [r] = await as<{ ok: boolean }>(sec, "select app_private.has_delegation($1, $2) as ok", [orgA, medA1.id]);
    expect(r.ok).toBe(false);
  });
});

describe("auditoria", () => {
  it("concessões ficam registradas com o autor, sem o hash do token", async () => {
    const logs = await asAal2<{ resource_type: string; actor_id: string; new_data: Record<string, unknown> }>(
      adminA,
      "select resource_type, actor_id, new_data from audit_logs where organization_id = $1 order by id",
      [orgA],
    );
    expect(logs.some((l) => l.resource_type === "delegations" && l.actor_id === medA1.id)).toBe(true);
    expect(logs.some((l) => l.resource_type === "memberships")).toBe(true);
    const invites = logs.filter((l) => l.resource_type === "org_invitations");
    expect(invites.length).toBeGreaterThan(0);
    for (const l of invites) expect(l.new_data).not.toHaveProperty("token_hash");
  });

  it("ninguém altera ou apaga auditoria, nem o superusuário", async () => {
    await expectDenied(asAal2(adminA, "update audit_logs set action = 'x'"));
    await expectDenied(asAal2(adminA, "delete from audit_logs"));
    await expectDenied(asAal2(adminA, "insert into audit_logs (action, resource_type) values ('fake', 'x')"));
    await expectDenied(superQuery("update audit_logs set action = 'x' where id = (select min(id) from audit_logs)"));
    await expectDenied(superQuery("delete from audit_logs"));
  });
});
