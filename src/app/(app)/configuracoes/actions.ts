"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/dal";
import { ROLE_LABEL, ROLES } from "@/lib/auth/roles";
import { friendlyError, type FormState } from "@/lib/form-state";
import { publicEnv } from "@/lib/env";
import { isMailSandbox, sendMail } from "@/lib/mail";
import { newInviteToken } from "@/lib/tokens";

const PATH = "/configuracoes";
const roleList = z.array(z.enum(ROLES)).min(1, "Escolha ao menos um papel");

// Todas as ações abaixo checam admin + MFA aqui E no banco (RLS com aal2).

export async function updateOrganization(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAdmin(PATH);
  const parsed = z
    .object({ name: z.string().trim().min(2).max(120), type: z.enum(["clinica", "grupo_medico", "administrativa"]) })
    .safeParse({ name: formData.get("name"), type: formData.get("type") });
  if (!parsed.success) return { error: "Confira o nome e o tipo." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .update(parsed.data)
    .eq("id", ctx.activeOrg.organization_id)
    .select("id");
  if (error || !data?.length) return { error: friendlyError(error, "Você não tem permissão para esta ação.") };
  revalidatePath("/", "layout");
  return { success: "Organização atualizada." };
}

export async function updateMember(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAdmin(PATH);
  const parsed = z
    .object({ membership_id: z.uuid(), roles: roleList, status: z.enum(["ativo", "inativo"]) })
    .safeParse({
      membership_id: formData.get("membership_id"),
      roles: formData.getAll("roles"),
      status: formData.get("status"),
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .update({ roles: parsed.data.roles, status: parsed.data.status })
    .eq("id", parsed.data.membership_id)
    .eq("organization_id", ctx.activeOrg.organization_id)
    .select("id");
  if (error || !data?.length) return { error: friendlyError(error, "Membro não encontrado.") };
  revalidatePath(PATH);
  return { success: "Membro atualizado." };
}

export async function createInvitation(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAdmin(PATH);
  const parsed = z
    .object({ email: z.email("E-mail inválido").transform((v) => v.trim().toLowerCase()), roles: roleList })
    .safeParse({ email: formData.get("email"), roles: formData.getAll("roles") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { token, hash } = newInviteToken();
  const supabase = await createClient();
  const { error } = await supabase.from("org_invitations").insert({
    organization_id: ctx.activeOrg.organization_id,
    email: parsed.data.email,
    roles: parsed.data.roles,
    token_hash: hash,
  });
  if (error) {
    if (error.code === "23505") return { error: "Já existe um convite pendente para este e-mail." };
    return { error: friendlyError(error) };
  }

  const link = `${publicEnv().NEXT_PUBLIC_SITE_URL}/convite/${token}`;
  const papel = parsed.data.roles.map((r) => ROLE_LABEL[r]).join(", ");
  await sendMail({
    to: parsed.data.email,
    subject: `Convite para ${ctx.activeOrg.organization.name}`,
    text: `Você foi convidado para ${ctx.activeOrg.organization.name} como ${papel}.\n\nAceite ou recuse em: ${link}\n\nO link vale por 7 dias.`,
  });
  revalidatePath(PATH);
  return isMailSandbox()
    ? { success: "Convite criado. Modo demonstração: nenhum e-mail foi enviado; copie o link abaixo.", data: { link } }
    : { success: "Convite enviado por e-mail." };
}

export async function extendInvitation(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAdmin(PATH);
  const parsed = z
    .object({ invitation_id: z.uuid(), days: z.coerce.number().int().min(1).max(30) })
    .safeParse({ invitation_id: formData.get("invitation_id"), days: formData.get("days") ?? 7 });
  if (!parsed.success) return { error: "Prazo inválido." };
  const expires = new Date(Date.now() + parsed.data.days * 86_400_000).toISOString();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("org_invitations")
    .update({ expires_at: expires })
    .eq("id", parsed.data.invitation_id)
    .eq("organization_id", ctx.activeOrg.organization_id)
    .select("id");
  if (error || !data?.length) return { error: friendlyError(error, "Convite não encontrado.") };
  revalidatePath(PATH);
  return { success: "Prazo prorrogado." };
}

export async function revokeInvitation(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAdmin(PATH);
  const parsed = z.uuid().safeParse(formData.get("invitation_id"));
  if (!parsed.success) return { error: "Convite inválido." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("org_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .eq("organization_id", ctx.activeOrg.organization_id)
    .select("id");
  if (error || !data?.length) return { error: friendlyError(error, "Convite não encontrado.") };
  revalidatePath(PATH);
  return { success: "Convite cancelado." };
}

/** Admin registra delegação em nome do médico, que é avisado (matriz S5). */
export async function adminGrantDelegation(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAdmin(PATH);
  const parsed = z
    .object({ secretary_user_id: z.uuid(), doctor_user_id: z.uuid() })
    .safeParse({ secretary_user_id: formData.get("secretary_user_id"), doctor_user_id: formData.get("doctor_user_id") });
  if (!parsed.success) return { error: "Escolha a secretária e o médico." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("delegations")
    .insert({ organization_id: ctx.activeOrg.organization_id, ...parsed.data });
  if (error) return { error: friendlyError(error) };

  const { data: people } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", [parsed.data.doctor_user_id, parsed.data.secretary_user_id]);
  const doctor = people?.find((p) => p.id === parsed.data.doctor_user_id);
  const secretary = people?.find((p) => p.id === parsed.data.secretary_user_id);
  if (doctor?.email) {
    await sendMail({
      to: doctor.email,
      subject: `Nova delegação em ${ctx.activeOrg.organization.name}`,
      text: `O administrador registrou que ${secretary?.full_name ?? "uma secretária"} passa a operar sua agenda e suas cirurgias em ${ctx.activeOrg.organization.name}.\n\nSe não reconhece, revogue em ${publicEnv().NEXT_PUBLIC_SITE_URL}/conta#delegacoes.`,
    });
  }
  revalidatePath(PATH);
  return { success: "Delegação registrada. O médico foi avisado." };
}
