import test from "node:test";
import assert from "node:assert/strict";
import {
  documentKey,
  pageStatus,
  summarizeImports,
} from "../lib/import-status.mjs";
const p = (id, status, documentId = "a") => ({
  id,
  documentId,
  filename: "libro.pdf",
  page: 1,
  status,
});
test("un archivo nuevo está pendiente y otro con páginas tratadas está en revisión", () => {
  const result = summarizeImports([p("1", "pending"), p("2", "reviewed")]);
  assert.equal(result[0].status, "reviewing");
  assert.equal(result[0].pending, 1);
  assert.equal(result[0].reviewed, 1);
  assert.equal(result[0].complete, false);
});
test("se exige aprobación explícita una vez revisadas o descartadas todas las páginas", () => {
  const pages = [p("1", "reviewed"), p("2", "discarded")];
  assert.equal(summarizeImports(pages)[0].status, "ready");
  assert.equal(summarizeImports(pages, { a: true })[0].status, "approved");
});
test("una página reabierta impide considerar aprobado el archivo incluso si existe aprobación antigua", () => {
  assert.equal(
    summarizeImports([p("1", "reviewing")], { a: true })[0].status,
    "reviewing",
  );
});
test("importaciones distintas con mismo nombre no se mezclan", () => {
  assert.equal(
    summarizeImports([p("1", "pending", "a"), p("2", "pending", "b")]).length,
    2,
  );
});
test("borradores antiguos sin estado se agrupan por nombre sin marcarlos revisados", () => {
  const old = { id: "old", filename: "antiguo.pdf", page: 2 };
  assert.equal(pageStatus(old), "pending");
  assert.equal(documentKey(old), "legacy:antiguo.pdf");
  assert.equal(summarizeImports([old])[0].status, "pending");
});
