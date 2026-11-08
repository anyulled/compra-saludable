import test from "node:test";
import assert from "node:assert/strict";
import { isConventionalCommitHeader } from "../scripts/check-conventional-commit.mjs";
import { calculateCrap, listFunctions, matchCoverage } from "../scripts/crap-metrics.mjs";

test("Conventional Commit hook accepts valid headers", () => {
  assert.equal(isConventionalCommitHeader("feat: add grocery list"), true);
  assert.equal(isConventionalCommitHeader("fix(auth): reject expired session"), true);
  assert.equal(isConventionalCommitHeader("feat(api)!: change response shape"), true);
});

test("Conventional Commit hook rejects malformed headers", () => {
  assert.equal(isConventionalCommitHeader("Add grocery list"), false);
  assert.equal(isConventionalCommitHeader("feat: "), false);
  assert.equal(isConventionalCommitHeader("Feat: uppercase type"), false);
});

test("CRAP formula uses cyclomatic complexity and function coverage", () => {
  assert.equal(calculateCrap(4, 0), 20);
  assert.equal(calculateCrap(4, 1), 4);
  assert.equal(calculateCrap(4, 0.5), 6);
});

test("complexity scanner scores branches and isolates nested functions", () => {
  const [outer, inner] = listFunctions(
    "function outer(value) { if (value && value.ready) { return () => value ? 1 : 0; } return 0; }",
    "fixture.ts",
  );
  assert.equal(outer.complexity, 3);
  assert.equal(inner.complexity, 2);
});

test("coverage matcher marks functions without a coverage location uncovered", () => {
  const functions = [{ name: "work", line: 3, column: 2, complexity: 4 }];
  const [matched] = matchCoverage(functions, [
    { name: "work", loc: { start: { line: 3, column: 2 } }, count: 0 },
  ]);
  assert.equal(matched.coverage, 0);
  assert.equal(matched.crap, 20);
  assert.equal(matched.coverageMatched, true);
});

test("coverage matcher falls back to executable statement coverage", () => {
  const [fn] = listFunctions(
    "function work(value) {\n  if (value) {\n    return 1;\n  }\n  return 0;\n}",
    "fixture.ts",
  );
  const [matched] = matchCoverage(
    [fn],
    [],
    [
      { start: { line: 2, column: 2 }, count: 1 },
      { start: { line: 3, column: 4 }, count: 0 },
      { start: { line: 5, column: 2 }, count: 0 },
    ],
  );
  assert.equal(matched.coverage, 1 / 3);
  assert.equal(matched.coverageMatched, false);
});
