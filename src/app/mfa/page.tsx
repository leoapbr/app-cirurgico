import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { DemoBanner } from "@/components/demo-banner";
import { Field } from "@/components/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getContext } from "@/lib/auth/dal";
import { safeNext } from "@/lib/auth/routes";
import { verifyChallenge } from "./actions";
import { EnrollMfa } from "./enroll";

export const metadata: Metadata = { title: "Verificação em duas etapas" };

export default async function MfaPage({ searchParams }: PageProps<"/mfa">) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const ctx = await getContext();
  if (!ctx) redirect(`/entrar?next=${encodeURIComponent("/mfa?next=" + next)}`);
  if (ctx.aal === "aal2") redirect(next);

  return (
    <>
      <DemoBanner />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Verificação em duas etapas</CardTitle>
            <CardDescription>
              {ctx.mfa.required
                ? "Administradores precisam confirmar a identidade com um aplicativo autenticador."
                : "Proteja sua conta com um aplicativo autenticador."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ctx.mfa.hasVerifiedFactor ? (
              <ActionForm action={verifyChallenge} submitLabel="Verificar" pendingLabel="Verificando…">
                <input type="hidden" name="next" value={next} />
                <Field label="Código do autenticador" htmlFor="code">
                  <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} autoFocus required />
                </Field>
              </ActionForm>
            ) : (
              <EnrollMfa next={next} />
            )}
            <form action="/auth/sair" method="post" className="mt-6">
              <button className="text-sm text-muted-foreground hover:underline" type="submit">
                Sair
              </button>
            </form>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
