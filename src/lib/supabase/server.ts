import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { fetchWithClockSkewRetry } from "@/lib/supabase/retry-fetch";

export async function createClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public environment variables are not configured.");
  return createServerClient<Database>(url, key, {
    global: { fetch: fetchWithClockSkewRetry },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(items) {
        try { items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* Server Components cannot write cookies; proxy refreshes sessions. */ }
      },
    },
  });
}
