"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/routes";
import type { FormState } from "@/lib/form-state";

const code = z.string().trim().regex(/^\d{6}$/, "Digite os 6 números do aplicativo autenticador");

export type EnrollResult = { factorId: string; qrCode: string; secret: string } | { error: string };

/** Inicia o cadastro de um autenticador TOTP (Google Authenticator, Authy, 1Password…). */
export async function startEnroll(): Promise<EnrollResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { error: "Sessão expirada. Entre novamente." };

  // Remove tentativas anteriores não concluídas para não acumular fatores pendentes.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Autenticador ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error || !data) return { error: "Não foi possível iniciar o cadastro do autenticador." };
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyEnroll(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.object({ code, factorId: z.string().min(1) }).safeParse({
    code: formData.get("code"),
    factorId: formData.get("factorId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: parsed.data.factorId, code: parsed.data.code });
  if (error) return { error: "Código inválido ou expirado. Confira o horário do celular e tente de novo." };
  redirect(safeNext(formData.get("next")));
}

export async function verifyChallenge(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = code.safeParse(formData.get("code"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  if (!factor) return { error: "Nenhum autenticador cadastrado." };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: parsed.data });
  if (error) return { error: "Código inválido ou expirado." };
  redirect(safeNext(formData.get("next")));
}
