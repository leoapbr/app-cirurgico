import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { requireAdmin } from "@/lib/auth/dal";
import { ROLE_LABEL, ROLES, rolesLabel } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import {
  adminGrantDelegation,
  extendInvitation,
  revokeInvitation,
  updateMember,
  updateOrganization,
} from "./actions";
import { revokeDelegation } from "../conta/actions";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Configurações" };

type Member = {
  id: string;
  user_id: string;
  roles: string[];
  status: string;
  profile: { full_name: string | null; email: string } | null;
};
type Invitation = {
  id: string;
  email: string;
  roles: string[];
  expires_at: string;
  accepted_at: string | null;
  declined_at: string | null;
  revoked_at: string | null;
  created_at: string;
};
type Delegation = {
  id: string;
  created_at: string;
  secretary: { full_name: string | null; email: string } | null;
  doctor: { full_name: string | null; email: string } | null;
};
type Audit = { id: number; action: string; resource_type: string; actor_id: string | null; created_at: string };

const ACTION_LABEL: Record<string, string> = { insert: "criou", update: "alterou", delete: "removeu" };
const RESOURCE_LABEL: Record<string, string> = {
  organizations: "organização",
  memberships: "vínculo de membro",
  org_invitations: "convite",
  delegations: "delegação",
};

function inviteStatus(i: Invitation) {
  if (i.accepted_at) return <Badge>Aceito</Badge>;
  if (i.declined_at) return <Badge variant="destructive">Recusado</Badge>;
  if (i.revoked_at) return <Badge variant="outline">Cancelado</Badge>;
  if (new Date(i.expires_at) <= new Date()) return <Badge variant="warning">Expirado</Badge>;
  return <Badge variant="secondary">Pendente</Badge>;
}

