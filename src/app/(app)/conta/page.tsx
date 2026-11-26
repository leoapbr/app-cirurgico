import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { requireContext } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import { changePassword, grantOwnDelegation, revokeDelegation, updateProfile } from "./actions";

export const metadata: Metadata = { title: "Minha conta" };

type DelegationRow = {
  id: string;
  created_at: string;
  secretary: { full_name: string | null; email: string } | null;
  doctor: { full_name: string | null; email: string } | null;
};

export default async function ContaPage() {
  const ctx = await requireContext("/conta");
  const supabase = await createClient();
  const orgId = ctx.activeOrg?.organization_id;
  const isDoctor = ctx.roles.includes("medico");
  const isSecretary = ctx.roles.includes("secretaria");

  const [delegations, secretaries] = await Promise.all([
    orgId && (isDoctor || isSecretary)
      ? supabase
          .from("delegations")
          .select(
            "id, created_at, secretary:profiles!delegations_secretary_user_id_fkey(full_name, email), doctor:profiles!delegations_doctor_user_id_fkey(full_name, email)",
          )
          .eq("organization_id", orgId)
          .or(`doctor_user_id.eq.${ctx.userId},secretary_user_id.eq.${ctx.userId}`)
          .is("revoked_at", null)
          .order("created_at")
      : Promise.resolve(null),
    orgId && isDoctor
      ? supabase
          .from("memberships")
          .select("user_id, profile:profiles!memberships_user_id_fkey(full_name, email)")
          .eq("organization_id", orgId)
          .eq("status", "ativo")
          .contains("roles", ["secretaria"])
      : Promise.resolve(null),
  ]);
  const rows = (delegations?.data as unknown as DelegationRow[] | null) ?? [];
  const secs = (secretaries?.data as unknown as { user_id: string; profile: { full_name: string | null; email: string } | null }[] | null) ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
          <CardDescription>{ctx.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={updateProfile} submitLabel="Salvar">
            <Field label="Nome completo" htmlFor="full_name">
              <Input id="full_name" name="full_name" defaultValue={ctx.profile.full_name ?? ""} required />
            </Field>
            <Field label="Telefone" htmlFor="phone" hint="Opcional. Use um número fictício neste ambiente.">
              <Input id="phone" name="phone" defaultValue={ctx.profile.phone ?? ""} inputMode="tel" />
            </Field>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Segurança</CardTitle>
          <CardDescription>
            Verificação em duas etapas:{" "}
            {ctx.mfa.hasVerifiedFactor ? <Badge>Ativa</Badge> : <Badge variant="warning">Desligada</Badge>}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {!ctx.mfa.hasVerifiedFactor && (
            <Button asChild variant="outline">
              <Link href="/mfa?next=/conta">Ativar verificação em duas etapas</Link>
            </Button>
          )}
          <ActionForm action={changePassword} submitLabel="Alterar senha" resetOnSuccess>
            <Field label="Nova senha" htmlFor="password">
              <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
            </Field>
            <Field label="Repita a senha" htmlFor="confirm">
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
            </Field>
          </ActionForm>
        </CardContent>
      </Card>

      {(isDoctor || isSecretary) && (
        <Card className="lg:col-span-2" id="delegacoes">
          <CardHeader>
            <CardTitle>Delegações</CardTitle>
            <CardDescription>
              {isDoctor
                ? "Secretárias que operam sua agenda e suas cirurgias nesta organização."
                : "Médicos que delegaram a você a operação da agenda nesta organização."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma delegação ativa.</p>
            ) : (
              <ul className="divide-y">
                {rows.map((d) => {
                  const iAmDoctor = d.doctor?.email === ctx.email;
                  const other = iAmDoctor ? d.secretary : d.doctor;
                  return (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div>
                        <p className="font-medium">{other?.full_name ?? other?.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {iAmDoctor ? "Secretária" : "Médico"} · desde {formatDateTime(d.created_at)}
                        </p>
                      </div>
                      {iAmDoctor && (
                        <ActionForm action={revokeDelegation} submitLabel="Revogar" size="sm" variant="outline" inline>
                          <input type="hidden" name="delegation_id" value={d.id} />
                        </ActionForm>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {isDoctor && (
              <ActionForm action={grantOwnDelegation} submitLabel="Conceder delegação">
                <Field label="Secretária" htmlFor="secretary_user_id">
                  <Select id="secretary_user_id" name="secretary_user_id" required defaultValue="">
                    <option value="" disabled>
                      {secs.length ? "Escolha…" : "Nenhuma secretária nesta organização"}
                    </option>
                    {secs
                      .filter((s) => s.user_id !== ctx.userId)
                      .map((s) => (
                        <option key={s.user_id} value={s.user_id}>
                          {s.profile?.full_name ?? s.profile?.email}
                        </option>
                      ))}
                  </Select>
                </Field>
              </ActionForm>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
