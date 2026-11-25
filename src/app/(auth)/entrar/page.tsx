import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { safeNext } from "@/lib/auth/routes";
import { signIn } from "../actions";

export const metadata: Metadata = { title: "Entrar" };

export default async function EntrarPage({ searchParams }: PageProps<"/entrar">) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar</CardTitle>
        <CardDescription>Use o e-mail e a senha da sua conta.</CardDescription>
      </CardHeader>
      <CardContent>
        {sp.erro === "link" && (
          <Alert variant="destructive" className="mb-4">
            O link expirou ou já foi usado. Entre com sua senha ou peça um novo link.
          </Alert>
        )}
        <ActionForm action={signIn} submitLabel="Entrar" pendingLabel="Entrando…">
          <input type="hidden" name="next" value={next} />
          <Field label="E-mail" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Senha" htmlFor="password">
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
        </ActionForm>
        <div className="mt-4 flex justify-between text-sm">
          <Link className="text-primary hover:underline" href="/recuperar-senha">
            Esqueci a senha
          </Link>
          <Link className="text-primary hover:underline" href={`/criar-conta?next=${encodeURIComponent(next)}`}>
            Criar conta
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
