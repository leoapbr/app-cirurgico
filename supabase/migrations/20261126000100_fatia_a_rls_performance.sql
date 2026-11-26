-- Ajustes apontados pelo Database Advisor do Supabase após aplicar a fatia A.
-- 1) auth.uid() dentro de (select ...) para ser avaliado uma vez por consulta, não por linha.
-- 2) Índices nas chaves estrangeiras usadas em junções e exclusões em cascata.
-- A lógica das políticas não muda.

drop policy profiles_select_self_or_colleague on public.profiles;
create policy profiles_select_self_or_colleague on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or app_private.shares_org(id));

drop policy profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy memberships_select on public.memberships;
create policy memberships_select on public.memberships
  for select to authenticated
  using (user_id = (select auth.uid()) or app_private.is_member(organization_id));

drop policy delegations_select on public.delegations;
create policy delegations_select on public.delegations
  for select to authenticated
  using (
    app_private.is_member(organization_id)
    and (secretary_user_id = (select auth.uid()) or doctor_user_id = (select auth.uid())
         or app_private.is_org_admin(organization_id))
  );

drop policy delegations_insert on public.delegations;
create policy delegations_insert on public.delegations
  for insert to authenticated
  with check (
    (doctor_user_id = (select auth.uid()) and app_private.has_role(organization_id, 'medico'))
    or app_private.is_org_admin(organization_id)
  );

drop policy delegations_update on public.delegations;
create policy delegations_update on public.delegations
  for update to authenticated
  using (
    (doctor_user_id = (select auth.uid()) and app_private.has_role(organization_id, 'medico'))
    or app_private.is_org_admin(organization_id)
  )
  with check (
    (doctor_user_id = (select auth.uid()) and app_private.has_role(organization_id, 'medico'))
    or app_private.is_org_admin(organization_id)
  );

create index if not exists delegations_secretary_fk_idx on public.delegations (secretary_user_id);
create index if not exists delegations_doctor_fk_idx on public.delegations (doctor_user_id);
create index if not exists profiles_active_org_idx on public.profiles (active_organization_id);
