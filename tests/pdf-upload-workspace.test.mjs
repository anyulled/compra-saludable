import test from "node:test";
import assert from "node:assert/strict";
import { appendPdfDraftsAfterUpload } from "../lib/pdf-workspace.mjs";

test("a delayed PDF upload appends to the latest saved workspace state", async () => {
  let currentWorkspace = { recipes: [], drafts: [] };
  let finishUpload;
  const delayedUpload = new Promise((resolve) => {
    finishUpload = resolve;
  });
  const draft = { id: "draft-1", documentId: "doc-1", text: "page" };

  const commit = appendPdfDraftsAfterUpload({
    upload: () => delayedUpload,
    getLatestWorkspace: () => currentWorkspace,
    drafts: [draft],
  });

  currentWorkspace = {
    ...currentWorkspace,
    recipes: [{ id: "recipe-edited-during-upload" }],
  };
  finishUpload();

  const next = await commit;
  assert.deepEqual(next.recipes, [{ id: "recipe-edited-during-upload" }]);
  assert.deepEqual(next.drafts, [draft]);
});
