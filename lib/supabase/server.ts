import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { isAuthorizedGoogleUser } from "./authorization";

export { isAuthorizedGoogleUser } from "./authorization";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta configurar ${name}.`);
  return value;
}

export async function getSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (updates) => {
          try {
            updates.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server components cannot write cookies; proxy and route handlers do.
          }
        },
      },
    },
  );
}

export async function requireAuthorizedUser(): Promise<{
  supabase: SupabaseClient;
  user: User;
} | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !isAuthorizedGoogleUser(data.user)) return null;
  return { supabase, user: data.user };
}
