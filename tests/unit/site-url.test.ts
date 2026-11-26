import { describe, expect, it } from "vitest";
import { resolveSiteUrl } from "@/lib/site-url-core";

describe("endereço usado nos links de convite e e-mail", () => {
  it("usa o valor configurado", () => {
    expect(resolveSiteUrl({ configured: "https://app.exemplo.com/", vercelEnv: "production" })).toBe("https://app.exemplo.com");
  });
  it("ignora localhost esquecido num deploy da Vercel e usa o endereço do branch", () => {
    expect(
      resolveSiteUrl({ configured: "http://localhost:3000", vercelEnv: "preview", vercelBranchUrl: "app-git-x.vercel.app" }),
    ).toBe("https://app-git-x.vercel.app");
  });
  it("sem configuração, em preview usa o endereço do branch", () => {
    expect(resolveSiteUrl({ vercelEnv: "preview", vercelBranchUrl: "app-git-x.vercel.app", vercelUrl: "app-123.vercel.app" })).toBe(
      "https://app-git-x.vercel.app",
    );
  });
  it("cai para o host da requisição e, por último, localhost", () => {
    expect(resolveSiteUrl({ host: "app.exemplo.com" })).toBe("https://app.exemplo.com");
    expect(resolveSiteUrl({ host: "localhost:3000" })).toBe("http://localhost:3000");
    expect(resolveSiteUrl({ host: "evil.com/<x>" })).toBe("http://localhost:3000");
    expect(resolveSiteUrl({})).toBe("http://localhost:3000");
  });
});
