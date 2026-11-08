"use client";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useWorkspace } from "../lib/useWorkspace";
import DashboardLayout, { type DashboardTab } from "../components/DashboardLayout";
import DashboardWorkspaceContent from "../components/DashboardWorkspaceContent";
import {
  WorkspaceConflictScreen,
  WorkspaceLoadingScreen,
  WorkspaceSetupScreen,
} from "../components/WorkspaceStatusScreens";
import { planBasis } from "../lib/plan-review.mjs";
import { documentKey } from "../lib/import-status.mjs";
import { importPdf } from "../lib/pdf-import";
import { extractRecipe } from "../lib/recipe-extraction.mjs";
import { getSupabaseBrowserClient } from "../lib/supabase/browser";
import { mercadonaResultMessage, requireMercadonaPrice } from "../lib/mercadona-lookup.mjs";
import { profileObjectivesComplete, withPlanLock, withShoppingCheck } from "../lib/dashboard-state.mjs";
import { isCurrentPdfPreview, isHouseholdPdfPath } from "../lib/pdf-preview-state.mjs";
import { notifyBatchReady, requestBrowserNotificationPermission, runWithConcurrency } from "../lib/pdf-batch.mjs";
import type { PdfImportJobView } from "../components/RecipeReviewPanels";
import { prepareStoredPdfDrafts, uploadPdfBatchAndPersist } from "../lib/pdf-upload-workflow";
import { matchIngredientOptions, matchRecipeIngredients } from "../lib/recipe-product-match.mjs";
import {
  initial,
  type State,
  type Profile,
  type Recipe,
  type IngredientProductOption,
  type Product,
  type Meal,
  type OptimizationOptions,
  type RecipeDraft,
} from "../lib/types";

