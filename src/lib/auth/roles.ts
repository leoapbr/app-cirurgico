export const ROLES = ["admin", "medico", "secretaria", "profissional"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  medico: "Médico",
  secretaria: "Secretária",
  profissional: "Profissional",
};

export function rolesLabel(roles: readonly string[]) {
  return roles.map((r) => ROLE_LABEL[r as Role] ?? r).join(", ");
}

/** MFA é obrigatório para quem é admin em qualquer organização ativa (matriz S8). */
export function requiresMfa(memberships: { roles: string[]; status: string }[]) {
  return memberships.some((m) => m.status === "ativo" && m.roles.includes("admin"));
}

/** Decide para onde mandar a pessoa logada antes de liberar a área autenticada. */
export function mfaGate(input: { mustHaveMfa: boolean; aal: string | undefined; hasVerifiedFactor: boolean }) {
  if (!input.mustHaveMfa) return null;
  if (input.aal === "aal2") return null;
  return input.hasVerifiedFactor ? "challenge" : "enroll";
}
