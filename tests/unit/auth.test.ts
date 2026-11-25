import { describe, expect, it } from "vitest";
import { isPublicPath, safeNext } from "@/lib/auth/routes";
import { mfaGate, requiresMfa } from "@/lib/auth/roles";
import { friendlyError } from "@/lib/form-state";

describe("safeNext (evita open redirect)", () => {
  it.each([
    ["/configuracoes", "/configuracoes"],
    ["/convite/abc?x=1", "/convite/abc?x=1"],
    ["https://malicioso.example", "/"],
    ["//malicioso.example", "/"],
    ["/\\malicioso.example", "/"],
    ["/ok\r\nSet-Cookie: x", "/"],
    [undefined, "/"],
    [42, "/"],
  ])("%s → %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});

describe("rotas públicas", () => {
  it("libera só login, cadastro, recuperação, convite e retorno de e-mail", () => {
    for (const p of ["/entrar", "/criar-conta", "/recuperar-senha", "/convite/xyz", "/auth/confirm"]) {
      expect(isPublicPath(p)).toBe(true);
    }
    for (const p of ["/", "/configuracoes", "/conta", "/organizacoes", "/mfa", "/redefinir-senha", "/entrarx", "/convite"]) {
      expect(isPublicPath(p)).toBe(false);
    }
  });
});

describe("MFA obrigatório para admin", () => {
  it("exige MFA de quem é admin ativo em alguma organização", () => {
    expect(requiresMfa([{ roles: ["medico"], status: "ativo" }])).toBe(false);
    expect(requiresMfa([{ roles: ["medico", "admin"], status: "ativo" }])).toBe(true);
    expect(requiresMfa([{ roles: ["admin"], status: "inativo" }])).toBe(false);
  });

  it("manda cadastrar o autenticador ou verificar o código", () => {
    expect(mfaGate({ mustHaveMfa: false, aal: "aal1", hasVerifiedFactor: false })).toBeNull();
    expect(mfaGate({ mustHaveMfa: true, aal: "aal2", hasVerifiedFactor: true })).toBeNull();
    expect(mfaGate({ mustHaveMfa: true, aal: "aal1", hasVerifiedFactor: false })).toBe("enroll");
    expect(mfaGate({ mustHaveMfa: true, aal: "aal1", hasVerifiedFactor: true })).toBe("challenge");
    expect(mfaGate({ mustHaveMfa: true, aal: undefined, hasVerifiedFactor: true })).toBe("challenge");
  });
});

describe("mensagens de erro", () => {
  it("não vaza detalhes internos do banco", () => {
    expect(friendlyError({ code: "42501", message: 'permission denied for table memberships' })).toBe(
      "Você não tem permissão para esta ação.",
    );
    expect(friendlyError({ code: "XX000", message: 'new row violates row-level security policy for table "x"' })).toMatch(
      /Não foi possível/,
    );
    expect(friendlyError({ code: "P0001", message: "A organização precisa manter ao menos um administrador ativo" })).toMatch(
      /administrador/,
    );
  });
});
