export const MEAL_TOKEN_TABLE = {
  Cena: ["cena", "cenas", "dinner", "noche", "nocturno", "nocturna"],
  Comida: ["comida", "comidas", "almuerzo", "almuerzos", "lunch", "mediodia"],
  Desayuno: ["desayuno", "desayunos", "breakfast", "manana", "matutino"],
  Tentempié: ["tentempie", "tentempies", "snack", "snacks", "merienda", "meriendas", "picoteo", "postre", "postres"],
};

export const NUMBER_WORD_TABLE = {
  twenty: "20",
  thirty: "30",
  forty: "40",
  fifty: "50",
  sixty: "60",
  seventy: "70",
  eighty: "80",
  ninety: "90",
};

export const SEASONING_KEYWORDS = [
  "sal",
  "pimienta",
  "oregano",
  "comino",
  "curcuma",
  "canela",
  "pimenton",
  "tomillo",
  "romero",
  "laurel",
  "eneldo",
  "perejil",
  "cilantro",
  "cebollino",
  "albahaca",
  "curry",
  "jengibre en polvo",
  "ajo en polvo",
  "cebolla en polvo",
  "nuez moscada",
  "cayena",
  "chile",
  "estevia",
  "stevia",
  "eritritol",
  "esencia de vainilla",
  "agua",
  "hielo",
  "brochetas",
  "palillos",
  "papel vegetal",
];

export const CORE_STAPLE_DEFAULTS = {
  aove: { amount: 10, unit: "ml", canonical: "aceite de oliva virgen extra" },
  aceite: { amount: 10, unit: "ml", canonical: "aceite de oliva" },
  vinagre: { amount: 10, unit: "ml" },
  "zumo de limon": { amount: 10, unit: "ml" },
  "jugo de limon": { amount: 10, unit: "ml" },
  lechuga: { amount: 50, unit: "g" },
  rucula: { amount: 50, unit: "g" },
  espinaca: { amount: 50, unit: "g" },
  espinacas: { amount: 50, unit: "g" },
  canonigos: { amount: 50, unit: "g" },
  kale: { amount: 50, unit: "g" },
  "mezcla de hojas": { amount: 50, unit: "g" },
  brotes: { amount: 50, unit: "g" },
  queso: { amount: 30, unit: "g" },
  mozzarella: { amount: 30, unit: "g" },
  parmesano: { amount: 30, unit: "g" },
  feta: { amount: 30, unit: "g" },
  semillas: { amount: 10, unit: "g" },
  sesamo: { amount: 10, unit: "g" },
  chia: { amount: 10, unit: "g" },
  lino: { amount: 10, unit: "g" },
  nueces: { amount: 10, unit: "g" },
  almendras: { amount: 10, unit: "g" },
  pinones: { amount: 10, unit: "g" },
  limon: { amount: 1, unit: "unidades" },
  lima: { amount: 1, unit: "unidades" },
  aguacate: { amount: 1, unit: "unidades" },
  tomate: { amount: 1, unit: "unidades" },
  cebolla: { amount: 1, unit: "unidades" },
  calabacin: { amount: 1, unit: "unidades" },
  pepino: { amount: 1, unit: "unidades" },
  pimiento: { amount: 1, unit: "unidades" },
  zanahoria: { amount: 1, unit: "unidades" },
  huevo: { amount: 1, unit: "unidades" },
};

export const STRIP_PREP_QUALIFIERS = [
  "picado",
  "picada",
  "picados",
  "picadas",
  "troceado",
  "troceada",
  "en rodajas",
  "en dados",
  "en juliana",
  "en tiras",
  "en laminas",
  "al vapor",
  "escurrido",
  "escurrida",
  "escurridos",
  "sin piel",
  "sin hueso",
  "al gusto",
];

const LIQUID_KEYWORDS = [
  "aceite",
  "aove",
  "vinagre",
  "salsa",
  "soja",
  "tamari",
  "zumo",
  "jugo",
  "leche",
  "caldo",
  "agua",
];

const LEAFY_KEYWORDS = ["espinaca", "rucula", "lechuga", "kale", "canonigos"];

