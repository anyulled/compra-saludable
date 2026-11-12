import type { IngredientProductOption, Product, Recipe } from "../lib/types";

function optionIsDisabled(option: IngredientProductOption, ingredientUnit: string) {
  return !option.unit || !option.size || option.price === null || option.unit !== ingredientUnit;
}

function toProduct(option: IngredientProductOption): Product {
  return { id: option.id, name: option.name, unit: option.unit || "", size: option.size || 0, price: option.price || 0, stock: 0, source: option.source };
}

function OptionButton({ option, ingredient, recipe, ingredientIndex, onChoose }: {
  option: IngredientProductOption;
  ingredient: Recipe["ingredients"][number];
  recipe: Recipe;
  ingredientIndex: number;
  onChoose: (recipe: Recipe, ingredientIndex: number, product: Product) => void;
}) {
  const unit = ingredient.unit || "g";
  const priceLabel = option.price === null ? "precio sin confirmar" : `${option.price.toFixed(2)} €`;
  return <button className="secondary" disabled={optionIsDisabled(option, unit)} onClick={onChoose.bind(null, recipe, ingredientIndex, toProduct(option))}>
    {option.name} · {option.size ?? "formato por revisar"} {option.unit || ""} · {priceLabel}
    {option.warning && <small> — {option.warning}</small>}
    {option.unit !== unit && <small> — unidad incompatible ({option.unit || "sin formato"}); no se puede asociar automáticamente</small>}
  </button>;
}

function renderOption(option: IngredientProductOption, recipe: Recipe, ingredient: Recipe["ingredients"][number], ingredientIndex: number, onChoose: (recipe: Recipe, ingredientIndex: number, product: Product) => void) {
  return <OptionButton key={option.id} option={option} recipe={recipe} ingredient={ingredient} ingredientIndex={ingredientIndex} onChoose={onChoose} />;
}

function ResolverRow({ recipe, ingredientIndex, count = 1, onChoose, onRetry }: {
  recipe: Recipe;
  ingredientIndex: number;
  count?: number;
  onChoose: (recipe: Recipe, ingredientIndex: number, product: Product) => void;
  onRetry: (recipe: Recipe, ingredientIndex: number) => void;
}) {
  const ingredient = recipe.ingredients[ingredientIndex];
  const options = ingredient.productOptions || [];
  const usageLabel = count > 1 ? ` · usado en ${count} recetas` : "";
  return <div className="list-row"><div>
    <strong>{ingredient.name || "Ingrediente sin nombre"}</strong><p>{ingredient.amount} {ingredient.unit || "g"}{usageLabel} · {options.length} coincidencias</p>
    {options.length ? <div className="form-grid">{options.map((option) => renderOption(option, recipe, ingredient, ingredientIndex, onChoose))}</div> : <p className="help">No se encontraron coincidencias. Cambia el nombre o intenta buscar de nuevo.</p>}
    {!options.length && <button className="secondary" onClick={() => onRetry(recipe, ingredientIndex)}>Volver a buscar</button>}
    <button className="secondary" onClick={() => onChoose(recipe, ingredientIndex, { id: "", name: "", unit: "", size: 0, price: 0, stock: 0, source: "" })}>Dejar sin asociar</button>
  </div></div>;
}

export default function IngredientProductResolver({ recipes, onChoose, onRetry }: {
  recipes: Recipe[];
  onChoose: (recipe: Recipe, ingredientIndex: number, product: Product) => void;
  onRetry: (recipe: Recipe, ingredientIndex: number) => void;
}) {
  const unresolvedMap = new Map<string, { recipe: Recipe; ingredient: Recipe["ingredients"][number]; index: number; count: number }>();
  for (const recipe of recipes) {
    (recipe.ingredients || []).forEach((ingredient, index) => {
      if (!ingredient.productId && ingredient.name?.trim()) {
        const key = `${ingredient.name.trim().toLocaleLowerCase("es")}|${ingredient.unit || "g"}`;
        const existing = unresolvedMap.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          unresolvedMap.set(key, { recipe, ingredient, index, count: 1 });
        }
      }
    });
  }
  const unresolved = Array.from(unresolvedMap.values());
  if (!unresolved.length) return null;
  return <section className="card"><h2>Elegir productos de Mercadona</h2><p className="help">Revisa que el producto, el formato y la unidad coincidan con la receta antes de asociarlo. La asociación no estima la nutrición.</p><div className="list">{unresolved.map(({ recipe, index, count }) => <ResolverRow key={`${recipe.id}-${index}`} recipe={recipe} ingredientIndex={index} count={count} onChoose={onChoose} onRetry={onRetry} />)}</div></section>;
}
