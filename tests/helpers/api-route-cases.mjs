import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

const household = '2d3a3934-5165-4dbc-845f-41b58bfe191e';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-public-key';
process.env.AUTHORIZED_EMAILS = 'one@example.test,two@example.test';
let session = null;
let row = null;
let error = null;
let rpcCalls = 0;
let rpcResult = { ok: true, revision: 2 };
let exchangeFailure = false;
let signOutCount = 0;
const db = {
  auth: { async exchangeCodeForSession() { return { error: exchangeFailure ? new Error('invalid code') : null }; },
  async signOut() { signOutCount++; }, async getUser() { return { data: { user: session ? {
    id: '10000000-0000-4000-8000-000000000001',
    email: 'one@example.test', email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'google', providers: ['google'] }, identities: [{ provider: 'google' }],
  } : null }, error: null }; } },
  from(table) {
    return {
      select() {
        return {
          eq() {
            return {
              maybeSingle: async () => ({
                data: table === 'household_members' ? { household_id: household } : row,
                error,
              }),
            };
          },
        };
      },
    };
  },
  async rpc() { rpcCalls++; return { data: [rpcResult], error }; },
};
mock.module('@supabase/ssr', {
  namedExports: { createServerClient: () => db },
  exports: { createServerClient: () => db },
});
mock.module('next/headers', {
  namedExports: { cookies: async () => ({ getAll: () => [], set() {} }) },
  exports: { cookies: async () => ({ getAll: () => [], set() {} }) },
});

const workspace = await import('../../app/api/workspace/route.ts');
const mercadona = await import('../../app/api/mercadona/route.ts');
const mercadonaSearch = await import('../../app/api/mercadona/search/route.ts');
const optimizer = await import('../../app/api/optimize/route.ts');
const pdf = await import('../../app/api/pdf-worker/route.ts');
const ocr = await import('../../app/api/ocr-assets/[asset]/route.ts');
const callback = await import('../../app/auth/callback/route.ts');
const signout = await import('../../app/auth/signout/route.ts');
const state = { profiles: [{ name: 'A' }, { name: 'B' }], products: [], recipes: [], plan: [], shopping: [], confirmed: false };
const post = (path, body, headers = {}) => new Request(`https://mesa.example${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const put = (body, headers = {}) => new Request('https://mesa.example/api/workspace', { method: 'PUT', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('todas las rutas de datos y OCR rechazan solicitudes sin sesión', async () => {
  session = null;
  assert.equal((await workspace.GET()).status, 401);
  assert.equal((await workspace.PUT(put({}))).status, 401);
  assert.equal((await mercadona.POST(post('/api/mercadona', {}))).status, 401);
  assert.equal((await mercadonaSearch.POST(post('/api/mercadona/search', { query: 'garbanzos' }))).status, 401);
  assert.equal((await optimizer.POST(post('/api/optimize', {}))).status, 401);
  assert.equal((await pdf.GET()).status, 401);
  assert.equal((await ocr.GET(new Request('https://mesa.example'), { params: Promise.resolve({ asset: 'worker.min.js' }) })).status, 401);
});

test('las rutas autenticadas validan formato, origen y límites', async () => {
  session = { supabase: db };
  assert.equal((await mercadona.POST(post('/api/mercadona', { product: 'x'.repeat(501) }))).status, 400);
  assert.equal((await mercadona.POST(post('/api/mercadona', { product: 'texto no permitido' }))).status, 400);
  assert.equal((await mercadonaSearch.POST(post('/api/mercadona/search', { query: '' }))).status, 400);
  assert.equal((await optimizer.POST(post('/api/optimize', {}, { 'content-length': '5000000' }))).status, 413);
  assert.equal((await optimizer.POST(post('/api/optimize', {}))).status, 400);
  assert.equal((await workspace.PUT(put({}, { origin: 'https://otro.example' }))).status, 403);
  assert.equal((await workspace.PUT(put({}, { 'sec-fetch-site': 'cross-site' }))).status, 403);
  assert.equal((await workspace.PUT(new Request('https://mesa.example/api/workspace', { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: '{}' }))).status, 415);
  assert.equal((await workspace.PUT(put({}, { 'content-length': '5000000' }))).status, 413);
  assert.equal((await workspace.PUT(put({ expectedRevision: -1, state }))).status, 400);
});

test('el espacio se lee por sesión y no se crea antes de la importación administrativa', async () => {
  session = { supabase: db }; row = null; error = null; rpcCalls = 0;
  const response = await workspace.GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { state: null, revision: 0 });
  const result = await workspace.PUT(put({ expectedRevision: 0, state }));
  assert.equal(result.status, 409);
  assert.equal(rpcCalls, 0);
});

test('guardar respeta comparación de revisión y propaga conflictos', async () => {
  row = { revision: 1, payload: state }; error = null; rpcCalls = 0;
  rpcResult = { ok: true, revision: 2 };
  let response = await workspace.PUT(put({ expectedRevision: 1, state }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, revision: 2 });
  assert.equal(rpcCalls, 1);
  rpcResult = { ok: false, revision: 2 };
  response = await workspace.PUT(put({ expectedRevision: 1, state }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).revision, 2);
});

test('los errores del proveedor no exponen datos y los recursos OCR son de lista cerrada', async () => {
  error = { message: 'detalle privado' };
  let response = await workspace.GET();
  assert.equal(response.status, 500);
  assert.doesNotMatch(JSON.stringify(await response.json()), /detalle privado/);
  error = null;
  response = await ocr.GET(new Request('https://mesa.example'), { params: Promise.resolve({ asset: '../secreto' }) });
  assert.equal(response.status, 404);
  response = await ocr.GET(new Request('https://mesa.example'), { params: Promise.resolve({ asset: 'worker.min.js' }) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /javascript/);
  assert.equal((await pdf.GET()).status, 200);
});

test('el callback de Google exige código y no expone errores del proveedor', async () => {
  let response = await callback.GET(new Request('https://mesa.example/auth/callback'));
  assert.equal(new URL(response.headers.get('location')).searchParams.get('error'), 'auth');
  exchangeFailure = true;
  response = await callback.GET(new Request('https://mesa.example/auth/callback?code=bad'));
  assert.equal(new URL(response.headers.get('location')).searchParams.get('error'), 'auth');
  exchangeFailure = false;
});

test('el callback expulsa usuarios no autorizados y evita redirecciones externas', async () => {
  session = null; signOutCount = 0;
  let response = await callback.GET(new Request('https://mesa.example/auth/callback?code=abc'));
  assert.equal(new URL(response.headers.get('location')).searchParams.get('error'), 'unauthorized');
  assert.equal(signOutCount, 1);
  session = { supabase: db };
  response = await callback.GET(new Request('https://mesa.example/auth/callback?code=abc&next=%2F%5Cevil.example'));
  assert.equal(new URL(response.headers.get('location')).origin, 'https://mesa.example');
  response = await callback.GET(new Request('https://mesa.example/auth/callback?code=abc&next=%2Frecetas'));
  assert.equal(new URL(response.headers.get('location')).pathname, '/recetas');
});

test('cerrar sesión revoca la sesión y vuelve a la pantalla de acceso', async () => {
  signOutCount = 0;
  const response = await signout.POST(new Request('https://mesa.example/auth/signout', { method: 'POST' }));
  assert.equal(response.status, 303);
  assert.equal(new URL(response.headers.get('location')).pathname, '/login');
  assert.equal(signOutCount, 1);
});