const VULGAR_FRACTIONS = {
  "½": 0.5,
  "¼": 0.25,
  "¾": 0.75,
  "⅓": 0.33,
  "⅔": 0.67,
};

function normalizeTokens(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();
}

function findMatchingMealsInText(text) {
  const norm = normalizeTokens(text);
  const words = new Set(norm.split(/\s+/).filter(Boolean));
  const matched = [];
  for (const [meal, tokens] of Object.entries(MEAL_TOKEN_TABLE)) {
    if (tokens.some((token) => words.has(token))) {
      matched.push(/** @type {Meal} */ (meal));
    }
  }
  return matched;
}

function matchMealTier(text) {
  if (!text) return null;
  const matches = findMatchingMealsInText(text);
  if (matches.length === 1) return { meal: matches[0], confidence: "resolved" };
  if (matches.length > 1) return { meal: /** @type {Meal} */ ("Comida"), confidence: "ambiguous" };
  return null;
}

function cleanTierText(text) {
  return String(text || "")
    .replace(/¡\s*disfruta\s+de\s+estos\s+deliciosos\s+postres!?/gi, "")
    .replace(/advertencia[\s\S]*?(?=\n\n|$)/gi, "")
    .replace(/recetassigloxxi\.com|recetassaludablesdehoy\.com/gi, "");
}

/**
 * @param {{ filename?: string; initialPagesText?: string[] }} options
 * @returns {{ meal: Meal; mealSource: MealSource; mealConfidence: MealConfidence }}
 */
export function classifyDocumentMealType({ filename, initialPagesText = [] } = {}) {
  const fileTier = matchMealTier(cleanTierText(filename));
  if (fileTier) {
    return {
      meal: fileTier.meal,
      mealSource: "filename",
      mealConfidence: /** @type {MealConfidence} */ (fileTier.confidence),
    };
  }

  const initialHeadings = initialPagesText
    .slice(0, 3)
    .map(cleanTierText)
    .join("\n");
  const headerTier = matchMealTier(initialHeadings);
  if (headerTier) {
    return {
      meal: headerTier.meal,
      mealSource: "document_header",
      mealConfidence: /** @type {MealConfidence} */ (headerTier.confidence),
    };
  }

  return { meal: "Comida", mealSource: "default", mealConfidence: "default" };
}

function isLayoutArtifact(line) {
  const lower = line.toLowerCase().trim();
  if (lower === "recetas" || lower === "siglo xxi" || lower === "siglo") return true;
  if (lower.includes("recetassigloxxi.com") || lower.includes("recetassaludablesdehoy.com")) return true;
  if (lower.startsWith("¡disfruta de estos deliciosos postres")) return true;
  return false;
}

function stripPageNumbers(lines) {
  const result = [...lines];
  while (result.length > 0) {
    const last = result[result.length - 1];
    if (/^\d{1,4}$/.test(last.trim())) {
      result.pop();
    } else {
      break;
    }
  }
  return result;
}

/**
 * @param {string} rawText
 * @returns {string[]}
 */
export function preprocessPageLines(rawText) {
  const rawLines = String(rawText || "")
    .replaceAll("\r", "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const filtered = [];
  let inDisclaimer = false;

  for (const line of rawLines) {
    if (/^ADVERTENCIA\b/i.test(line)) {
      inDisclaimer = true;
      continue;
    }
    if (inDisclaimer) {
      if (/^(INFORMACI[ÓO]N|INGREDIENTES|PASO|CONSEJOS)/i.test(line)) {
        inDisclaimer = false;
      } else {
        continue;
      }
    }
    if (!isLayoutArtifact(line)) {
      filtered.push(line);
    }
  }

  return stripPageNumbers(filtered);
}

function hasMacroMatch(line) {
  return /^(calor[ií]as|energ[ií]a|prote[ií]nas?|carbohidratos|hidratos|grasas?(?: saludables)?|l[ií]pidos|fibra|az[uú]cares?|sodio|sal)\s*[:：]/i.test(line);
}

function isIndexHeading(line) {
  return /^(ÍNDICE|INDICE|IDEAS DE RECETAS|Índice de recetas|Recetas \d+\s*[–-]\s*\d+)/i.test(line);
}

function isBlankOrSparseCover(lines) {
  const totalChars = lines.join("").trim().length;
  const hasSteps = lines.some((l) => /^\d{1,2}[.)]\s*[^\d]/.test(l));
  const hasQuantities = lines.some((l) => /\d|½|¼|¾/.test(l));
  return totalChars < 40 && !hasSteps && !hasQuantities;
}

