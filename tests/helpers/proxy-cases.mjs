import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { mockOpts } from './mock-module.mjs';

let user = null;
let refresh = false;
const createMockClient = (_url, _key, options) => ({ auth: { async getUser() {
  if (refresh) options.cookies.setAll([{ name: 'test-session', value: 'new-token', options: { path: '/' } }]);
  return { data: { user }, error: null };
} } });
mock.module('@supabase/ssr', mockOpts({
  createServerClient: createMockClient,
}));
const { proxy } = await import('../../proxy.ts');
const request = path => new NextRequest(`https://mesa.example${path}`);
const configure = () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'public-key';
  process.env.AUTHORIZED_EMAILS = 'one@example.test,two@example.test';
};
const validUser = () => ({
  email: 'one@example.test', email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: 'google', providers: ['google'] }, identities: [{ provider: 'google' }],
});

test('la falta de configuración responde con error y no permite entrar', async () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  assert.equal((await proxy(request('/api/workspace'))).status, 503);
  const page = await proxy(request('/'));
  assert.equal(page.status, 307);
  assert.equal(new URL(page.headers.get('location')).searchParams.get('error'), 'setup');
});

test('los usuarios sin sesión o fuera de la lista son rechazados', async () => {
  configure(); user = null; refresh = false;
  const api = await proxy(request('/api/workspace'));
  assert.equal(api.status, 401);
  const page = await proxy(request('/'));
  assert.equal(page.status, 307);
  assert.equal(new URL(page.headers.get('location')).pathname, '/login');
  user = validUser(); user.email = 'intruso@example.test';
  assert.equal((await proxy(request('/api/workspace'))).status, 401);
});

test('la sesión Google autorizada pasa y conserva la cookie renovada', async () => {
  configure(); user = validUser(); refresh = true;
  const response = await proxy(request('/'));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /test-session=new-token/);
});
