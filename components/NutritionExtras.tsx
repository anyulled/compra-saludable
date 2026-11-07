"use client";
import { nutrients, foodGroups } from "../lib/nutrients.mjs";
import type { Recipe } from "../lib/types";
export default function NutritionExtras({
  recipe,
  update,
}: {
  recipe: Recipe;
  update: (patch: Partial<Recipe>) => void;
}) {
  return (
    <div className="extras">
      <div className="subheading">NUTRIENTES Y GRUPOS · POR RACIÓN</div>
      <p className="help">
        Introduce datos revisados del total de la receta divididos por el número
        de raciones. Un valor vacío es desconocido; cero debe estar verificado.
        Los azúcares libres no son necesariamente los azúcares totales de la
        etiqueta.
      </p>
      <div className="form-grid three">
        {nutrients
          .filter((n) => n.key !== "vitaminDMcg")
          .map((n) => (
            <label className="field" key={n.key}>
              {n.label} ({n.unit})
              <input
                type="number"
                min="0"
                step="0.1"
                value={
                  (recipe[n.key as keyof Recipe] as number | undefined) ?? ""
                }
                onChange={(e) => {
                  const raw = e.target.value;
                  if (
                    raw !== "" &&
                    (!Number.isFinite(Number(raw)) || Number(raw) < 0)
                  )
                    return;
                  update({ [n.key]: raw === "" ? undefined : Number(raw) });
                }}
              />
            </label>
          ))}
      </div>
      <label className="field">
        Fuente de los nutrientes
        <input
          value={recipe.nutritionExtrasSource || ""}
          onChange={(e) => update({ nutritionExtrasSource: e.target.value })}
        />
      </label>
      <div className="subheading">GRUPOS PRESENTES · REVISAR MANUALMENTE</div>
      <div className="group-checkboxes">
        {foodGroups.map((g) => (
          <label key={g.key}>
            <input
              type="checkbox"
              checked={(recipe.foodGroups || []).includes(g.key)}
              onChange={(e) =>
                update({
                  foodGroups: e.target.checked
                    ? [...(recipe.foodGroups || []), g.key]
                    : (recipe.foodGroups || []).filter((x) => x !== g.key),
                })
              }
            />
            {g.label}
          </label>
        ))}
      </div>
      <p className="help">
        La clasificación solo cuenta apariciones de recetas; no garantiza
        cantidades mínimas por grupo.
      </p>
    </div>
  );
}
