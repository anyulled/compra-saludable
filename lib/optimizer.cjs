const loadHighs = require("highs");
const meals = ["Desayuno", "Comida", "Cena", "Tentempié"];
// Check every model constraint and integer variable before accepting an incumbent.
function validVariableValue(name, model, value) {
  if (!Number.isFinite(value) || value < -1e-6) return false;
  const integer = name in model.ints || name in model.binaries;
  if (integer && Math.abs(value - Math.round(value)) > 1e-6) return false;
  return !(name in model.binaries) || value <= 1 + 1e-6;
}

function addColumnToTotals(model, name, value, totals) {
  for (const [key, coefficient] of Object.entries(model.variables[name])) {
    if (key !== "cost" && key in totals) totals[key] += value * coefficient;
  }
}

function calculateConstraintTotals(model, names, aliases, columns) {
  const totals = Object.fromEntries(Object.keys(model.constraints).map((key) => [key, 0]));
  for (const name of names) {
    const value = columns[aliases[name]]?.Primal;
    if (!validVariableValue(name, model, value)) return null;
    addColumnToTotals(model, name, value, totals);
  }
  return totals;
}

function boundContains(value, bound, lower) {
  const tolerance = 1e-6 * Math.max(1, Math.abs(bound));
  return lower ? value >= bound - tolerance : value <= bound + tolerance;
}

function constraintContains(value, bounds) {
  if (bounds.equal !== undefined && !boundContains(value, bounds.equal, true)) return false;
  if (bounds.equal !== undefined && !boundContains(value, bounds.equal, false)) return false;
  if (bounds.min !== undefined && !boundContains(value, bounds.min, true)) return false;
  return bounds.max === undefined || boundContains(value, bounds.max, false);
}

function constraintsContainTotals(model, totals) {
  for (const [name, bounds] of Object.entries(model.constraints)) {
    if (!constraintContains(totals[name], bounds)) return false;
  }
  return true;
}

function isFeasibleSolution(model, names, aliases, columns) {
  if (!columns) return false;
  const totals = calculateConstraintTotals(model, names, aliases, columns);
  return totals !== null && constraintsContainTotals(model, totals);
}

function validateInputShape(profiles, recipes, products) {
  if (
    !Array.isArray(profiles) ||
    profiles.length !== 2 ||
    !Array.isArray(recipes) ||
    !Array.isArray(products)
  ) throw new Error("Se necesitan dos perfiles, recetas y productos.");
}

function hasValidProduct(product, ids) {
  return Boolean(
    product &&
      typeof product.id === "string" &&
      product.id &&
      !ids.has(product.id) &&
      Number.isFinite(product.size) &&
      product.size > 0 &&
      Number.isFinite(product.stock) &&
      product.stock >= 0 &&
      Number.isFinite(product.price) &&
      product.price >= 0,
  );
}

function validateProducts(products) {
  const ids = new Set();
  for (const product of products) {
    if (!hasValidProduct(product, ids)) {
      throw new Error("Revisa los productos: identificadores únicos, tamaño positivo, precio y existencias no negativos.");
    }
    ids.add(product.id);
  }
}

function validateRecipes(recipes) {
  const ids = new Set();
  for (const recipe of recipes) {
    if (!recipe || typeof recipe.id !== "string" || !recipe.id || ids.has(recipe.id)) {
      throw new Error("Revisa que cada receta tenga un identificador único.");
    }
    ids.add(recipe.id);
  }
}

function hasAvailableIngredient(ingredient, productIds) {
  return Number.isFinite(ingredient.amount) && ingredient.amount > 0 && productIds.has(ingredient.productId);
}

function recipeHasIngredients(recipe, productIds) {
  if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) return false;
  return recipe.ingredients.every((ingredient) => hasAvailableIngredient(ingredient, productIds));
}

