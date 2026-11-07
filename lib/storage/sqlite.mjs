import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Local adapter for a single household. Revisions are used for atomic compare-and-swap. */
export class SqliteWorkspaceStore {
  constructor(filePath) {
    this.path = resolve(filePath);
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(this.path);
    chmodSync(this.path, 0o600);
    this.db.exec(
      "PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL CHECK(revision > 0), payload TEXT NOT NULL, updated_at TEXT NOT NULL);",
    );
  }
  async read() {
    const row = this.db
      .prepare("SELECT revision, payload FROM workspace WHERE id = 1")
      .get();
    if (!row) return { state: null, revision: 0 };
    return { state: JSON.parse(row.payload), revision: Number(row.revision) };
  }
  async write(state, expectedRevision) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      throw new Error("Revisión inválida.");
    const payload = JSON.stringify(state);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db
        .prepare("SELECT revision FROM workspace WHERE id = 1")
        .get();
      const revision = row ? Number(row.revision) : 0;
      if (revision !== expectedRevision) {
        this.db.exec("ROLLBACK");
        return { ok: false, revision };
      }
      const next = revision + 1;
      this.db
        .prepare(
          "INSERT INTO workspace(id,revision,payload,updated_at) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,updated_at=excluded.updated_at",
        )
        .run(next, payload, new Date().toISOString());
      this.db.exec("COMMIT");
      return { ok: true, revision: next };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
let singleton;
export function getWorkspaceStore() {
  if (!singleton)
    singleton = new SqliteWorkspaceStore(
      process.env.MESA_DB_PATH ||
        resolve(process.cwd(), ".data", "mesa.sqlite"),
    );
  return singleton;
}