function isFrontMatterCover(lines, pageNumber) {
  if (pageNumber > 3) return false;
  const hasIngredients = lines.some((l) => /^INGREDIENTES\b/i.test(l));
  const hasMacro = lines.some(hasMacroMatch);
  const hasSteps = lines.some((l) => /^\d{1,2}[.)]\s*[^\d]/.test(l));
  return !hasIngredients && !hasMacro && !hasSteps;
}

function isFrontMatterIndex(lines, pageNumber) {
  if (pageNumber > 5) return false;
  const stepCount = lines.filter((l) => /^\d{1,2}[.)]\s*[^\d]/.test(l)).length;
  if (stepCount < 10) return false;
  const hasMacro = lines.some(hasMacroMatch);
  const hasIngredients = lines.some((l) => /^INGREDIENTES\b/i.test(l));
  return !hasMacro && !hasIngredients;
}

/**
 * @param {string[]} cleanedLines
 * @param {number} [pageNumber]
 * @param {RecipeDraft["method"]} [method]
 * @returns {PageClassification}
 */
export function classifyPageType(cleanedLines, pageNumber = 1, method = "text") {
  if (method === "unreadable") return "recipe";
  if (cleanedLines.some(isIndexHeading)) return "index";
  if (isBlankOrSparseCover(cleanedLines)) return "cover";
  if (isFrontMatterCover(cleanedLines, pageNumber)) return "cover";
  if (isFrontMatterIndex(cleanedLines, pageNumber)) return "index";
  return "recipe";
}

function isSectionOrBoundary(line) {
  return (
    /^(INGREDIENTES|PASO|INFORMACI[ÓO]N|NFORMACI[ÓO]N|CONSEJOS|ADVERTENCIA|ÍNDICE|INDICE)/i.test(line) ||
    hasMacroMatch(line) ||
    /^\d{1,2}[.)]\s*[^\d]/.test(line)
  );
}

function isPotentialTitle(line) {
  if (line.length < 3 || line.length > 120) return false;
  if (!/[A-ZÁÉÍÓÚÑ]/.test(line)) return false;
  if (isSectionOrBoundary(line)) return false;
  return line === line.toLocaleUpperCase("es");
}

function isTitleFallbackLine(line) {
  if (isSectionOrBoundary(line)) return false;
  return line.length >= 3 && line.length <= 120;
}

/**
 * @param {string[]} cleanedLines
 * @returns {string}
 */
export function extractTitle(cleanedLines) {
  const titleParts = [];
  for (const line of cleanedLines) {
    if (isSectionOrBoundary(line)) break;
    if (isPotentialTitle(line)) {
      titleParts.push(line);
    } else if (titleParts.length > 0) {
      break;
    }
  }

  if (titleParts.length > 0) {
    return titleParts.join(" ").replace(/\s+/g, " ").trim();
  }

  const fallback = cleanedLines.find(isTitleFallbackLine);
  return fallback ? fallback.replace(/\s+/g, " ").trim() : "";
}

/**
 * @param {string[]} cleanedLines
 * @returns {number}
 */
export function extractServingsCount(cleanedLines) {
  for (const line of cleanedLines) {
    const match = line.match(/INGREDIENTES\s*\(([^)]+)\)/i);
    if (match) {
      const inside = match[1].toLowerCase();
      if (/3\s*[-–]\s*4\s*raciones/.test(inside)) return 3.5;
      const numMatch = inside.match(/(\d+)\s*raciones/);
      if (numMatch) return Number(numMatch[1]) || 1;
    }
  }
  return 1;
}

