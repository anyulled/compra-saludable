import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { MAX_WORKSPACE_BYTES } from "../lib/workspace-limits.mjs";

const sourcePathValue = process.env.MESA_LEGACY_DB_PATH;
if (!sourcePathValue) {
  throw new Error("Configura MESA_LEGACY_DB_PATH con la ruta de la SQLite de origen.");
}
const sourcePath = resolve(sourcePathValue);
const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let householdId = "";
const memberIds = (process.env.MESA_HOUSEHOLD_MEMBER_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);
const apply = process.argv.includes("--apply");

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function readLegacyState(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const row = db.prepare("select payload from workspace where id = 1").get();
    if (!row) throw new Error("La base de origen no contiene el espacio de trabajo.");
    const state = JSON.parse(row.payload);
    if (!state || !Array.isArray(state.recipes)) throw new Error("El estado de origen no es válido.");
    const hasDocuments = db.prepare(
      "select 1 from sqlite_master where type = 'table' and name = 'documents'",
    ).get();
    if (!hasDocuments) return { state, documents: [] };
    const columns = new Set(db.prepare("pragma table_info(documents)").all().map((column) => column.name));
    for (const required of ["id", "filename", "sha256", "bytes"]) {
      if (!columns.has(required)) throw new Error("La tabla de documentos de origen no tiene el esquema esperado.");
    }
    const documents = db.prepare("select id, filename, sha256, bytes from documents order by id").all()
      .map(validateLegacyDocument);
    return { state, documents };
  } finally {
    db.close();
  }
}

function validateLegacyDocument(row) {
  if (typeof row.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(row.id)) {
    throw new Error("Un documento de origen tiene un identificador no válido.");
  }
  if (typeof row.filename !== "string" || !row.filename.toLowerCase().endsWith(".pdf")) {
    throw new Error("Un documento de origen no está identificado como PDF.");
  }
  const bytes = Buffer.from(row.bytes);
  if (bytes.length === 0 || bytes.length > 20 * 1024 * 1024) {
    throw new Error("Un PDF de origen está vacío o supera el límite privado de 20 MiB.");
  }
  if (!bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"))) {
    throw new Error("Un documento de origen no contiene una cabecera PDF válida.");
  }
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (typeof row.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(row.sha256) || actualHash !== row.sha256.toLowerCase()) {
    throw new Error("El SHA-256 de un PDF de origen no coincide con sus bytes.");
  }
  return { id: row.id, sha256: actualHash, bytes };
}

function attachPrivateDocumentPaths(state, documents, verifyExistingPath = true) {
  const documentsById = new Map(documents.map((doc) => [doc.id, doc]));
  let linkedDraftCount = 0;
  let linkedViaStoredDocumentIdCount = 0;
  let linkedViaDocumentIdCount = 0;
  let unmatchedDraftCount = 0;
  const drafts = Array.isArray(state.drafts)
    ? state.drafts.map((draft) => {
        const effectiveDocumentId = draft?.storedDocumentId || draft?.documentId;
        if (!effectiveDocumentId) return draft;
        const document = documentsById.get(effectiveDocumentId);
        if (!document) {
          unmatchedDraftCount += 1;
          return draft;
        }
        const expectedPath = `${householdId}/${document.id}.pdf`;
        if (verifyExistingPath && draft.documentPath && draft.documentPath !== expectedPath) {
          throw new Error("Un borrador ya tiene una ruta documental distinta; no se modificó.");
        }
        linkedDraftCount += 1;
        if (draft.storedDocumentId) linkedViaStoredDocumentIdCount += 1;
        else linkedViaDocumentIdCount += 1;
        return { ...draft, documentPath: expectedPath };
      })
    : state.drafts;
  return {
    state: Array.isArray(state.drafts) ? { ...state, drafts } : state,
    linkedDraftCount,
    linkedViaStoredDocumentIdCount,
    linkedViaDocumentIdCount,
    unmatchedDraftCount,
  };
}

async function request(path, { method = "GET", body, prefer } = {}) {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
      ...(prefer ? { prefer } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed.code) message += ` (${parsed.code})`;
      if (parsed.message) message += `: ${parsed.message}`;
    } catch {}
    throw new Error(`Supabase ${path}: ${message}`);
  }
  return text ? JSON.parse(text) : null;
}

async function resolveHouseholdId() {
  if (!apply) return randomUUID();
  if (!baseUrl || !serviceKey || memberIds.length === 0) {
    throw new Error("Configura SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y MESA_HOUSEHOLD_MEMBER_IDS.");
  }
  if (memberIds.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
    throw new Error("Cada miembro del hogar debe tener un UUID válido.");
  }
  const memberFilter = encodeURIComponent(`in.(${memberIds.join(",")})`);
  const memberships = await request(`household_members?select=household_id&user_id=${memberFilter}`);
  const existingHouseholds = [...new Set(memberships.map((row) => row.household_id))];
  if (existingHouseholds.length > 1) {
    throw new Error("Los miembros ya pertenecen a hogares distintos; no se creó ni modificó ningún hogar.");
  }
  return existingHouseholds[0] || randomUUID();
}

function privateDocumentPath(doc) {
  return `${householdId}/${encodeURIComponent(`${doc.id}.pdf`)}`;
}

