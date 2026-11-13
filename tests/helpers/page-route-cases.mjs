import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-public-key';
process.env.AUTHORIZED_EMAILS = 'one@example.test,two@example.test';
const householdId = '00000000-0000-4000-8000-000000000001';
let signedIn = false;
let oauthResult = { data: { url: 'https://accounts.google.test/authorize' }, error: null };
let oauthOptions;
const user = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'one@example.test', email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: 'google', providers: ['google'] }, identities: [{ provider: 'google' }],
};
const db = { auth: {
  async getUser() { return { data: { user: signedIn ? user : null }, error: null }; },
  async signInWithOAuth(options) { oauthOptions = options; return oauthResult; },
}, from(table) {
  return {
    select() {
      return {
        eq() {
          return {
            maybeSingle: async () => ({
              data: table === 'household_members' ? { household_id: householdId } : null,
              error: null,
            }),
          };
        },
      };
    },
  };
} };
mock.module('@supabase/ssr', {
  namedExports: { createServerClient: () => db, createBrowserClient: () => db },
  exports: { createServerClient: () => db, createBrowserClient: () => db },
});
mock.module('next/headers', {
  namedExports: { cookies: async () => ({ getAll: () => [], set() {} }) },
  exports: { cookies: async () => ({ getAll: () => [], set() {} }) },
});

const { default: Home } = await import('../../app/page.tsx');
const { default: Login } = await import('../../app/login/page.tsx');
const { GET: startGoogleLogin } = await import('../../app/auth/google/route.ts');

const isRedirect = (error) => String(error?.message || error).includes('NEXT_REDIRECT');

test('la portada redirige a login si falta sesión y entrega el dashboard si está autorizada', async () => {
  signedIn = false;
  await assert.rejects(Home(), isRedirect);
  signedIn = true;
  const page = await Home();
  assert.equal(page.props.email, user.email);
  assert.equal(page.props.householdId, householdId);
});

test('Login muestra los estados de error, configuración y acceso autorizado', async () => {
  signedIn = false;
  const unauthorized = await Login({ searchParams: Promise.resolve({ error: 'unauthorized' }) });
  assert.equal(unauthorized.type, 'main');
  const failed = await Login({ searchParams: Promise.resolve({ error: 'auth' }) });
  assert.equal(failed.type, 'main');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  const unconfigured = await Login({ searchParams: Promise.resolve({}) });
  assert.equal(unconfigured.type, 'main');
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  signedIn = true;
  await assert.rejects(Login({ searchParams: Promise.resolve({}) }), isRedirect);
});

test('OAuth de Google redirige al proveedor y vuelve a login al fallar', async () => {
  const request = new Request('https://mesa.example/auth/google');
  oauthResult = { data: { url: 'https://accounts.google.test/authorize' }, error: null };
  let response = await startGoogleLogin(request);
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), 'https://accounts.google.test/authorize');
  oauthResult = { data: { url: null }, error: new Error('provider failed') };
  response = await startGoogleLogin(request);
  assert.equal(new URL(response.headers.get('location')).pathname, '/login');
  oauthResult = { data: { url: null }, error: null };
  response = await startGoogleLogin(request);
  assert.equal(new URL(response.headers.get('location')).searchParams.get('error'), 'auth');
});

test('OAuth redirect URI uses this host callback and returns to home', async () => {
  oauthResult = { data: { url: 'https://accounts.google.test/authorize' }, error: null };
  await startGoogleLogin(new Request('https://mesa.example/auth/google'));
  const redirectTo = new URL(oauthOptions.options.redirectTo);
  assert.equal(redirectTo.origin, 'https://mesa.example');
  assert.equal(redirectTo.pathname, '/auth/callback');
  assert.equal(redirectTo.searchParams.get('next'), '/');
});
