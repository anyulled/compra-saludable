import { documentKey } from "./import-status.mjs";

export function recipeValidationMessage(recipe, selectedDraft, reviewConfirmed) {
  if (selectedDraft && !reviewConfirmed) return "Confirma que has revisado el original, las raciones y todos los ingredientes antes de guardar.";
  if (!recipe.name.trim() || [recipe.calories, recipe.protein, recipe.carbs, recipe.fat].some((value) => value <= 0) || !recipe.ingredients.length) {
    return "Completa nombre, nutrientes e ingredientes con cantidades positivas.";
  }
  for (const ingredient of recipe.ingredients) if (ingredient.amount <= 0 || !ingredient.name?.trim()) return "Completa nombre, nutrientes e ingredientes con cantidades positivas.";
  return null;
}

export function approvedRecipe(recipe, recipeId, selectedDraft) {
  const ingredients = [];
  for (const ingredient of recipe.ingredients) ingredients.push({ ...ingredient, name: ingredient.name?.trim(), productId: undefined, productOptions: undefined });
  return { ...recipe, id: recipeId, approved: true, sourceDraftId: selectedDraft || undefined, ingredients };
}

export function appendApprovedRecipe(recipe, selectedDraft, state) {
  const drafts = [];
  let source;
  for (const draft of state.drafts || []) {
    if (draft.id === selectedDraft) {
      source = draft;
      drafts.push({ ...draft, status: "reviewing" });
    } else drafts.push(draft);
  }
  return {
    ...state,
    recipes: [...state.recipes, recipe],
    drafts: source ? drafts : state.drafts,
    approvedDocuments: source ? { ...state.approvedDocuments, [documentKey(source)]: false } : state.approvedDocuments,
  };
}

export function applyRecipeMatches(recipeId, matches, state) {
  const recipes = [];
  for (const recipe of state.recipes) recipes.push(recipe.id === recipeId ? { ...recipe, ingredients: matches.ingredients } : recipe);
  const products = [...state.products];
  for (const product of matches.products) {
    if (!products.some((existing) => existing.id === product.id)) products.push(product);
  }
  return { ...state, recipes, products };
}

export function recipeSavedMessage(unresolvedCount, sourceWasSelected) {
  const result = unresolvedCount
    ? `Receta guardada. Revisa ${unresolvedCount} ingrediente(s) en “Elegir productos de Mercadona”.`
    : "Receta guardada y productos únicos añadidos al catálogo.";
  return sourceWasSelected ? `${result} El PDF original sigue disponible en la biblioteca.` : result;
}
