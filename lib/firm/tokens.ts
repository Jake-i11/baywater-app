/**
 * Invitation token helpers — browser-safe subset.
 *
 * Server-side token generation and hashing (node:crypto) live in
 * lib/firm/tokens.server.ts; client code hashes tokens with Web Crypto here.
 */

/** Browser-safe SHA-256 hex digest of the raw invite token. */
export async function hashInvitationTokenWeb(rawToken: string): Promise<string> {
  const data = new TextEncoder().encode(rawToken);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function buildInvitePath(rawToken: string): string {
  return `/invite/${encodeURIComponent(rawToken)}`;
}

export function buildInviteUrl(rawToken: string, origin: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}${buildInvitePath(rawToken)}`;
}

/** Allow only same-origin relative return paths (open-redirect safe). */
export function safeNextPath(candidate: string | null | undefined, fallback = "/dashboard"): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith("/")) return fallback;
  if (candidate.startsWith("//")) return fallback;
  if (candidate.includes("://")) return fallback;
  return candidate;
}