function recipeHasPositiveMacros(recipe) {
  return ["calories", "protein", "carbs", "fat"].every(
    (key) => Number.isFinite(recipe[key]) && recipe[key] > 0,
  );
}

function isCompleteRecipe(recipe, productIds) {
  return recipe.approved && meals.includes(recipe.meal) && recipeHasPositiveMacros(recipe) && recipeHasIngredients(recipe, productIds);
}

function completeRecipes(recipes, productIds) {
  return recipes.filter((recipe) => isCompleteRecipe(recipe, productIds));
}

function validateProfileGoals(profiles) {
  for (const profile of profiles) {
    for (const key of ["calories", "protein", "carbs", "fat"]) {
      if (!Number.isFinite(profile[key]) || profile[key] <= 0) {
        throw new Error("Introduce objetivos positivos para ambas personas.");
      }
    }
  }
}

function hasStaleRecommendation(profile, recommendationBasis, recommendGoals) {
  return profile.objectiveSource === "suggested" &&
    (profile.recommendationBasis !== recommendationBasis(profile) || !recommendGoals(profile).proposal);
}

function validateProfiles(profiles, recommendationBasis, recommendGoals) {
  if (profiles.some((profile) => hasStaleRecommendation(profile, recommendationBasis, recommendGoals))) {
    throw new Error("Una propuesta nutricional ya no corresponde al perfil. Revisa y confirma los objetivos antes de generar el menú.");
  }
  if (profiles.some((profile) => profile.restrictions && profile.restrictions.trim())) {
    throw new Error("Las alergias y restricciones todavía no se pueden verificar automáticamente. No generes un plan hasta que estén soportadas y revisadas.");
  }
  validateProfileGoals(profiles);
}

function collectActiveNutrients(profiles, nutrients) {
  const active = [];
  for (const nutrient of nutrients) {
    for (let person = 0; person < profiles.length; person++) {
      const value = profiles[person].nutritionGoals?.[nutrient.goal];
      if (value === undefined || value === null) continue;
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("El objetivo de " + nutrient.label + " debe ser un número no negativo.");
      }
      active.push({ n: nutrient, person, value });
    }
  }
  return active;
}

function validateMaxRecipeRepetitions(value) {
  if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > 14)) {
    throw new Error("El máximo de repeticiones debe estar entre 1 y 14.");
  }
}

function validateGroupGoal(group, value, foodGroups) {
  return foodGroups.some((item) => item.key === group) &&
    Number.isInteger(value) && value >= 0 && value <= 28;
}

function validateGroupGoals(groupGoals, foodGroups) {
  if (!groupGoals || typeof groupGoals !== "object" || Array.isArray(groupGoals)) {
    throw new Error("Los objetivos de grupos no son válidos.");
  }
  for (const [group, value] of Object.entries(groupGoals)) {
    if (!validateGroupGoal(group, value, foodGroups)) {
      throw new Error("Los mínimos semanales de grupos deben estar entre 0 y 28.");
    }
  }
}

function validateOptimizationOptions(options, foodGroups) {
  validateMaxRecipeRepetitions(options.maxRecipeRepetitions);
  const groupGoals = options.categoryMinimums || {};
  validateGroupGoals(groupGoals, foodGroups);
  return groupGoals;
}

function dateValue(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const millis = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 10) === value ? millis : null;
}

function usableDaysForProduct(product, start) {
  if (!product.expiresOn) return 14;
  const expiration = dateValue(product.expiresOn);
  if (start === null || expiration === null) {
    throw new Error("Indica una fecha de inicio válida y revisa las fechas de caducidad de la despensa.");
  }
  return Math.max(0, Math.min(14, Math.floor((expiration - start) / 86400000) + 1));
}

function calculateUsableDays(products, startDate) {
  const start = dateValue(startDate);
  const usableDays = {};
  for (const product of products) usableDays[product.id] = usableDaysForProduct(product, start);
  return usableDays;
}

