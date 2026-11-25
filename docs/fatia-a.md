# Fatia A — Auth e tenancy (relatório do item 13.1 do PRD)

Escopo entregue: login, criação de conta, recuperação de senha, organizações, vínculos (memberships)
com papéis, convites para a organização, delegações secretária → médico, auditoria imutável,
RBAC + RLS em todas as tabelas, MFA obrigatório para administradores e dashboard vazio.

Base aprovada: "MVP 1 — Modelo de dados e mapa de telas" e "Matriz de permissões por papel – MVP 1" (v0.5).

## Decisões tomadas nesta fatia

| Decisão | Por quê |
|---|---|
| Uma linha de `memberships` por pessoa e organização, com `roles` como conjunto (ex.: `{admin, medico}`) | A matriz diz que uma pessoa pode acumular papéis; o modelo pedia "único por par". O conjunto atende os dois. |
| MFA do admin é exigido **no banco** (`aal2` no JWT), não só na tela | Mesmo um admin com senha vazada não consegue alterar usuários, convites nem ler auditoria sem o segundo fator. |
| Quem é admin em qualquer organização precisa passar pelo MFA para usar o app | Regra simples e previsível; evita sessão de admin "meio protegida". |
| Convites guardam só o SHA-256 do token; nem o admin consegue ler o hash | Vazamento do banco não gera links de convite válidos. |
| Aceite e recusa de convite por funções `SECURITY DEFINER` com checagem do e-mail confirmado | Convite encaminhado a outra pessoa não dá acesso (matriz: "mesmo e-mail"). Recusa funciona sem conta (S15). |
| Nenhuma chave `service_role` no app | Todo acesso passa pelo RLS com a chave pública. Menos chance de vazamento e de bypass acidental. |
| Membership não é apagada, só desativada; organização sempre mantém um admin ativo | Preserva histórico e evita organização órfã. |
| `audit_logs` gravado por triggers, sem UPDATE/DELETE nem para o superusuário | PRD §8.5 e matriz: trilha só inserção. |
| E-mail em modo sandbox por padrão (o link do convite aparece na tela para o admin copiar) | PRD §12: nada de envio real no protótipo. |
| `cacheComponents` do Next 16 desligado | Telas dependem da sessão; preferimos renderização dinâmica explícita a cache por usuário nesta fase. |

## Arquivos

- `supabase/migrations/20261125000100_fatia_a_tenancy.sql` — tabelas, funções auxiliares (`app_private`), triggers, RLS, GRANTs por coluna e RPCs.
- `src/proxy.ts`, `src/lib/supabase/*` — sessão do Supabase Auth via cookies e bloqueio de rotas privadas.
- `src/lib/auth/dal.ts` — camada de acesso: usuário verificado, organização ativa validada, exigência de MFA e de admin.
- `src/app/(auth)/*` — entrar, criar conta, recuperar senha; `src/app/redefinir-senha`, `src/app/auth/confirm`, `src/app/auth/sair`.
- `src/app/mfa/*` — cadastro e verificação do autenticador (TOTP).
- `src/app/convite/[token]/*` — prévia, aceite e recusa de convite.
- `src/app/(app)/*` — dashboard vazio (`/`), `/organizacoes`, `/conta` (perfil, senha, delegações do médico), `/configuracoes` (admin).
- `tests/db/*` — testes de RLS contra Postgres real; `tests/unit/*` — regras de redirecionamento, MFA e tokens.
- `scripts/check-secrets.mjs` — falha se houver segredo no bundle do navegador ou em arquivo versionado.
- `.github/workflows/ci.yml` — lint, tipos, testes (com Postgres), build e checagem de segredos em cada PR.

## Tabelas e RPCs

`organizations`, `profiles`, `memberships`, `org_invitations`, `delegations`, `audit_logs`.
RPCs: `create_organization`, `set_active_organization`, `get_org_invitation`, `accept_org_invitation`,
`decline_org_invitation`, `org_admin_counts`. Funções de política: `app_private.is_member`, `has_role`,
`is_org_admin` (admin + aal2), `shares_org`, `has_delegation` (já pronta para as fatias C e D).

## Variáveis de ambiente (só nomes)

| Nome | Onde | Obrigatória |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel (todas) | Sim |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel (todas) | Sim |
| `NEXT_PUBLIC_SITE_URL` | Vercel (por ambiente) | Sim em produção/preview |
| `MAIL_MODE` | Vercel, servidor | Não (padrão `sandbox`) |
| `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_ALLOWED_DOMAINS` | Vercel, servidor | Só com `MAIL_MODE=live` |
| `TEST_DATABASE_ADMIN_URL` | Local/CI | Só para testes |

## Testes executados