/**
 * @param {number} amount
 * @param {"g" | "ml" | "unidades"} unit
 * @returns {number}
 */
export function roundScaledAmount(amount, unit) {
  if (unit === "unidades") {
    return Math.max(0.5, Math.round(amount * 10) / 10);
  }
  if (amount >= 10) {
    return Math.round(amount);
  }
  return Math.max(0.5, Math.round(amount * 2) / 2);
}

function normalizeNumberWord(str) {
  let res = String(str || "").toLowerCase();
  for (const [word, digit] of Object.entries(NUMBER_WORD_TABLE)) {
    res = res.replace(new RegExp(`\\b${word}\\b`, "g"), digit);
  }
  return res;
}

function parseNumericWithWord(valStr) {
  const normalized = normalizeNumberWord(valStr).trim().replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : undefined;
}

const NUTRITION_PATTERNS = {
  calories: {
    regex: /\b(?:calor[ií]as|energ[ií]a|kcal)\s*[:：]\s*(\d+(?:[.,]\d+)?)\s*(?:kcal)?\b/gi,
    unit: "kcal",
  },
  protein: {
    regex: /\b(?:prote[ií]nas?)\s*[:：]\s*([a-z0-9]+(?:[.,]\d+)?)\s*(g)\b/gi,
    unit: "g",
  },
  carbs: {
    regex: /\b(?:carbohidratos|hidratos(?: de carbono)?)\s*[:：]\s*([a-z0-9]+(?:[.,]\d+)?)\s*(g)\b/gi,
    unit: "g",
  },
  fat: {
    regex: /\b(?:grasas(?: saludables)?|grasa|l[ií]pidos)\s*[:：]\s*(\d+(?:[.,]\d+)?)\s*(g)\b/gi,
    unit: "g",
  },
  fiberG: {
    regex: /\b(?:fibra(?: alimentaria)?)\s*[:：]\s*(\d+(?:[.,]\d+)?)\s*(g)\b/gi,
    unit: "g",
  },
  freeSugarG: {
    regex: /\b(?:az[uú]cares?)\s*[:：]\s*(\d+(?:[.,]\d+)?)\s*(?:g)?\b/gi,
    unit: "g",
  },
  sodiumMg: {
    regex: /\b(?:sodio|sal)\s*[:：]\s*(\d+(?:[.,]\d+)?)\s*(mg|g)?\b/gi,
    unit: "mg",
  },
};

function extractNutritionField(content, fieldName) {
  const { regex } = NUTRITION_PATTERNS[fieldName];
  regex.lastIndex = 0;
  const matches = [...content.matchAll(regex)];
  if (matches.length === 0) return { value: undefined, ambiguous: false };

  const parsedValues = matches
    .map((m) => {
      let val = parseNumericWithWord(m[1]);
      if (val === undefined) return undefined;
      const matchedUnit = (m[2] || "").toLowerCase();
      if (fieldName === "sodiumMg" && (matchedUnit === "g" || m[0].toLowerCase().includes("sal"))) {
        val = val * 400;
      }
      return val;
    })
    .filter((v) => v !== undefined);

  if (parsedValues.length === 0) return { value: undefined, ambiguous: false };

  const unique = [...new Set(parsedValues)];
  if (unique.length === 1) {
    return { value: unique[0], ambiguous: false };
  }
  return { value: undefined, ambiguous: true };
}

function mentionsPerHundred(content) {
  return /por\s+100\s*(?:g|ml)\b|\b100\s*(?:g|ml)\s+de\s+producto/i.test(content);
}

function canAttemptAtwater(nutrition, ambiguous, per100) {
  if (per100) return false;
  if (nutrition.calories !== undefined) return false;
  return !ambiguous.includes("calories");
}

function hasValidMacrosForAtwater(p, c, f) {
  if (p === undefined || c === undefined || f === undefined) return false;
  return p >= 0 && c >= 0 && f >= 0 && p + c + f > 0;
}

