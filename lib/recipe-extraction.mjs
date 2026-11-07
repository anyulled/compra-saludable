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
  const titleLine = lines.find(
    (line) =>
      line.length >= 5 &&
      line.length <= 120 &&
      /[A-ZÁÉÍÓÚÑ]/.test(line) &&
      line === line.toLocaleUpperCase("es") &&
      !/^(RECETAS|SIGLO|INGREDIENTES|PASO|INFORMACI[ÓO]N|ÍNDICE|INDICE|CONSEJOS|ADVERTENCIA)/i.test(
        line,
      ),
  );
  /** @type {Partial<Record<"calories"|"protein"|"carbs"|"fat", number>>} */
  const nutrition = {};
  const ambiguous = [];
  for (const [
    key,
    label,
  ] of /** @type {["calories"|"protein"|"carbs"|"fat", string][]} */ (
    Object.entries(labels)
  )) {
    const pattern = new RegExp(
      `\\b(?:${label})\\s*[:：]\\s*(\\d+(?:[.,]\\d+)?)\\s*(kcal|g)\\b`,
      "giu",
    );
    const matches = [...content.matchAll(pattern)];
    const expected = key === "calories" ? "kcal" : "g";
    if (matches.length === 1 && matches[0][2].toLowerCase() === expected)
      nutrition[key] = Number(matches[0][1].replace(",", "."));
    else if (matches.length > 1) ambiguous.push(key);
  }
  const firstStep = lines.findIndex((line) =>
    /^\d{1,2}[.)]\s*[^\d]/.test(line),
  );
  const start = titleLine ? lines.indexOf(titleLine) + 1 : 0;
  const before = firstStep >= 0 ? lines.slice(start, firstStep) : [];
  const ingredients = before.filter(
    (line) =>
      /\d|½|¼|¾|⅓|⅔/.test(line) &&
      !/^(RECETAS|SIGLO|P[ÁA]GINA|INFORMACI[ÓO]N)/i.test(line) &&
      !/kcal/i.test(line),
  );
  const stepEnd =
    firstStep < 0
      ? -1
      : lines.findIndex(
          (line, i) =>
            i > firstStep &&
            /^(INFORMACI[ÓO]N NUTRICIONAL|CONSEJOS|ADVERTENCIA|INGREDIENTES PASO)/i.test(
              line,
            ),
        );
  const preparation =
    firstStep < 0
      ? ""
      : lines.slice(firstStep, stepEnd < 0 ? lines.length : stepEnd).join("\n");
  const per100 =
    /por\s+100\s*(?:g|ml)\b|\b100\s*(?:g|ml)\s+de\s+producto/i.test(content);
  return {
    title: titleLine || "",
    ingredients,
    preparation,
    nutrition,
    ambiguous,
    per100,
  };
}
