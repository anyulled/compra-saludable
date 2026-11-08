import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { listFunctions, matchCoverage } from "./crap-metrics.mjs";

const root = process.cwd();
const reportDirectory = await mkdtemp(join(tmpdir(), "mesa-crap-coverage-"));
const coverageFile = join(reportDirectory, "coverage-final.json");
const maxCrap = 10;
const includeOptions = [
  "--all",
  "--src=.",
  "--include=app/**",
  "--include=components/**",
  "--include=lib/**",
  "--include=proxy.ts",
  "--include=next.config.ts",
  "--extension=.mjs",
  "--extension=.cjs",
  "--extension=.ts",
  "--extension=.tsx",
  "--exclude=lib/types.ts",
  "--exclude=lib/storage/contract.ts",
  "--exclude=**/*.d.ts",
];

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

try {
  const testRun = spawnSync(
    resolve(root, "node_modules/.bin/c8"),
    [
      ...includeOptions,
      "--reporter=json",
      `--reports-dir=${reportDirectory}`,
      "tsx",
      "--experimental-test-module-mocks",
      "--test",
      ...(await readdir(join(root, "tests")))
        .filter((file) => file.endsWith(".test.mjs"))
        .map((file) => join("tests", file)),
    ],
    { cwd: root, stdio: "inherit" },
  );

  if (testRun.error) throw testRun.error;
  if (testRun.status !== 0) {
    fail(`Tests failed; CRAP metrics were not evaluated (exit ${testRun.status ?? 1}).`);
  } else {
    let coverageReport;
    try {
      coverageReport = JSON.parse(await readFile(coverageFile, "utf8"));
    } catch (error) {
      throw new Error(`Unable to read c8 JSON coverage report at ${coverageFile}.`, {
        cause: error,
      });
    }

    const metrics = [];
    let unmatched = 0;
    for (const [file, coverage] of Object.entries(coverageReport)) {
      if (!/\.(?:mjs|cjs|ts|tsx)$/.test(file)) continue;
      const source = await readFile(file, "utf8");
      const functions = listFunctions(source, file);
      const coverageFunctions = Object.values(coverage.fnMap ?? {}).map((entry, index) => ({
        ...entry,
        count: coverage.f?.[index] ?? 0,
      }));
      const statementCoverage = Object.entries(coverage.statementMap ?? {}).map(
        ([index, statement]) => ({
          start: statement.start,
          count: coverage.s?.[index] ?? 0,
        }),
      );
      const scored = matchCoverage(functions, coverageFunctions, statementCoverage);
      unmatched += scored.filter((fn) => !fn.coverageMatched).length;
      for (const fn of scored) metrics.push({ file, ...fn });
    }

    const failing = metrics.filter((fn) => fn.crap > maxCrap);
    const unmatchedPercent = metrics.length
      ? Math.round((unmatched / metrics.length) * 100)
      : 0;

    console.log(
      `CRAP analysis: ${metrics.length} functions across ${new Set(metrics.map((fn) => fn.file)).size} source files; ` +
        `standard CRAP formula = CC² × (1 − function coverage)³ + CC; threshold ${maxCrap}.`,
    );
    if (unmatched) {
      console.log(
        `Coverage mapping: ${unmatched} function(s) (${unmatchedPercent}%) used c8 statement line coverage because c8 did not report a function location. Coverage is covered executable statements / executable statements within each function body, excluding nested function bodies.`,
      );
    }
    console.log(`CRAP violations: ${failing.length}.`);

    if (failing.length) {
      for (const fn of failing.sort((a, b) => b.crap - a.crap)) {
        console.error(
          `CRAP ${fn.crap.toFixed(2)} (CC ${fn.complexity}, ${Math.round(fn.coverage * 100)}% function coverage): ${relative(root, fn.file)}:${fn.line} ${fn.name}`,
        );
      }
      fail(`CRAP threshold exceeded: ${failing.length} function(s) score above ${maxCrap}.`);
    }
  }
} finally {
  await rm(reportDirectory, { recursive: true, force: true });
}

