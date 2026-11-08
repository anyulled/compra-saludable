import { parse } from "@babel/parser";

const decisionTypes = new Set([
  "IfStatement",
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
  "CatchClause",
  "ConditionalExpression",
]);

const functionTypes = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ClassMethod",
  "ClassPrivateMethod",
  "ObjectMethod",
]);

function childNodes(node) {
  const children = [];
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      children.push(...value.filter((item) => item && typeof item.type === "string"));
    } else if (value && typeof value.type === "string") {
      children.push(value);
    }
  }
  return children;
}

function countDecisions(node) {
  let decisions = 0;

  function visit(current, root) {
    if (!root && functionTypes.has(current.type)) return;
    if (decisionTypes.has(current.type)) decisions += 1;
    if (current.type === "SwitchCase" && current.test !== null) decisions += 1;
    if (current.type === "LogicalExpression") decisions += 1;
    for (const child of childNodes(current)) visit(child, false);
  }

  visit(node, true);
  return decisions;
}

function nodeLabel(node, source) {
  if (node.id?.name) return node.id.name;
  if (node.key) {
    const key = node.key.name ?? node.key.value;
    if (key !== undefined) {
      if (node.kind === "get" || node.kind === "set") return `${node.kind} ${key}`;
      return String(key);
    }
  }
  if (node.type === "ClassMethod" && node.kind === "constructor") return "constructor";
  const firstLine = source.slice(node.start, node.body?.start ?? node.end).split(/\r?\n/, 1)[0];
  return firstLine.trim().slice(0, 60) || "<anonymous>";
}

export function listFunctions(source, fileName) {
  const ast = parse(source, {
    sourceType: "unambiguous",
    sourceFilename: fileName,
    plugins: ["typescript", "jsx", "decorators-legacy"],
  });
  const functions = [];

  function visit(node) {
    if (functionTypes.has(node.type) && node.body && node.loc) {
      const complexity = 1 + countDecisions(node.body);
      functions.push({
        name: nodeLabel(node, source),
        line: node.loc.start.line,
        column: node.loc.start.column,
        bodyStart: node.body.loc.start,
        bodyEnd: node.body.loc.end,
        nestedRanges: [],
        complexity,
      });
    }
    for (const child of childNodes(node)) visit(child);
  }

  visit(ast.program);
  for (const fn of functions) {
    fn.nestedRanges = functions
      .filter(
        (candidate) =>
          candidate !== fn &&
          (candidate.line > fn.bodyStart.line ||
            (candidate.line === fn.bodyStart.line && candidate.column >= fn.bodyStart.column)) &&
          (candidate.line < fn.bodyEnd.line ||
            (candidate.line === fn.bodyEnd.line && candidate.column <= fn.bodyEnd.column)),
      )
      .map((candidate) => ({
        start: { line: candidate.line, column: candidate.column },
        end: candidate.bodyEnd,
      }));
  }
  return functions;
}

export function calculateCrap(complexity, coverageRatio) {
  return complexity ** 2 * (1 - coverageRatio) ** 3 + complexity;
}

function atOrAfter(point, boundary) {
  return (
    point.line > boundary.line ||
    (point.line === boundary.line && point.column >= boundary.column)
  );
}

function beforeOrAt(point, boundary) {
  return (
    point.line < boundary.line ||
    (point.line === boundary.line && point.column <= boundary.column)
  );
}

export function matchCoverage(functions, coverageFunctions, statementCoverage = []) {
  return functions.map((fn) => {
    const candidates = coverageFunctions
      .map((coverageFn) => ({
        coverageFn,
        distance:
          Math.abs(coverageFn.loc.start.line - fn.line) * 10_000 +
          Math.abs(coverageFn.loc.start.column - fn.column),
      }))
      .filter(({ coverageFn }) => coverageFn.loc.start.line === fn.line)
      .sort((a, b) => a.distance - b.distance);
    const match = candidates[0]?.coverageFn;
    const functionCoverage = match
      ? match.count > 0
        ? 1
        : 0
      : null;
    const bodyStatements = match
      ? []
      : statementCoverage.filter(({ start }) => {
          if (
            !fn.bodyStart ||
            !fn.bodyEnd ||
            !atOrAfter(start, fn.bodyStart) ||
            !beforeOrAt(start, fn.bodyEnd)
          ) {
            return false;
          }
          return !(fn.nestedRanges ?? []).some(
            (range) => atOrAfter(start, range.start) && beforeOrAt(start, range.end),
          );
        });
    const coverage =
      functionCoverage ??
      (bodyStatements.length
        ? bodyStatements.filter((statement) => statement.count > 0).length / bodyStatements.length
        : 0);

    return {
      ...fn,
      coverage,
      crap: calculateCrap(fn.complexity, coverage),
      coverageMatched: Boolean(match),
    };
  });
}
