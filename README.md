# App Cirúrgico

Protótipo SaaS para planejamento e coordenação de equipes cirúrgicas (PRD v1.0). **Somente dados fictícios.**

Stack: Next.js 16 (App Router) + TypeScript, Tailwind CSS + componentes no padrão shadcn/ui, Supabase
(Postgres, Auth, RLS), Vercel, Resend (e-mail, em sandbox no protótipo).

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha URL e chave pública do Supabase
npm run dev
```

Banco: `supabase start` e `supabase db reset` aplicam `supabase/migrations`.

## Testes

```bash
npm run test:unit
npm run test:db        # precisa de Postgres 15+ em TEST_DATABASE_ADMIN_URL
npm run build && npm run check:secrets
```

## Andamento por fatia (PRD item 13.1)

- [x] A — Auth e tenancy: ver [docs/fatia-a.md](docs/fatia-a.md)
- [ ] B — Profissionais
- [ ] C — Pacientes
- [ ] D — Cirurgias
- [ ] E — Equipe e agenda
- [ ] F — Convênios
