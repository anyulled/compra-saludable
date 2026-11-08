import { useMemo } from "react";
import type { Recipe } from "../lib/types";
import { extractRecipe } from "../lib/recipe-extraction.mjs";

type Suggestions = ReturnType<typeof extractRecipe>;
type Props = { suggestions: Suggestions; setRecipe: React.Dispatch<React.SetStateAction<Recipe>> };

function SuggestedTitle({ title, setRecipe }: { title: string; setRecipe: Props["setRecipe"] }) {
  return <div className="suggestion"><span><strong>Nombre posible:</strong> {title}</span><button className="secondary" onClick={() => setRecipe((recipe) => ({ ...recipe, name: title }))}>Usar nombre</button></div>;
}

function SuggestedIngredients({ ingredients }: { ingredients: string[] }) {
  return <><div className="subheading">INGREDIENTES DETECTADOS · REVISA LA LISTA COMPLETA</div><ul className="suggestion-list">{ingredients.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}</ul><p className="help">Asocia manualmente cada ingrediente con un producto y ajusta la cantidad por ración en el formulario. No se seleccionan productos automáticamente.</p></>;
}

function SuggestedPreparation({ preparation }: { preparation: string }) {
  return <><div className="subheading">PREPARACIÓN DETECTADA</div><pre className="suggestion-text">{preparation}</pre></>;
}

function NutrientSuggestion({ value, keyName, label, unit, disabled, setRecipe }: {
  value: number;
  keyName: "calories" | "protein" | "carbs" | "fat";
  label: string;
  unit: string;
  disabled: boolean;
  setRecipe: Props["setRecipe"];
}) {
  return <div className="suggestion" key={keyName}><span>{label}: <strong>{value} {unit}</strong></span><button className="secondary" disabled={disabled} onClick={() => setRecipe((recipe) => ({ ...recipe, [keyName]: value }))}>Usar valor</button></div>;
}

function SuggestedNutrition({ suggestions, setRecipe }: Props) {
  const entries = useMemo(() => [
    ["calories", "Energía", "kcal"],
    ["protein", "Proteínas", "g"],
    ["carbs", "Carbohidratos", "g"],
    ["fat", "Grasas", "g"],
  ] as const, []);
  const hasValues = Object.keys(suggestions.nutrition).length > 0 || suggestions.ambiguous.length > 0;
  if (!hasValues) return null;
  return (
    <>
      <div className="subheading">NUTRICIÓN DETECTADA</div>
      {suggestions.per100 && <div className="warning">El texto menciona valores por 100 g o ml. No se pueden aplicar automáticamente como valores por ración.</div>}
      {suggestions.ambiguous.length > 0 && <div className="warning">Hay valores repetidos o ambiguos; consúltalos en el original.</div>}
      <div className="suggestion-nutrients">{entries.map(([keyName, label, unit]) => {
        const value = suggestions.nutrition[keyName];
        return value === undefined ? null : <NutrientSuggestion key={keyName} value={value} keyName={keyName} label={label} unit={unit} disabled={suggestions.per100} setRecipe={setRecipe} />;
      })}</div>
    </>
  );
}

export default function RecipeSuggestions({ suggestions, setRecipe }: Props) {
  const hasSuggestions = Boolean(suggestions.title || suggestions.ingredients.length || suggestions.preparation || Object.keys(suggestions.nutrition).length || suggestions.ambiguous.length);
  if (!hasSuggestions) return null;
  return <section className="card"><h2>Datos detectados</h2><p className="help">Son sugerencias del texto de una página, no datos verificados. Elige solo los valores que correspondan a esta receta y a una ración. Comprueba cantidades y pasos en el original.</p>{suggestions.title && <SuggestedTitle title={suggestions.title} setRecipe={setRecipe} />}{suggestions.ingredients.length > 0 && <SuggestedIngredients ingredients={suggestions.ingredients} />}{suggestions.preparation && <SuggestedPreparation preparation={suggestions.preparation} />}<SuggestedNutrition suggestions={suggestions} setRecipe={setRecipe} /></section>;
}
