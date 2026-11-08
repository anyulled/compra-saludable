import type { SupabaseClient } from "@supabase/supabase-js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Resolve the shared household from the signed-in user's RLS-protected membership. */
export async function getHouseholdIdForUser(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error("No se pudo consultar la pertenencia al hogar.");
  if (!data) return null;
  if (typeof data.household_id !== "string" || !UUID.test(data.household_id)) {
    throw new Error("La pertenencia al hogar no contiene un UUID válido.");
  }
  return data.household_id;
}
