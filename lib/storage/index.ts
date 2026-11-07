import type { WorkspaceStore } from "./contract";
import { getWorkspaceStore } from "./sqlite.mjs";
/** Future remote adapters must honor the same atomic revision semantics. */
export function workspaceStore(): WorkspaceStore {
  const provider = process.env.MESA_STORAGE_PROVIDER || "sqlite";
  if (provider !== "sqlite")
    throw new Error("Proveedor de almacenamiento no configurado.");
  return getWorkspaceStore();
}
