const loadHighs = require("highs");
const meals = ["Desayuno", "Comida", "Cena", "Tentempié"];
// Check every model constraint and integer variable before accepting an incumbent.
function isFeasibleSolution(model, names, aliases, columns) {
  if (!columns) return false;
  const totals = Object.fromEntries(Object.keys(model.constraints).map((key) => [key, 0]));
  for (const name of names) {
    const value = columns[aliases[name]]?.Primal;
    if (!Number.isFinite(value) || value < -1e-6) return false;
    if ((name in model.ints || name in model.binaries) && Math.abs(value - Math.round(value)) > 1e-6) return false;
    if (name in model.binaries && value > 1 + 1e-6) return false;
    for (const [key, coefficient] of Object.entries(model.variables[name])) {
      if (key !== "cost" && key in totals) totals[key] += value * coefficient;
    }
  }
  for (const [name, bounds] of Object.entries(model.constraints)) {
    const value = totals[name];
    const check = (bound, lower) => {
      const tolerance = 1e-6 * Math.max(1, Math.abs(bound));
      return lower ? value >= bound - tolerance : value <= bound + tolerance;
    };
    if (bounds.equal !== undefined && (!check(bounds.equal, true) || !check(bounds.equal, false))) return false;
    if (bounds.min !== undefined && !check(bounds.min, true)) return false;
    if (bounds.max !== undefined && !check(bounds.max, false)) return false;
  }
  return true;
}
async function optimize(data, internal = {}) {
  const { profiles, recipes, products } = data;
  const locks = data.locks ?? [];
  if (
    !Array.isArray(profiles) ||
    profiles.length !== 2 ||
    !Array.isArray(recipes) ||
    !Array.isArray(products)
  )
    throw new Error("Se necesitan dos perfiles, recetas y productos.");
  const productIds = new Set();
  for (const p of products) {
    if (
      !p ||
      typeof p.id !== "string" ||
      !p.id ||
      productIds.has(p.id) ||
      !Number.isFinite(p.size) ||
      p.size <= 0 ||
      !Number.isFinite(p.stock) ||
      p.stock < 0 ||
      !Number.isFinite(p.price) ||
      p.price < 0
    )
      throw new Error(
        "Revisa los productos: identificadores únicos, tamaño positivo, precio y existencias no negativos.",
      );
    productIds.add(p.id);
  }
  const recipeIds = new Set();
  for (const r of recipes) {
    if (!r || typeof r.id !== "string" || !r.id || recipeIds.has(r.id))
      throw new Error("Revisa que cada receta tenga un identificador único.");
    recipeIds.add(r.id);
  }
  const { recommendationBasis, recommendGoals } =
    await import("./profile-estimates.mjs");
  const { nutrients, foodGroups } = await import("./nutrients.mjs");
  const options = data.optimizationOptions || {};
  if (
    profiles.some(
      (p) =>
        p.objectiveSource === "suggested" &&
        (p.recommendationBasis !== recommendationBasis(p) ||
          !recommendGoals(p).proposal),
    )
  )
    throw new Error(
      "Una propuesta nutricional ya no corresponde al perfil. Revisa y confirma los objetivos antes de generar el menú.",
    );
  if (profiles.some((p) => p.restrictions && p.restrictions.trim()))
    throw new Error(
      "Las alergias y restricciones todavía no se pueden verificar automáticamente. No generes un plan hasta que estén soportadas y revisadas.",
    );
  for (const p of profiles)
    for (const k of ["calories", "protein", "carbs", "fat"])
      if (!Number.isFinite(p[k]) || p[k] <= 0)
        throw new Error("Introduce objetivos positivos para ambas personas.");
  const complete = recipes.filter(
    (r) =>
      r.approved &&
      meals.includes(r.meal) &&
      ["calories", "protein", "carbs", "fat"].every(
        (k) => Number.isFinite(r[k]) && r[k] > 0,
      ) &&
      Array.isArray(r.ingredients) &&
      r.ingredients.length &&
      r.ingredients.every(
        (i) =>
          Number.isFinite(i.amount) &&
          i.amount > 0 &&
          products.some(
            (p) =>
              p.id === i.productId &&
              p.size > 0 &&
              p.price >= 0 &&
              p.stock >= 0,
          ),
      ),
  );
  for (const meal of meals)
    if (!complete.some((r) => r.meal === meal))
      throw new Error(
        "Falta al menos una receta revisada y completa para " + meal + ".",
      );
  const active = [];
  for (const n of nutrients)
    for (let i = 0; i < 2; i++) {
      const value = profiles[i].nutritionGoals?.[n.goal];
      if (value !== undefined && value !== null) {
        if (!Number.isFinite(value) || value < 0)
          throw new Error(
            "El objetivo de " + n.label + " debe ser un número no negativo.",
          );
        active.push({ n, person: i, value });
      }
    }
  const activeNutrients = nutrients.filter((n) =>
    active.some((a) => a.n.key === n.key),
  );
  if (
    options.maxRecipeRepetitions !== undefined &&
    (!Number.isInteger(options.maxRecipeRepetitions) ||
      options.maxRecipeRepetitions < 1 ||
      options.maxRecipeRepetitions > 14)
  )
    throw new Error("El máximo de repeticiones debe estar entre 1 y 14.");
  const groupGoals = options.categoryMinimums || {};
  if (typeof groupGoals !== "object" || Array.isArray(groupGoals))
    throw new Error("Los objetivos de grupos no son válidos.");
  for (const [group, value] of Object.entries(groupGoals))
    if (
      !foodGroups.some((g) => g.key === group) ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 28
    )
      throw new Error(
        "Los mínimos semanales de grupos deben estar entre 0 y 28.",
      );
  function dateValue(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
      return null;
    const millis = Date.parse(value + "T00:00:00Z");
    return Number.isFinite(millis) &&
      new Date(millis).toISOString().slice(0, 10) === value
      ? millis
      : null;
  }
  const start = dateValue(options.startDate);
  const usableDays = {};
  for (const product of products) {
    if (product.expiresOn) {
      const expiration = dateValue(product.expiresOn);
      if (start === null || expiration === null)
        throw new Error(
          "Indica una fecha de inicio válida y revisa las fechas de caducidad de la despensa.",
        );
      usableDays[product.id] = Math.max(
        0,
        Math.min(14, Math.floor((expiration - start) / 86400000) + 1),
      );
    } else usableDays[product.id] = 14;
  }
  const valid = complete.filter(
    (r) =>
      Number.isFinite(r.sodiumMg) &&
      r.sodiumMg >= 0 &&
      activeNutrients.every((n) => Number.isFinite(r[n.key]) && r[n.key] >= 0),
  );
  for (const meal of meals)
    if (!valid.some((r) => r.meal === meal)) {
      const choices = complete.filter((r) => r.meal === meal);
      const missing = [
        ...(choices.some((r) => !Number.isFinite(r.sodiumMg) || r.sodiumMg < 0)
          ? ["sodio por ración"]
          : []),
        ...activeNutrients
          .filter((n) =>
            choices.some((r) => !Number.isFinite(r[n.key]) || r[n.key] < 0),
          )
          .map((n) => n.label.toLowerCase()),
      ];
      throw new Error(
        "Falta una receta de " +
          meal +
          " con datos revisados de sodio por ración y de todos los nutrientes con objetivos activos" +
          (missing.length ? ": " + missing.join(", ") : "") +
          ". Los valores desconocidos no se consideran cero.",
      );
    }
  if (!Array.isArray(locks) || locks.length > 56)
    throw new Error("Las recetas fijadas no son válidas.");
  const seen = new Set();
  for (const lock of locks) {
    if (
      !lock ||
      !Number.isInteger(lock.day) ||
      lock.day < 0 ||
      lock.day >= 14 ||
      !meals.includes(lock.meal) ||
      typeof lock.recipeId !== "string" ||
      !valid.some((r) => r.id === lock.recipeId && r.meal === lock.meal)
    )
      throw new Error(
        "Una receta fijada ya no está disponible o no corresponde a esa comida. Revísala antes de recalcular.",
      );
    const key = lock.day + "_" + lock.meal;
    if (seen.has(key))
      throw new Error("Hay más de una receta fijada para una misma comida.");
    seen.add(key);
  }
  // Limit each slot to a rotating shortlist for tractable mixed-integer models.
  // Keep high-energy choices available for larger daily targets. Explicit locks
  // always win. If the shortlist is infeasible, retry the full model.
  let hasRestrictedCandidates = false;
  function slotCandidates(day, meal) {
    const all = valid.filter((r) => r.meal === meal);
    const fixed = locks.find((lock) => lock.day === day && lock.meal === meal);
    if (fixed) return all.filter((r) => r.id === fixed.recipeId);
    if (internal.disableBalancedRotation || all.length <= 3) return all;
    hasRestrictedCandidates = true;
    const highEnergy = [...all].sort((a, b) => b.calories - a.calories).slice(0, 2);
    const chosen = new Set(highEnergy.map((r) => r.id));
    const result = [...highEnergy];
    for (let offset = 0; offset < all.length && result.length < 3; offset++) {
      const recipe = all[(day * 3 + offset) % all.length];
      if (!chosen.has(recipe.id)) { result.push(recipe); chosen.add(recipe.id); }
    }
    return result;
  }
  const model = {
    optimize: "cost",
    opType: "min",
    constraints: {},
    variables: {},
    ints: {},
    binaries: {},
  };
  for (const r of valid) {
    const repeat = "repeats_" + r.id;
    model.constraints[repeat] = { min: -1 };
    model.variables["excess_" + r.id] = { cost: 0.75, [repeat]: 1 };
    if (options.maxRecipeRepetitions !== undefined)
      model.constraints["cap_" + r.id] = { max: options.maxRecipeRepetitions };
  }
  for (let week = 0; week < 2; week++)
    for (const [group, minimum] of Object.entries(groupGoals))
      if (minimum > 0)
        model.constraints[`group_${week}_${group}`] = { min: minimum };
  for (let d = 0; d < 14; d++) {
    for (let p = 0; p < 2; p++)
      for (const k of ["calories", "protein", "carbs", "fat"])
        model.constraints[`n_${d}_${p}_${k}`] = {
          min: profiles[p][k] * 0.9,
          max: profiles[p][k] * 1.1,
        };
    for (const a of active)
      model.constraints[`extra_${d}_${a.person}_${a.n.key}`] = {
        [a.n.direction]: a.value,
      };
    for (const meal of meals) {
      const slot = `${d}_${meal}`;
      model.constraints["select_" + slot] = { equal: 1 };
      for (const r of slotCandidates(d, meal)) {
        const y = `y_${slot}_${r.id}`;
        model.variables[y] = {
          ["select_" + slot]: 1,
          cost: Math.max(0, 4 - (r.rating || 0)) * 0.03,
        };
        model.binaries[y] = 1;
        model.variables[y]["repeats_" + r.id] = -1;
        if (options.maxRecipeRepetitions !== undefined)
          model.variables[y]["cap_" + r.id] = 1;
        for (const [group, minimum] of Object.entries(groupGoals))
          if (
            minimum > 0 &&
            Array.isArray(r.foodGroups) &&
            r.foodGroups.includes(group)
          )
            model.variables[y][`group_${Math.floor(d / 7)}_${group}`] = 1;
        if (
          locks.some(
            (l) => l.day === d && l.meal === meal && l.recipeId === r.id,
          )
        ) {
          const locked = "fixed_" + slot;
          model.constraints[locked] = { equal: 1 };
          model.variables[y][locked] = 1;
        }
        for (let p = 0; p < 2; p++) {
          const x = `x_${slot}_${r.id}_${p}`,
            link = `link_${slot}_${r.id}_${p}`,
            lower = `lower_${slot}_${r.id}_${p}`;
          model.constraints[link] = { max: 0 };
          model.constraints[lower] = { min: 0 };
          model.variables[y][link] = -4;
          model.variables[y][lower] = -1;
          const v = { cost: (r.sodiumMg * 0.0001) / 2, [link]: 1, [lower]: 1 };
          for (const k of ["calories", "protein", "carbs", "fat"])
            v[`n_${d}_${p}_${k}`] = r[k] / 2;
          for (const a of active)
            if (a.person === p)
              v[`extra_${d}_${p}_${a.n.key}`] = r[a.n.key] / 2;
          for (const i of r.ingredients) {
            v["product_" + i.productId] =
              (v["product_" + i.productId] || 0) + i.amount / 2;
            v["surplus_" + i.productId] =
              (v["surplus_" + i.productId] || 0) + i.amount / 2;
            if (d < usableDays[i.productId] && usableDays[i.productId] < 14)
              v["expired_" + i.productId] =
                (v["expired_" + i.productId] || 0) + i.amount / 2;
            if (d >= usableDays[i.productId] && usableDays[i.productId] > 0)
              v["late_" + i.productId] =
                (v["late_" + i.productId] || 0) + i.amount / 2;
          }
          model.variables[x] = v;
          model.ints[x] = 1;
        }
      }
    }
  }
  for (const product of products) {
    const c = "product_" + product.id;
    model.constraints[c] = {
      max: usableDays[product.id] === 0 ? 0 : product.stock,
    };
    const v = "buy_" + product.id;
    model.variables[v] = { cost: product.price, [c]: -product.size };
    const surplus = "surplus_" + product.id;
    model.constraints[surplus] = { min: product.stock };
    model.variables[v][surplus] = -product.size;
    model.variables["remaining_" + product.id] = {
      cost: (0.05 * product.price) / product.size,
      [surplus]: 1,
    };
    if (usableDays[product.id] < 14) {
      const expired = "expired_" + product.id;
      model.constraints[expired] = { min: product.stock };
      model.variables["expired_stock_" + product.id] = {
        cost: (0.2 * product.price) / product.size,
        [expired]: 1,
      };
    }
    if (usableDays[product.id] > 0 && usableDays[product.id] < 14) {
      const late = "late_" + product.id;
      model.constraints[late] = { max: 0 };
      model.variables[v][late] = -product.size;
    }
    model.ints[v] = 1;
  }
  const names = Object.keys(model.variables),
    aliases = Object.fromEntries(names.map((name, i) => [name, "v" + i]));
  const expr = (key) =>
    names
      .filter((n) => model.variables[n][key])
      .map(
        (n) =>
          `${model.variables[n][key] >= 0 ? " + " : " - "}${Math.abs(model.variables[n][key])} ${aliases[n]}`,
      )
      .join("") || "0 " + aliases[names[0]];
  let lp = "Minimize\n obj: " + expr("cost") + "\nSubject To\n";
  let j = 0;
  for (const [name, c] of Object.entries(model.constraints)) {
    const e = expr(name);
    if (c.equal !== undefined) lp += ` c${j++}: ${e} = ${c.equal}\n`;
    else {
      if (c.min !== undefined) lp += ` c${j++}: ${e} >= ${c.min}\n`;
      if (c.max !== undefined) lp += ` c${j++}: ${e} <= ${c.max}\n`;
    }
  }
  lp +=
    "Bounds\n" +
    names.map((n) => ` ${aliases[n]} >= 0`).join("\n") +
    "\nGenerals\n" +
    Object.keys(model.ints)
      .map((n) => aliases[n])
      .join(" ") +
    "\nBinary\n" +
    Object.keys(model.binaries)
      .map((n) => aliases[n])
      .join(" ") +
    "\nEnd\n";
  const highs = await loadHighs();
  const solved = highs.solve(lp, {
    output_flag: false,
    time_limit: 8,
    mip_rel_gap: 0.01,
  });
  const verified = isFeasibleSolution(model, names, aliases, solved.Columns);
  if (solved.Status !== "Optimal" && !(solved.Status === "Time limit reached" && verified)) {
    if (solved.Status === "Infeasible" && hasRestrictedCandidates)
      return optimize(data, { disableBalancedRotation: true });
    if (solved.Status === "Infeasible")
      throw new Error(
        "No se ha encontrado un menú que cumpla todos los objetivos. Revisa los objetivos nutricionales, límites de repetición, grupos, recetas fijadas y fechas de la despensa. Prueba a ajustar los valores elegidos; no se han relajado automáticamente.",
      );
    throw new Error(
      "El cálculo no ha terminado con una solución verificada (" +
        solved.Status +
        "). Prueba con menos recetas o ajusta los objetivos.",
    );
  }
  if (!verified) throw new Error("La solución calculada no supera la comprobación de restricciones.");
  const result = Object.fromEntries(
    names.map((n) => [n, solved.Columns[aliases[n]]?.Primal || 0]),
  );
  const plan = [];
  for (let d = 0; d < 14; d++)
    for (const meal of meals)
      for (const r of valid.filter((x) => x.meal === meal))
        if (result[`y_${d}_${meal}_${r.id}`] > 0.5)
          plan.push({
            day: d,
            meal,
            recipeId: r.id,
            portions: [0, 1].map(
              (p) => (result[`x_${d}_${meal}_${r.id}_${p}`] || 0) / 2,
            ),
          });
  const shopping = products
    .map((p) => ({
      id: p.id,
      name: p.name,
      packages: Math.round(result["buy_" + p.id] || 0),
      size: p.size,
      unit: p.unit,
      price: p.price,
      checked: false,
    }))
    .filter((p) => p.packages > 0);
  const leftovers = products
    .map((product) => {
      let used = 0,
        before = 0;
      for (const item of plan) {
        const recipe = valid.find((r) => r.id === item.recipeId);
        for (const ingredient of recipe.ingredients.filter(
          (i) => i.productId === product.id,
        )) {
          const amount =
            ingredient.amount * (item.portions[0] + item.portions[1]);
          used += amount;
          if (item.day < usableDays[product.id]) before += amount;
        }
      }
      const purchased =
        Math.round(result["buy_" + product.id] || 0) * product.size;
      const expiredStock =
        usableDays[product.id] < 14 ? Math.max(0, product.stock - before) : 0;
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
    })
    .filter((x) => x.stock > 0 || x.purchased > 0 || x.used > 0);
  return { plan, shopping, leftovers, solutionStatus: solved.Status === "Optimal" && !hasRestrictedCandidates ? "optimal" : "feasible" };
}
module.exports = { optimize, isFeasibleSolution };
