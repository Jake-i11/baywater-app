import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/middleware";

/**
 * Next.js 16 renamed Middleware to Proxy (the behaviour is unchanged).
 *
 * This refreshes the Supabase session from cookies *before* the server renders
 * a Firm route, then gates unauthenticated visitors to `/login`. Scoping the
 * matcher to the Firm surface is deliberate: the rest of the app authenticates
 * on the client, so a global proxy would break the anonymous/guest flows.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/firm", "/firm/:path*"],
};
