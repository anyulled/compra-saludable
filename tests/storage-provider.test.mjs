import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { workspaceStore } from '../lib/storage/index.ts';

test('selecciona SQLite local y conserva la revisión; rechaza proveedores no configurados', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mesa-store-'));
  const previousPath = process.env.MESA_DB_PATH;
  const previousProvider = process.env.MESA_STORAGE_PROVIDER;
  let store;
  try {
    process.env.MESA_DB_PATH = join(dir, 'mesa.sqlite');
    delete process.env.MESA_STORAGE_PROVIDER;
    store = workspaceStore();
    assert.deepEqual(await store.read(), { state: null, revision: 0 });
    const state = { profiles: [{ name: 'A' }, { name: 'B' }], products: [], recipes: [], plan: [], shopping: [], confirmed: false };
    assert.deepEqual(await store.write(state, 0), { ok: true, revision: 1 });
    assert.deepEqual(await store.read(), { state, revision: 1 });
    process.env.MESA_STORAGE_PROVIDER = 'no-configurado';
    assert.throws(workspaceStore, /Proveedor de almacenamiento no configurado/);
  } finally {
    store?.close();
    previousPath === undefined ? delete process.env.MESA_DB_PATH : process.env.MESA_DB_PATH = previousPath;
    previousProvider === undefined ? delete process.env.MESA_STORAGE_PROVIDER : process.env.MESA_STORAGE_PROVIDER = previousProvider;
    rmSync(dir, { recursive: true, force: true });
  }
});