function isNutritionallyComplete(recipe, activeNutrients) {
  return Number.isFinite(recipe.sodiumMg) && recipe.sodiumMg >= 0 &&
    activeNutrients.every((nutrient) => Number.isFinite(recipe[nutrient.key]) && recipe[nutrient.key] >= 0);
}

function missingNutrients(choices, activeNutrients) {
  const sodiumMissing = choices.some((recipe) => !Number.isFinite(recipe.sodiumMg) || recipe.sodiumMg < 0);
  const otherMissing = activeNutrients
    .filter((nutrient) => choices.some((recipe) => !Number.isFinite(recipe[nutrient.key]) || recipe[nutrient.key] < 0))
    .map((nutrient) => nutrient.label.toLowerCase());
  return [...(sodiumMissing ? ["sodio por ración"] : []), ...otherMissing];
}

function assertCompleteMeals(recipes) {
  for (const meal of meals) {
    if (!recipes.some((recipe) => recipe.meal === meal)) {
      throw new Error("Falta al menos una receta revisada y completa para " + meal + ".");
    }
  }
}

function validRecipes(complete, activeNutrients) {
  const valid = complete.filter((recipe) => isNutritionallyComplete(recipe, activeNutrients));
  for (const meal of meals) {
    if (valid.some((recipe) => recipe.meal === meal)) continue;
    const choices = complete.filter((recipe) => recipe.meal === meal);
    const missing = missingNutrients(choices, activeNutrients);
    throw new Error(
      "Falta una receta de " + meal + " con datos revisados de sodio por ración y de todos los nutrientes con objetivos activos" +
      (missing.length ? ": " + missing.join(", ") : "") + ". Los valores desconocidos no se consideran cero.",
    );
  }
  return valid;
}

function isValidLock(lock, valid) {
  return Boolean(lock && Number.isInteger(lock.day) && lock.day >= 0 && lock.day < 14 &&
    meals.includes(lock.meal) && typeof lock.recipeId === "string" &&
    valid.some((recipe) => recipe.id === lock.recipeId && recipe.meal === lock.meal));
}

function validateLocks(locks, valid) {
  if (!Array.isArray(locks) || locks.length > 56) throw new Error("Las recetas fijadas no son válidas.");
  const seen = new Set();
  for (const lock of locks) {
    if (!isValidLock(lock, valid)) {
      throw new Error("Una receta fijada ya no está disponible o no corresponde a esa comida. Revísala antes de recalcular.");
    }
    const key = lock.day + "_" + lock.meal;
    if (seen.has(key)) throw new Error("Hay más de una receta fijada para una misma comida.");
    seen.add(key);
  }
}

async function prepareOptimization(data) {
  const { profiles, recipes, products } = data;
  validateInputShape(profiles, recipes, products);
  validateProducts(products);
  validateRecipes(recipes);
  const [{ recommendationBasis, recommendGoals }, { nutrients, foodGroups }] = await Promise.all([
    import("./profile-estimates.mjs"),
    import("./nutrients.mjs"),
  ]);
  validateProfiles(profiles, recommendationBasis, recommendGoals);
  const productIds = new Set(products.map((product) => product.id));
  const complete = completeRecipes(recipes, productIds);
  assertCompleteMeals(complete);
  const active = collectActiveNutrients(profiles, nutrients);
  const activeNutrients = nutrients.filter((nutrient) => active.some((item) => item.n.key === nutrient.key));
  const options = data.optimizationOptions || {};
  const groupGoals = validateOptimizationOptions(options, foodGroups);
  const usableDays = calculateUsableDays(products, options.startDate);
  const valid = validRecipes(complete, activeNutrients);
  const locks = data.locks ?? [];
  validateLocks(locks, valid);
  return { profiles, recipes: valid, products, locks, active, activeNutrients, options, groupGoals, usableDays };
}

function newModel() {
  return { optimize: "cost", opType: "min", constraints: {}, variables: {}, ints: {}, binaries: {} };
}

