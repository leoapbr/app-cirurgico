"use client";

import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { ROLE_LABEL, ROLES } from "@/lib/auth/roles";
import { createInvitation } from "./actions";
import { InviteLink } from "./invite-link";

export function InviteForm() {
  return (
    <ActionForm
      action={createInvitation}
      submitLabel="Enviar convite"
      resetOnSuccess
      renderSuccess={(s) => (s.data?.link ? <InviteLink link={s.data.link} /> : null)}
    >
      <Field label="E-mail" htmlFor="invite-email">
        <Input id="invite-email" name="email" type="email" required placeholder="nome@exemplo.test" />
      </Field>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1 text-sm font-medium">Papéis</legend>
        {ROLES.map((r) => (
          <label key={r} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="roles" value={r} defaultChecked={r === "medico"} /> {ROLE_LABEL[r]}
          </label>
        ))}
      </fieldset>
    </ActionForm>
  );
}
