import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { requireContext } from "@/lib/auth/dal";
import { rolesLabel } from "@/lib/auth/roles";
import { createOrganization, switchOrganization } from "../org-actions";

export const metadata: Metadata = { title: "Organizações" };

export default async function OrganizacoesPage() {
  const ctx = await requireContext("/organizacoes");
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Suas organizações</CardTitle>
          <CardDescription>Os dados de cada organização ficam separados. Escolha em qual quer trabalhar.</CardDescription>
        </CardHeader>
        <CardContent>
          {ctx.memberships.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Você ainda não participa de nenhuma organização. Crie uma ao lado ou aceite um convite recebido por e-mail.
            </p>
          ) : (
            <ul className="divide-y">
              {ctx.memberships.map((m) => (
                <li key={m.organization_id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium">{m.organization.name}</p>
                    <p className="text-xs text-muted-foreground">{rolesLabel(m.roles)}</p>
                  </div>
                  {m.organization_id === ctx.activeOrg?.organization_id ? (
                    <Badge>Ativa</Badge>
                  ) : (
                    <ActionForm action={switchOrganization} submitLabel="Usar esta" size="sm" variant="outline" inline>
                      <input type="hidden" name="organization_id" value={m.organization_id} />
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Criar organização</CardTitle>
          <CardDescription>
            Quem cria vira administrador e precisará ativar a verificação em duas etapas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={createOrganization} submitLabel="Criar organização" pendingLabel="Criando…">
            <Field label="Nome" htmlFor="name" hint="Ex.: Grupo de Ginecologia Exemplo (fictício)">
              <Input id="name" name="name" required minLength={2} maxLength={120} />
            </Field>
            <Field label="Tipo" htmlFor="type">
              <Select id="type" name="type" defaultValue="grupo_medico">
                <option value="grupo_medico">Grupo médico</option>
                <option value="clinica">Clínica</option>
                <option value="administrativa">Administrativa</option>
              </Select>
            </Field>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Além de administrador, eu também sou</legend>
              {[
                ["medico", "Médico(a)"],
                ["secretaria", "Secretária(o)"],
                ["profissional", "Outro profissional da equipe"],
              ].map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="extra_roles" value={value} /> {label}
                </label>
              ))}
            </fieldset>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
