import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('los clientes Supabase usan solo las claves públicas y respetan el contexto de cookies', () => {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const file = fileURLToPath(new URL('./helpers/supabase-client-cases.mjs', import.meta.url));
  const result = spawnSync(process.execPath, ['--experimental-test-module-mocks', '--import=tsx', '--test', file], {
    cwd: process.cwd(), env, encoding: 'utf8', timeout: 30000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /tests 4/);
});
