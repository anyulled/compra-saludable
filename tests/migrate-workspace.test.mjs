import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const household = '2d3a3934-5165-4dbc-845f-41b58bfe191e';
const users = ['845a5265-9279-4ae6-af20-10f4dd43b874', '90649d87-3a47-4d51-a2d6-b9186fb1129f'];
const script = fileURLToPath(new URL('../scripts/migrate-sqlite-to-supabase.mjs', import.meta.url));
const pdf = Buffer.from('%PDF-1.7\ncontenido sintético de documento\n%%EOF');

function fixture({ badHash = false, conflictingPath = false, filename = 'receta.pdf', documentId = 'doc1', fileBytes = pdf, largeState = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'mesa-migrate-'));
  const path = join(directory, 'source.sqlite');
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE workspace (id INTEGER PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE documents (id TEXT PRIMARY KEY, filename TEXT, sha256 TEXT, bytes BLOB)');
  const state = {
    profiles: [{ name: 'A' }, { name: 'B' }], products: [], recipes: [], plan: [], shopping: [], confirmed: false,
    drafts: [
      { id: 'draft1', filename: 'receta.pdf', page: 1, text: 'receta', documentId: 'old-doc', storedDocumentId: 'doc1', ...(conflictingPath ? { documentPath: 'otro/hogar.pdf' } : {}) },
      { id: 'draft2', filename: 'sin-original.pdf', page: 1, text: 'otro', documentId: 'missing' },
    ],
  };
  if (largeState) state.drafts[0].text = 'x'.repeat(3 * 1024 * 1024);
  db.prepare('INSERT INTO workspace(id,payload) VALUES (1,?)').run(JSON.stringify(state));
  db.prepare('INSERT INTO documents(id,filename,sha256,bytes) VALUES (?,?,?,?)').run(documentId, filename, badHash ? '0'.repeat(64) : createHash('sha256').update(fileBytes).digest('hex'), fileBytes);
  db.close();
  return { directory, path, state };
}

function startApi(initialState = null, initialPdf = null) {
  let workspace = initialState;
  let writeCount = 0;
  let uploaded = initialPdf;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/rest/v1/household_workspaces' && req.method === 'GET') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(workspace ? [workspace] : []));
    } else if (pathname === '/rest/v1/household_workspaces' && req.method === 'POST') {
      writeCount++; workspace ??= JSON.parse(body.toString()); res.statusCode = 204; res.end();
    } else if (['/rest/v1/households', '/rest/v1/household_members'].includes(pathname) && req.method === 'POST') {
      writeCount++; res.statusCode = 204; res.end();
    } else if (pathname.startsWith('/storage/v1/object/household-documents/') && req.method === 'GET') {
      if (!uploaded) { res.statusCode = 404; res.end(); }
      else res.end(uploaded);
    } else if (pathname.startsWith('/storage/v1/object/household-documents/') && req.method === 'POST') {
      writeCount++; uploaded = body; res.statusCode = 200; res.end('{}');
    } else { res.statusCode = 404; res.end(); }
  });
  return { server, snapshot: () => ({ workspace, writeCount, uploaded }) };
}

async function launch(path, baseUrl, args = [], overrides = {}) {
  const env = {
    ...process.env,
    MESA_LEGACY_DB_PATH: path,
    MESA_HOUSEHOLD_ID: household,
    MESA_HOUSEHOLD_MEMBER_IDS: users.join(','),
    SUPABASE_URL: baseUrl,
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-key',
    ...overrides,
  };
  delete env.NODE_TEST_CONTEXT;
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [script, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    proc.stdout.on('data', chunk => { out += chunk; });
    proc.stderr.on('data', chunk => { err += chunk; });
    proc.on('error', reject);
    proc.on('close', code => resolve({ code, out, err }));
  });
}

