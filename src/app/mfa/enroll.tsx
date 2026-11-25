"use client";

import { useState, useTransition } from "react";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startEnroll, verifyEnroll, type EnrollResult } from "./actions";

export function EnrollMfa({ next }: { next: string }) {
  const [result, setResult] = useState<EnrollResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (!result || "error" in result) {
    return (
      <div className="grid gap-4">
        {result && "error" in result && <Alert variant="destructive">{result.error}</Alert>}
        <Button disabled={pending} onClick={() => startTransition(async () => setResult(await startEnroll()))}>
          {pending ? "Gerando QR code…" : "Cadastrar autenticador"}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Abra o aplicativo autenticador no celular.</li>
        <li>Leia o QR code abaixo (ou digite a chave manualmente).</li>
        <li>Informe o código de 6 números que aparecer.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- data URI SVG gerado pelo Supabase */}
      <img src={result.qrCode} alt="QR code para o aplicativo autenticador" className="mx-auto size-44 rounded bg-white p-2" />
      <p className="break-all text-center font-mono text-xs text-muted-foreground">{result.secret}</p>
      <ActionForm action={verifyEnroll} submitLabel="Confirmar código" pendingLabel="Verificando…">
        <input type="hidden" name="factorId" value={result.factorId} />
        <input type="hidden" name="next" value={next} />
        <Field label="Código" htmlFor="code">
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
        </Field>
      </ActionForm>
    </div>
  );
}
