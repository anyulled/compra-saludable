import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { renderHook, act, cleanup, waitFor } = await import('@testing-library/react');
const { useWorkspace, warnAboutPendingEdits } = await import('../lib/useWorkspace.ts');
const originalFetch = globalThis.fetch;

const state = () => ({
  profiles: [{ name: 'Persona A' }, { name: 'Persona B' }],
  products: [], recipes: [], plan: [], shopping: [], confirmed: false, drafts: [],
});
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
afterEach(() => { cleanup(); localStorage.clear(); globalThis.fetch = originalFetch; });

test('avisa antes de cerrar solo si quedan cambios sin guardar o una escritura en curso', () => {
  const event = () => ({ prevented: false, returnValue: 'unchanged', preventDefault() { this.prevented = true; } });
  const clean = event();
  warnAboutPendingEdits(clean, 'snapshot', 'snapshot', false);
  assert.equal(clean.prevented, false);
  assert.equal(clean.returnValue, 'unchanged');
  const edited = event();
  warnAboutPendingEdits(edited, 'new', 'saved', false);
  assert.equal(edited.prevented, true);
  assert.equal(edited.returnValue, '');
  const writing = event();
  warnAboutPendingEdits(writing, 'same', 'same', true);
  assert.equal(writing.prevented, true);
});

test('un espacio vacío espera la importación administrativa sin guardarlo automáticamente', async () => {
  const calls = [];
  globalThis.fetch = async (_url, opts) => {
    calls.push(opts?.method || 'GET');
    return json({ state: null, revision: 0 });
  };
  const { result } = renderHook(() => useWorkspace());
  await waitFor(() => assert.equal(result.current.status, 'setup'));
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.deepEqual(calls, ['GET']);
});

test('se guarda un cambio usando la revisión y se notifica un conflicto simultáneo', async () => {
  const calls = [];
  globalThis.fetch = async (_url, opts) => {
    calls.push(opts?.method || 'GET');
    if (opts?.method === 'PUT') return json({ revision: 2 }, 409);
    return json({ state: state(), revision: 1 });
  };
  const { result } = renderHook(() => useWorkspace());
  await waitFor(() => assert.equal(result.current.status, 'ready'));
  act(() => result.current.setData(current => ({ ...current, confirmed: true })));
  await waitFor(() => assert.equal(result.current.status, 'conflict'), { timeout: 1500 });
  assert.equal(result.current.data.confirmed, true);
  assert.match(result.current.error, /Otra persona/);
  assert.deepEqual(calls, ['GET', 'PUT']);
});

test('guarda cambios con la última revisión y recupera el estado listo', async () => {
  let saved;
  globalThis.fetch = async (_url, opts) => {
    if (opts?.method === 'PUT') { saved = JSON.parse(opts.body); return json({ ok: true, revision: 2 }); }
    return json({ state: state(), revision: 1 });
  };
  const { result } = renderHook(() => useWorkspace());
  await waitFor(() => assert.equal(result.current.status, 'ready'));
  act(() => result.current.setData(current => ({ ...current, confirmed: true })));
  await waitFor(() => assert.equal(saved?.expectedRevision, 1), { timeout: 1500 });
  await waitFor(() => assert.equal(result.current.status, 'ready'));
  assert.equal(saved.state.confirmed, true);
});

test('muestra una copia antigua distinta sin sobrescribir el espacio remoto', async () => {
  const legacy = { ...state(), confirmed: true };
  localStorage.setItem('mesa-v1', JSON.stringify(legacy));
  let writes = 0;
  globalThis.fetch = async (_url, opts) => {
    if (opts?.method === 'PUT') writes++;
    return json({ state: state(), revision: 4 });
  };
  const { result } = renderHook(() => useWorkspace());
  await waitFor(() => assert.equal(result.current.status, 'ready'));
  assert.deepEqual(JSON.parse(result.current.legacyCopy), legacy);
  assert.equal(result.current.data.confirmed, false);
  assert.equal(writes, 0);
});

test('una copia antigua inválida se conserva para descargar y no se importa', async () => {
  localStorage.setItem('mesa-v1', '{datos inválidos');
  globalThis.fetch = async () => json({ state: state(), revision: 1 });
  const { result } = renderHook(() => useWorkspace());
  await waitFor(() => assert.equal(result.current.status, 'ready'));
  assert.equal(result.current.legacyCopy, '{datos inválidos');
  assert.match(result.current.legacyWarning, /formato reconocido/);
});

test('rechaza el estado remoto inválido o una lectura fallida', async () => {
  globalThis.fetch = async () => json({ state: { profiles: [] }, revision: 1 });
  const first = renderHook(() => useWorkspace());
  await waitFor(() => assert.equal(first.result.current.status, 'error'));
  assert.match(first.result.current.error, /no reconoce/);
  first.unmount();
  globalThis.fetch = async () => json({ error: 'offline' }, 503);
  const second = renderHook(() => useWorkspace());
  await waitFor(() => assert.equal(second.result.current.status, 'error'));
  assert.match(second.result.current.error, /conexión/);
});

