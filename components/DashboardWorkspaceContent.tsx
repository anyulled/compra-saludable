import { CircleAlert, X } from "lucide-react";
import Library from "./Library";
import MenuPlanningPanel from "./MenuPlanningPanel";
import Profiles from "./Profiles";
import ProductsPanel from "./ProductsPanel";
import RecipesPanel from "./RecipesPanel";
import ShoppingPanel from "./ShoppingPanel";
import WellnessHome from "./WellnessHome";
import { extractRecipe } from "../lib/recipe-extraction.mjs";
import type { DashboardTab } from "./DashboardLayout";
import type { Meal, OptimizationOptions, Product, Recipe, RecipeDraft, State } from "../lib/types";
import type { PdfImportJobView } from "./RecipeReviewPanels";

type PageStatus = NonNullable<RecipeDraft["status"]>;
type Preview = { filename: string; url: string; documentId?: string } | null;

type Props = {
  data: State;
  tab: DashboardTab;
  setTab: (tab: DashboardTab) => void;
  storageStatus: string;
  message: string;
  setMessage: (message: string) => void;
  legacyCopy: string | null;
  legacyWarning: string;
  downloadLegacy: () => void;
  updateProfile: (index: number, patch: Partial<State["profiles"][number]>) => void;
  product: Product;
  setProduct: (product: Product) => void;
  mercadonaInput: string;
  setMercadonaInput: (value: string) => void;
  mercadonaBusy: boolean;
  lookupMercadona: () => void;
  addProduct: () => void;
  updateProduct: (id: string, patch: Partial<Product>) => void;
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
  setPageStatus: (draft: RecipeDraft, status: PageStatus) => void;
  reviewDraft: (draft: RecipeDraft) => void;
  reviewConfirmed: boolean;
  setReviewConfirmed: (value: boolean) => void;
  addRecipe: () => void;
  updateRecipe: (id: string, patch: Partial<Recipe>) => void;
  chooseIngredientProduct: (recipe: Recipe, ingredientIndex: number, product: Product) => void;
  retryIngredientSearch: (recipe: Recipe, ingredientIndex: number) => void;
  ready: boolean;
  busy: boolean;
  stale: boolean;
  dirty: boolean;
  generate: () => void;
  updateOptimizationOptions: (patch: Partial<OptimizationOptions>) => void;
  updateLock: (day: number, meal: Meal, recipeId: string | null) => void;
  confirmPlan: () => void;
  total: number;
  checkShoppingItem: (id: string, checked: boolean) => void;
  approveDocument: (documentId: string) => void;
  resetRecipes: () => void;
};

function WorkspaceNotices({ storageStatus, message, setMessage, legacyCopy, legacyWarning, downloadLegacy }: Pick<Props, "storageStatus" | "message" | "setMessage" | "legacyCopy" | "legacyWarning" | "downloadLegacy">) {
  return (
    <>
      {(legacyCopy || legacyWarning) && <div className="warning"><CircleAlert size={18} /><span>{legacyWarning || "Hay una copia anterior en este navegador diferente de SQLite. No se ha sobrescrito ni importado automáticamente."}{" "}{legacyCopy && <button className="text-button" onClick={downloadLegacy}>Descargar copia anterior</button>}</span></div>}
      {storageStatus === "saving" && <p className="storage-status" role="status">Guardando en el espacio compartido…</p>}
      {message && <div className="notice" role="status"><CircleAlert size={18} /><span>{message}</span><button onClick={() => setMessage("")} aria-label="Cerrar"><X size={16} /></button></div>}
    </>
  );
}

function ActiveTabContent(props: Props) {
  const { data, tab } = props;
  return (
    <>
      {tab === "Inicio" && <WellnessHome navigate={props.setTab} />}
      {tab === "Perfiles" && <Profiles profiles={data.profiles} update={props.updateProfile} />}
      {tab === "Productos" && <ProductsPanel products={data.products} product={props.product} setProduct={props.setProduct} query={props.mercadonaInput} setQuery={props.setMercadonaInput} busy={props.mercadonaBusy} onLookup={props.lookupMercadona} onAdd={props.addProduct} onUpdate={props.updateProduct} />}
      {tab === "Recetas" && <RecipesPanel data={data} recipe={props.recipe} setRecipe={props.setRecipe} importing={props.importing} importProgress={props.importProgress} importJobs={props.importJobs} uploadPdf={props.uploadPdf} selectedDraft={props.selectedDraft} setSelectedDraft={props.setSelectedDraft} selectedPage={props.selectedPage} suggestions={props.suggestions} preview={props.preview} setPreview={props.setPreview} openingDocument={props.openingDocument} openDocument={props.openDocument} setMessage={props.setMessage} setPageStatus={props.setPageStatus} reviewDraft={props.reviewDraft} reviewConfirmed={props.reviewConfirmed} setReviewConfirmed={props.setReviewConfirmed} addRecipe={props.addRecipe} updateRecipe={props.updateRecipe} chooseIngredientProduct={props.chooseIngredientProduct} retryIngredientSearch={props.retryIngredientSearch} resetRecipes={props.resetRecipes} />}
      {tab === "Menú" && <MenuPlanningPanel data={data} ready={props.ready} busy={props.busy} stale={props.stale} dirty={props.dirty} onGenerate={props.generate} onUpdateOptions={props.updateOptimizationOptions} onUpdateLock={props.updateLock} onConfirm={props.confirmPlan} />}
      {tab === "Compra" && <ShoppingPanel data={data} stale={props.stale} dirty={props.dirty} total={props.total} onCheck={props.checkShoppingItem} onGoToMenu={() => props.setTab("Menú")} />}
      {tab === "Biblioteca" && <Library data={data} review={props.reviewDraft} approveDocument={props.approveDocument} onResetRecipes={props.resetRecipes} />}
    </>
  );
}

export default function DashboardWorkspaceContent(props: Props) {
  return <div className="content"><WorkspaceNotices storageStatus={props.storageStatus} message={props.message} setMessage={props.setMessage} legacyCopy={props.legacyCopy} legacyWarning={props.legacyWarning} downloadLegacy={props.downloadLegacy} /><ActiveTabContent {...props} /><footer>HECHO CON CARIÑO PARA VUESTRA MESA <span>✳</span> &nbsp; 08191</footer></div>;
}
