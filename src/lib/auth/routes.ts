// Rotas que não exigem login (mapa de telas: 1, 2, 3 e o retorno dos e-mails do Auth).
const PUBLIC_EXACT = new Set(["/entrar", "/criar-conta", "/recuperar-senha"]);
const PUBLIC_PREFIXES = ["/convite/", "/auth/"];

export function isPublicPath(pathname: string) {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p) && pathname.length > p.length);
}

/**
 * Só aceita redirecionar para caminhos internos (evita open redirect via ?next=).
 */
export function safeNext(next: unknown, fallback = "/") {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(next)) return fallback;
  return next;
}
