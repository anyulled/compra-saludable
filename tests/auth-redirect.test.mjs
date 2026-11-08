import test from "node:test";
import assert from "node:assert/strict";
import { safeNextUrl } from "../lib/supabase/redirect.mjs";

const origin = "https://mesa.example";

test("safeNextUrl keeps valid same-origin paths", () => {
  assert.equal(safeNextUrl("/", origin).href, `${origin}/`);
  assert.equal(safeNextUrl("/recetas?tab=library", origin).href, `${origin}/recetas?tab=library`);
});

test("safeNextUrl rejects external and malformed authority paths", () => {
  for (const value of [
    "https://evil.example",
    "//evil.example/path",
    "/\\evil.example/path",
    "\\\\evil.example/path",
  ]) {
    assert.equal(safeNextUrl(value, origin).href, `${origin}/`, value);
  }
});