const id = () => crypto.randomUUID().replaceAll("-", "");
export default function Dashboard({
  email,
  householdId,
}: {
  email: string;
  householdId: string;
}) {
  const {
    data,
    setData,
    status: storageStatus,
    error: storageError,
    legacySeed,
    legacyCopy,
    legacyWarning,
    retry,
    persistWorkspace,
    downloadCurrent,
    downloadLegacy,
    downloadLegacySeed,
  } = useWorkspace();
  const [tab, setTab] = useState<DashboardTab>("Inicio");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [persistingUpload, setPersistingUpload] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [importJobs, setImportJobs] = useState<PdfImportJobView[]>([]);
  const [selectedDraft, setSelectedDraft] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    filename: string;
    url: string;
    documentId?: string;
  } | null>(null);
  const [openingDocument, setOpeningDocument] = useState<string | null>(null);
  const [mercadonaInput, setMercadonaInput] = useState("");
  const [mercadonaBusy, setMercadonaBusy] = useState(false);
  const [product, setProduct] = useState<Product>({
    id: "",
    name: "",
    unit: "g",
    size: 0,
    price: 0,
    stock: 0,
    source: "Manual",
  });
  const [recipe, setRecipe] = useState<Recipe>({
    id: "",
    name: "",
    meal: "Comida",
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    ingredients: [],
    rating: 3,
    notes: "",
    approved: false,
  });
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
  const updateProfile = (i: number, patch: Partial<Profile>) =>
    setData((s) => ({
      ...s,
      profiles: s.profiles.map((p, j) => (j === i ? { ...p, ...patch } : p)),
    }));
  const lookupMercadona = async () => {
    setMercadonaBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/mercadona", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: mercadonaInput }),
      });
      const payload = await response.json();
      if (!response.ok) throw Error(payload.error);
      const result = requireMercadonaPrice(payload);
      if (!response.ok) throw Error(result.error);
      setProduct({
        ...product,
        name: result.name,
        price: result.price,
        size: result.size ?? 0,
        unit: result.unit ?? "g",
        source: result.source,
      });
      setMessage(mercadonaResultMessage(result));
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "No se pudo consultar Mercadona.",
      );
    } finally {
      setMercadonaBusy(false);
    }
  };
  const addProduct = () => {
    if (!product.name.trim() || product.size <= 0 || product.price < 0) {
      setMessage("Introduce nombre, tamaño del envase y un precio válido.");
      return;
    }
    setData((s) => ({
      ...s,
      products: [...s.products, { ...product, id: id() }],
    }));
    setProduct({
      id: "",
      name: "",
      unit: "g",
      size: 0,
      price: 0,
      stock: 0,
      source: "Manual",
    });
    setMessage("Producto añadido.");
  };
  const updateProduct = (productId: string, patch: Partial<Product>) =>
    setData((state) => ({
      ...state,
      products: state.products.map((item) =>
        item.id === productId ? { ...item, ...patch } : item,
      ),
    }));
  const uploadPdf = async (files: File[]) => {
    if (files.length > 10) {
      setMessage("Selecciona como máximo 10 PDF por lote.");
      return;
    }
    if (storageStatus !== "ready") {
      setMessage("Espera a que el espacio compartido esté guardado antes de importar un PDF.");
      return;
    }
    const notificationsEnabled = await requestBrowserNotificationPermission();
    flushSync(() => setImporting(true));
    setMessage("");
    setImportJobs(files.map((file, index) => ({ id: `${index}-${file.name}`, name: file.name, status: "queued", progress: "" })));
    const updateJob = (index: number, patch: Partial<PdfImportJobView>) => setImportJobs((jobs) => jobs.map((job, jobIndex) => jobIndex === index ? { ...job, ...patch } : job));
    try {
      setImportProgress(`Procesando hasta dos archivos a la vez · ${files.length} en cola.`);
      const results = await runWithConcurrency(files, 2, async (file: File, index: number) => {
        updateJob(index, { status: "processing", progress: "Iniciando PDF y OCR…" });
        try {
          const drafts = await importPdf(file, (progress) => updateJob(index, { status: "processing", progress }));
          const prepared = prepareStoredPdfDrafts(drafts, householdId, dataRef.current);
          return { file, drafts: prepared.storedDrafts, documentPath: prepared.documentPath, filename: file.name, pages: drafts.length };
        } catch (error) {
          updateJob(index, { status: "error", progress: error instanceof Error ? error.message : "No se pudo leer el PDF." });
          throw error;
        }
      });
      const successful = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      let batchFailure: string | null = null;
      if (successful.length) {
        successful.forEach((item) => updateJob(files.indexOf(item.file), { status: "saving", progress: "Guardando originales y páginas…" }));
        setImportProgress("Guardando en el espacio compartido…");
        setPersistingUpload(true);
        try {
          const storage = getSupabaseBrowserClient().storage.from("household-documents");
          await uploadPdfBatchAndPersist({ items: successful, storage, getLatestWorkspace: () => dataRef.current, persist: persistWorkspace });
          successful.forEach((item) => updateJob(files.indexOf(item.file), { status: "done", progress: `${item.pages} páginas · pendiente de revisión` }));
        } catch (error) {
          batchFailure = error instanceof Error ? error.message : "No se pudo guardar el lote.";
          successful.forEach((item) => updateJob(files.indexOf(item.file), { status: "error", progress: batchFailure || "No se pudo guardar el lote." }));
        } finally {
          setPersistingUpload(false);
        }
      }
      const failures = results.flatMap((result, index) => result.status === "rejected" ? [`${files[index].name}: ${result.reason instanceof Error ? result.reason.message : "error desconocido"}`] : []);
      if (batchFailure) failures.push(batchFailure);
      const savedCount = batchFailure ? 0 : successful.length;
      const summary = `${savedCount} de ${files.length} PDF listos para revisar${savedCount ? ` (${successful.map((item) => `${item.filename}: ${item.pages} páginas`).join("; ")})` : ""}.${failures.length ? ` Errores: ${failures.join("; ")}` : ""}`;
      setMessage(summary);
      const notified = savedCount > 0 && notifyBatchReady("Recetarios listos para revisar", `${savedCount} PDF procesados; abre Recetas para revisar las páginas.${failures.length ? ` ${failures.length} con errores.` : ""}`);
      if (!notified && !notificationsEnabled) setMessage(`${summary} Activa las notificaciones del navegador para recibir avisos de próximos lotes.`);
    } finally {
      setImportProgress("");
      setImporting(false);
    }
  };
  const setPageStatus = (
    draft: RecipeDraft,
    status: NonNullable<RecipeDraft["status"]>,
  ) => {
    setData((s) => ({
      ...s,
      drafts: (s.drafts || []).map((d) =>
        d.id === draft.id ? { ...d, status } : d,
      ),
      approvedDocuments: {
        ...s.approvedDocuments,
        [documentKey(draft)]: false,
      },
    }));
  };
  const approveDocument = (documentId: string) =>
    setData((s) => ({
      ...s,
      approvedDocuments: { ...s.approvedDocuments, [documentId]: true },
    }));
  const openDocument = async (draft: RecipeDraft) => {
    const documentId = draft.storedDocumentId || draft.documentId;
    if (isCurrentPdfPreview(preview, documentId)) return;
    if (!documentId || !draft.documentPath) return;
    if (!isHouseholdPdfPath(draft.documentPath, householdId, documentId)) {
      setMessage("La ruta del documento no corresponde al hogar actual.");
      return;
    }
    setOpeningDocument(documentId);
    setMessage("");
    try {
      const { data: blob, error } = await getSupabaseBrowserClient()
        .storage.from("household-documents")
        .download(draft.documentPath);
      if (error || !blob) throw Error("No se pudo abrir el PDF privado.");
      setPreview({
        filename: draft.filename,
        documentId,
        url: URL.createObjectURL(blob),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo abrir el PDF privado.");
    } finally {
      setOpeningDocument(null);
    }
  };
  const reviewDraft = (draft: RecipeDraft) => {
    setPageStatus(draft, "reviewing");
    setTab("Recetas");
    setReviewConfirmed(false);
    setSelectedDraft(draft.id);
    void openDocument(draft);
    setRecipe({
      id: "",
      name: "",
      meal: "Comida",
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      ingredients: [],
      rating: 3,
      notes: `Origen: ${draft.filename}, página ${draft.page}.\n\n${draft.text}`,
      approved: false,
    });
  };
  const addRecipe = async () => {
    if (selectedDraft && !reviewConfirmed) {
      setMessage(
        "Confirma que has revisado el original, las raciones y todos los ingredientes antes de guardar.",
      );
      return;
    }
    if (
      !recipe.name.trim() ||
      [recipe.calories, recipe.protein, recipe.carbs, recipe.fat].some(
        (n) => n <= 0,
      ) ||
      !recipe.ingredients.length ||
      recipe.ingredients.some((i) => i.amount <= 0 || !i.name?.trim())
    ) {
      setMessage(
        "Completa nombre, nutrientes e ingredientes con cantidades positivas.",
      );
      return;
    }
    const newRecipe: Recipe = {
      ...recipe,
      id: id(),
      approved: true,
      sourceDraftId: selectedDraft || undefined,
      ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient, name: ingredient.name?.trim(), productId: undefined, productOptions: undefined })),
    };
    setData((s) => {
      const source = (s.drafts || []).find((d) => d.id === selectedDraft);
      return {
        ...s,
        recipes: [...s.recipes, newRecipe],
        drafts: source
          ? (s.drafts || []).map((d) =>
              d.id === source.id ? { ...d, status: "reviewing" } : d,
            )
          : s.drafts,
        approvedDocuments: source
          ? { ...s.approvedDocuments, [documentKey(source)]: false }
          : s.approvedDocuments,
      };
    });
    const sourceWasSelected = Boolean(selectedDraft);
    setRecipe({
      id: "", name: "", meal: "Comida", calories: 0, protein: 0, carbs: 0, fat: 0,
      ingredients: [], rating: 3, notes: "", approved: false,
    });
    setSelectedDraft(null);
    setMessage("Receta revisada y guardada. Buscando sus ingredientes en Mercadona…");
    try {
      const names = [...new Set(newRecipe.ingredients.map((ingredient) => ingredient.name!.trim()))];
      const response = await fetch("/api/mercadona/search", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queries: names }),
      });
      const payload = await response.json();
      if (!response.ok) throw Error(payload.error || "No se pudieron buscar los ingredientes en Mercadona.");
      const matches = matchRecipeIngredients(newRecipe.ingredients, payload.results || []);
      setData((state) => ({
        ...state,
        recipes: state.recipes.map((saved) => saved.id !== newRecipe.id ? saved : {
          ...saved,
          ingredients: matches.ingredients,
        }),
        products: [...state.products, ...matches.products.filter((product) => !state.products.some((existing) => existing.id === product.id))],
      }));
      setMessage(matches.unresolvedCount ? `Receta guardada. Revisa ${matches.unresolvedCount} ingrediente(s) en “Elegir productos de Mercadona”.${sourceWasSelected ? " El PDF original sigue disponible en la biblioteca." : ""}` : `Receta guardada y productos únicos añadidos al catálogo.${sourceWasSelected ? " El PDF original sigue disponible en la biblioteca." : ""}`);
    } catch (error) {
      setMessage(error instanceof Error ? `Receta guardada. No se pudo completar la búsqueda: ${error.message}` : "Receta guardada, pero no se pudo buscar en Mercadona.");
    }
  };
  const updateRecipe = (recipeId: string, patch: Partial<Recipe>) =>
    setData((state) => ({
      ...state,
      recipes: state.recipes.map((item) =>
        item.id === recipeId ? { ...item, ...patch } : item,
      ),
    }));
  const chooseIngredientProduct = (selectedRecipe: Recipe, ingredientIndex: number, chosen: Product) => {
    setData((state) => {
      const recipes = state.recipes.map((saved) => saved.id !== selectedRecipe.id ? saved : {
        ...saved,
        ingredients: saved.ingredients.map((ingredient, index) => index !== ingredientIndex ? ingredient : chosen.id
          ? { ...ingredient, productId: chosen.id, productOptions: undefined }
          : { ...ingredient, productOptions: undefined }),
      });
      const products = chosen.id && !state.products.some((item) => item.id === chosen.id) ? [...state.products, chosen] : state.products;
      return { ...state, recipes, products };
    });
    setMessage(chosen.id ? `Producto ${chosen.name} asociado a ${selectedRecipe.name}.` : `El ingrediente “${selectedRecipe.ingredients[ingredientIndex]?.name || ""}” queda sin asociar.`);
  };
  const retryIngredientSearch = async (selectedRecipe: Recipe, ingredientIndex: number) => {
    const ingredient = selectedRecipe.ingredients[ingredientIndex];
    if (!ingredient?.name) return;
    setMessage(`Buscando ${ingredient.name} en Mercadona…`);
    try {
      const response = await fetch("/api/mercadona/search", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queries: [ingredient.name] }),
      });
      const payload = await response.json();
      if (!response.ok) throw Error(payload.error || "No se pudo repetir la búsqueda.");
      const options: IngredientProductOption[] = payload.results?.[0]?.products || [];
      const match = matchIngredientOptions(ingredient, options);
      if (match.product) {
        chooseIngredientProduct(selectedRecipe, ingredientIndex, match.product);
      } else {
        updateRecipe(selectedRecipe.id, { ingredients: selectedRecipe.ingredients.map((entry, index) => index === ingredientIndex ? match.ingredient : entry) });
        setMessage(options.length ? `Se encontraron ${options.length} alternativas. Elige la adecuada para ${ingredient.name}.` : `No se encontraron coincidencias para ${ingredient.name}.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo repetir la búsqueda.");
    }
  };
  const generate = async () => {
    setBusy(true);
    setMessage("");
    const basis = planBasis(data);
    const locks = data.planLocks || [];
    const lockSnapshot = JSON.stringify(locks);
    try {
      const response = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, locks }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      if (
        planBasis(dataRef.current) !== basis ||
        JSON.stringify(dataRef.current.planLocks || []) !== lockSnapshot
      )
        throw Error(
          "Los datos cambiaron durante el cálculo. Vuelve a generar el menú.",
        );
      setData((s) => ({
        ...s,
        plan: result.plan,
        shopping: result.shopping,
        leftovers: result.leftovers,
        planBasis: basis,
        planDirty: false,
        confirmed: false,
      }));
      setTab("Menú");
      setMessage(result.solutionStatus === "feasible" ? "Menú generado con restricciones verificadas. El coste es aproximado." : "Menú de 14 días generado.");
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "No se pudo generar el menú.",
      );
    } finally {
      setBusy(false);
    }
  };
  const updateLock = (day: number, meal: Meal, recipeId: string | null) =>
    setData((state) => withPlanLock(state, day, meal, recipeId));
  const updateOptimizationOptions = (patch: Partial<OptimizationOptions>) =>
    setData((state) => ({
      ...state,
      optimizationOptions: { ...state.optimizationOptions, ...patch },
      confirmed: false,
    }));
  const confirmPlan = () => {
    setData((state) => ({ ...state, confirmed: true }));
    setTab("Compra");
  };
  const checkShoppingItem = (itemId: string, checked: boolean) =>
    setData((state) => withShoppingCheck(state, itemId, checked));
  const stale =
    data.plan.length > 0 &&
    (!data.planBasis || data.planBasis !== planBasis(data));
  const dirty = !!data.planDirty;
  const ready = data.profiles.every(profileObjectivesComplete);
  const selectedPage = (data.drafts || []).find((d) => d.id === selectedDraft);
  const suggestions = selectedPage ? extractRecipe(selectedPage.text) : null;
  const recipeById = (rid: string) => data.recipes.find((r) => r.id === rid);
  const total = data.shopping.reduce((n, p) => n + p.price * p.packages, 0);
  if (storageStatus === "loading") return <WorkspaceLoadingScreen />;
  if (storageStatus === "setup") return <WorkspaceSetupScreen error={storageError} legacySeed={legacySeed} legacyCopy={legacyCopy} downloadLegacySeed={downloadLegacySeed} downloadLegacy={downloadLegacy} />;
  if (storageStatus === "conflict" || storageStatus === "error") return <WorkspaceConflictScreen error={storageError} message={message} legacyCopy={legacyCopy} status={storageStatus} downloadCurrent={downloadCurrent} downloadLegacy={downloadLegacy} retry={() => void retry()} />;
  return (
    <DashboardLayout
      email={email}
      tab={tab}
      onTabChange={setTab}
      data={data}
      downloadCurrent={downloadCurrent}
      importing={importing}
      persistingUpload={persistingUpload}
      importProgress={importProgress}
    >
      <DashboardWorkspaceContent
        data={data}
        tab={tab}
        setTab={setTab}
        storageStatus={storageStatus}
        message={message}
        setMessage={setMessage}
        legacyCopy={legacyCopy}
        legacyWarning={legacyWarning}
        downloadLegacy={downloadLegacy}
        updateProfile={updateProfile}
        product={product}
        setProduct={setProduct}
        mercadonaInput={mercadonaInput}
        setMercadonaInput={setMercadonaInput}
        mercadonaBusy={mercadonaBusy}
        lookupMercadona={lookupMercadona}
        addProduct={addProduct}
        updateProduct={updateProduct}
        recipe={recipe}
        setRecipe={setRecipe}
        importing={importing}
        importProgress={importProgress}
        importJobs={importJobs}
        uploadPdf={uploadPdf}
        selectedDraft={selectedDraft}
        setSelectedDraft={setSelectedDraft}
        selectedPage={selectedPage}
        suggestions={suggestions}
        preview={preview}
        setPreview={setPreview}
        openingDocument={openingDocument}
        openDocument={openDocument}
        setPageStatus={setPageStatus}
        reviewDraft={reviewDraft}
        reviewConfirmed={reviewConfirmed}
        setReviewConfirmed={setReviewConfirmed}
        addRecipe={addRecipe}
        updateRecipe={updateRecipe}
        chooseIngredientProduct={chooseIngredientProduct}
        retryIngredientSearch={retryIngredientSearch}
        ready={ready}
        busy={busy}
        stale={stale}
        dirty={dirty}
        generate={generate}
        updateOptimizationOptions={updateOptimizationOptions}
        updateLock={updateLock}
        confirmPlan={confirmPlan}
        total={total}
        checkShoppingItem={checkShoppingItem}
        approveDocument={approveDocument}
      />
    </DashboardLayout>
  );
}