function addRecipeRepeatConstraints(model, recipes, options) {
  for (const recipe of recipes) {
    const repeat = "repeats_" + recipe.id;
    model.constraints[repeat] = { min: -1 };
    model.variables["excess_" + recipe.id] = { cost: 0.75, [repeat]: 1 };
    if (options.maxRecipeRepetitions !== undefined) {
      model.constraints["cap_" + recipe.id] = { max: options.maxRecipeRepetitions };
    }
  }
}

function addGroupMinimumConstraints(model, groupGoals) {
  for (let week = 0; week < 2; week++) {
    for (const [group, minimum] of Object.entries(groupGoals)) {
      if (minimum > 0) model.constraints[`group_${week}_${group}`] = { min: minimum };
    }
  }
}

function addDailyNutritionConstraints(model, profiles, active) {
  for (let day = 0; day < 14; day++) {
    for (let person = 0; person < 2; person++) {
      for (const key of ["calories", "protein", "carbs", "fat"]) {
        model.constraints[`n_${day}_${person}_${key}`] = {
          min: profiles[person][key] * 0.9,
          max: profiles[person][key] * 1.1,
        };
      }
    }
    for (const nutrient of active) {
      model.constraints[`extra_${day}_${nutrient.person}_${nutrient.n.key}`] = {
        [nutrient.n.direction]: nutrient.value,
      };
    }
  }
}

function candidateRecipesFor(context, day, meal) {
  const all = context.recipes.filter((recipe) => recipe.meal === meal);
  const fixed = context.locks.find((lock) => lock.day === day && lock.meal === meal);
  if (fixed) return { recipes: all.filter((recipe) => recipe.id === fixed.recipeId), restricted: false };
  if (context.disableBalancedRotation || all.length <= 3) return { recipes: all, restricted: false };
  const highEnergy = [...all].sort((a, b) => b.calories - a.calories).slice(0, 2);
  const chosen = new Set(highEnergy.map((recipe) => recipe.id));
  const selected = [...highEnergy];
  for (let offset = 0; offset < all.length && selected.length < 3; offset++) {
    const recipe = all[(day * 3 + offset) % all.length];
    if (!chosen.has(recipe.id)) {
      selected.push(recipe);
      chosen.add(recipe.id);
    }
  }
  return { recipes: selected, restricted: true };
}

function addIngredientCoefficients(coefficients, ingredients, day, usableDays) {
  for (const ingredient of ingredients) {
    const productKey = "product_" + ingredient.productId;
    const surplusKey = "surplus_" + ingredient.productId;
    coefficients[productKey] = (coefficients[productKey] || 0) + ingredient.amount / 2;
    coefficients[surplusKey] = (coefficients[surplusKey] || 0) + ingredient.amount / 2;
    if (day < usableDays[ingredient.productId] && usableDays[ingredient.productId] < 14) {
      const key = "expired_" + ingredient.productId;
      coefficients[key] = (coefficients[key] || 0) + ingredient.amount / 2;
    }
    if (day >= usableDays[ingredient.productId] && usableDays[ingredient.productId] > 0) {
      const key = "late_" + ingredient.productId;
      coefficients[key] = (coefficients[key] || 0) + ingredient.amount / 2;
    }
  }
}

function portionCoefficients(recipe, day, person, link, lower, active, usableDays) {
  const coefficients = { cost: (recipe.sodiumMg * 0.0001) / 2, [link]: 1, [lower]: 1 };
  for (const key of ["calories", "protein", "carbs", "fat"]) {
    coefficients[`n_${day}_${person}_${key}`] = recipe[key] / 2;
  }
  for (const nutrient of active) {
    if (nutrient.person === person) {
      coefficients[`extra_${day}_${person}_${nutrient.n.key}`] = recipe[nutrient.n.key] / 2;
    }
  }
  addIngredientCoefficients(coefficients, recipe.ingredients, day, usableDays);
  return coefficients;
}