function recoverAtwaterCalories(nutrition, ambiguous, per100) {
  if (!canAttemptAtwater(nutrition, ambiguous, per100)) {
    return nutrition.calories;
  }
  const { protein, carbs, fat } = nutrition;
  if (hasValidMacrosForAtwater(protein, carbs, fat)) {
    return Math.round(protein * 4 + carbs * 4 + fat * 9);
  }
  return undefined;
}

/**
 * @param {string[] | string} linesOrContent
 * @returns {{ nutrition: ExtractedNutrition; ambiguous: string[]; per100: boolean }}
 */
export function extractNutrition(linesOrContent) {
  const content = Array.isArray(linesOrContent) ? linesOrContent.join("\n") : String(linesOrContent || "");
  /** @type {ExtractedNutrition} */
  const nutrition = {};
  const ambiguous = [];

  for (const field of Object.keys(NUTRITION_PATTERNS)) {
    const result = extractNutritionField(content, field);
    if (result.value !== undefined) {
      nutrition[field] = result.value;
    }
    if (result.ambiguous) {
      ambiguous.push(field);
    }
  }

  const per100 = mentionsPerHundred(content);
  const atwater = recoverAtwaterCalories(nutrition, ambiguous, per100);
  if (atwater !== undefined) {
    nutrition.calories = atwater;
  }

  return { nutrition, ambiguous, per100 };
}

function stripPrepQualifiers(name) {
  let clean = name;
  for (const q of STRIP_PREP_QUALIFIERS) {
    clean = clean.replace(new RegExp(`\\b${q}\\b`, "gi"), " ");
  }
  return clean.replace(/\s+/g, " ").trim();
}

function cleanIngredientName(rawName) {
  let name = rawName
    .replace(/^de\s+/i, "")
    .replace(/^del\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/\baove\b/i.test(name)) {
    name = name.replace(/\baove\b/gi, "aceite de oliva virgen extra");
  }

  name = stripPrepQualifiers(name);
  return name.replace(/^de\s+/i, "").replace(/^del\s+/i, "").trim().toLowerCase();
}

function parseVulgarFraction(str) {
  for (const [frac, val] of Object.entries(VULGAR_FRACTIONS)) {
    if (str.includes(frac)) {
      const rest = str.replace(frac, "").trim();
      return (rest ? Number(rest) : 0) + val;
    }
  }
  return null;
}

function parseSlashFraction(str) {
  if (!str.includes("/")) return null;
  const [num, den] = str.split("/").map(Number);
  return den ? num / den : null;
}

function parseRangeFraction(str) {
  if (!/[-–]/.test(str)) return null;
  const parts = str.split(/[-–]/).map((p) => Number(p.trim().replace(",", ".")));
  if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
    return (parts[0] + parts[1]) / 2;
  }
  return null;
}

function parseMetricFraction(str) {
  const trimmed = str.trim();
  const vulgar = parseVulgarFraction(trimmed);
  if (vulgar !== null) return vulgar;
  const slash = parseSlashFraction(trimmed);
  if (slash !== null) return slash;
  const range = parseRangeFraction(trimmed);
  if (range !== null) return range;
  const direct = Number(trimmed.replace(",", "."));
  return Number.isFinite(direct) ? direct : undefined;
}

function parseParenthesizedMetric(line) {
  const match = line.match(/\((?:≈\s*)?(\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?)\s*(g|ml|kg|l)\b[^)]*\)/i);
  if (!match) return null;
  const amountVal = parseMetricFraction(match[1]);
  if (amountVal === undefined) return null;

  let unit = match[2].toLowerCase();
  let amount = amountVal;
  if (unit === "kg") {
    amount *= 1000;
    unit = "g";
  } else if (unit === "l") {
    amount *= 1000;
    unit = "ml";
  }
  const nameWithoutParen = line.replace(/\([^)]*\)/g, " ").trim();
  return { amount, unit: /** @type {"g"|"ml"} */ (unit), name: nameWithoutParen };
}

