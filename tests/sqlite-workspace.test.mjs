import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteWorkspaceStore } from "../lib/storage/sqlite.mjs";
import { isWorkspace } from "../lib/storage/validate.mjs";
const state = (name = "A") => ({
  profiles: [{ name }, { name: "B" }],
  products: [],
  recipes: [],
  plan: [],
  shopping: [],
  confirmed: false,
  drafts: [],
});
test("SQLite persiste los datos al cerrar y reabrir, con permisos privados", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mesa-db-"));
  try {
    const path = join(dir, "db.sqlite");
    let db = new SqliteWorkspaceStore(path);
    assert.deepEqual(await db.read(), { state: null, revision: 0 });
    assert.deepEqual(await db.write(state(), 0), { ok: true, revision: 1 });
    assert.equal(statSync(path).mode & 0o777, 0o600);
    db.close();
    db = new SqliteWorkspaceStore(path);
    assert.deepEqual(await db.read(), { state: state(), revision: 1 });
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("ediciones simultáneas se detectan sin sobrescribir", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mesa-db-"));
  try {
    const file = join(dir, "db.sqlite");
    const a = new SqliteWorkspaceStore(file),
      b = new SqliteWorkspaceStore(file);
    await a.write(state("Primero"), 0);
    assert.deepEqual(await b.write(state("Perdido"), 0), {
      ok: false,
      revision: 1,
    });
    assert.equal((await b.read()).state.profiles[0].name, "Primero");
    assert.deepEqual(await b.write(state("Segundo"), 1), {
      ok: true,
      revision: 2,
    });
    assert.deepEqual(await a.write(state("Obsoleto"), 1), {
      ok: false,
      revision: 2,
    });
    a.close();
    b.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("valida la forma del estado sin aceptar objetos incompletos", () => {
  assert.equal(isWorkspace(state()), true);
  assert.equal(isWorkspace({ profiles: [] }), false);
  assert.equal(isWorkspace({ ...state(), confirmed: undefined }), false);
  assert.equal(isWorkspace({ ...state(), profiles: [null, null] }), false);
});
