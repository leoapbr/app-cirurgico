-- Diz se o convite foi enviado para o e-mail da sessão atual, sem revelar o e-mail.
-- Usado na tela do convite para orientar quem está logado com outra conta.
create function public.org_invitation_is_for_me(p_token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_invitations i
    join auth.users u on u.id = auth.uid()
    where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
      and i.email = lower(u.email)
  )
$$;

revoke all on function public.org_invitation_is_for_me(text) from public, anon;
grant execute on function public.org_invitation_is_for_me(text) to authenticated;