function parseExplicitMetric(line) {
  const match = line.match(/^(\d+(?:[.,]\d+)?(?:[/]\d+)?(?:[½¼¾⅓⅔])?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?)\s*(kg|g|l|ml)\b(?:\s+de)?\s*(.*)$/i);
  if (!match) return null;
  const amountVal = parseMetricFraction(match[1]);
  if (amountVal === undefined) return null;

  let unit = match[2].toLowerCase();
  let amount = amountVal;
  if (unit === "kg") {
    amount *= 1000;
    unit = "g";
  } else if (unit === "l") {
    amount *= 1000;
    unit = "ml";
  }
  return { amount, unit: /** @type {"g"|"ml"} */ (unit), name: match[3] };
}

function parseSpoonMeasure(line) {
  const match = line.match(/^(\d+(?:[.,]\d+)?(?:[/]\d+)?(?:[½¼¾⅓⅔])?)\s*(cdas?|cucharadas?|cdtas?|cditas?|cucharaditas?)\b(?:\s+de)?\s*(.*)$/i);
  if (!match) return null;
  const count = parseMetricFraction(match[1]) || 1;
  const spoon = match[2].toLowerCase();
  const restName = match[3];
  const isTeaspoon = spoon.startsWith("cdt") || spoon.startsWith("cdit") || spoon.startsWith("cucharadit");
  const isLiquid = LIQUID_KEYWORDS.some((k) => restName.toLowerCase().includes(k));

  if (isTeaspoon) {
    return { amount: count * 5, unit: isLiquid ? "ml" : "g", name: restName };
  }
  return { amount: count * (isLiquid ? 15 : 10), unit: isLiquid ? "ml" : "g", name: restName };
}

function parseCupMeasure(line) {
  const match = line.match(/^(\d+(?:[.,]\d+)?(?:[/]\d+)?(?:[½¼¾⅓⅔])?)\s*(tazas?|vasos?)\b(?:\s+de)?\s*(.*)$/i);
  if (!match) return null;
  const count = parseMetricFraction(match[1]) || 1;
  const restName = match[3];
  const isLiquid = LIQUID_KEYWORDS.some((k) => restName.toLowerCase().includes(k));
  if (isLiquid) {
    return { amount: count * 240, unit: "ml", name: restName };
  }
  const isLeafy = LEAFY_KEYWORDS.some((k) => restName.toLowerCase().includes(k));
  return { amount: count * (isLeafy ? 30 : 150), unit: "g", name: restName };
}

function parseCountableMeasure(line) {
  const match = line.match(/^(\d+(?:[.,]\d+)?(?:[/]\d+)?(?:[½¼¾⅓⅔])?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?)\s*(dientes?|latas?|unidades?|piezas?|puñados?|rebanadas?)?\b(?:\s+de)?\s*(.*)$/i);
  if (!match) return null;
  const count = parseMetricFraction(match[1]);
  if (count === undefined) return null;
  const restName = match[3] ? match[3].trim() : "";
  if (!restName && !match[2]) return null;
  return { amount: count, unit: "unidades", name: restName || match[2] };
}

function isSeasoningText(text) {
  const norm = normalizeTokens(text);
  return SEASONING_KEYWORDS.some((k) => {
    const kNorm = normalizeTokens(k);
    return new RegExp(`\\b${kNorm}\\b`, "i").test(norm);
  });
}

function parseStapleDefault(line) {
  const norm = normalizeTokens(line);
  for (const [staple, def] of Object.entries(CORE_STAPLE_DEFAULTS)) {
    if (norm.includes(staple)) {
      return {
        amount: def.amount,
        unit: def.unit,
        name: def.canonical || staple,
      };
    }
  }
  return null;
}

function parseSingleIngredientItem(itemLine) {
  const cleanLine = itemLine.replace(/^\s*[-•*]\s*/, "").trim();
  if (!cleanLine) return null;

  if (isSeasoningText(cleanLine)) {
    return { type: "seasoning", note: cleanLine };
  }

  const parenMetric = parseParenthesizedMetric(cleanLine);
  if (parenMetric) return { type: "structured", ...parenMetric };

  const explicit = parseExplicitMetric(cleanLine);
  if (explicit) return { type: "structured", ...explicit };

  const spoon = parseSpoonMeasure(cleanLine);
  if (spoon) return { type: "structured", ...spoon };

  const cup = parseCupMeasure(cleanLine);
  if (cup) return { type: "structured", ...cup };

  const countable = parseCountableMeasure(cleanLine);
  if (countable) return { type: "structured", ...countable };

  const staple = parseStapleDefault(cleanLine);
  if (staple) return { type: "structured", ...staple };

  return { type: "unparsed", raw: cleanLine };
}

