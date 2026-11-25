import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("token de convite", () => {
  it("gera token longo e guarda só o SHA-256 em hex (mesmo cálculo do banco)", async () => {
    const { newInviteToken, hashToken } = await import("@/lib/tokens");
    const { token, hash } = newInviteToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hash);
    // sha256('abc') conhecido; o banco usa encode(sha256(convert_to(token,'UTF8')),'hex')
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
