import test from "node:test";
import assert from "node:assert/strict";
import { pdfImportBlockMessage, runWithConcurrency } from "../lib/pdf-batch.mjs";
import { persistSuccessfulPdfBatch } from "../lib/pdf-upload-workflow.ts";

test("procesa varios ficheros en paralelo con límite y conserva el orden", async () => {
  const files = ["a", "b", "c", "d"];
  let active = 0;
  let peak = 0;
  const results = await runWithConcurrency(files, 2, async (file) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, file === "a" ? 15 : 2));
    active -= 1;
    if (file === "c") throw Error("bad pdf");
    return file.toUpperCase();
  });
  assert.equal(peak, 2);
  assert.deepEqual(results.map((result) => result.status), ["fulfilled", "fulfilled", "rejected", "fulfilled"]);
  assert.deepEqual(results.filter((result) => result.status === "fulfilled").map((result) => result.value), ["A", "B", "D"]);
  assert.match(results[2].reason.message, /bad pdf/);
});

test("bloquea lotes excesivos o un espacio que todavía no está listo", () => {
  assert.match(pdfImportBlockMessage(11, "ready"), /máximo 10/);
  assert.match(pdfImportBlockMessage(1, "loading"), /espacio compartido/);
  assert.equal(pdfImportBlockMessage(10, "ready"), null);
});

test("guarda los PDF procesados y comunica errores de persistencia por trabajo", async () => {
  const file = new File(["%PDF-1.4"], "A.pdf", { type: "application/pdf" });
  const item = { file, filename: "A.pdf", drafts: [{ id: "draft-1", filename: "A.pdf", page: 1, text: "", documentId: "doc-1" }], documentPath: "house/doc-1.pdf", pages: 1 };
  const statuses = [];
  const state = { profiles: [], products: [], recipes: [], plan: [], shopping: [], confirmed: false, drafts: [] };
  const common = { successful: [item], files: [file], updateJob: (index, patch) => statuses.push([index, patch.status]), setImportProgress: () => {}, setPersistingUpload: (value) => statuses.push(["persisting", value]), getLatestWorkspace: () => state, persist: async (next) => { assert.equal(next.drafts.length, 1); } };
  const storage = { upload: async () => ({ error: null }), remove: async () => ({ error: null }) };
  assert.equal(await persistSuccessfulPdfBatch({ ...common, storage }), null);
  assert.deepEqual(statuses.map((entry) => entry[1]), ["saving", true, "done", false]);
  statuses.length = 0;
  const failure = await persistSuccessfulPdfBatch({ ...common, storage: { ...storage, upload: async () => ({ error: new Error("offline") }) } });
  assert.match(failure, /No se pudo guardar el PDF original/);
  assert.deepEqual(statuses.map((entry) => entry[1]), ["saving", true, "error", false]);
  assert.equal(await persistSuccessfulPdfBatch({ ...common, successful: [], storage }), null);
});