test('un guardado con error avisa sin perder los cambios locales', async () => {
  globalThis.fetch = async (_url, opts) => opts?.method === 'PUT'
    ? json({ error: 'No se pudo guardar' }, 500)
    : json({ state: state(), revision: 1 });
  const { result } = renderHook(() => useWorkspace());
  await waitFor(() => assert.equal(result.current.status, 'ready'));
  act(() => result.current.setData(current => ({ ...current, confirmed: true })));
  await waitFor(() => assert.equal(result.current.status, 'error'), { timeout: 1500 });
  assert.equal(result.current.data.confirmed, true);
  assert.match(result.current.error, /No se pudo guardar/);
});

test('un PDF se considera guardado si se confirma la escritura tras una respuesta perdida', async () => {
  let remote = state(); let revision = 1;
  globalThis.fetch = async (_url, opts) => {
    if (opts?.method === 'PUT') {
      remote = JSON.parse(opts.body).state; revision = 2;
      throw Error('conexión interrumpida');
    }
    return json({ state: remote, revision });
  };
  const { result } = renderHook(() => useWorkspace());
  await waitFor(() => assert.equal(result.current.status, 'ready'));
  const next = { ...result.current.data, drafts: [{ id: 'd1', filename: 'x.pdf', page: 1, text: 'Receta' }] };
  await act(async () => { await result.current.persistWorkspace(next); });
  assert.equal(result.current.status, 'ready');
  assert.equal(result.current.data.drafts[0].id, 'd1');
});

test('un fallo no confirmado conserva el estado y avisa de que la escritura es incierta', async () => {
  let initialRead = true;
  globalThis.fetch = async (_url, opts) => {
    if (opts?.method === 'PUT') throw Error('conexión interrumpida');
    if (initialRead) { initialRead = false; return json({ state: state(), revision: 1 }); }
    throw Error('lectura interrumpida');
  };
  const { result } = renderHook(() => useWorkspace());
  await waitFor(() => assert.equal(result.current.status, 'ready'));
  const next = { ...result.current.data, drafts: [{ id: 'd1', filename: 'x.pdf', page: 1, text: 'Receta' }] };
  await act(async () => { await assert.rejects(result.current.persistWorkspace(next), /No se pudo confirmar el guardado/); });
  assert.equal(result.current.status, 'error');
  assert.equal(result.current.data.drafts.length, 0);
});

test('un conflicto en el guardado de PDF se comunica sin reemplazar el estado', async () => {
  globalThis.fetch = async (_url, opts) => opts?.method === 'PUT'
    ? json({ revision: 2 }, 409)
    : json({ state: state(), revision: 1 });
  const { result } = renderHook(() => useWorkspace());
  await waitFor(() => assert.equal(result.current.status, 'ready'));
  const next = { ...result.current.data, drafts: [{ id: 'd1', filename: 'x.pdf', page: 1, text: 'Receta' }] };
  await act(async () => { await assert.rejects(result.current.persistWorkspace(next), /Se ha cancelado la importación/); });
  assert.equal(result.current.status, 'conflict');
  assert.equal(result.current.data.drafts.length, 0);
});

test('reintentar una lectura que sigue fallando vuelve al estado de error', async () => {
  globalThis.fetch = async () => { throw Error('sin conexión'); };
  const { result } = renderHook(() => useWorkspace());
  await waitFor(() => assert.equal(result.current.status, 'error'));
  await act(async () => { await result.current.retry(); });
  assert.equal(result.current.status, 'error');
  assert.match(result.current.error, /sin conexión/);
});

test('reintentar reconoce cambios ya guardados en el servidor y limpia el conflicto', async () => {
  let remote = state(); let revision = 1; let saved = false;
  globalThis.fetch = async (_url, opts) => {
    if (opts?.method === 'PUT') {
      remote = JSON.parse(opts.body).state; revision = 2; saved = true;
      throw Error('respuesta perdida');
    }
    return json({ state: remote, revision });
  };
  const { result } = renderHook(() => useWorkspace());
  await waitFor(() => assert.equal(result.current.status, 'ready'));
  act(() => result.current.setData(current => ({ ...current, confirmed: true })));
  await waitFor(() => assert.equal(saved, true), { timeout: 1500 });
  await waitFor(() => assert.equal(result.current.status, 'error'));
  await act(async () => { await result.current.retry(); });
  assert.equal(result.current.status, 'ready');
  assert.equal(result.current.data.confirmed, true);
  assert.equal(result.current.error, '');
});