async function fetchPrivateDocument(doc) {
  const path = privateDocumentPath(doc);
  const response = await fetch(
    `${baseUrl}/storage/v1/object/household-documents/${path}`,
    { headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` } },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`No se pudo comprobar un PDF privado (HTTP ${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return createHash("sha256").update(bytes).digest("hex");
}

async function uploadPrivateDocument(doc) {
  const path = privateDocumentPath(doc);
  const response = await fetch(
    `${baseUrl}/storage/v1/object/household-documents/${path}`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/pdf",
        "x-upsert": "false",
      },
      body: doc.bytes,
    },
  );
  if (!response.ok && response.status !== 409) {
    const existingHash = await fetchPrivateDocument(doc);
    if (existingHash === doc.sha256) return;
    if (existingHash) throw new Error("El objeto PDF cambió durante la subida y tiene contenido distinto.");
    throw new Error(`No se pudo subir un PDF privado (HTTP ${response.status}).`);
  }
}

async function preflightDocuments(documents) {
  const existingHashes = new Map();
  for (const doc of documents) {
    existingHashes.set(doc.id, await fetchPrivateDocument(doc));
  }
  for (const doc of documents) {
    const existingHash = existingHashes.get(doc.id);
    if (existingHash && existingHash !== doc.sha256) {
      throw new Error("Un objeto PDF ya existente tiene contenido distinto; no se sobrescribió nada.");
    }
  }
  return existingHashes;
}

async function uploadAndVerifyDocuments(documents, existingHashes) {
  for (const doc of documents) {
    if (existingHashes.get(doc.id) === null) await uploadPrivateDocument(doc);
  }
  let verifiedCount = 0;
  for (const doc of documents) {
    const actualHash = await fetchPrivateDocument(doc);
    if (actualHash !== doc.sha256) {
      throw new Error("La verificación del PDF remoto no coincide con el SHA-256 de origen.");
    }
    verifiedCount += 1;
  }
  if (verifiedCount !== documents.length) {
    throw new Error("La cantidad de PDFs verificados no coincide con el origen.");
  }
  console.log(`Documentos PDF migrados y verificados por SHA-256: ${verifiedCount}.`);
}

const { state: originalState, documents } = readLegacyState(sourcePath);
householdId = await resolveHouseholdId();
const {
  state,
  linkedDraftCount,
  linkedViaStoredDocumentIdCount,
  linkedViaDocumentIdCount,
  unmatchedDraftCount,
} = attachPrivateDocumentPaths(originalState, documents, apply);
if (new TextEncoder().encode(JSON.stringify(state)).byteLength > MAX_WORKSPACE_BYTES) {
  throw new Error("El workspace de origen supera el límite de 3 MiB; no se escribió nada y SQLite permanece intacta.");
}
const draftCount = Array.isArray(state.drafts) ? state.drafts.length : 0;
const approvedDocumentCount = state.approvedDocuments && typeof state.approvedDocuments === "object"
  ? Object.keys(state.approvedDocuments).length
  : 0;
console.log("SQLite de origen abierta correctamente.");
console.log(`Recetas: ${state.recipes.length}; perfiles: ${state.profiles?.length ?? 0}; productos: ${state.products?.length ?? 0}; páginas de importación: ${draftCount}; registros de aprobación de documentos: ${approvedDocumentCount}`);
const documentBytes = documents.reduce((sum, doc) => sum + doc.bytes.length, 0);
console.log(`PDFs leídos y SHA-256 validado: ${documents.length}; bytes totales: ${documentBytes}.`);
console.log(`Rutas privadas asociadas: ${linkedDraftCount} (storedDocumentId: ${linkedViaStoredDocumentIdCount}; documentId: ${linkedViaDocumentIdCount}); borradores con documento no encontrado: ${unmatchedDraftCount}.`);

if (!apply) {
  console.log("Simulación únicamente. Revisa el origen y configura miembros; usa --apply para escribir en Supabase.");
  process.exit(0);
}

// Check every existing object before any remote write. Upload and verify PDFs
// before bootstrapping membership/workspace, so a concurrent object conflict
// cannot leave database rows pointing at an unverified document.
const existingDocumentHashes = await preflightDocuments(documents);
const existingRows = await request(`household_workspaces?select=revision,payload&household_id=eq.${encodeURIComponent(householdId)}&limit=1`);
if (existingRows.length && canonical(existingRows[0].payload) !== canonical(state)) {
  throw new Error("Ya existe un espacio remoto con datos distintos; se cancela sin sobrescribirlo.");
}

await uploadAndVerifyDocuments(documents, existingDocumentHashes);

await request("households?on_conflict=id", {
  method: "POST",
  body: { id: householdId },
  prefer: "resolution=ignore-duplicates,return=minimal",
});
await request("household_members?on_conflict=household_id%2Cuser_id", {
  method: "POST",
  body: memberIds.map((user_id) => ({ household_id: householdId, user_id, role: "member" })),
  prefer: "resolution=merge-duplicates,return=minimal",
});

if (existingRows.length) {
  console.log(`Migración idempotente: el destino ya coincide (revisión ${existingRows[0].revision}); no se cambió.`);
} else {
  await request("household_workspaces?on_conflict=household_id", {
    method: "POST",
    body: { household_id: householdId, revision: 1, payload: state },
    prefer: "resolution=ignore-duplicates,return=minimal",
  });
  const afterRows = await request(`household_workspaces?select=revision,payload&household_id=eq.${encodeURIComponent(householdId)}&limit=1`);
  if (!afterRows.length || canonical(afterRows[0].payload) !== canonical(state)) {
    throw new Error("El destino cambió durante la migración; requiere revisión manual.");
  }
  console.log("Migración completada en revisión 1.");
}
