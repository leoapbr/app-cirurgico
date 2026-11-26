import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { DemoBanner } from "@/components/demo-banner";
import { Field } from "@/components/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { updatePassword } from "../(auth)/actions";

export const metadata: Metadata = { title: "Nova senha" };

// Acessada pelo link de recuperação (a sessão vem de /auth/confirm); o proxy exige login.
export default function RedefinirSenhaPage() {
  return (
    <>
      <DemoBanner />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Criar nova senha</CardTitle>
            <CardDescription>Escolha uma senha com ao menos 10 caracteres.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={updatePassword} submitLabel="Salvar senha" resetOnSuccess>
              <Field label="Nova senha" htmlFor="password">
                <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
              </Field>
              <Field label="Repita a senha" htmlFor="confirm">
                <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
              </Field>
            </ActionForm>
            <p className="mt-4 text-sm">
              <Link className="text-primary hover:underline" href="/">
                Ir para o início
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
