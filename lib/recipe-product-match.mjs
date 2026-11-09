function canUseInRecipe(option, ingredient) {
  return option.unit === (ingredient.unit || "g") && Boolean(option.size) && option.price !== null;
}

export function matchRecipeIngredients(ingredients, results) {
  const byName = new Map();
  for (const result of results) byName.set(String(result.query || "").trim().toLocaleLowerCase("es"), result.products || []);
  const products = new Map();
  let unresolvedCount = 0;
  const matchedIngredients = ingredients.map((ingredient) => {
    const options = byName.get(String(ingredient.name || "").trim().toLocaleLowerCase("es")) || [];
    const usable = options.filter((option) => canUseInRecipe(option, ingredient));
    if (options.length === 1 && usable.length === 1) {
      const option = usable[0];
      products.set(option.id, { id: option.id, name: option.name, unit: option.unit, size: option.size, price: option.price, stock: 0, source: option.source });
      return { ...ingredient, productId: option.id, productOptions: undefined };
    }
    unresolvedCount++;
    return { ...ingredient, productOptions: options };
  });
  return { ingredients: matchedIngredients, products: [...products.values()], unresolvedCount };
}

export function matchIngredientOptions(ingredient, options) {
  const usable = options.filter((option) => canUseInRecipe(option, ingredient));
  if (options.length === 1 && usable.length === 1) {
    const option = usable[0];
    return {
      ingredient: { ...ingredient, productId: option.id, productOptions: undefined },
      product: { id: option.id, name: option.name, unit: option.unit, size: option.size, price: option.price, stock: 0, source: option.source },
    };
  }
  return { ingredient: { ...ingredient, productOptions: options }, product: null };
}
