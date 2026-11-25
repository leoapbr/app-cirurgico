import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requestPasswordReset } from "../actions";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function RecuperarSenhaPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recuperar senha</CardTitle>
        <CardDescription>Enviaremos um link para você criar uma nova senha.</CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={requestPasswordReset} submitLabel="Enviar link">
          <Field label="E-mail" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
        </ActionForm>
        <p className="mt-4 text-sm">
          <Link className="text-primary hover:underline" href="/entrar">
            Voltar para o login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
