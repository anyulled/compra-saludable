import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseWorkspaceStore } from '../lib/storage/supabase.ts';

const household = '2d3a3934-5165-4dbc-845f-41b58bfe191e';
const state = { profiles: [{ name: 'A' }, { name: 'B' }], products: [], recipes: [], plan: [], shopping: [], confirmed: false };

function client({ readData = null, readError = null, writeData = null, writeError = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push(['table', table]);
      return { select(columns) {
        calls.push(['select', columns]);
        return { eq(column, value) {
          calls.push(['eq', column, value]);
          return { maybeSingle: async () => ({ data: readData, error: readError }) };
        } };
      } };
    },
    async rpc(name, args) {
      calls.push(['rpc', name, args]);
      return { data: writeData, error: writeError };
    },
  };
}

test('el adaptador rechaza un identificador de hogar mal formado', () => {
  assert.throws(() => createSupabaseWorkspaceStore(client(), 'no-es-un-uuid'), /UUID/);
});

test('lee exclusivamente la fila del hogar y conserva el estado y la revisión', async () => {
  const db = client({ readData: { revision: '12', payload: state } });
  const store = createSupabaseWorkspaceStore(db, household);
  assert.deepEqual(await store.read(), { state, revision: 12 });
  assert.deepEqual(db.calls, [
    ['table', 'household_workspaces'],
    ['select', 'revision,payload'],
    ['eq', 'household_id', household],
  ]);
});

test('devuelve revisión cero cuando el hogar todavía no tiene espacio', async () => {
  const store = createSupabaseWorkspaceStore(client(), household);
  assert.deepEqual(await store.read(), { state: null, revision: 0 });
});

test('los errores y revisiones imposibles de lectura no se confunden con un estado vacío', async () => {
  const errorStore = createSupabaseWorkspaceStore(client({ readError: { message: 'acceso denegado' } }), household);
  await assert.rejects(errorStore.read(), /acceso denegado/);
  for (const revision of [0, -1, 'no válido', '9007199254740992']) {
    const store = createSupabaseWorkspaceStore(client({ readData: { revision, payload: state } }), household);
    await assert.rejects(store.read(), /revisión guardada no es válida/);
  }
});

test('envía revisión esperada y cambios mediante la operación atómica', async () => {
  const db = client({ writeData: [{ ok: true, revision: '13' }] });
  const store = createSupabaseWorkspaceStore(db, household);
  assert.deepEqual(await store.write(state, 12), { ok: true, revision: 13 });
  assert.deepEqual(db.calls, [['rpc', 'write_household_workspace', {
    p_household_id: household, p_expected_revision: 12, p_payload: state,
  }]]);
});

test('propaga un conflicto de revisión sin sobrescribir ni tratarlo como éxito', async () => {
  const store = createSupabaseWorkspaceStore(client({ writeData: { ok: false, revision: 14 } }), household);
  assert.deepEqual(await store.write(state, 12), { ok: false, revision: 14 });
});

test('rechaza respuestas de escritura mal formadas y errores del proveedor', async () => {
  for (const value of [null, [], [{ ok: 'true', revision: 2 }], [{ ok: true, revision: 'NaN' }]]) {
    const store = createSupabaseWorkspaceStore(client({ writeData: value }), household);
    await assert.rejects(store.write(state, 1), /Respuesta de escritura/);
  }
  const store = createSupabaseWorkspaceStore(client({ writeError: { message: 'política RLS' } }), household);
  await assert.rejects(store.write(state, 1), /política RLS/);
  for (const revision of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(store.write(state, revision), /Revisión inválida/);
  }
});
