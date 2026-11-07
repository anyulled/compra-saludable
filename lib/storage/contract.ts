import type { State } from "../types";
/** A remote SQL/NoSQL adapter must implement atomic compare-and-swap, including creation at revision 0. */
export interface WorkspaceStore {
  read(): Promise<{ state: State | null; revision: number }>;
  write(
    state: State,
    expectedRevision: number,
  ): Promise<{ ok: boolean; revision: number }>;
}
