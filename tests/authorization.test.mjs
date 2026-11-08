import test from 'node:test';
import assert from 'node:assert/strict';
import { hasAuthorizedEmails, isAuthConfigured, isAuthorizedEmail, isAuthorizedGoogleUser } from '../lib/supabase/authorization.ts';

const keys = ['AUTHORIZED_EMAILS', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
test.after(() => { for (const key of keys) original[key] === undefined ? delete process.env[key] : process.env[key] = original[key]; });

const googleUser = () => ({
  email: 'one@example.test', email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: 'google', providers: ['google'] },
  identities: [{ provider: 'google' }],
});

test('se exige una lista de exactamente dos correos diferentes', () => {
  for (const value of ['', 'one@example.test', 'one@example.test,ONE@example.test', 'a@x.test,b@x.test,c@x.test']) {
    process.env.AUTHORIZED_EMAILS = value;
    assert.equal(hasAuthorizedEmails(), false);
    assert.equal(isAuthorizedEmail('one@example.test'), false);
  }
  process.env.AUTHORIZED_EMAILS = ' ONE@example.test , two@example.test ';
  assert.equal(hasAuthorizedEmails(), true);
  assert.equal(isAuthorizedEmail('one@example.test'), true);
  assert.equal(isAuthorizedEmail('TWO@example.test'), true);
  assert.equal(isAuthorizedEmail('third@example.test'), false);
});

test('la configuración exige URL, clave pública y lista válida', () => {
  process.env.AUTHORIZED_EMAILS = 'one@example.test,two@example.test';
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'public-test-key';
  assert.equal(isAuthConfigured(), false);
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.test';
  assert.equal(isAuthConfigured(), true);
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  assert.equal(isAuthConfigured(), false);
});

test('solo acepta cuentas permitidas, verificadas y autenticadas exclusivamente con Google', () => {
  process.env.AUTHORIZED_EMAILS = 'one@example.test,two@example.test';
  assert.equal(isAuthorizedGoogleUser(googleUser()), true);
  const unknown = googleUser(); unknown.email = 'third@example.test';
  const unconfirmed = googleUser(); unconfirmed.email_confirmed_at = null;
  const mixed = googleUser(); mixed.app_metadata.providers.push('email');
  const missingIdentity = googleUser(); missingIdentity.identities = [];
  const wrongProvider = googleUser(); wrongProvider.app_metadata.provider = 'email';
  for (const user of [null, undefined, unknown, unconfirmed, mixed, missingIdentity, wrongProvider]) {
    assert.equal(isAuthorizedGoogleUser(user), false);
  }
});