function addPortionVariables(model, recipe, day, meal, active, usableDays, choiceName) {
  for (let person = 0; person < 2; person++) {
    const slot = `${day}_${meal}`;
    const variableName = `x_${slot}_${recipe.id}_${person}`;
    const link = `link_${slot}_${recipe.id}_${person}`;
    const lower = `lower_${slot}_${recipe.id}_${person}`;
    model.constraints[link] = { max: 0 };
    model.constraints[lower] = { min: 0 };
    model.variables[choiceName][link] = -4;
    model.variables[choiceName][lower] = -1;
    model.variables[variableName] = portionCoefficients(recipe, day, person, link, lower, active, usableDays);
    model.ints[variableName] = 1;
  }
}

function recipeHasGroup(recipe, group, minimum) {
  return minimum > 0 && Array.isArray(recipe.foodGroups) && recipe.foodGroups.includes(group);
}

function applyRecipeGroups(model, recipe, day, groupGoals, choiceName) {
  for (const [group, minimum] of Object.entries(groupGoals)) {
    if (recipeHasGroup(recipe, group, minimum)) {
      model.variables[choiceName][`group_${Math.floor(day / 7)}_${group}`] = 1;
    }
  }
}

function isRecipeLocked(locks, day, meal, recipe) {
  return locks.some((lock) => lockMatchesRecipe(lock, day, meal, recipe));
}

function lockMatchesRecipe(lock, day, meal, recipe) {
  return lock.day === day && lock.meal === meal && lock.recipeId === recipe.id;
}

function applyRecipeLock(model, locks, day, meal, recipe, choiceName) {
  if (!isRecipeLocked(locks, day, meal, recipe)) return;
  const locked = "fixed_" + day + "_" + meal;
  model.constraints[locked] = { equal: 1 };
  model.variables[choiceName][locked] = 1;
}

function addRecipeChoice(model, context, day, meal, recipe) {
  const slot = `${day}_${meal}`;
  const choiceName = `y_${slot}_${recipe.id}`;
  model.variables[choiceName] = {
    ["select_" + slot]: 1,
    cost: Math.max(0, 4 - (recipe.rating || 0)) * 0.03,
    ["repeats_" + recipe.id]: -1,
  };
  model.binaries[choiceName] = 1;
  if (context.options.maxRecipeRepetitions !== undefined) {
    model.variables[choiceName]["cap_" + recipe.id] = 1;
  }
  applyRecipeGroups(model, recipe, day, context.groupGoals, choiceName);
  applyRecipeLock(model, context.locks, day, meal, recipe, choiceName);
  addPortionVariables(model, recipe, day, meal, context.active, context.usableDays, choiceName);
}

function addMealSlot(model, context, day, meal) {
  const slot = `${day}_${meal}`;
  model.constraints["select_" + slot] = { equal: 1 };
  const candidates = candidateRecipesFor(context, day, meal);
  for (const recipe of candidates.recipes) addRecipeChoice(model, context, day, meal, recipe);
  return candidates.restricted;
}

function addRecipeSelectionVariables(model, context) {
  let hasRestrictedCandidates = false;
  for (let day = 0; day < 14; day++) {
    for (const meal of meals) {
      hasRestrictedCandidates = addMealSlot(model, context, day, meal) || hasRestrictedCandidates;
    }
  }
  return hasRestrictedCandidates;
}

function addProductVariables(model, products, usableDays) {
  for (const product of products) {
    const productConstraint = "product_" + product.id;
    const buyVariable = "buy_" + product.id;
    const surplusConstraint = "surplus_" + product.id;
    model.constraints[productConstraint] = { max: usableDays[product.id] === 0 ? 0 : product.stock };
    model.variables[buyVariable] = { cost: product.price, [productConstraint]: -product.size };
    model.constraints[surplusConstraint] = { min: product.stock };
    model.variables[buyVariable][surplusConstraint] = -product.size;
    model.variables["remaining_" + product.id] = {
      cost: (0.05 * product.price) / product.size,
      [surplusConstraint]: 1,
    };
    addExpiryVariables(model, product, usableDays[product.id], buyVariable);
    model.ints[buyVariable] = 1;
  }
}