export default async function ConfiguracoesPage() {
  const ctx = await requireAdmin("/configuracoes");
  const orgId = ctx.activeOrg.organization_id;
  const supabase = await createClient();

  const [members, invitations, delegations, audit] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, user_id, roles, status, profile:profiles!memberships_user_id_fkey(full_name, email)")
      .eq("organization_id", orgId)
      .order("created_at"),
    supabase
      .from("org_invitations")
      // token_hash fica de fora: nem o admin tem permissão de lê-lo.
      .select("id, email, roles, expires_at, accepted_at, declined_at, revoked_at, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("delegations")
      .select(
        "id, created_at, secretary:profiles!delegations_secretary_user_id_fkey(full_name, email), doctor:profiles!delegations_doctor_user_id_fkey(full_name, email)",
      )
      .eq("organization_id", orgId)
      .is("revoked_at", null)
      .order("created_at"),
    supabase
      .from("audit_logs")
      .select("id, action, resource_type, actor_id, created_at")
      .eq("organization_id", orgId)
      .order("id", { ascending: false })
      .limit(30),
  ]);

  const memberRows = (members.data as unknown as Member[] | null) ?? [];
  const nameById = new Map(memberRows.map((m) => [m.user_id, m.profile?.full_name ?? m.profile?.email ?? "—"]));
  const active = memberRows.filter((m) => m.status === "ativo");
  const doctors = active.filter((m) => m.roles.includes("medico"));
  const secretaries = active.filter((m) => m.roles.includes("secretaria"));

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Administração de {ctx.activeOrg.organization.name}. Como administrador você vê usuários, permissões e contagens,
          nunca dados de pacientes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Organização</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={updateOrganization} submitLabel="Salvar" className="sm:grid-cols-[1fr_200px_auto] sm:items-end">
            <Field label="Nome" htmlFor="org-name">
              <Input id="org-name" name="name" defaultValue={ctx.activeOrg.organization.name} required />
            </Field>
            <Field label="Tipo" htmlFor="org-type">
              <Select id="org-type" name="type" defaultValue={ctx.activeOrg.organization.type}>
                <option value="grupo_medico">Grupo médico</option>
                <option value="clinica">Clínica</option>
                <option value="administrativa">Administrativa</option>
              </Select>
            </Field>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Membros e papéis</CardTitle>
          <CardDescription>Desativar um membro corta o acesso dele na hora. A organização precisa manter um administrador ativo.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {memberRows.map((m) => (
              <li key={m.id} className="py-4">
                <ActionForm action={updateMember} submitLabel="Salvar" size="sm" variant="outline" className="gap-3">
                  <input type="hidden" name="membership_id" value={m.id} />
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="font-medium">{m.profile?.full_name ?? "Sem nome"}</p>
                      <p className="text-xs text-muted-foreground">{m.profile?.email}</p>
                    </div>
                    <Select name="status" defaultValue={m.status} className="h-8 w-32" aria-label="Situação">
                      <option value="ativo">Ativo</option>
                      <option value="inativo">Inativo</option>
                    </Select>
                  </div>
                  <fieldset className="flex flex-wrap gap-4">
                    <legend className="sr-only">Papéis</legend>
                    {ROLES.map((r) => (
                      <label key={r} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="roles" value={r} defaultChecked={m.roles.includes(r)} /> {ROLE_LABEL[r]}
                      </label>
                    ))}
                  </fieldset>
                </ActionForm>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Convidar para a organização</CardTitle>
            <CardDescription>O convite vale 7 dias e só pode ser aceito com o mesmo e-mail.</CardDescription>
          </CardHeader>
          <CardContent>
            <InviteForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Convites</CardTitle>
          </CardHeader>
          <CardContent>
            {(invitations.data as unknown as Invitation[] | null)?.length ? (
              <ul className="divide-y">
                {(invitations.data as unknown as Invitation[]).map((i) => {
                  const open = !i.accepted_at && !i.declined_at && !i.revoked_at;
                  return (
                    <li key={i.id} className="grid gap-2 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{i.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {rolesLabel(i.roles)} · vence {formatDateTime(i.expires_at)}
                          </p>
                        </div>
                        {inviteStatus(i)}
                      </div>
                      {open && (
                        <div className="flex flex-wrap gap-2">
                          <ActionForm action={extendInvitation} submitLabel="Prorrogar 7 dias" size="sm" variant="outline" inline>
                            <input type="hidden" name="invitation_id" value={i.id} />
                            <input type="hidden" name="days" value="7" />
                          </ActionForm>
                          <ActionForm action={revokeInvitation} submitLabel="Cancelar" size="sm" variant="ghost" inline>
                            <input type="hidden" name="invitation_id" value={i.id} />
                          </ActionForm>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum convite ainda.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Delegações secretária → médico</CardTitle>
          <CardDescription>
            Normalmente o próprio médico concede em Minha conta. Quando o administrador registra, o médico recebe um aviso.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {(delegations.data as unknown as Delegation[] | null)?.length ? (
            <ul className="divide-y">
              {(delegations.data as unknown as Delegation[]).map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <p className="text-sm">
                    <strong>{d.secretary?.full_name ?? d.secretary?.email}</strong> opera por{" "}
                    <strong>{d.doctor?.full_name ?? d.doctor?.email}</strong>
                    <span className="text-xs text-muted-foreground"> · desde {formatDateTime(d.created_at)}</span>
                  </p>
                  <ActionForm action={revokeDelegation} submitLabel="Revogar" size="sm" variant="outline" inline>
                    <input type="hidden" name="delegation_id" value={d.id} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma delegação ativa.</p>
          )}
          <ActionForm action={adminGrantDelegation} submitLabel="Registrar delegação" className="sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Secretária" htmlFor="del-sec">
              <Select id="del-sec" name="secretary_user_id" required defaultValue="">
                <option value="" disabled>Escolha…</option>
                {secretaries.map((s) => (
                  <option key={s.user_id} value={s.user_id}>{s.profile?.full_name ?? s.profile?.email}</option>
                ))}
              </Select>
            </Field>
            <Field label="Médico" htmlFor="del-doc">
              <Select id="del-doc" name="doctor_user_id" required defaultValue="">
                <option value="" disabled>Escolha…</option>
                {doctors.map((d) => (
                  <option key={d.user_id} value={d.user_id}>{d.profile?.full_name ?? d.profile?.email}</option>
                ))}
              </Select>
            </Field>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de usuários e permissões</CardTitle>
          <CardDescription>Registro imutável. Mostra as 30 alterações mais recentes.</CardDescription>
        </CardHeader>
        <CardContent>
          {(audit.data as unknown as Audit[] | null)?.length ? (
            <ul className="divide-y text-sm">
              {(audit.data as unknown as Audit[]).map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    {a.actor_id ? nameById.get(a.actor_id) ?? "Usuário externo" : "Sistema"} {ACTION_LABEL[a.action] ?? a.action}{" "}
                    {RESOURCE_LABEL[a.resource_type] ?? a.resource_type}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Sem registros.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
