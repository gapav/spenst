import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "./config";

export async function getSupabaseServerClient() {
  if (!isSupabaseConfigured || !supabaseUrl || !supabasePublishableKey) return null;
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot set response cookies. Nothing refreshes
          // them here either: the browser client owns the auth cookie so it is
          // the only refresher (see proxy.ts). A future server-side reader has
          // to settle who writes before relying on a refresh happening.
        }
      },
    },
  });
}