test('otro dispositivo actualiza el espacio mediante consulta periódica', async () => {
  let remote = state(); let revision = 1;
  globalThis.fetch = async () => json({ state: remote, revision });
  const { result } = renderHook(() => useWorkspace());
  await waitFor(() => assert.equal(result.current.status, 'ready'));
  remote = { ...state(), confirmed: true }; revision = 2;
  await waitFor(() => assert.equal(result.current.data.confirmed, true), { timeout: 5000, interval: 100 });
});

test('reintentar conserva la edición si el servidor cambió de forma diferente', async () => {
  let remote = state(); let revision = 1;
  globalThis.fetch = async (_url, opts) => opts?.method === 'PUT'
    ? json({ revision: 2 }, 409)
    : json({ state: remote, revision });
  const { result } = renderHook(() => useWorkspace());
  await waitFor(() => assert.equal(result.current.status, 'ready'));
  act(() => result.current.setData(current => ({ ...current, confirmed: true })));
  await waitFor(() => assert.equal(result.current.status, 'conflict'), { timeout: 1500 });
  remote = { ...state(), products: [{ id: 'other-device' }] }; revision = 2;
  await act(async () => { await result.current.retry(); });
  assert.equal(result.current.status, 'conflict');
  assert.equal(result.current.data.confirmed, true);
  assert.match(result.current.error, /Descarga tus datos/);
});

test('impide una importación PDF cuando el estado excede el límite o hay otro guardado', async () => {
  let resolvePut;
  globalThis.fetch = async (_url, opts) => opts?.method === 'PUT'
    ? new Promise(resolve => { resolvePut = resolve; })
    : json({ state: state(), revision: 1 });
  const { result } = renderHook(() => useWorkspace());
  await waitFor(() => assert.equal(result.current.status, 'ready'));
  const tooLarge = { ...result.current.data, drafts: [{ id: 'd', filename: 'x.pdf', page: 1, text: 'x'.repeat(3 * 1024 * 1024) }] };
  await assert.rejects(result.current.persistWorkspace(tooLarge), /límite de 3 MiB/);
  const next = { ...result.current.data, drafts: [{ id: 'd', filename: 'x.pdf', page: 1, text: 'P' }] };
  let pending;
  act(() => { pending = result.current.persistWorkspace(next); });
  await waitFor(() => assert.equal(typeof resolvePut, 'function'));
  await assert.rejects(result.current.persistWorkspace(next), /cambios pendientes/);
  await act(async () => { resolvePut(json({ ok: true, revision: 2 })); await pending; });
  assert.equal(result.current.data.drafts[0].id, 'd');
});

test('el guardado de PDF conserva las ediciones hechas mientras espera la respuesta', async () => {
  let finishPut;
  let putCalled = false;
  globalThis.fetch = async (_url, opts) => {
    if (opts?.method === 'PUT') {
      putCalled = true;
      return new Promise(resolve => { finishPut = resolve; });
    }
    return json({ state: state(), revision: 1 });
  };
  const { result } = renderHook(() => useWorkspace());
  await waitFor(() => assert.equal(result.current.status, 'ready'));
  const next = { ...result.current.data, drafts: [{ id: 'd1', filename: 'x.pdf', page: 1, text: 'Receta' }] };
  let pending;
  act(() => { pending = result.current.persistWorkspace(next); });
  await waitFor(() => assert.equal(putCalled, true));
  act(() => result.current.setData(current => ({ ...current, confirmed: true })));
  await act(async () => { finishPut(json({ ok: true, revision: 2 })); await pending; });
  assert.equal(result.current.data.confirmed, true);
  assert.equal(result.current.data.drafts.length, 1);
});

test('resetWorkspace guarda el estado restablecido y actualiza el estado local', async () => {
  let savedState;
  globalThis.fetch = async (_url, opts) => {
    if (opts?.method === 'PUT') {
      savedState = JSON.parse(opts.body).state;
      return json({ ok: true, revision: 2 });
    }
    return json({ state: { ...state(), recipes: [{ id: 'r1', name: 'R', meal: 'Comida', calories: 100, protein: 10, carbs: 10, fat: 5, ingredients: [], rating: 3, notes: '', approved: true }], drafts: [{ id: 'd1', filename: 'x.pdf', page: 1, text: 'Receta' }] }, revision: 1 });
  };
  const { result } = renderHook(() => useWorkspace());
  await waitFor(() => assert.equal(result.current.status, 'ready'));
  assert.equal(result.current.data.recipes.length, 1);
  assert.equal(result.current.data.drafts.length, 1);
  const reset = { ...result.current.data, recipes: [], drafts: [] };
  await act(async () => { await result.current.resetWorkspace(reset); });
  assert.equal(result.current.status, 'ready');
  assert.equal(result.current.data.recipes.length, 0);
  assert.equal(result.current.data.drafts.length, 0);
  assert.equal(savedState.recipes.length, 0);
  assert.equal(savedState.drafts.length, 0);
});
