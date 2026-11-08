import type { IngredientProductOption, Product, Recipe } from "../lib/types";

function ResolverRow({ recipe, ingredientIndex, onChoose, onRetry }: {
  recipe: Recipe;
  ingredientIndex: number;
  onChoose: (recipe: Recipe, ingredientIndex: number, product: Product) => void;
  onRetry: (recipe: Recipe, ingredientIndex: number) => void;
}) {
  const ingredient = recipe.ingredients[ingredientIndex];
  const options = ingredient.productOptions || [];
  return <div className="list-row"><div>
    <strong>{ingredient.name || "Ingrediente sin nombre"}</strong><p>{ingredient.amount} {ingredient.unit || "g"} · {options.length} coincidencias</p>
    {options.length ? <div className="form-grid">{options.map((option: IngredientProductOption) => <button key={option.id} className="secondary" disabled={!option.unit || !option.size || option.price === null || option.unit !== (ingredient.unit || "g")} onClick={() => onChoose(recipe, ingredientIndex, {
      id: option.id, name: option.name, unit: option.unit || "", size: option.size || 0, price: option.price || 0, stock: 0, source: option.source,
    })}>
      {option.name} · {option.size ?? "formato por revisar"} {option.unit || ""} · {option.price === null ? "precio sin confirmar" : `${option.price.toFixed(2)} €`}
      {option.warning && <small> — {option.warning}</small>}
      {option.unit !== (ingredient.unit || "g") && <small> — unidad incompatible ({option.unit || "sin formato"}); no se puede asociar automáticamente</small>}
    </button>)}</div> : <p className="help">No se encontraron coincidencias. Cambia el nombre o intenta buscar de nuevo.</p>}
    {!options.length && <button className="secondary" onClick={() => onRetry(recipe, ingredientIndex)}>Volver a buscar</button>}
    <button className="secondary" onClick={() => onChoose(recipe, ingredientIndex, { id: "", name: "", unit: "", size: 0, price: 0, stock: 0, source: "" })}>Dejar sin asociar</button>
  </div></div>;
}

export default function IngredientProductResolver({ recipes, onChoose, onRetry }: {
  recipes: Recipe[];
  onChoose: (recipe: Recipe, ingredientIndex: number, product: Product) => void;
  onRetry: (recipe: Recipe, ingredientIndex: number) => void;
}) {
  const unresolved = recipes.flatMap((recipe) => recipe.ingredients.map((ingredient, index) => ({ recipe, ingredient, index })).filter(({ ingredient }) => !ingredient.productId && Boolean(ingredient.name)));
  if (!unresolved.length) return null;
  return <section className="card"><h2>Elegir productos de Mercadona</h2><p className="help">Revisa que el producto, el formato y la unidad coincidan con la receta antes de asociarlo. La asociación no estima la nutrición.</p><div className="list">{unresolved.map(({ recipe, index }) => <ResolverRow key={`${recipe.id}-${index}`} recipe={recipe} ingredientIndex={index} onChoose={onChoose} onRetry={onRetry} />)}</div></section>;
}
