"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site-url";
import { safeNext } from "@/lib/auth/routes";
import type { FormState } from "@/lib/form-state";

const email = z.email("Informe um e-mail válido").transform((v) => v.trim().toLowerCase());
const password = z.string().min(10, "A senha precisa ter ao menos 10 caracteres").max(72);

export async function signIn(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.object({ email, password: z.string().min(1, "Informe a senha") }).safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // Mensagem única para não revelar se o e-mail existe.
  if (error) return { error: "E-mail ou senha incorretos, ou e-mail ainda não confirmado." };
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ full_name: z.string().trim().min(2, "Informe seu nome").max(120), email, password })
    .safeParse({ full_name: formData.get("full_name"), email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const next = safeNext(formData.get("next"));
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name },
      emailRedirectTo: `${await siteUrl()}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });
  if (error && error.code === "weak_password") return { error: "Senha fraca. Use uma senha mais longa e menos óbvia." };
  if (error) return { error: "Não foi possível criar a conta agora. Tente novamente em instantes." };
  return { success: "Enviamos um link de confirmação para o seu e-mail. Abra-o para ativar a conta." };
}

export async function requestPasswordReset(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = email.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Informe um e-mail válido" };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${await siteUrl()}/auth/confirm?next=/redefinir-senha`,
  });
  // Mesma resposta exista ou não a conta.
  return { success: "Se houver uma conta com este e-mail, enviamos um link para redefinir a senha." };
}

export async function updatePassword(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "As senhas não conferem" })
    .safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return { error: "O link expirou. Peça um novo em Recuperar senha." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "Não foi possível alterar a senha. Use uma senha diferente da anterior." };
  return { success: "Senha alterada." };
}