function addExpiryVariables(model, product, usableDays, buyVariable) {
  if (usableDays < 14) {
    const expired = "expired_" + product.id;
    model.constraints[expired] = { min: product.stock };
    model.variables["expired_stock_" + product.id] = {
      cost: (0.2 * product.price) / product.size,
      [expired]: 1,
    };
  }
  if (usableDays > 0 && usableDays < 14) {
    const late = "late_" + product.id;
    model.constraints[late] = { max: 0 };
    model.variables[buyVariable][late] = -product.size;
  }
}

function buildModel(context) {
  const model = newModel();
  addRecipeRepeatConstraints(model, context.recipes, context.options);
  addGroupMinimumConstraints(model, context.groupGoals);
  addDailyNutritionConstraints(model, context.profiles, context.active);
  const hasRestrictedCandidates = addRecipeSelectionVariables(model, context);
  addProductVariables(model, context.products, context.usableDays);
  return { model, hasRestrictedCandidates };
}

function expressionFor(model, names, aliases, key) {
  const terms = names
    .filter((name) => model.variables[name][key])
    .map((name) => {
      const coefficient = model.variables[name][key];
      return `${coefficient >= 0 ? " + " : " - "}${Math.abs(coefficient)} ${aliases[name]}`;
    });
  return terms.join("") || "0 " + aliases[names[0]];
}

function constraintLines(model, names, aliases) {
  const lines = [];
  let index = 0;
  for (const [name, bounds] of Object.entries(model.constraints)) {
    const expression = expressionFor(model, names, aliases, name);
    if (bounds.equal !== undefined) {
      lines.push(` c${index++}: ${expression} = ${bounds.equal}`);
      continue;
    }
    if (bounds.min !== undefined) lines.push(` c${index++}: ${expression} >= ${bounds.min}`);
    if (bounds.max !== undefined) lines.push(` c${index++}: ${expression} <= ${bounds.max}`);
  }
  return lines.join("\n");
}

function variableLines(model, names, aliases, variableSet) {
  return Object.keys(variableSet).map((name) => aliases[name]).join(" ");
}

function linearProgram(model) {
  const names = Object.keys(model.variables);
  const aliases = Object.fromEntries(names.map((name, index) => [name, "v" + index]));
  const objective = expressionFor(model, names, aliases, "cost");
  const bounds = names.map((name) => ` ${aliases[name]} >= 0`).join("\n");
  return {
    names,
    aliases,
    lp: "Minimize\n obj: " + objective + "\nSubject To\n" + constraintLines(model, names, aliases) +
      "\nBounds\n" + bounds + "\nGenerals\n" + variableLines(model, names, aliases, model.ints) +
      "\nBinary\n" + variableLines(model, names, aliases, model.binaries) + "\nEnd\n",
  };
}

function throwForSolverStatus(status) {
  if (status === "Infeasible") {
    throw new Error("No se ha encontrado un menú que cumpla todos los objetivos. Revisa los objetivos nutricionales, límites de repetición, grupos, recetas fijadas y fechas de la despensa. Prueba a ajustar los valores elegidos; no se han relajado automáticamente.");
  }
  throw new Error("El cálculo no ha terminado con una solución verificada (" + status + "). Prueba con menos recetas o ajusta los objetivos.");
}

function resultValues(names, aliases, columns) {
  return Object.fromEntries(names.map((name) => [name, columns[aliases[name]]?.Primal || 0]));
}

