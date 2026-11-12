import { documentKey } from "./import-status.mjs";
import { classifyDocumentMealType, extractRecipe } from "./recipe-extraction.mjs";
import { matchRecipeIngredients } from "./recipe-product-match.mjs";

/**
 * @typedef {import("./types").Recipe} Recipe
 * @typedef {import("./types").RecipeDraft} RecipeDraft
 * @typedef {import("./types").ExtractedRecipe} ExtractedRecipe
 * @typedef {import("./types").State} State
 * @typedef {import("./types").Ingredient} Ingredient
 */

function isValidMacros(recipe) {
  if (!(recipe.calories > 0)) return false;
  const nonNegative = [recipe.protein, recipe.carbs, recipe.fat].every(
    (v) => Number.isFinite(v) && v >= 0,
  );
  const sum = (recipe.protein || 0) + (recipe.carbs || 0) + (recipe.fat || 0);
  return nonNegative && sum > 0;
}

function hasValidIngredients(ingredients) {
  if (!Array.isArray(ingredients) || ingredients.length === 0) return false;
  return ingredients.every((ing) => ing.amount > 0 && Boolean(ing.name?.trim()));
}

export function recipeValidationMessage(recipe, selectedDraft, reviewConfirmed) {
  if (selectedDraft && !reviewConfirmed) {
    return "Confirma que has revisado el original, las raciones y todos los ingredientes antes de guardar.";
  }
  if (!recipe.name?.trim() || !isValidMacros(recipe) || !hasValidIngredients(recipe.ingredients)) {
    return "Completa nombre, nutrientes e ingredientes con cantidades positivas.";
  }
  return null;
}

export function approvedRecipe(recipe, recipeId, selectedDraft) {
  const ingredients = recipe.ingredients.map((ing) => ({
    ...ing,
    name: ing.name?.trim(),
    productId: undefined,
    productOptions: undefined,
  }));
  return {
    ...recipe,
    id: recipeId,
    approved: true,
    sourceDraftId: selectedDraft || undefined,
    ingredients,
  };
}

export function appendApprovedRecipe(recipe, selectedDraft, state) {
  const drafts = [];
  let source;
  for (const draft of state.drafts || []) {
    if (draft.id === selectedDraft) {
      source = draft;
      drafts.push({ ...draft, status: "reviewed" });
    } else {
      drafts.push(draft);
    }
  }
  return {
    ...state,
    recipes: [...state.recipes, recipe],
    drafts: source ? drafts : state.drafts,
    approvedDocuments: source ? { ...state.approvedDocuments, [documentKey(source)]: false } : state.approvedDocuments,
  };
}

export function applyRecipeMatches(recipeId, matches, state) {
  const recipes = state.recipes.map((recipe) =>
    recipe.id === recipeId ? { ...recipe, ingredients: matches.ingredients } : recipe,
  );
  const products = [...state.products];
  for (const product of matches.products) {
    if (!products.some((existing) => existing.id === product.id)) {
      products.push(product);
    }
  }
  return { ...state, recipes, products };
}

export function recipeSavedMessage(unresolvedCount, sourceWasSelected) {
  const result = unresolvedCount
    ? `Receta guardada. Revisa ${unresolvedCount} ingrediente(s) en “Elegir productos de Mercadona”.`
    : "Receta guardada y productos únicos añadidos al catálogo.";
  return sourceWasSelected ? `${result} El PDF original sigue disponible en la biblioteca.` : result;
}

/**
 * @param {ExtractedRecipe} extracted
 * @param {RecipeDraft["method"]} [method]
 * @returns {boolean}
 */
export function isExtractedRecipeAutoApprovable(extracted, method = "text") {
  return (
    extracted.pageType === "recipe" &&
    (method ?? "text") === "text" &&
    extracted.reviewReasons.length === 0
  );
}

function resolveSodiumBaseline(extracted) {
  if (extracted.nutrition.sodiumMg !== undefined) {
    return extracted.nutrition.sodiumMg;
  }
  const hasSalt = extracted.seasoningNotes.some((n) => /\bsal\b/i.test(n));
  return hasSalt ? 150 : 80;
}

/**
 * @param {RecipeDraft} draft
 * @param {ExtractedRecipe} extracted
 * @param {string} id
 * @returns {Recipe}
 */
export function buildRecipeFromExtractedDraft(draft, extracted, id) {
  const notes = [extracted.preparation, ...extracted.seasoningNotes].filter(Boolean).join("\n");
  return {
    id,
    name: extracted.title,
    meal: extracted.meal,
    calories: extracted.nutrition.calories || 0,
    protein: extracted.nutrition.protein || 0,
    carbs: extracted.nutrition.carbs || 0,
    fat: extracted.nutrition.fat || 0,
    fiberG: extracted.nutrition.fiberG,
    freeSugarG: extracted.nutrition.freeSugarG,
    sodiumMg: resolveSodiumBaseline(extracted),
    nutritionExtrasSource: "Estimado automáticamente al importar PDF",
    ingredients: extracted.structuredIngredients,
    notes,
    sourceDraftId: draft.id,
    approved: true,
    rating: 0,
  };
}

/**
 * @param {RecipeDraft} draft
 * @param {string} currentRecipeId
 * @param {ReturnType<typeof classifyDocumentMealType>} [documentMealContext]
 * @returns {Recipe}
 */
