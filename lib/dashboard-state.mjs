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

export function updateChosenIngredient(selectedRecipe, ingredientIndex, chosen, state) {
  const recipes = [];
  for (const saved of state.recipes) {
    if (saved.id !== selectedRecipe.id) {
      recipes.push(saved);
      continue;
    }
    const ingredients = [];
    for (let index = 0; index < saved.ingredients.length; index += 1) {
      const ingredient = saved.ingredients[index];
      ingredients.push(index !== ingredientIndex ? ingredient : {
        ...ingredient,
        ...(chosen.id ? { productId: chosen.id } : {}),
        productOptions: undefined,
      });
    }
    recipes.push({ ...saved, ingredients });
  }
  const products = state.products.some((product) => product.id === chosen.id)
    ? state.products
    : chosen.id ? [...state.products, chosen] : state.products;
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
