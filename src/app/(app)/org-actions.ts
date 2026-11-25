"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "@/lib/auth/dal";
import { friendlyError, type FormState } from "@/lib/form-state";

export async function switchOrganization(_: FormState, formData: FormData): Promise<FormState> {
  await requireContext();
  const parsed = z.uuid().safeParse(formData.get("organization_id"));
  if (!parsed.success) return { error: "Organização inválida." };
  const supabase = await createClient();
  // O banco confere se a pessoa é membro ativo; o ID vindo do formulário não é confiado.
  const { error } = await supabase.rpc("set_active_organization", { p_org: parsed.data });
  if (error) return { error: "Organização não encontrada." };
  revalidatePath("/", "layout");
  redirect("/");
}

export async function createOrganization(_: FormState, formData: FormData): Promise<FormState> {
  await requireContext("/organizacoes");
  const parsed = z
    .object({
      name: z.string().trim().min(2, "Informe o nome").max(120),
      type: z.enum(["clinica", "grupo_medico", "administrativa"]),
      extra: z.array(z.enum(["medico", "secretaria", "profissional"])),
    })
    .safeParse({ name: formData.get("name"), type: formData.get("type"), extra: formData.getAll("extra_roles") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_type: parsed.data.type,
    p_extra_roles: parsed.data.extra,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/", "layout");
  // Quem cria vira admin: o MFA passa a ser exigido e o requireContext leva ao cadastro.
  redirect("/mfa?next=/configuracoes");
}
