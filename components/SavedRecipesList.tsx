import NutritionExtras from "./NutritionExtras";
import type { Recipe } from "../lib/types";

function RecipeRow({ recipe, update }: {
  recipe: Recipe;
  update: (id: string, patch: Partial<Recipe>) => void;
}) {
  return (
    <div className="list-row">
      <div>
        <strong>{recipe.name}</strong>
        <p>{recipe.meal} · {recipe.calories} kcal por ración</p>
        <label className="field"><span>Sodio por ración (mg; vacío si se desconoce)</span><input type="number" min="0" value={recipe.sodiumMg ?? ""} onChange={(event) => update(recipe.id, { sodiumMg: event.target.value === "" ? undefined : Number(event.target.value) })} /></label>
        <label className="field"><span>Vitamina D por ración (µg; vacío si se desconoce)</span><input type="number" min="0" step="0.1" value={recipe.vitaminDMcg ?? ""} onChange={(event) => {
          const raw = event.target.value;
          if (raw !== "" && (!Number.isFinite(Number(raw)) || Number(raw) < 0)) return;
          update(recipe.id, { vitaminDMcg: raw === "" ? undefined : Number(raw) });
        }} /></label>
        <label className="field"><span>Fuente de vitamina D</span><input value={recipe.vitaminDSource || ""} onChange={(event) => update(recipe.id, { vitaminDSource: event.target.value })} /></label>
        <NutritionExtras recipe={recipe} update={(patch) => update(recipe.id, patch)} />
      </div>
      <label className="rating">Preferencia <select value={recipe.rating} onChange={(event) => update(recipe.id, { rating: Number(event.target.value) || 0 })}>{[1, 2, 3, 4, 5].map((rating) => <option key={rating}>{rating}</option>)}</select></label>
    </div>
  );
}

export default function SavedRecipesList({ recipes, update }: {
  recipes: Recipe[];
  update: (id: string, patch: Partial<Recipe>) => void;
}) {
  return <div className="list">{recipes.map((recipe) => <RecipeRow key={recipe.id} recipe={recipe} update={update} />)}</div>;
}
