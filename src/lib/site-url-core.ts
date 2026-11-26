type Input = {
  configured?: string | null;
  vercelEnv?: string | null;
  vercelBranchUrl?: string | null;
  vercelUrl?: string | null;
  host?: string | null;
  proto?: string | null;
};

const strip = (u: string) => u.replace(/\/+$/, "");
const isLocal = (u: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(strip(u));

export function resolveSiteUrl(i: Input): string {
  const onVercel = Boolean(i.vercelEnv);
  // Valor configurado vale, exceto "localhost" num deploy da Vercel (configuração esquecida).
  if (i.configured && !(onVercel && isLocal(i.configured))) return strip(i.configured);
  // Em preview, o endereço fixo do branch; senão o do próprio deploy.
  if (i.vercelEnv === "preview" && i.vercelBranchUrl) return `https://${i.vercelBranchUrl}`;
  if (i.vercelUrl && i.vercelEnv !== "production") return `https://${i.vercelUrl}`;
  if (i.host && /^[a-z0-9.-]+(:\d+)?$/i.test(i.host)) {
    const proto = i.proto === "http" ? "http" : i.host.startsWith("localhost") ? "http" : "https";
    return `${proto}://${i.host}`;
  }
  return "http://localhost:3000";
}
