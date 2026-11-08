import type { State } from "../types";
import type { WorkspaceStore } from "./contract";

type SupabaseResult<T> = { data: T | null; error: { message: string } | null };
type SupabaseAwaitable<T> = PromiseLike<SupabaseResult<T>>;
type WorkspaceRow = { revision: number | string; payload: State };
type RevisionResult = { ok: boolean; revision: number | string };
type SupabaseClientLike = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): SupabaseAwaitable<WorkspaceRow>;
      };
    };
  };
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): SupabaseAwaitable<RevisionResult[] | RevisionResult>;
};

/** Supabase adapter; pass a cookie-authenticated server client so RLS uses the user's JWT. */
export function createSupabaseWorkspaceStore(
  client: unknown,
  householdId: string,
): WorkspaceStore {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(householdId)) {
    throw new Error("El hogar debe identificarse con un UUID válido.");
  }
  const db = client as SupabaseClientLike;

  return {
    async read() {
      const { data, error } = await db
        .from("household_workspaces")
        .select("revision,payload")
        .eq("household_id", householdId)
        .maybeSingle();
      if (error) throw new Error(`No se pudo leer el espacio privado: ${error.message}`);
      if (!data) return { state: null, revision: 0 };
      const revision = Number(data.revision);
      if (!Number.isSafeInteger(revision) || revision < 1) {
        throw new Error("La revisión guardada no es válida.");
      }
      return { state: data.payload, revision };
    },
    async write(state, expectedRevision) {
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        throw new Error("Revisión inválida.");
      }
      const { data, error } = await db.rpc("write_household_workspace", {
        p_household_id: householdId,
        p_expected_revision: expectedRevision,
        p_payload: state,
      });
      if (error) throw new Error(`No se pudo guardar el espacio privado: ${error.message}`);
      const result = Array.isArray(data) ? data[0] : data;
      const revision = result ? Number(result.revision) : Number.NaN;
      if (!result || typeof result.ok !== "boolean" || !Number.isSafeInteger(revision)) {
        throw new Error("Respuesta de escritura de Supabase no válida.");
      }
      return { ok: result.ok, revision };
    },
  };
}