- `npm run test:db`: **30 testes de RLS** passando contra Postgres 16 com as policies aplicadas. Cobrem:
  usuário da org A não lê, altera nem cria nada da org B (organização, membros, perfis, convites,
  delegações, auditoria, contagens); anônimo sem acesso a nenhuma tabela; quem não tem organização não vê nada;
  médico/secretária não alteram organização, membros nem convites e não se promovem a admin;
  admin sem MFA não executa ações de admin; organização nunca fica sem admin; perfil só editável pelo dono
  e só em campos permitidos; hash do convite ilegível; convite exige mesmo e-mail confirmado, e expirado,
  cancelado ou recusado não dá acesso; delegação só do próprio médico (ou admin com MFA), só para secretária
  ativa da mesma organização, visível só às partes e revogação definitiva e imediata; secretária desativada
  perde acesso; auditoria imutável e sem hash de token.
- Conferência dos testes: afrouxei de propósito três regras (RLS de organizations, exigência de aal2 e checagem
  de e-mail do convite) e os testes correspondentes falharam; restaurado depois.
- `npm run test:unit`: 13 testes (open redirect em `?next=`, rotas públicas, regra de MFA, mensagens de erro, hash do token).
  Um deles pegou um bug real (`/entrarx` era tratada como pública) que foi corrigido.
- `npm run lint`, `npm run typecheck`, `npm run build`: sem erros. `npm run check:secrets`: OK.
- Smoke test com `next start`: rotas privadas redirecionam para `/entrar?next=…`, telas públicas respondem 200,
  cabeçalhos de segurança presentes.

**Não testado ainda:** o fluxo completo contra um Supabase real (envio do e-mail de confirmação,
cadastro do TOTP, troca para aal2). Os testes de banco emulam o `auth` do Supabase (`tests/db/supabase-shim.sql`).
Fazer o checklist manual abaixo no primeiro deploy.

## Riscos conhecidos

1. **Testes de RLS usam emulação do `auth.uid()/auth.jwt()`**, não o Supabase real. Mitigação: rodar também com
   `supabase start` + `supabase db reset` quando o projeto existir; o comportamento das funções é o mesmo.
2. **Revogar sessões de um usuário** (matriz, fatia A) não foi implementado: exige a chave `service_role`.
   Hoje, desativar o membro já corta o acesso aos dados na hora pelo RLS; a sessão segue válida até expirar
   (padrão 1 h), sem ver nada da organização. Proposta: Edge Function com service role na fatia B.
3. **Aviso ao médico quando o admin registra delegação** é por e-mail em modo sandbox (só log). A notificação
   dentro do app chega com a tabela `notifications` (fatia E).
4. **Limite de tentativas** de login e de recuperação de senha depende dos limites padrão do Supabase Auth.
5. Lista de membros mostra telefone e e-mail dos colegas da mesma organização (necessário para operar);
   pessoas de outras organizações nunca aparecem.
6. Telefone e nome são livres; usar só dados fictícios (faixa de demonstração em todas as telas).

## Deploy

1. Criar projeto no Supabase (região São Paulo, `sa-east-1`, recomendado pela LGPD).
2. Aplicar a migração: `supabase link --project-ref <ref>` e `supabase db push`.
3. Em Authentication: ativar confirmação de e-mail, senha mínima 10, **MFA TOTP habilitado**;
   Site URL = URL da Vercel; Redirect URLs = `https://<dominio>/auth/confirm`.
4. Em Authentication > Email Templates, trocar o link de "Confirm signup" e "Reset password" por
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}`
   (para recuperação, `type=recovery`). Isso funciona mesmo se a pessoa abrir o e-mail em outro navegador.
5. Na Vercel: importar o repositório, definir as variáveis acima (sem service role) e fazer deploy.

## Checklist manual (primeiro deploy)

- [ ] Criar conta com e-mail fictício de teste, confirmar pelo link, entrar.
- [ ] Criar organização marcando "Médico(a)": o app pede o cadastro do autenticador; ler o QR, digitar o código.
- [ ] Sair e entrar de novo: o app pede o código do autenticador antes de liberar.
- [ ] Em Configurações, convidar um segundo e-mail como Secretária; abrir o link em janela anônima; recusar sem conta.
- [ ] Convidar de novo; criar a conta com o mesmo e-mail e aceitar; tentar aceitar com outro e-mail (deve negar).
- [ ] Como médico, em Minha conta, conceder delegação à secretária; conferir no dashboard dela; revogar.
- [ ] Desativar a secretária em Configurações e confirmar que ela deixa de ver a organização.
- [ ] Tentar abrir `/configuracoes` como médico sem papel de admin (deve voltar ao início).
- [ ] Criar uma segunda organização com outra conta e confirmar que nenhuma lista mostra dados da primeira.
- [ ] Conferir o Histórico em Configurações (cada ação acima aparece, sem dados de paciente).
- [ ] Recuperar senha por e-mail e entrar com a nova senha.
