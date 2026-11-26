"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError, type FormState } from "@/lib/form-state";

const token = z.string().regex(/^[A-Za-z0-9_-]{20,128}$/);

export async function acceptInvitation(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = token.safeParse(formData.get("token"));
  if (!parsed.success) return { error: "Convite inválido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_org_invitation", { p_token: parsed.data });
  if (error) {
    if (/outro e-mail/.test(error.message ?? "")) {
      return { error: "Este convite foi enviado para outro e-mail. Saia e entre com o e-mail do convite." };
    }
    return { error: friendlyError(error, "Convite inválido ou expirado.") };
  }
  revalidatePath("/", "layout");
  redirect("/");
}

export async function declineInvitation(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = token.safeParse(formData.get("token"));
  if (!parsed.success) return { error: "Convite inválido." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decline_org_invitation", { p_token: parsed.data });
  if (error || !data) return { error: "Este convite não está mais disponível." };
  return { success: "Convite recusado. Quem convidou verá a recusa." };
}
