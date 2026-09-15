/**
 * Server-only invitation token helpers — raw token never persisted;
 * only the SHA-256 hash is stored. Uses node:crypto, so this module
 * must never be imported from client code.
 */
import { createHash, randomBytes } from "crypto";

export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}