function splitCompositeLines(lines) {
  const result = [];
  for (const line of lines) {
    if (line.includes("+") && !line.includes("(")) {
      result.push(...line.split("+").map((s) => s.trim()).filter(Boolean));
    } else {
      result.push(line);
    }
  }
  return result;
}

function joinContinuationLines(lines) {
  const merged = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const isContinuation =
      merged.length > 0 &&
      (/^(escurrido|escurrida|escurridos|picado|rallado|en polvo|sin azúcar|al gusto|aprox\.)\b/i.test(trimmed) ||
        trimmed.startsWith("("));

    if (isContinuation) {
      merged[merged.length - 1] += ` ${trimmed}`;
    } else {
      merged.push(trimmed);
    }
  }
  return merged;
}

function stripSectionPrefix(line) {
  return line.replace(/^(para la masa|para la salsa|salsa|aliño|base|topping)\s*:\s*/i, "").trim();
}

/**
 * @param {string[]} ingredientLines
 * @param {number} servings
 * @returns {{ structuredIngredients: Ingredient[]; unparsedIngredients: string[]; seasoningNotes: string[] }}
 */
export function parseIngredientsBlock(ingredientLines, servings = 1) {
  const validLines = ingredientLines
    .filter((l) => !hasMacroMatch(l) && !/^\d{1,2}[.)]\s*[^\d]/.test(l))
    .map(stripSectionPrefix)
    .filter(Boolean);

  const unwrapped = joinContinuationLines(validLines);
  const items = splitCompositeLines(unwrapped);

  /** @type {Map<string, Ingredient>} */
  const ingredientMap = new Map();
  const unparsedIngredients = [];
  const seasoningNotes = [];

  for (const rawItem of items) {
    const parsed = parseSingleIngredientItem(rawItem);
    if (!parsed) continue;

    if (parsed.type === "seasoning") {
      seasoningNotes.push(parsed.note);
    } else if (parsed.type === "structured") {
      const canonicalName = cleanIngredientName(parsed.name);
      const scaledAmount = roundScaledAmount(parsed.amount / servings, parsed.unit);
      const key = `${canonicalName}|${parsed.unit}`;
      const existing = ingredientMap.get(key);
      if (existing) {
        existing.amount = roundScaledAmount(existing.amount + scaledAmount, parsed.unit);
      } else {
        ingredientMap.set(key, {
          name: canonicalName,
          amount: scaledAmount,
          unit: parsed.unit,
        });
      }
    } else {
      unparsedIngredients.push(parsed.raw);
    }
  }

  return {
    structuredIngredients: Array.from(ingredientMap.values()),
    unparsedIngredients,
    seasoningNotes,
  };
}

function hasValidTitle(title) {
  return Boolean(title && title.trim().length >= 3);
}

function hasFullMacros(nut) {
  if (!(nut?.calories > 0)) return false;
  return [nut.protein, nut.carbs, nut.fat].every((v) => v !== undefined);
}

const REVIEW_CHECKS = [
  (_ext, method) => (method === "ocr" ? "Texto extraído por OCR" : null),
  (_ext, method) => (method === "unreadable" ? "Página ilegible" : null),
  (ext) => (!hasValidTitle(ext.title) ? "Sin título detectado" : null),
  (ext) => (ext.mealConfidence === "ambiguous" ? "Tipo de comida ambiguo" : null),
  (ext) => (ext.per100 ? "Valores nutricionales por 100g" : null),
  (ext) => (ext.ambiguous.length > 0 ? "Valores nutricionales ambiguos" : null),
  (ext) => (!hasFullMacros(ext.nutrition) ? "Faltan calorías o macros" : null),
  (ext) => (ext.structuredIngredients.length === 0 ? "Sin ingredientes detectados" : null),
  (ext) => (ext.unparsedIngredients.length > 0 ? "Ingredientes sin cantidad reconocida" : null),
];

