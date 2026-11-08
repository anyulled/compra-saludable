import test from "node:test";
import assert from "node:assert/strict";
import { runWithConcurrency } from "../lib/pdf-batch.mjs";

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
