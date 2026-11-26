import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { safeNext } from "@/lib/auth/routes";
import { signUp } from "../actions";

export const metadata: Metadata = { title: "Criar conta" };

export default async function CriarContaPage({ searchParams }: PageProps<"/criar-conta">) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar conta</CardTitle>
        <CardDescription>Se você recebeu um convite, use o mesmo e-mail do convite.</CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={signUp} submitLabel="Criar conta" pendingLabel="Criando…">
          <input type="hidden" name="next" value={next} />
          <Field label="Nome completo" htmlFor="full_name">
            <Input id="full_name" name="full_name" autoComplete="name" required />
          </Field>
          <Field label="E-mail" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Senha" htmlFor="password" hint="Mínimo de 10 caracteres.">
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
          </Field>
        </ActionForm>
        <p className="mt-4 text-sm text-muted-foreground">
          Já tem conta?{" "}
          <Link className="text-primary hover:underline" href={`/entrar?next=${encodeURIComponent(next)}`}>
            Entrar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