/**
 * @param {Omit<ExtractedRecipe, "reviewReasons">} extracted
 * @param {RecipeDraft["method"]} [method]
 * @returns {string[]}
 */
export function computeReviewReasons(extracted, method = "text") {
  return REVIEW_CHECKS.map((check) => check(extracted, method)).filter(Boolean);
}

function sliceIngredientsSection(cleanedLines, firstStep) {
  const ingHeaderIndex = cleanedLines.findIndex((l) => /^INGREDIENTES\b/i.test(l));
  if (ingHeaderIndex < 0 && firstStep < 0) return [];
  const start = ingHeaderIndex >= 0 ? ingHeaderIndex + 1 : 0;
  let end = firstStep >= 0 ? firstStep : cleanedLines.length;

  for (let i = start; i < cleanedLines.length; i++) {
    if (i !== ingHeaderIndex && /^(PASO A PASO|PREPARACI[ÓO]N|ELABORACI[ÓO]N|CONSEJOS [ÚU]TILES|I?NFORMACI[ÓO]N NUTRICIONAL)/i.test(cleanedLines[i])) {
      if (i < end) end = i;
      break;
    }
  }
  return cleanedLines.slice(start, end);
}

function slicePreparationSection(cleanedLines, firstStep) {
  if (firstStep < 0) return "";
  const end = cleanedLines.findIndex(
    (line, index) => index > firstStep && /^(INFORMACI[ÓO]N NUTRICIONAL|NFORMACI[ÓO]N NUTRICIONAL|CONSEJOS|ADVERTENCIA)/i.test(line),
  );
  return cleanedLines.slice(firstStep, end < 0 ? cleanedLines.length : end).join("\n");
}

function resolveMealForPage(cleanedLines, filename, documentMealContext) {
  if (documentMealContext && documentMealContext.mealSource !== "default") {
    return documentMealContext;
  }
  return classifyDocumentMealType({
    filename,
    initialPagesText: [cleanedLines.join("\n")],
  });
}

/**
 * @param {string} text
 * @param {{ filename?: string; pageNumber?: number; method?: RecipeDraft["method"]; documentMealContext?: ReturnType<typeof classifyDocumentMealType> }} [options]
 * @returns {ExtractedRecipe}
 */
export function extractRecipe(text, options = {}) {
  const { filename, pageNumber = 1, method = "text", documentMealContext } = options;
  const cleanedLines = preprocessPageLines(text);
  const pageType = classifyPageType(cleanedLines, pageNumber, method);
  const title = extractTitle(cleanedLines);
  const mealInfo = resolveMealForPage(cleanedLines, filename, documentMealContext);
  const servings = extractServingsCount(cleanedLines);
  const { nutrition, ambiguous, per100 } = extractNutrition(cleanedLines);

  const firstStep = cleanedLines.findIndex((l) => /^\d{1,2}[.)]\s*[^\d]/.test(l));
  const rawIngLines = sliceIngredientsSection(cleanedLines, firstStep);
  const { structuredIngredients, unparsedIngredients, seasoningNotes } = parseIngredientsBlock(rawIngLines, servings);
  const preparation = slicePreparationSection(cleanedLines, firstStep);

  // Backward compatible raw ingredient strings
  const ingredients = rawIngLines.filter((l) => /\d|½|¼|¾|⅓|⅔/.test(l) && !hasMacroMatch(l));

  /** @type {Omit<ExtractedRecipe, "reviewReasons">} */
  const base = {
    pageType,
    title,
    meal: mealInfo.meal,
    mealSource: mealInfo.mealSource,
    mealConfidence: mealInfo.mealConfidence,
    servings,
    nutrition,
    ingredients,
    structuredIngredients,
    unparsedIngredients,
    seasoningNotes,
    preparation,
    per100,
    ambiguous,
  };

  const reviewReasons = computeReviewReasons(base, method);

  return {
    ...base,
    reviewReasons,
  };
}