function createPlan(valid, result) {
  const plan = [];
  for (let day = 0; day < 14; day++) {
    for (const meal of meals) {
      for (const recipe of valid.filter((item) => item.meal === meal)) {
        if (result[`y_${day}_${meal}_${recipe.id}`] > 0.5) {
          plan.push({
            day,
            meal,
            recipeId: recipe.id,
            portions: [0, 1].map((person) => (result[`x_${day}_${meal}_${recipe.id}_${person}`] || 0) / 2),
          });
        }
      }
    }
  }
  return plan;
}

function createShopping(products, result) {
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    packages: Math.round(result["buy_" + product.id] || 0),
    size: product.size,
    unit: product.unit,
    price: product.price,
    checked: false,
  })).filter((product) => product.packages > 0);
}

function calculateProductUsage(product, plan, recipes, usableDays) {
  let used = 0;
  let beforeExpiry = 0;
  for (const item of plan) {
    const recipe = recipes.find((candidate) => candidate.id === item.recipeId);
    for (const ingredient of recipe.ingredients.filter((entry) => entry.productId === product.id)) {
      const amount = ingredient.amount * (item.portions[0] + item.portions[1]);
      used += amount;
      if (item.day < usableDays[product.id]) beforeExpiry += amount;
    }
  }
  return { used, beforeExpiry };
}

function productLeftover(product, plan, recipes, usableDays, result) {
  const { used, beforeExpiry } = calculateProductUsage(product, plan, recipes, usableDays);
  const packages = Math.round(result["buy_" + product.id] || 0);
  const purchased = packages * product.size;
  const expiredStock = usableDays[product.id] < 14 ? Math.max(0, product.stock - beforeExpiry) : 0;
  return {
    id: product.id,
    name: product.name,
    unit: product.unit,
    stock: product.stock,
    purchased,
    used,
    remaining: Math.max(0, product.stock + purchased - used),
    expiredStock,
  };
}

function createLeftovers(products, plan, recipes, usableDays, result) {
  return products
    .map((product) => productLeftover(product, plan, recipes, usableDays, result))
    .filter(hasLeftoverUsage);
}

function hasLeftoverUsage(item) {
  return item.stock > 0 || item.purchased > 0 || item.used > 0;
}
async function optimize(data, internal = {}) {
  const context = await prepareOptimization(data);
  context.disableBalancedRotation = Boolean(internal.disableBalancedRotation);
  const { model, hasRestrictedCandidates } = buildModel(context);
  const { lp, names, aliases } = linearProgram(model);
  const highs = await loadHighs();
  const solved = highs.solve(lp, { output_flag: false, time_limit: 8, mip_rel_gap: 0.01 });
  const verified = isFeasibleSolution(model, names, aliases, solved.Columns);
  if (!isAcceptedSolverResult(solved.Status, verified)) {
    return recoverOrThrow(data, solved.Status, hasRestrictedCandidates);
  }
  if (!verified) throw new Error('La solución calculada no supera la comprobación de restricciones.');
  return buildPlanResult(context, solved, names, aliases, hasRestrictedCandidates);
}

function isAcceptedSolverResult(status, verified) {
  return status === 'Optimal' || (status === 'Time limit reached' && verified);
}

function recoverOrThrow(data, status, hasRestrictedCandidates) {
  if (status === 'Infeasible' && hasRestrictedCandidates) {
    return optimize(data, { disableBalancedRotation: true });
  }
  throwForSolverStatus(status);
}

function buildPlanResult(context, solved, names, aliases, hasRestrictedCandidates) {
  const result = resultValues(names, aliases, solved.Columns);
  const plan = createPlan(context.recipes, result);
  const shopping = createShopping(context.products, result);
  const leftovers = createLeftovers(context.products, plan, context.recipes, context.usableDays, result);
  const solutionStatus = solved.Status === 'Optimal' && !hasRestrictedCandidates ? 'optimal' : 'feasible';
  return { plan, shopping, leftovers, solutionStatus };
}

module.exports = { optimize, isFeasibleSolution };