async function listening(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

test('dry run valida PDF y enlaces sin escribir en origen ni destino', async () => {
  const file = fixture(); const api = startApi();
  try {
    const url = await listening(api.server);
    const result = await launch(file.path, url);
    assert.equal(result.code, 0, result.err);
    assert.match(result.out, /PDFs leídos y SHA-256 validado: 1/);
    assert.match(result.out, /storedDocumentId: 1/);
    assert.match(result.out, /documento no encontrado: 1/);
    assert.equal(api.snapshot().writeCount, 0);
    const db = new DatabaseSync(file.path, { readOnly: true });
    const source = JSON.parse(db.prepare('SELECT payload FROM workspace WHERE id=1').get().payload); db.close();
    assert.equal(source.drafts[0].documentPath, undefined);
  } finally { await new Promise(resolve => api.server.close(resolve)); rmSync(file.directory, { recursive: true, force: true }); }
});

test('importa workspace y PDF, verifica bytes y admite repetir sin duplicados', async () => {
  const file = fixture(); const api = startApi();
  try {
    const url = await listening(api.server);
    let result = await launch(file.path, url, ['--apply']);
    assert.equal(result.code, 0, result.err);
    assert.match(result.out, /PDF migrados y verificados por SHA-256: 1/);
    assert.equal(api.snapshot().workspace.payload.drafts[0].documentPath, `${household}/doc1.pdf`);
    assert.equal(api.snapshot().workspace.payload.drafts[1].documentPath, undefined);
    assert.deepEqual(api.snapshot().uploaded, pdf);
    const writesAfterFirst = api.snapshot().writeCount;
    result = await launch(file.path, url, ['--apply']);
    assert.equal(result.code, 0, result.err);
    assert.match(result.out, /destino ya coincide/);
    assert.equal(api.snapshot().writeCount, writesAfterFirst + 2, 'solo se repiten operaciones idempotentes de hogar y miembros');
  } finally { await new Promise(resolve => api.server.close(resolve)); rmSync(file.directory, { recursive: true, force: true }); }
});

test('rechaza diferencias remotas sin escribir y detecta PDF corrupto o rutas en conflicto', async () => {
  const file = fixture(); const api = startApi({ revision: 1, payload: { different: true } });
  try {
    const url = await listening(api.server);
    const result = await launch(file.path, url, ['--apply']);
    assert.notEqual(result.code, 0);
    assert.match(result.err, /datos distintos/);
    assert.equal(api.snapshot().writeCount, 0);
  } finally { await new Promise(resolve => api.server.close(resolve)); rmSync(file.directory, { recursive: true, force: true }); }

  for (const options of [{ badHash: true }, { conflictingPath: true }]) {
    const invalid = fixture(options);
    try {
      const result = await launch(invalid.path, 'http://127.0.0.1:9');
      assert.notEqual(result.code, 0);
      assert.match(result.err, options.badHash ? /SHA-256/ : /ruta documental distinta/);
    } finally { rmSync(invalid.directory, { recursive: true, force: true }); }
  }
});

test('la colisión de un PDF remoto aborta antes de escribir hogar, miembros o workspace', async () => {
  const file = fixture(); const api = startApi(null, Buffer.from('%PDF-1.7\ncontenido diferente'));
  try {
    const url = await listening(api.server);
    const result = await launch(file.path, url, ['--apply']);
    assert.notEqual(result.code, 0);
    assert.match(result.err, /contenido distinto/);
    assert.equal(api.snapshot().writeCount, 0);
    assert.equal(api.snapshot().workspace, null);
  } finally { await new Promise(resolve => api.server.close(resolve)); rmSync(file.directory, { recursive: true, force: true }); }
});

test('valida identificadores, tipos, tamaño del espacio y configuración antes de migrar', async () => {
  for (const [options, expected] of [
    [{ filename: 'imagen.png' }, /identificado como PDF/],
    [{ documentId: '../escape' }, /identificador no válido/],
    [{ fileBytes: Buffer.from('no es PDF') }, /cabecera PDF/],
    [{ fileBytes: Buffer.alloc(0) }, /vacío/],
    [{ largeState: true }, /límite de 3 MiB/],
  ]) {
    const invalid = fixture(options);
    try {
      const result = await launch(invalid.path, 'http://127.0.0.1:9');
      assert.notEqual(result.code, 0);
      assert.match(result.err, expected);
    } finally { rmSync(invalid.directory, { recursive: true, force: true }); }
  }
  const valid = fixture();
  try {
    let result = await launch(valid.path, 'http://127.0.0.1:9', [], { MESA_HOUSEHOLD_ID: 'bad-uuid' });
    assert.notEqual(result.code, 0);
    assert.match(result.err, /MESA_HOUSEHOLD_ID válido/);
    result = await launch(valid.path, 'http://127.0.0.1:9', ['--apply'], { SUPABASE_SERVICE_ROLE_KEY: '' });
    assert.notEqual(result.code, 0);
    assert.match(result.err, /SUPABASE_SERVICE_ROLE_KEY/);
  } finally { rmSync(valid.directory, { recursive: true, force: true }); }
});
