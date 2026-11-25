#!/usr/bin/env node
// Falha se algum segredo aparecer no bundle do navegador (.next/static) ou em arquivos versionados.
// Uso: npm run build && npm run check:secrets
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const PATTERNS = [
  [/service_role/i, "referência à chave service_role"],
  [/sb_secret_[A-Za-z0-9_-]{10,}/, "chave secreta do Supabase"],
  [/\bre_[A-Za-z0-9]{20,}\b/, "chave da API do Resend"],
  [/eyJhbGciOi[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*cm9sZSI6InNlcnZpY2Vfcm9sZS/, "JWT com role service_role"],
  [/-----BEGIN (RSA |EC )?PRIVATE KEY-----/, "chave privada"],
  [/RESEND_API_KEY|SUPABASE_SERVICE_ROLE_KEY/, "nome de variável secreta no bundle"],
];

const problems = [];
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

// 1) Bundle do navegador
const staticDir = ".next/static";
if (!existsSync(staticDir)) {
  console.error("Rode `npm run build` antes (pasta .next/static não encontrada).");
  process.exit(2);
}
for (const file of walk(staticDir).filter((f) => /\.(js|css|json|html|map)$/.test(f))) {
  const text = readFileSync(file, "utf8");
  for (const [re, label] of PATTERNS) if (re.test(text)) problems.push(`${file}: ${label}`);
}

// 2) Valores de variáveis secretas do ambiente atual não podem aparecer no bundle
const secretEnv = Object.entries(process.env).filter(
  ([k, v]) => !k.startsWith("NEXT_PUBLIC_") && /KEY|SECRET|TOKEN|PASSWORD/i.test(k) && v && v.length >= 12,
);
if (secretEnv.length) {
  for (const file of walk(staticDir)) {
    const text = readFileSync(file, "utf8");
    for (const [k, v] of secretEnv) if (text.includes(v)) problems.push(`${file}: valor de ${k}`);
  }
}

// 3) Arquivos versionados
try {
  const tracked = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean);
  for (const f of tracked) {
    if (/(^|\/)\.env(\.|$)/.test(f) && !f.endsWith(".env.example")) problems.push(`${f}: arquivo .env versionado`);
    if (f.startsWith("scripts/check-secrets") || f.startsWith("tests/")) continue;
    if (!existsSync(f) || statSync(f).size > 1_000_000) continue;
    const text = readFileSync(f, "utf8");
    for (const [re, label] of PATTERNS.slice(1, 5)) if (re.test(text)) problems.push(`${f}: ${label}`);
  }
} catch {
  // fora de um repositório git: pula esta etapa
}

if (problems.length) {
  console.error("Possíveis segredos expostos:\n" + problems.map((p) => "  - " + p).join("\n"));
  process.exit(1);
}
console.log("OK: nenhum segredo encontrado no bundle do navegador nem nos arquivos versionados.");
