import { CircleAlert, RotateCcw } from "lucide-react";
import { extractRecipe } from "../lib/recipe-extraction.mjs";
import type { Recipe, RecipeDraft, State } from "../lib/types";
import RecipeEntryForm from "./RecipeEntryForm";
import RecipeSuggestions from "./RecipeSuggestions";
import SavedRecipesList from "./SavedRecipesList";
import IngredientProductResolver from "./IngredientProductResolver";
import {
  DraftOriginalCard,
  DraftReviewList,
  RecipeImportCard,
  RecipePdfPreview,
  PdfImportJobView,
} from "./RecipeReviewPanels";

type PageStatus = NonNullable<RecipeDraft["status"]>;
type Preview = RecipePdfPreview;
type Props = {
  data: State;
  recipe: Recipe;
  setRecipe: React.Dispatch<React.SetStateAction<Recipe>>;
  importing: boolean;
  importProgress: string;
  importJobs: PdfImportJobView[];
  uploadPdf: (files: File[]) => void;
  selectedDraft: string | null;
  setSelectedDraft: (id: string | null) => void;
  selectedPage: RecipeDraft | undefined;
  suggestions: ReturnType<typeof extractRecipe> | null;
  preview: Preview;
  setPreview: (preview: Preview) => void;
  openingDocument: string | null;
  openDocument: (draft: RecipeDraft) => void;
  setMessage: (message: string) => void;
  setPageStatus: (draft: RecipeDraft, status: PageStatus) => void;
  reviewDraft: (draft: RecipeDraft) => void;
  reviewConfirmed: boolean;
  setReviewConfirmed: (value: boolean) => void;
  addRecipe: () => void;
  updateRecipe: (id: string, patch: Partial<Recipe>) => void;
  chooseIngredientProduct: (recipe: Recipe, ingredientIndex: number, product: import("../lib/types").Product) => void;
  retryIngredientSearch: (recipe: Recipe, ingredientIndex: number) => void;
  resetRecipes: () => void;
};

export default function RecipesPanel(props: Props) {
  const { data, recipe, setRecipe, importing, importProgress, importJobs, uploadPdf, selectedDraft, setSelectedDraft, selectedPage, suggestions, preview, setPreview, openingDocument, openDocument, setMessage, setPageStatus, reviewDraft, reviewConfirmed, setReviewConfirmed, addRecipe, updateRecipe, chooseIngredientProduct, retryIngredientSearch, resetRecipes } = props;
  const hasResetData = data.recipes.length > 0 || (Boolean(data.drafts) && data.drafts!.length > 0);
  return (
    <>
      <div className="eyebrow muted">02 / VUESTRA COCINA</div>
      <h1 className="page-title">Vuestras <em>recetas.</em></h1>
      <p className="intro">Añadid recetas revisadas con cantidades y valores por ración.</p>
      <div className="warning"><CircleAlert size={19} /><span>Los PDF se procesan en este navegador. Revisa el texto, las raciones y los valores nutricionales antes de guardar. Las sugerencias son orientativas y no validan las recetas ni sus valores nutricionales.</span></div>
      <div className="toolbar">
        <span>
          {data.recipes.length} {data.recipes.length === 1 ? "receta guardada" : "recetas guardadas"}
          {(data.drafts && data.drafts.length > 0) ? ` · ${data.drafts.length} páginas importadas` : ""}
        </span>
        <button
          type="button"
          className="secondary"
          disabled={!hasResetData}
          onClick={resetRecipes}
          title="Eliminar todas las recetas y descartar los borradores importados"
          aria-label="Restablecer recetas"
        >
          <RotateCcw size={16} />
          <span>Restablecer recetas</span>
        </button>
      </div>
      <RecipeImportCard importing={importing} progress={importProgress} jobs={importJobs} upload={uploadPdf} />
      <DraftReviewList drafts={data.drafts || []} recipes={data.recipes} selectedDraft={selectedDraft} review={reviewDraft} setStatus={setPageStatus} setSelectedDraft={setSelectedDraft} onReset={resetRecipes} />
      <DraftOriginalCard drafts={data.drafts || []} selectedDraft={selectedDraft} preview={preview} setPreview={setPreview} openingDocument={openingDocument} openDocument={openDocument} setMessage={setMessage} />
      {suggestions && <RecipeSuggestions suggestions={suggestions} setRecipe={setRecipe} />}
      <RecipeEntryForm recipe={recipe} setRecipe={setRecipe} products={data.products} selectedDraft={selectedDraft} reviewConfirmed={reviewConfirmed} setReviewConfirmed={setReviewConfirmed} addRecipe={addRecipe} />
      <SavedRecipesList recipes={data.recipes} update={updateRecipe} />
      <IngredientProductResolver recipes={data.recipes} onChoose={chooseIngredientProduct} onRetry={retryIngredientSearch} />
    </>
  );
}
