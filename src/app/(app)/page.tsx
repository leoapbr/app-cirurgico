import type { Metadata } from "next";
import { CalendarDays, ClipboardCheck, FileCheck2, TriangleAlert, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrg } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Início" };

const EMPTY_CARDS = [
  { icon: CalendarDays, title: "Próximas cirurgias", text: "As cirurgias agendadas aparecerão aqui.", slice: "D" },
  { icon: Users, title: "Equipe e convites", text: "Recusas e convites pendentes da equipe.", slice: "E" },
  { icon: FileCheck2, title: "Autorizações", text: "Pedidos de autorização em andamento.", slice: "F" },
  { icon: ClipboardCheck, title: "Checklist atrasado", text: "Itens de preparo com prazo vencido.", slice: "Checklist" },
  { icon: TriangleAlert, title: "Conflitos de agenda", text: "Choques de horário da equipe.", slice: "E" },
];

export default async function DashboardPage() {
  const ctx = await requireOrg("/");
  const supabase = await createClient();
  const isAdmin = ctx.roles.includes("admin");
  const isSecretary = ctx.roles.includes("secretaria");

  const [counts, delegations] = await Promise.all([
    isAdmin ? supabase.rpc("org_admin_counts", { p_org: ctx.activeOrg.organization_id }) : Promise.resolve(null),
    isSecretary
      ? supabase
          .from("delegations")
          .select("id, doctor:profiles!delegations_doctor_user_id_fkey(full_name)")
          .eq("organization_id", ctx.activeOrg.organization_id)
          .eq("secretary_user_id", ctx.userId)
          .is("revoked_at", null)
      : Promise.resolve(null),
  ]);
  const c = (counts?.data as { active_members: number; pending_invitations: number; active_delegations: number }[] | null)?.[0];
  const delegatedBy = (delegations?.data as unknown as { id: string; doctor: { full_name: string | null } | null }[] | null) ?? [];

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Olá, {ctx.profile.full_name ?? ctx.email}</h1>
        <p className="text-sm text-muted-foreground">{ctx.activeOrg.organization.name}</p>
      </div>

      {isAdmin && c && (
        <section aria-labelledby="admin-counts" className="grid gap-3">
          <h2 id="admin-counts" className="text-sm font-medium text-muted-foreground">Organização (somente contagens)</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Membros ativos", c.active_members],
              ["Convites pendentes", c.pending_invitations],
              ["Delegações ativas", c.active_delegations],
            ].map(([label, value]) => (
              <Card key={label as string}>
                <CardHeader>
                  <CardDescription>{label}</CardDescription>
                  <CardTitle className="text-3xl">{value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>
      )}

      {isSecretary && (
        <Card>
          <CardHeader>
            <CardTitle>Médicos que delegaram a você</CardTitle>
            <CardDescription>Você opera a agenda e as cirurgias só desses médicos.</CardDescription>
          </CardHeader>
          <CardContent>
            {delegatedBy.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma delegação ativa. Peça ao médico ou ao administrador.</p>
            ) : (
              <ul className="list-disc pl-5 text-sm">
                {delegatedBy.map((d) => (
                  <li key={d.id}>{d.doctor?.full_name ?? "Médico"}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <section aria-labelledby="ops" className="grid gap-3">
        <h2 id="ops" className="text-sm font-medium text-muted-foreground">Painel operacional</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {EMPTY_CARDS.map(({ icon: Icon, title, text, slice }) => (
            <Card key={title}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-primary" aria-hidden />
                  <CardTitle>{title}</CardTitle>
                </div>
                <CardDescription>{text}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Nada por aqui ainda. Chega na fatia {slice}.</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
