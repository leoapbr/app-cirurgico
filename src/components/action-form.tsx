"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { FormState } from "@/lib/form-state";
import { cn } from "@/lib/utils";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  resetOnSuccess?: boolean;
  inline?: boolean;
  /** Renderiza algo a partir do estado de sucesso (ex.: link do convite). */
  renderSuccess?: (state: NonNullable<FormState>) => ReactNode;
};

export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Enviando…",
  className,
  variant,
  size,
  resetOnSuccess,
  inline,
  renderSuccess,
}: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state?.success) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={cn(inline ? "inline-flex items-center gap-2" : "grid gap-4", className)}>
      {children}
      {!inline && state?.error && <Alert variant="destructive">{state.error}</Alert>}
      {!inline && state?.success && (
        <Alert variant="success">
          {state.success}
          {renderSuccess?.(state)}
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={pending} variant={variant} size={size}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
      {inline && state?.error && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  );
}
