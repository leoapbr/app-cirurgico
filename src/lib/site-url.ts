import "server-only";
import { headers } from "next/headers";
import { resolveSiteUrl } from "@/lib/site-url-core";

/**
 * Endereço público do app para links em e-mails e convites.
 * Ordem: NEXT_PUBLIC_SITE_URL → URL do branch/deploy na Vercel → host da requisição.
 */
export async function siteUrl() {
  const h = await headers();
  return resolveSiteUrl({
    configured: process.env.NEXT_PUBLIC_SITE_URL,
    vercelEnv: process.env.VERCEL_ENV,
    vercelBranchUrl: process.env.VERCEL_BRANCH_URL,
    vercelUrl: process.env.VERCEL_URL,
    host: h.get("x-forwarded-host") ?? h.get("host"),
    proto: h.get("x-forwarded-proto"),
  });
}
