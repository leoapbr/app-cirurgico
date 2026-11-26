import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mfaGate, requiresMfa, type Role } from "@/lib/auth/roles";

export type Membership = {
  organization_id: string;
  roles: Role[];
  status: "ativo" | "inativo";
  organization: { id: string; name: string; type: string; status: string };
};

export type AppContext = {
  userId: string;
  email: string;
  aal: "aal1" | "aal2";
  profile: { full_name: string | null; phone: string | null; active_organization_id: string | null };
  memberships: Membership[];
  activeOrg: Membership | null;
  roles: Role[];
  mfa: { required: boolean; hasVerifiedFactor: boolean };
};

/**
 * Camada de acesso (DAL): lê a sessão verificada e o contexto da pessoa.
 * A organização ativa vem do perfil e é revalidada contra memberships (via RLS);
 * nada que o navegador envia é confiado.
 */
export const getContext = cache(async (): Promise<AppContext | null> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims?.sub) return null;

  const [{ data: profile }, { data: memberships }, { data: factors }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, active_organization_id").eq("id", claims.sub).single(),
    supabase
      .from("memberships")
      .select("organization_id, roles, status, organization:organizations(id, name, type, status)")
      .eq("user_id", claims.sub)
      .eq("status", "ativo"),
    supabase.auth.mfa.listFactors(),
  ]);

  // Membership de organização inativa não aparece (RLS esconde a organização).
  const active = ((memberships ?? []) as unknown as Membership[]).filter((m) => m.organization);
  const activeOrg =
    active.find((m) => m.organization_id === profile?.active_organization_id) ?? (active.length === 1 ? active[0] : null);

  return {
    userId: claims.sub,
    email: String(claims.email ?? ""),
    aal: claims.aal === "aal2" ? "aal2" : "aal1",
    profile: profile ?? { full_name: null, phone: null, active_organization_id: null },
    memberships: active,
    activeOrg,
    roles: activeOrg?.roles ?? [],
    mfa: {
      required: requiresMfa(active),
      hasVerifiedFactor: (factors?.totp ?? []).some((f) => f.status === "verified"),
    },
  };
});

/** Exige login e, para admins, MFA concluído. Use em toda página e ação autenticada. */
export async function requireContext(nextPath = "/"): Promise<AppContext> {
  const ctx = await getContext();
  if (!ctx) redirect(`/entrar?next=${encodeURIComponent(nextPath)}`);
  const gate = mfaGate({ mustHaveMfa: ctx.mfa.required, aal: ctx.aal, hasVerifiedFactor: ctx.mfa.hasVerifiedFactor });
  if (gate) redirect(`/mfa?next=${encodeURIComponent(nextPath)}`);
  return ctx;
}

/** Exige organização ativa; sem ela, manda escolher ou criar uma. */
export async function requireOrg(nextPath = "/") {
  const ctx = await requireContext(nextPath);
  if (!ctx.activeOrg) redirect("/organizacoes");
  return ctx as AppContext & { activeOrg: Membership };
}

/** Exige admin com MFA na organização ativa (o banco exige o mesmo via RLS). */
export async function requireAdmin(nextPath = "/configuracoes") {
  const ctx = await requireOrg(nextPath);
  if (!ctx.roles.includes("admin")) redirect("/");
  if (ctx.aal !== "aal2") redirect(`/mfa?next=${encodeURIComponent(nextPath)}`);
  return ctx;
}