export function buildRecipeFromDraft(draft, currentRecipeId, documentMealContext) {
  const extracted = extractRecipe(draft.text, {
    filename: draft.filename,
    pageNumber: draft.page,
    method: draft.method,
    documentMealContext,
  });
  const notes = [extracted.preparation, ...extracted.seasoningNotes].filter(Boolean).join("\n");
  return {
    id: currentRecipeId,
    name: extracted.title || "",
    meal: extracted.meal,
    calories: extracted.nutrition.calories || 0,
    protein: extracted.nutrition.protein || 0,
    carbs: extracted.nutrition.carbs || 0,
    fat: extracted.nutrition.fat || 0,
    fiberG: extracted.nutrition.fiberG,
    freeSugarG: extracted.nutrition.freeSugarG,
    sodiumMg: resolveSodiumBaseline(extracted),
    nutritionExtrasSource: "Estimado automáticamente al importar PDF",
    ingredients: extracted.structuredIngredients,
    notes,
    sourceDraftId: draft.id,
    approved: false,
    rating: 0,
  };
}

function groupDraftsByDoc(drafts) {
  /** @type {Map<string, RecipeDraft[]>} */
  const groups = new Map();
  for (const draft of drafts) {
    const key = draft.documentId || draft.filename;
    const list = groups.get(key) || [];
    list.push(draft);
    groups.set(key, list);
  }
  return groups;
}

function isDraftAlreadyImported(draft, existingRecipes) {
  return existingRecipes.some((r) => r.sourceDraftId === draft.id);
}

/**
 * @param {{
 *   drafts: RecipeDraft[];
 *   existingRecipes?: Recipe[];
 *   createId?: () => string;
 * }} options
 * @returns {{
 *   classifiedDrafts: RecipeDraft[];
 *   autoApprovedRecipes: Recipe[];
 *   summary: { approvedCount: number; discardedCount: number; pendingCount: number };
 * }}
 */
export function processImportedDraftBatch({
  drafts,
  existingRecipes = [],
  createId = () => Math.random().toString(36).slice(2, 10),
}) {
  const docGroups = groupDraftsByDoc(drafts);
  const classifiedDrafts = [];
  const autoApprovedRecipes = [];
  let approvedCount = 0;
  let discardedCount = 0;
  let pendingCount = 0;

  for (const [, groupDrafts] of docGroups) {
    const context = classifyDocumentMealType({
      filename: groupDrafts[0]?.filename,
      initialPagesText: groupDrafts.slice(0, 3).map((d) => d.text),
    });

    for (const draft of groupDrafts) {
      const extracted = extractRecipe(draft.text, {
        filename: draft.filename,
        pageNumber: draft.page,
        method: draft.method,
        documentMealContext: context,
      });

      if (extracted.pageType === "cover" || extracted.pageType === "index") {
        classifiedDrafts.push({ ...draft, status: "discarded" });
        discardedCount++;
      } else if (isExtractedRecipeAutoApprovable(extracted, draft.method)) {
        if (!isDraftAlreadyImported(draft, existingRecipes)) {
          const newRecipe = buildRecipeFromExtractedDraft(draft, extracted, createId());
          autoApprovedRecipes.push(newRecipe);
          approvedCount++;
        }
        classifiedDrafts.push({ ...draft, status: "reviewed" });
      } else {
        classifiedDrafts.push({ ...draft, status: "pending" });
        pendingCount++;
      }
    }
  }

  return {
    classifiedDrafts,
    autoApprovedRecipes,
    summary: { approvedCount, discardedCount, pendingCount },
  };
}

function normalizeIngKey(name, unit) {
  return `${String(name || "").trim().toLocaleLowerCase("es")}|${unit || "g"}`;
}

function collectResolvedKeys(existingRecipes) {
  const resolvedKeys = new Set();
  for (const r of existingRecipes) {
    for (const ing of r.ingredients || []) {
      if (ing.productId) {
        resolvedKeys.add(normalizeIngKey(ing.name, ing.unit));
      }
    }
  }
  return resolvedKeys;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * @param {Recipe[]} recipes
 * @param {Recipe[]} existingRecipes
 * @returns {string[][]}
 */
export function collectUncachedIngredientQueries(recipes, existingRecipes = []) {
  const resolvedKeys = collectResolvedKeys(existingRecipes);
  const querySet = new Set();
  for (const r of recipes) {
    for (const ing of r.ingredients || []) {
      const key = normalizeIngKey(ing.name, ing.unit);
      if (!resolvedKeys.has(key) && ing.name?.trim()) {
        querySet.add(ing.name.trim().toLocaleLowerCase("es"));
      }
    }
  }
  return chunkArray(Array.from(querySet), 30);
}

/**
 * @param {string[]} recipeIds
 * @param {any[]} searchResults
 * @param {State} state
 * @returns {State}
 */
export function applyBatchRecipeMatches(recipeIds, searchResults, state) {
  const targetIdSet = new Set(recipeIds);
  let currentState = state;

  for (const recipe of currentState.recipes) {
    if (targetIdSet.has(recipe.id)) {
      const matchResult = matchRecipeIngredients(recipe.ingredients, searchResults);
      currentState = applyRecipeMatches(recipe.id, matchResult, currentState);
    }
  }

  return currentState;
}
