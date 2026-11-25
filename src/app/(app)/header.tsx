import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import type { AppContext } from "@/lib/auth/dal";
import { rolesLabel } from "@/lib/auth/roles";
import { switchOrganization } from "./org-actions";

export function AppHeader({ ctx }: { ctx: AppContext }) {
  const isAdmin = ctx.roles.includes("admin");
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/" className="font-semibold text-primary">
          App Cirúrgico
        </Link>
        <nav className="flex flex-wrap gap-4 text-sm">
          <Link href="/" className="hover:underline">Início</Link>
          <Link href="/organizacoes" className="hover:underline">Organizações</Link>
          {isAdmin && <Link href="/configuracoes" className="hover:underline">Configurações</Link>}
          <Link href="/conta" className="hover:underline">Minha conta</Link>
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
          {ctx.memberships.length > 1 ? (
            <ActionForm action={switchOrganization} submitLabel="Trocar" size="sm" variant="outline" inline>
              <label htmlFor="org-switch" className="sr-only">Organização ativa</label>
              <Select id="org-switch" name="organization_id" defaultValue={ctx.activeOrg?.organization_id} className="h-8 w-48">
                {ctx.memberships.map((m) => (
                  <option key={m.organization_id} value={m.organization_id}>
                    {m.organization.name}
                  </option>
                ))}
              </Select>
            </ActionForm>
          ) : (
            ctx.activeOrg && <span className="font-medium">{ctx.activeOrg.organization.name}</span>
          )}
          {ctx.roles.length > 0 && <Badge variant="secondary">{rolesLabel(ctx.roles)}</Badge>}
          <form action="/auth/sair" method="post">
            <button type="submit" className="text-muted-foreground hover:underline">Sair</button>
          </form>
        </div>
      </div>
    </header>
  );
}
