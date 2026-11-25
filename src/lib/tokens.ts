import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** Token de convite: 256 bits aleatórios no link; só o SHA-256 vai para o banco. */
export function newInviteToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
