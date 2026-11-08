import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

let options;
let created = 0;
let sessionUser = null;
let authError = null;
let throwOnCookie = false;
const written = [];
const fakeClient = { auth: { getUser: async () => ({ data: { user: sessionUser }, error: authError }) } };
mock.module('@supabase/ssr', { exports: {
  createServerClient: (url, key, config) => { options = { url, key, ...config }; return fakeClient; },
  createBrowserClient: (url, key) => { created++; return { url, key }; },
} });
mock.module('next/headers', { exports: { cookies: async () => ({
  getAll: () => [{ name: 'session', value: 'value' }],
  set: (name, value, settings) => { if (throwOnCookie) throw Error('cookies are read-only'); written.push([name, value, settings]); },
}) } });

const { getSupabaseServerClient, requireAuthorizedUser } = await import('../../lib/supabase/server.ts');
const { getSupabaseBrowserClient } = await import('../../lib/supabase/browser.ts');
const setEnv = () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'public-key';
  process.env.AUTHORIZED_EMAILS = 'one@example.test,two@example.test';
};
const validUser = () => ({
  email: 'one@example.test', email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: 'google', providers: ['google'] }, identities: [{ provider: 'google' }],
});

test('el cliente servidor exige configuración y entrega cookies al SDK', async () => {
  setEnv(); delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  await assert.rejects(getSupabaseServerClient(), /NEXT_PUBLIC_SUPABASE_URL/);
  setEnv();
  assert.equal(await getSupabaseServerClient(), fakeClient);
  assert.equal(options.url, 'https://supabase.example');
  assert.equal(options.key, 'public-key');
  assert.deepEqual(options.cookies.getAll(), [{ name: 'session', value: 'value' }]);
  options.cookies.setAll([{ name: 'refreshed', value: 'new', options: { path: '/' } }]);
  assert.deepEqual(written.at(-1), ['refreshed', 'new', { path: '/' }]);
  throwOnCookie = true;
  assert.doesNotThrow(() => options.cookies.setAll([{ name: 'x', value: 'v', options: {} }]));
  throwOnCookie = false;
});

test('la sesión se deniega si el servicio devuelve error o el usuario no está autorizado', async () => {
  setEnv(); sessionUser = validUser(); authError = new Error('bad token');
  assert.equal(await requireAuthorizedUser(), null);
  authError = null; sessionUser = null;
  assert.equal(await requireAuthorizedUser(), null);
  sessionUser = validUser(); sessionUser.email = 'intruso@example.test';
  assert.equal(await requireAuthorizedUser(), null);
});

test('la sesión válida incluye el cliente autenticado y al usuario', async () => {
  setEnv(); authError = null; sessionUser = validUser();
  assert.deepEqual(await requireAuthorizedUser(), { supabase: fakeClient, user: sessionUser });
});

test('el cliente navegador requiere claves públicas y reutiliza la misma instancia', () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  assert.throws(getSupabaseBrowserClient, /no está configurado/);
  setEnv();
  const first = getSupabaseBrowserClient();
  assert.deepEqual(first, { url: 'https://supabase.example', key: 'public-key' });
  assert.equal(getSupabaseBrowserClient(), first);
  assert.equal(created, 1);
});
