import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('el proxy protege páginas y API con sesiones Google autorizadas', () => {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const file = fileURLToPath(new URL('./helpers/proxy-cases.mjs', import.meta.url));
  const result = spawnSync(process.execPath, ['--experimental-test-module-mocks', '--import=tsx', '--test', file], {
    cwd: process.cwd(), env, encoding: 'utf8', timeout: 30000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /tests 3/);
});
