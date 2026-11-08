// Suggestions only: the original text remains authoritative for manual review.
const labels = {
  calories: "calor[ií]as",
  protein: "prote[ií]nas",
  carbs: "carbohidratos",
  fat: "grasas",
};
export function extractRecipe(text) {
  const lines = String(text || "")
    .replaceAll("\r", "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const content = lines.join("\n");
  const titleLine = findTitleLine(lines);
  const { nutrition, ambiguous } = extractNutrition(content);
  const firstStep = lines.findIndex(isNumberedStep);
  const ingredients = extractIngredients(lines, titleLine, firstStep);
  const preparation = extractPreparation(lines, firstStep);
  const per100 = mentionsPerHundred(content);
  return {
    title: titleLine || "",
    ingredients,
    preparation,
    nutrition,
    ambiguous,
    per100,
  };
}

function isTitleLine(line) {
  return line.length >= 5 && line.length <= 120 && /[A-ZÁÉÍÓÚÑ]/.test(line) &&
    line === line.toLocaleUpperCase("es") &&
    !/^(RECETAS|SIGLO|INGREDIENTES|PASO|INFORMACI[ÓO]N|ÍNDICE|INDICE|CONSEJOS|ADVERTENCIA)/i.test(line);
}

function findTitleLine(lines) {
  return lines.find(isTitleLine);
}

function nutritionMatches(content, key, label) {
  const pattern = new RegExp(
    `\\b(?:${label})\\s*[:：]\\s*(\\d+(?:[.,]\\d+)?)\\s*(kcal|g)\\b`,
    "giu",
  );
  const matches = [...content.matchAll(pattern)];
  const expected = key === "calories" ? "kcal" : "g";
  if (matches.length === 1 && matches[0][2].toLowerCase() === expected) {
    return { value: Number(matches[0][1].replace(",", ".")), ambiguous: false };
  }
  return { value: undefined, ambiguous: matches.length > 1 };
}

function extractNutrition(content) {
  /** @type {Partial<Record<"calories"|"protein"|"carbs"|"fat", number>>} */
  const nutrition = {};
  const ambiguous = [];
  for (const [key, label] of /** @type {["calories"|"protein"|"carbs"|"fat", string][]} */ (Object.entries(labels))) {
    const result = nutritionMatches(content, key, label);
    if (result.value !== undefined) nutrition[key] = result.value;
    if (result.ambiguous) ambiguous.push(key);
  }
  return { nutrition, ambiguous };
}

function isNumberedStep(line) {
  return /^\d{1,2}[.)]\s*[^\d]/.test(line);
}

function isIngredientLine(line) {
  return /\d|½|¼|¾|⅓|⅔/.test(line) &&
    !/^(RECETAS|SIGLO|P[ÁA]GINA|INFORMACI[ÓO]N)/i.test(line) &&
    !/kcal/i.test(line);
}

/** @param {string[]} lines */
function extractIngredients(lines, titleLine, firstStep) {
  if (firstStep < 0) return [];
  const start = titleLine ? lines.indexOf(titleLine) + 1 : 0;
  return lines.slice(start, firstStep).filter(isIngredientLine);
}

function isPreparationEnd(line) {
  return /^(INFORMACI[ÓO]N NUTRICIONAL|CONSEJOS|ADVERTENCIA|INGREDIENTES PASO)/i.test(line);
}

function extractPreparation(lines, firstStep) {
  if (firstStep < 0) return "";
  const stepEnd = lines.findIndex((line, index) => index > firstStep && isPreparationEnd(line));
  return lines.slice(firstStep, stepEnd < 0 ? lines.length : stepEnd).join("\n");
}

function mentionsPerHundred(content) {
  return /por\s+100\s*(?:g|ml)\b|\b100\s*(?:g|ml)\s+de\s+producto/i.test(content);
}
