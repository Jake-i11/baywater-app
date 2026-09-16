import {
  createClient as createPlainSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { createClient as createBrowserSupabaseClient } from "@/lib/client";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase-env";

/**
 * Single Supabase entry point for the browser.
 *
 * The session is persisted in COOKIES (through the existing @supabase/ssr
 * browser client in `lib/client.ts`) instead of localStorage. That way the
 * server-side authenticated client in `lib/server.ts` — and every authorization
 * check that depends on `auth.uid()` — sees the exact same session the browser
 * sees.
 *
 * Previously this module created a plain `@supabase/supabase-js` client whose
 * session lived only in localStorage. The server can never read localStorage,
 * so server components / route handlers treated signed-in users as anonymous
 * and bounced them to `/login` (the Firm flow bug).
 *
 * If this module is ever evaluated on the server (a few legacy route handlers
 * import it) it falls back to a plain anonymous client, matching the previous
 * behaviour — those routes never relied on a stored session.
 */
const isBrowser = typeof window !== "undefined";

const browserClient: SupabaseClient | null = isBrowser
  ? createBrowserSupabaseClient()
  : null;

/**
 * Sessions created before the Firm work live in localStorage under the default
 * `@supabase/supabase-js` key. When no cookie session exists yet, adopt the
 * first legacy session we find so an already-signed-in user is not logged out
 * by the storage switch. One-time and best-effort: any failure is ignored and
 * the user can simply sign in again.
 */
async function adoptLegacyLocalStorageSession(client: SupabaseClient) {
  try {
    const { data: current } = await client.auth.getSession();
    if (current.session) return;

    const legacy = createPlainSupabaseClient(
      getSupabaseUrl(),
      getSupabasePublishableKey(),
      {
        auth: {
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );

    const { data } = await legacy.auth.getSession();
    const session = data.session;
    if (!session) return;

    await client.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    // Drop the old copy so the two stores can never drift apart.
    await legacy.auth.signOut({ scope: "local" });
  } catch {
    // Best-effort migration only — never let it break the app.
  }
}

if (browserClient) {
  void adoptLegacyLocalStorageSession(browserClient);
}

export const supabase: SupabaseClient =
  browserClient ??
  createPlainSupabaseClient(getSupabaseUrl(), getSupabasePublishableKey());
