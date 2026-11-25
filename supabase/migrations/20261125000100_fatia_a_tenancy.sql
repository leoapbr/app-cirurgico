-- =============================================================================
-- Fatia A — Auth e tenancy
-- organizations, profiles, memberships, org_invitations, delegations, audit_logs
--
-- Princípios (PRD §2.1, §8 e matriz de permissões v0.5):
--   * Toda tabela sensível tem RLS ligado. Nada é liberado por conhecer o ID.
--   * Operações de admin exigem sessão com MFA (aal2) já no banco, não só na UI.
--   * audit_logs é só inserção, gravado por triggers; ninguém altera ou apaga.
--   * Funções auxiliares ficam no schema app_private, que a API não expõe.
-- =============================================================================

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.org_type as enum ('clinica', 'grupo_medico', 'administrativa');
create type public.org_status as enum ('ativa', 'inativa');
create type public.member_role as enum ('admin', 'medico', 'secretaria', 'profissional');
create type public.member_status as enum ('ativo', 'inativo');
create type public.profile_status as enum ('ativo', 'inativo');
create type public.delegation_scope as enum ('ver', 'operar');

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 120),
  type        public.org_type not null default 'grupo_medico',
  settings    jsonb not null default '{"required_team_roles": ["cirurgiao_principal", "anestesista"]}'::jsonb
              check (jsonb_typeof(settings) = 'object'),
  status      public.org_status not null default 'ativa',
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  full_name               text check (full_name is null or char_length(btrim(full_name)) between 2 and 120),
  email                   text not null check (email = lower(email)),
  phone                   text check (phone is null or phone ~ '^\+?[0-9 ()-]{8,20}$'),
  status                  public.profile_status not null default 'ativo',
  active_organization_id  uuid references public.organizations (id) on delete set null,
  preferences             jsonb not null default '{}'::jsonb check (jsonb_typeof(preferences) = 'object'),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Uma linha por pessoa e organização. Uma pessoa pode acumular papéis
-- (ex.: médica que também é admin), por isso roles é um conjunto.
create table public.memberships (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  roles            public.member_role[] not null
                   check (cardinality(roles) between 1 and 4 and array_position(roles, null) is null),
  status           public.member_status not null default 'ativo',
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id) where status = 'ativo';

create table public.org_invitations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  email            text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  roles            public.member_role[] not null
                   check (cardinality(roles) between 1 and 4 and array_position(roles, null) is null),
  -- Só o hash SHA-256 (hex) do token fica no banco; o token vai no link do e-mail.
  token_hash       text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at       timestamptz not null default (now() + interval '7 days'),
  extended_at      timestamptz,
  extended_by      uuid references auth.users (id) on delete set null,
  accepted_at      timestamptz,
  accepted_by      uuid references auth.users (id) on delete set null,
  declined_at      timestamptz,
  revoked_at       timestamptz,
  revoked_by       uuid references auth.users (id) on delete set null,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index org_invitations_org_idx on public.org_invitations (organization_id);
create unique index org_invitations_one_open_per_email
  on public.org_invitations (organization_id, email)
  where accepted_at is null and declined_at is null and revoked_at is null;

-- Secretária opera pelos médicos que a delegaram, dentro de uma organização.
create table public.delegations (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  secretary_user_id  uuid not null references public.profiles (id) on delete cascade,
  doctor_user_id     uuid not null references public.profiles (id) on delete cascade,
  scope              public.delegation_scope not null default 'operar',
  granted_by         uuid references auth.users (id) on delete set null,
  starts_at          timestamptz not null default now(),
  ends_at            timestamptz,
  revoked_at         timestamptz,
  revoked_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (secretary_user_id <> doctor_user_id),
  check (ends_at is null or ends_at > starts_at)
);
create index delegations_secretary_idx on public.delegations (organization_id, secretary_user_id) where revoked_at is null;
create index delegations_doctor_idx on public.delegations (organization_id, doctor_user_id) where revoked_at is null;
create unique index delegations_one_active
  on public.delegations (organization_id, secretary_user_id, doctor_user_id)
  where revoked_at is null;

create table public.audit_logs (
  id               bigint generated always as identity primary key,
  organization_id  uuid,          -- sem FK: o registro sobrevive à organização
  actor_id         uuid,
  action           text not null,
  resource_type    text not null,
  resource_id      uuid,
  old_data         jsonb,
  new_data         jsonb,
  ip               text,
  created_at       timestamptz not null default now()
);
create index audit_logs_org_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_resource_idx on public.audit_logs (resource_type, resource_id);

