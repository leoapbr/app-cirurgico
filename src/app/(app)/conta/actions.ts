"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireContext, requireOrg } from "@/lib/auth/dal";
import { friendlyError, type FormState } from "@/lib/form-state";

export async function updateProfile(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireContext("/conta");
  const parsed = z
    .object({
      full_name: z.string().trim().min(2, "Informe seu nome").max(120),
      phone: z
        .string()
        .trim()
        .max(20)
        .regex(/^(\+?[0-9 ()-]{8,20})?$/, "Telefone inválido")
        .transform((v) => v || null),
    })
    .safeParse({ full_name: formData.get("full_name"), phone: formData.get("phone") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", ctx.userId);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { success: "Dados salvos." };
}

export async function changePassword(_: FormState, formData: FormData): Promise<FormState> {
  await requireContext("/conta");
  const parsed = z
    .object({ password: z.string().min(10, "A senha precisa ter ao menos 10 caracteres").max(72), confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "As senhas não conferem" })
    .safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "Não foi possível alterar a senha. Use uma senha diferente da anterior." };
  return { success: "Senha alterada." };
}

/** Médico concede delegação à secretária da organização ativa (matriz S5). */
export async function grantOwnDelegation(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireOrg("/conta");
  if (!ctx.roles.includes("medico")) return { error: "Só médicos concedem a própria delegação." };
  const parsed = z.uuid().safeParse(formData.get("secretary_user_id"));
  if (!parsed.success) return { error: "Escolha a secretária." };
  const supabase = await createClient();
  const { error } = await supabase.from("delegations").insert({
    organization_id: ctx.activeOrg.organization_id,
    secretary_user_id: parsed.data,
    doctor_user_id: ctx.userId,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/conta");
  return { success: "Delegação concedida." };
}

export async function revokeDelegation(_: FormState, formData: FormData): Promise<FormState> {
  await requireOrg("/conta");
  const parsed = z.uuid().safeParse(formData.get("delegation_id"));
  if (!parsed.success) return { error: "Delegação inválida." };
  const supabase = await createClient();
  // O RLS só deixa o próprio médico ou o admin com MFA revogar.
  const { data, error } = await supabase
    .from("delegations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .is("revoked_at", null)
    .select("id");
  if (error || !data?.length) return { error: friendlyError(error, "Delegação não encontrada.") };
  revalidatePath("/conta");
  revalidatePath("/configuracoes");
  return { success: "Delegação revogada." };
}
