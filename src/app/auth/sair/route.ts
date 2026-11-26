import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/routes";

// POST para evitar logout por link/prefetch. Aceita "next" para voltar a uma página pública (ex.: convite).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  let target = "/entrar";
  try {
    const form = await request.formData();
    const next = safeNext(form.get("next"), "");
    if (next.startsWith("/convite/")) target = next;
  } catch {
    // sem corpo de formulário
  }
  return NextResponse.redirect(new URL(target, request.nextUrl.origin), { status: 303 });
}