-- -----------------------------------------------------------------------------
-- Funções auxiliares (SECURITY DEFINER, search_path vazio)
-- -----------------------------------------------------------------------------
create function app_private.current_aal() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1')
$$;

create function app_private.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = p_org
      and m.user_id = auth.uid()
      and m.status = 'ativo'
      and p.status = 'ativo'
      and o.status = 'ativa'
  )
$$;

create function app_private.has_role(p_org uuid, p_role public.member_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.is_member(p_org) and exists (
    select 1 from public.memberships m
    where m.organization_id = p_org and m.user_id = auth.uid() and p_role = any (m.roles)
  )
$$;

-- Admin só age com MFA verificado na sessão (matriz S8).
create function app_private.is_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.has_role(p_org, 'admin') and app_private.current_aal() = 'aal2'
$$;

-- Duas pessoas ativas na mesma organização (para a lista de membros).
create function app_private.shares_org(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid() and mine.status = 'ativo'
      and theirs.user_id = p_user
      and app_private.is_member(mine.organization_id)
  )
$$;

-- Delegação vigente secretária → médico (usada a partir da fatia C).
create function app_private.has_delegation(p_org uuid, p_doctor uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.has_role(p_org, 'secretaria') and exists (
    select 1
    from public.delegations d
    join public.memberships md on md.organization_id = d.organization_id and md.user_id = d.doctor_user_id
    where d.organization_id = p_org
      and d.secretary_user_id = auth.uid()
      and d.doctor_user_id = p_doctor
      and d.revoked_at is null
      and d.starts_at <= now()
      and (d.ends_at is null or d.ends_at > now())
      and md.status = 'ativo'
      and 'medico' = any (md.roles)
  )
$$;

revoke all on all functions in schema app_private from public;
grant execute on function
  app_private.current_aal(),
  app_private.is_member(uuid),
  app_private.has_role(uuid, public.member_role),
  app_private.is_org_admin(uuid),
  app_private.shares_org(uuid),
  app_private.has_delegation(uuid, uuid)
to authenticated;

-- -----------------------------------------------------------------------------
-- Triggers de apoio
-- -----------------------------------------------------------------------------
create function app_private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger organizations_updated_at before update on public.organizations
  for each row execute function app_private.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function app_private.set_updated_at();
create trigger memberships_updated_at before update on public.memberships
  for each row execute function app_private.set_updated_at();
create trigger org_invitations_updated_at before update on public.org_invitations
  for each row execute function app_private.set_updated_at();
create trigger delegations_updated_at before update on public.delegations
  for each row execute function app_private.set_updated_at();

-- Perfil criado junto com a conta do Supabase Auth.
create function app_private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app_private.handle_new_user();

create function app_private.sync_user_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = lower(coalesce(new.email, '')) where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function app_private.sync_user_email();

-- Toda organização ativa precisa de ao menos um admin ativo.
create function app_private.guard_last_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := coalesce(new.organization_id, old.organization_id);
begin
  if exists (select 1 from public.organizations where id = v_org and status = 'ativa')
     and not exists (
       select 1 from public.memberships
       where organization_id = v_org and status = 'ativo' and 'admin' = any (roles)
     ) then
    raise exception 'A organização precisa manter ao menos um administrador ativo'
      using errcode = 'P0001';
  end if;
  return null;
end $$;

create constraint trigger memberships_keep_admin
  after update or delete on public.memberships
  deferrable initially immediate
  for each row execute function app_private.guard_last_admin();

-- Membership: organização e pessoa nunca mudam depois de criadas.
create function app_private.guard_membership_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.organization_id <> old.organization_id or new.user_id <> old.user_id then
    raise exception 'Não é permitido mover um vínculo para outra organização ou pessoa';
  end if;
  return new;
end $$;

create trigger memberships_guard before update on public.memberships
  for each row execute function app_private.guard_membership_update();

-- Delegação: secretária e médico precisam estar ativos na mesma organização,
-- com os papéis certos. Depois de revogada, a delegação não muda mais.
create function app_private.guard_delegation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if old.revoked_at is not null then
      raise exception 'Delegação já revogada';
    end if;
    if new.organization_id <> old.organization_id
       or new.secretary_user_id <> old.secretary_user_id
       or new.doctor_user_id <> old.doctor_user_id
       or new.granted_by is distinct from old.granted_by
       or new.starts_at <> old.starts_at then
      raise exception 'Só é possível alterar escopo, fim ou revogação da delegação';
    end if;
    if new.revoked_at is not null then
      new.revoked_by := auth.uid();
    end if;
    return new;
  end if;

  -- INSERT
  new.granted_by := coalesce(auth.uid(), new.granted_by);
  new.revoked_at := null;
  new.revoked_by := null;
  if not exists (
    select 1 from public.memberships
    where organization_id = new.organization_id and user_id = new.secretary_user_id
      and status = 'ativo' and 'secretaria' = any (roles)
  ) then
    raise exception 'A pessoa delegada precisa ser secretária ativa nesta organização';
  end if;
  if not exists (
    select 1 from public.memberships
    where organization_id = new.organization_id and user_id = new.doctor_user_id
      and status = 'ativo' and 'medico' = any (roles)
  ) then
    raise exception 'O delegante precisa ser médico ativo nesta organização';
  end if;
  return new;
end $$;

create trigger delegations_guard before insert or update on public.delegations
  for each row execute function app_private.guard_delegation();

-- Convite: depois de aceito, recusado ou revogado, não muda mais.
create function app_private.guard_invitation_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.accepted_at is not null or old.declined_at is not null or old.revoked_at is not null then
    raise exception 'Convite já encerrado';
  end if;
  if new.organization_id <> old.organization_id or new.email <> old.email
     or new.token_hash <> old.token_hash or new.roles <> old.roles
     or new.created_by is distinct from old.created_by then
    raise exception 'Só é possível prorrogar ou revogar o convite';
  end if;
  if new.expires_at <> old.expires_at then
    new.extended_at := now();
    new.extended_by := auth.uid();
  end if;
  if new.revoked_at is not null then
    new.revoked_by := auth.uid();
  end if;
  return new;
end $$;

create trigger org_invitations_guard before update on public.org_invitations
  for each row execute function app_private.guard_invitation_update();

create function app_private.stamp_invitation_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_by := auth.uid();
  new.accepted_at := null; new.accepted_by := null;
  new.declined_at := null; new.revoked_at := null; new.revoked_by := null;
  new.extended_at := null; new.extended_by := null;
  return new;
end $$;

create trigger org_invitations_stamp before insert on public.org_invitations
  for each row execute function app_private.stamp_invitation_insert();

-- -----------------------------------------------------------------------------
-- Auditoria (só inserção)
-- -----------------------------------------------------------------------------
create function app_private.request_ip() returns text
language plpgsql stable set search_path = '' as $$
declare
  v_headers jsonb;
begin
  v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  return split_part(coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip', ''), ',', 1);
exception when others then
  return null;
end $$;

create function app_private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'token_hash' end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'token_hash' end;
  v_row jsonb := coalesce(v_new, v_old);
  v_org uuid;
begin
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
    return null;  -- nada mudou de fato
  end if;
  v_org := case tg_table_name
             when 'organizations' then (v_row ->> 'id')::uuid
             when 'profiles' then null
             else (v_row ->> 'organization_id')::uuid
           end;
  insert into public.audit_logs (organization_id, actor_id, action, resource_type, resource_id, old_data, new_data, ip)
  values (v_org, auth.uid(), lower(tg_op), tg_table_name, (v_row ->> 'id')::uuid, v_old, v_new, app_private.request_ip());
  return null;
end $$;

create trigger organizations_audit after insert or update or delete on public.organizations
  for each row execute function app_private.audit_row();
create trigger profiles_audit after update or delete on public.profiles
  for each row execute function app_private.audit_row();
create trigger memberships_audit after insert or update or delete on public.memberships
  for each row execute function app_private.audit_row();
create trigger org_invitations_audit after insert or update or delete on public.org_invitations
  for each row execute function app_private.audit_row();
create trigger delegations_audit after insert or update or delete on public.delegations
  for each row execute function app_private.audit_row();

create function app_private.audit_is_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_logs é somente inserção';
end $$;

create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function app_private.audit_is_append_only();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function app_private.audit_is_append_only();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.organizations   enable row level security;
alter table public.profiles        enable row level security;
alter table public.memberships     enable row level security;
alter table public.org_invitations enable row level security;
alter table public.delegations     enable row level security;
alter table public.audit_logs      enable row level security;

-- Privilégios explícitos: anon não lê nenhuma tabela; authenticated só o que
-- cada política libera. Colunas sensíveis ficam fora dos GRANTs de UPDATE.
revoke all on public.organizations, public.profiles, public.memberships,
              public.org_invitations, public.delegations, public.audit_logs
  from anon, authenticated;

grant select on public.organizations to authenticated;
grant update (name, type, settings) on public.organizations to authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, phone, preferences) on public.profiles to authenticated;

grant select on public.memberships to authenticated;
grant update (roles, status) on public.memberships to authenticated;

grant select (id, organization_id, email, roles, expires_at, extended_at, extended_by,
              accepted_at, accepted_by, declined_at, revoked_at, revoked_by,
              created_by, created_at, updated_at)
  on public.org_invitations to authenticated;
grant insert (organization_id, email, roles, token_hash, expires_at) on public.org_invitations to authenticated;
grant update (expires_at, revoked_at) on public.org_invitations to authenticated;

grant select on public.delegations to authenticated;
grant insert (organization_id, secretary_user_id, doctor_user_id, scope, starts_at, ends_at)
  on public.delegations to authenticated;
grant update (scope, ends_at, revoked_at) on public.delegations to authenticated;

grant select on public.audit_logs to authenticated;

-- organizations
create policy organizations_select_member on public.organizations
  for select to authenticated using (app_private.is_member(id));
create policy organizations_update_admin on public.organizations
  for update to authenticated
  using (app_private.is_org_admin(id)) with check (app_private.is_org_admin(id));

-- profiles
create policy profiles_select_self_or_colleague on public.profiles
  for select to authenticated
  using (id = auth.uid() or app_private.shares_org(id));
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- memberships
create policy memberships_select on public.memberships
  for select to authenticated
  using (user_id = auth.uid() or app_private.is_member(organization_id));
create policy memberships_update_admin on public.memberships
  for update to authenticated
  using (app_private.is_org_admin(organization_id))
  with check (app_private.is_org_admin(organization_id));

-- org_invitations (só admin com MFA; aceite e recusa passam por funções)
create policy org_invitations_select_admin on public.org_invitations
  for select to authenticated using (app_private.is_org_admin(organization_id));
create policy org_invitations_insert_admin on public.org_invitations
  for insert to authenticated
  with check (app_private.is_org_admin(organization_id)
              and expires_at > now() and expires_at <= now() + interval '30 days');
create policy org_invitations_update_admin on public.org_invitations
  for update to authenticated
  using (app_private.is_org_admin(organization_id))
  with check (app_private.is_org_admin(organization_id)
              and expires_at <= now() + interval '30 days');

-- delegations (médico concede as próprias; admin com MFA concede qualquer uma)
create policy delegations_select on public.delegations
  for select to authenticated
  using (
    app_private.is_member(organization_id)
    and (secretary_user_id = auth.uid() or doctor_user_id = auth.uid()
         or app_private.is_org_admin(organization_id))
  );
create policy delegations_insert on public.delegations
  for insert to authenticated
  with check (
    (doctor_user_id = auth.uid() and app_private.has_role(organization_id, 'medico'))
    or app_private.is_org_admin(organization_id)
  );
create policy delegations_update on public.delegations
  for update to authenticated
  using (
    (doctor_user_id = auth.uid() and app_private.has_role(organization_id, 'medico'))
    or app_private.is_org_admin(organization_id)
  )
  with check (
    (doctor_user_id = auth.uid() and app_private.has_role(organization_id, 'medico'))
    or app_private.is_org_admin(organization_id)
  );

-- audit_logs (admin com MFA lê o histórico de usuários e permissões da própria org)
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using (
    organization_id is not null
    and app_private.is_org_admin(organization_id)
    and resource_type in ('organizations', 'memberships', 'org_invitations', 'delegations')
  );

-- -----------------------------------------------------------------------------
-- Funções expostas (RPC)
-- -----------------------------------------------------------------------------

-- Cria organização; quem cria vira admin (e pode acumular outros papéis).
create function public.create_organization(
  p_name text,
  p_type public.org_type default 'grupo_medico',
  p_extra_roles public.member_role[] default '{}'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_roles public.member_role[];
begin
  if v_uid is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and status = 'ativo') then
    raise exception 'Perfil inativo' using errcode = '42501';
  end if;
  if (select count(*) from public.memberships where created_by = v_uid and 'admin' = any (roles)
        and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Limite diário de criação de organizações atingido' using errcode = '54000';
  end if;

  select array_agg(distinct r) into v_roles
  from unnest(array['admin'::public.member_role] || coalesce(p_extra_roles, '{}')) r;

  insert into public.organizations (name, type, created_by)
  values (btrim(p_name), p_type, v_uid)
  returning id into v_org;

  insert into public.memberships (organization_id, user_id, roles, created_by)
  values (v_org, v_uid, v_roles, v_uid);

  update public.profiles set active_organization_id = v_org where id = v_uid;
  return v_org;
end $$;

-- Troca a organização ativa (validada contra memberships, nunca confiada do navegador).
create function public.set_active_organization(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app_private.is_member(p_org) then
    raise exception 'Organização não encontrada' using errcode = 'P0002';
  end if;
  update public.profiles set active_organization_id = p_org where id = auth.uid();
end $$;

-- Prévia do convite para a tela /convite/[token]; só o que já estava no e-mail.
create function public.get_org_invitation(p_token text)
returns table (organization_name text, roles public.member_role[], email_hint text,
               expires_at timestamptz, status text)
language sql stable security definer set search_path = '' as $$
  select o.name,
         i.roles,
         left(i.email, 2) || '***@' || split_part(i.email, '@', 2),
         i.expires_at,
         case
           when i.accepted_at is not null then 'aceito'
           when i.declined_at is not null then 'recusado'
           when i.revoked_at is not null then 'cancelado'
           when i.expires_at <= now() then 'expirado'
           else 'pendente'
         end
  from public.org_invitations i
  join public.organizations o on o.id = i.organization_id
  where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
$$;

-- Aceite: exige conta com o mesmo e-mail do convite, já confirmado.
create function public.accept_org_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.org_invitations;
  v_email text;
  v_confirmed timestamptz;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta para aceitar o convite' using errcode = '42501';
  end if;

  select * into v_inv from public.org_invitations
  where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  for update;

  if not found or v_inv.accepted_at is not null or v_inv.declined_at is not null
     or v_inv.revoked_at is not null or v_inv.expires_at <= now() then
    raise exception 'Convite inválido ou expirado' using errcode = 'P0002';
  end if;

  select lower(email), email_confirmed_at into v_email, v_confirmed from auth.users where id = v_uid;
  if v_email is distinct from v_inv.email or v_confirmed is null then
    raise exception 'Este convite foi enviado para outro e-mail' using errcode = '42501';
  end if;

  insert into public.memberships (organization_id, user_id, roles, created_by)
  values (v_inv.organization_id, v_uid, v_inv.roles, v_inv.created_by)
  on conflict (organization_id, user_id) do update
    set roles = (select array_agg(distinct r) from unnest(public.memberships.roles || excluded.roles) r),
        status = 'ativo';

  update public.org_invitations
     set accepted_at = now(), accepted_by = v_uid
   where id = v_inv.id;

  update public.profiles set active_organization_id = v_inv.organization_id where id = v_uid;
  return v_inv.organization_id;
end $$;

-- Recusa pelo link, sem precisar de conta (matriz S15).
create function public.decline_org_invitation(p_token text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  select id into v_id from public.org_invitations
  where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    and accepted_at is null and declined_at is null and revoked_at is null and expires_at > now()
  for update;
  if v_id is null then
    return false;
  end if;
  update public.org_invitations set declined_at = now() where id = v_id;
  return true;
end $$;

-- Contagens para o dashboard do admin (sem dado pessoal).
create function public.org_admin_counts(p_org uuid)
returns table (active_members bigint, pending_invitations bigint, active_delegations bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.is_org_admin(p_org) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return query
  select
    (select count(*) from public.memberships where organization_id = p_org and status = 'ativo'),
    (select count(*) from public.org_invitations where organization_id = p_org
       and accepted_at is null and declined_at is null and revoked_at is null and expires_at > now()),
    (select count(*) from public.delegations where organization_id = p_org and revoked_at is null
       and (ends_at is null or ends_at > now()));
end $$;

revoke all on function public.create_organization(text, public.org_type, public.member_role[]) from public, anon;
revoke all on function public.set_active_organization(uuid) from public, anon;
revoke all on function public.get_org_invitation(text) from public;
revoke all on function public.accept_org_invitation(text) from public, anon;
revoke all on function public.decline_org_invitation(text) from public;
revoke all on function public.org_admin_counts(uuid) from public, anon;

grant execute on function public.create_organization(text, public.org_type, public.member_role[]) to authenticated;
grant execute on function public.set_active_organization(uuid) to authenticated;
grant execute on function public.get_org_invitation(text) to anon, authenticated;
grant execute on function public.accept_org_invitation(text) to authenticated;
grant execute on function public.decline_org_invitation(text) to anon, authenticated;
grant execute on function public.org_admin_counts(uuid) to authenticated;
