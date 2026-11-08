import NutritionExtras from "./NutritionExtras";
import type { Ingredient, Meal, Product, Recipe } from "../lib/types";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <Field label={label}><input type="number" min="0" value={value || ""} onChange={(event) => onChange(Number(event.target.value) || 0)} /></Field>;
}

function changeVitaminD(raw: string, recipe: Recipe, setRecipe: (recipe: Recipe) => void) {
  if (raw === "") return setRecipe({ ...recipe, vitaminDMcg: undefined });
  const value = Number(raw);
  if (Number.isFinite(value) && value >= 0) setRecipe({ ...recipe, vitaminDMcg: value });
}

function IngredientRows({ recipe, setRecipe }: { products: Product[]; recipe: Recipe; setRecipe: (recipe: Recipe) => void }) {
  const change = (index: number, patch: Partial<Ingredient>) => setRecipe({
    ...recipe,
    ingredients: recipe.ingredients.map((ingredient, row) => row === index ? { ...ingredient, ...patch } : ingredient),
  });
  return <div className="list">{recipe.ingredients.map((ingredient, index) => <div className="ingredient ingredient-edit" key={index}>
    <Field label={`Ingrediente ${index + 1}`}><input aria-label={`Ingrediente ${index + 1}`} value={ingredient.name || ""} placeholder="p. ej., garbanzos cocidos" onChange={(event) => change(index, { name: event.target.value, productId: undefined, productOptions: undefined })} /></Field>
    <Field label="Cantidad"><input aria-label={`Cantidad del ingrediente ${index + 1}`} type="number" min="0" value={ingredient.amount || ""} onChange={(event) => change(index, { amount: Number(event.target.value) || 0 })} /></Field>
    <Field label="Unidad"><select aria-label={`Unidad del ingrediente ${index + 1}`} value={ingredient.unit || "g"} onChange={(event) => change(index, { unit: event.target.value, productId: undefined, productOptions: undefined })}><option value="g">g</option><option value="ml">ml</option><option value="unidades">unidades</option></select></Field>
    <button type="button" className="secondary" aria-label={`Eliminar ingrediente ${index + 1}`} onClick={() => setRecipe({ ...recipe, ingredients: recipe.ingredients.filter((_, row) => row !== index) })}>Eliminar</button>
  </div>)}
    <button type="button" className="secondary" onClick={() => setRecipe({ ...recipe, ingredients: [...recipe.ingredients, { name: "", unit: "g", amount: 0 }] })}>Añadir ingrediente</button>
  </div>;
}

export default function RecipeEntryForm({ recipe, setRecipe, products, selectedDraft, reviewConfirmed, setReviewConfirmed, addRecipe }: {
  recipe: Recipe;
  setRecipe: (recipe: Recipe) => void;
  products: Product[];
  selectedDraft: string | null;
  reviewConfirmed: boolean;
  setReviewConfirmed: (confirmed: boolean) => void;
  addRecipe: () => void;
}) {
  return (
    <section className="card">
      <h2>Nueva receta</h2>
      <div className="form-grid three">
        <Field label="Nombre"><input value={recipe.name} onChange={(event) => setRecipe({ ...recipe, name: event.target.value })} /></Field>
        <Field label="Comida"><select value={recipe.meal} onChange={(event) => setRecipe({ ...recipe, meal: event.target.value as Meal })}><option>Desayuno</option><option>Comida</option><option>Cena</option><option>Tentempié</option></select></Field>
        <NumberField label="Energía por ración (kcal)" value={recipe.calories} onChange={(value) => setRecipe({ ...recipe, calories: value })} />
        <NumberField label="Proteínas por ración (g)" value={recipe.protein} onChange={(value) => setRecipe({ ...recipe, protein: value })} />
        <NumberField label="Carbohidratos por ración (g)" value={recipe.carbs} onChange={(value) => setRecipe({ ...recipe, carbs: value })} />
        <NumberField label="Grasas por ración (g)" value={recipe.fat} onChange={(value) => setRecipe({ ...recipe, fat: value })} />
        <Field label="Sodio por ración (mg)"><input type="number" min="0" value={recipe.sodiumMg ?? ""} onChange={(event) => setRecipe({ ...recipe, sodiumMg: event.target.value === "" ? undefined : Number(event.target.value) })} /></Field>
      </div>
      <p className="help">Usa sodio total de todos los ingredientes y la sal añadida, por ración. Un valor desconocido debe quedar vacío; 0 solo si se ha verificado. Si solo conoces la sal en gramos, 1 g de sal equivale aproximadamente a 400 mg de sodio.</p>
      <Field label="Vitamina D por ración (µg; opcional)"><input type="number" min="0" step="0.1" value={recipe.vitaminDMcg ?? ""} onChange={(event) => changeVitaminD(event.target.value, recipe, setRecipe)} /></Field>
      <Field label="Fuente de vitamina D (opcional)"><input value={recipe.vitaminDSource || ""} onChange={(event) => setRecipe({ ...recipe, vitaminDSource: event.target.value })} placeholder="Etiqueta, tabla nutricional…" /></Field>
      <p className="help">Registra el total por ración solo si lo conoces. Un valor vacío significa desconocido; 0 µg debe estar verificado. Si la fuente usa unidades internacionales (UI), 40 UI = 1 µg.</p>
      <NutritionExtras recipe={recipe} update={(patch) => setRecipe({ ...recipe, ...patch })} />
      <Field label="Preparación y fuente nutricional"><textarea value={recipe.notes} onChange={(event) => setRecipe({ ...recipe, notes: event.target.value })} /></Field>
      <div className="subheading">INGREDIENTES Y CANTIDAD POR RACIÓN</div>
      {products.length === 0 && <p className="help">Al guardar la receta buscaremos cada ingrediente en Mercadona; podrás elegir el producto adecuado.</p>}
      <IngredientRows products={products} recipe={recipe} setRecipe={setRecipe} />
      {selectedDraft && <label className="review-check"><input type="checkbox" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} /><span>He contrastado el documento original, el número de raciones, todos los ingredientes y los valores por ración.</span></label>}
      <button className="primary" onClick={addRecipe}>He revisado y quiero guardar</button>
    </section>
  );
}
