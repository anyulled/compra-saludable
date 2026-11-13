export function profileObjectivesComplete(profile) {
  return profile.calories > 0 && profile.protein > 0 && profile.carbs > 0 && profile.fat > 0;
}

export function withPlanLock(state, day, meal, recipeId) {
  return {
    ...state,
    planLocks: [
      ...(state.planLocks || []).filter((lock) => lock.day !== day || lock.meal !== meal),
      ...(recipeId ? [{ day, meal, recipeId }] : []),
    ],
    planDirty: true,
    confirmed: false,
  };
}

export function withShoppingCheck(state, itemId, checked) {
  return {
    ...state,
    shopping: state.shopping.map((item) => item.id === itemId ? { ...item, checked } : item),
  };
}

function normalizeKey(name, unit) {
  return `${String(name || "").trim().toLocaleLowerCase("es")}|${unit || "g"}`;
}

function updateIngredientWithChoice(ingredient, chosen) {
  return {
    ...ingredient,
    productId: chosen.id || undefined,
    productOptions: undefined,
  };
}

function updateRecipeIngredients(saved, targetKey, chosen) {
  return saved.ingredients.map((ingredient) => {
    const key = normalizeKey(ingredient.name, ingredient.unit);
    return key === targetKey ? updateIngredientWithChoice(ingredient, chosen) : ingredient;
  });
}

export function updateChosenIngredient(selectedRecipe, ingredientIndex, chosen, state) {
  const target = selectedRecipe?.ingredients?.[ingredientIndex];
  const targetKey = target ? normalizeKey(target.name, target.unit) : null;
  const recipes = state.recipes.map((saved) => ({
    ...saved,
    ingredients: updateRecipeIngredients(saved, targetKey, chosen),
  }));
  const hasProduct = !chosen.id || state.products.some((product) => product.id === chosen.id);
  const products = hasProduct ? state.products : [...state.products, chosen];
  return { ...state, recipes, products };
}

export function pdfFailureMessages(results, files, batchFailure) {
  const failures = [];
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (result.status !== "rejected") continue;
    const reason = result.reason instanceof Error ? result.reason.message : "error desconocido";
    failures.push(`${files[index].name}: ${reason}`);
  }
  if (batchFailure) failures.push(batchFailure);
  return failures;
}

export function collectDraftDocumentPaths(drafts) {
  return [
    ...new Set(
      (drafts || [])
        .map((d) => d?.documentPath)
        .filter((p) => Boolean(p)),
    ),
  ];
}

export function resetRecipesState(state) {
  return {
    ...state,
    recipes: [],
    drafts: [],
    approvedDocuments: {},
    planLocks: [],
    plan: [],
    shopping: [],
    confirmed: false,
    planBasis: undefined,
    planDirty: false,
    leftovers: [],
  };
}

