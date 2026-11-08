"use client";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useWorkspace } from "../lib/useWorkspace";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChefHat,
  CircleAlert,
  Leaf,
  Plus,
  ShoppingBasket,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import Library from "../components/Library";
import WellnessHome from "../components/WellnessHome";
import Profiles from "../components/Profiles";
import MenuReview from "../components/MenuReview";
import NutritionExtras from "../components/NutritionExtras";
import OptimizationSettings from "../components/OptimizationSettings";
import ScenarioCompare from "../components/ScenarioCompare";
import { planBasis } from "../lib/plan-review.mjs";
import { documentKey, pageStatus } from "../lib/import-status.mjs";
import { importPdf } from "../lib/pdf-import";
import { extractRecipe } from "../lib/recipe-extraction.mjs";
import { getSupabaseBrowserClient } from "../lib/supabase/browser";
import {
  appendPdfDraftsAfterUpload,
  appendPdfDraftsToWorkspace,
} from "../lib/pdf-workspace.mjs";
import {
  fitsWorkspaceLimit,
  WorkspaceWriteUncertainError,
} from "../lib/workspace-limits.mjs";
import {
  initial,
  meals,
  type State,
  type Profile,
  type Recipe,
  type Product,
  type Meal,
  type RecipeDraft,
} from "../lib/types";

type Tab =
  | "Inicio"
  | "Perfiles"
  | "Recetas"
  | "Biblioteca"
  | "Productos"
  | "Menú"
  | "Compra";
const tabs: Tab[] = [
  "Inicio",
  "Perfiles",
  "Recetas",
  "Biblioteca",
  "Productos",
  "Menú",
  "Compra",
];
const icons = [
  Leaf,
  Users,
  ChefHat,
  BookOpen,
  ShoppingBasket,
  CalendarDays,
  Check,
];
const id = () => crypto.randomUUID().replaceAll("-", "");
const num = (v: string) => Number(v) || 0;
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function NumberField({
  label,
  value,
  onChange,
  step = "1",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        min="0"
        step={step}
        value={value || ""}
        onChange={(e) => onChange(num(e.target.value))}
      />
    </Field>
  );
}
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
  const [tab, setTab] = useState<Tab>("Inicio");
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
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      if (result.price === null)
        throw Error(
          "Mercadona no devolvió un precio válido. Añade el producto manualmente.",
        );
      setProduct({
        ...product,
        name: result.name,
        price: result.price,
        size: result.size ?? 0,
        unit: result.unit ?? "g",
        source: result.source,
      });
      setMessage(
        [
          "Producto consultado para 08191. Revisa el precio, formato y tamaño antes de añadirlo.",
          result.price === null
            ? "No se ha recibido un precio válido; introdúcelo manualmente."
            : "",
          result.warning || "",
          !result.published || result.unavailable
            ? "La disponibilidad no está confirmada."
            : "La disponibilidad en tienda física no está confirmada.",
        ]
          .filter(Boolean)
          .join(" "),
      );
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
  const uploadPdf = async (file: File) => {
    if (storageStatus !== "ready") {
      setMessage("Espera a que el espacio compartido esté guardado antes de importar un PDF.");
      return;
    }
    flushSync(() => setImporting(true));
    setMessage("");
    try {
      const drafts = await importPdf(file, setImportProgress);
      const documentId = drafts[0]?.documentId;
      if (!documentId) throw Error("El PDF no contiene páginas para importar.");
      if (!/^[0-9a-f-]{36}$/i.test(householdId))
        throw Error("No se ha configurado el hogar para guardar el original.");
      const documentPath = `${householdId}/${documentId}.pdf`;
      const storedDrafts = drafts.map((draft) => ({ ...draft, documentPath }));
      if (!fitsWorkspaceLimit(appendPdfDraftsToWorkspace(dataRef.current, storedDrafts)))
        throw Error("Los borradores superarían el límite de 3 MiB del espacio compartido.");
      setImportProgress("Guardando el PDF original en almacenamiento privado…");
      const storage = getSupabaseBrowserClient().storage.from("household-documents");
      const nextState = await appendPdfDraftsAfterUpload({
        upload: async () => {
          const { error: uploadError } = await storage.upload(documentPath, file, {
          contentType: "application/pdf",
          cacheControl: "3600",
          upsert: false,
          });
          if (uploadError) throw Error("No se pudo guardar el PDF original en el hogar.");
        },
        getLatestWorkspace: () => dataRef.current,
        drafts: storedDrafts,
      });
      setPersistingUpload(true);
      try {
        if (!fitsWorkspaceLimit(nextState)) {
          const { error: cleanupError } = await storage.remove([documentPath]);
          if (cleanupError)
            throw Error("Los borradores superan 3 MiB y no se pudo confirmar la limpieza del PDF privado.");
          throw Error("Los borradores superarían el límite de 3 MiB del espacio compartido.");
        }
        await persistWorkspace(nextState);
      } catch (persistError) {
        if (!(persistError instanceof WorkspaceWriteUncertainError)) {
          const { error: cleanupError } = await storage.remove([documentPath]);
          if (cleanupError)
            throw Error("No se guardó el borrador y no se pudo confirmar la limpieza del PDF privado.");
        }
        throw persistError;
      } finally {
        setPersistingUpload(false);
      }
      const unreadable = drafts.filter((d) => d.method === "unreadable").length;
      setPreview({
        filename: file.name,
        documentId,
        url: URL.createObjectURL(file),
      });
      setMessage(
        `Se han creado ${drafts.length} páginas para revisión.${unreadable ? ` ${unreadable} no se han podido leer y requieren revisión manual.` : ""} No se han aprobado recetas automáticamente.`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo leer el PDF.");
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
    if (preview?.documentId === documentId && preview?.url) return;
    if (!documentId || !draft.documentPath) return;
    const expectedPath = `${householdId}/${documentId}.pdf`;
    if (draft.documentPath !== expectedPath) {
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
  const addRecipe = () => {
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
      recipe.ingredients.some((i) => i.amount <= 0)
    ) {
      setMessage(
        "Completa nombre, nutrientes e ingredientes con cantidades positivas.",
      );
      return;
    }
    setData((s) => {
      const source = (s.drafts || []).find((d) => d.id === selectedDraft);
      return {
        ...s,
        recipes: [
          ...s.recipes,
          {
            ...recipe,
            id: id(),
            approved: true,
            sourceDraftId: selectedDraft || undefined,
          },
        ],
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
      notes: "",
      approved: false,
    });
    setSelectedDraft(null);
    setMessage(
      "Receta revisada y guardada. La página original sigue disponible entre los borradores.",
    );
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
    setData((s) => ({
      ...s,
      planLocks: [
        ...(s.planLocks || []).filter((l) => l.day !== day || l.meal !== meal),
        ...(recipeId ? [{ day, meal, recipeId }] : []),
      ],
      planDirty: true,
      confirmed: false,
    }));
  const stale =
    data.plan.length > 0 &&
    (!data.planBasis || data.planBasis !== planBasis(data));
  const dirty = !!data.planDirty;
  const ready = data.profiles.every(
    (p) => p.calories > 0 && p.protein > 0 && p.carbs > 0 && p.fat > 0,
  );
  const selectedPage = (data.drafts || []).find((d) => d.id === selectedDraft);
  const suggestions = selectedPage ? extractRecipe(selectedPage.text) : null;
  const recipeById = (rid: string) => data.recipes.find((r) => r.id === rid);
  const total = data.shopping.reduce((n, p) => n + p.price * p.packages, 0);
  if (storageStatus === "loading")
    return (
      <main className="storage-screen">
        <h1>Abriendo vuestro espacio…</h1>
        <p>Preparando los datos compartidos.</p>
      </main>
    );
  if (storageStatus === "setup")
    return (
      <main className="storage-screen">
        <h1>Espacio pendiente de importación.</h1>
        <p>
          El hogar compartido aún no se ha preparado. El administrador debe
          importar los datos o crear el seed inicial antes de habilitar las
          escrituras. Esta sesión no modificará el espacio vacío.
        </p>
        {storageError && <p role="alert">{storageError}</p>}
        <div className="storage-actions">
          {legacySeed && (
            <button
              className="secondary"
              onClick={downloadLegacySeed}
            >
              Descargar la copia local para migrarla
            </button>
          )}
          {legacyCopy && (
            <button className="secondary" onClick={downloadLegacy}>
              Descargar copia antigua
            </button>
          )}
          <button className="primary" onClick={() => window.location.reload()}>
            Comprobar de nuevo
          </button>
        </div>
      </main>
    );
  if (storageStatus === "conflict" || storageStatus === "error")
    return (
      <main className="storage-screen">
        <h1>Hay cambios que revisar.</h1>
        <p>{storageError}</p>
        {message && <p role="alert">{message}</p>}
        <p>
          Los cambios de esta pestaña se conservan mientras permanezca abierta.
          Puedes descargarlos antes de volver a cargar.
        </p>
        <div className="storage-actions">
          <button className="primary" onClick={downloadCurrent}>
            Descargar cambios de esta pestaña
          </button>
          {legacyCopy && (
            <button className="secondary" onClick={downloadLegacy}>
              Descargar copia anterior del navegador
            </button>
          )}
          <button className="secondary" onClick={() => void retry()}>
            Volver a intentar
          </button>
          {storageStatus === "conflict" && (
            <button
              className="text-button"
              onClick={() => window.location.reload()}
            >
              Descartar cambios de esta pestaña y cargar la versión compartida
            </button>
          )}
        </div>
      </main>
    );
  return (
    <>
    <div className="shell" inert={importing || persistingUpload || undefined}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">
            <Leaf size={19} />
          </span>
          <div>
            <strong>mesa</strong>
            <small>COMER BIEN, JUNTOS</small>
          </div>
        </div>
        <div className="nav-label">TU ESPACIO</div>
        <nav>
          {tabs.map((t, i) => {
            const Icon = icons[i];
            return (
              <button
                key={t}
                className={tab === t ? "nav active" : "nav"}
                onClick={() => {
                  setTab(t);
                  setMessage("");
                }}
              >
                <Icon size={18} />
                {t}
                {t === "Compra" && data.shopping.length > 0 && (
                  <span className="nav-count">{data.shopping.length}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="side-note">
          <span className="side-spark">
            <Sparkles size={17} />
          </span>
          <strong>Un poco de planificación,</strong>
          <p>mucho más tiempo para disfrutar.</p>
        </div>
        <div className="side-bottom">
          HECHO PARA VUESTRA MESA <span>♥</span>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <span>
            VUESTRO ESPACIO <span className="slash">/</span> {tab.toUpperCase()}
          </span>
          <div>
            <button className="text-button" onClick={downloadCurrent}>
              Descargar copia
            </button>
            <span className="location">◉ &nbsp; 08191</span>
            <span className="avatar" title={email}>
              {email.slice(0, 1).toUpperCase() || "M"}
            </span>
            <form action="/auth/signout" method="post" className="signout-form">
              <button className="text-button" type="submit">
                Cerrar sesión
              </button>
            </form>
          </div>
        </header>
        <div className="content">
          {(legacyCopy || legacyWarning) && (
            <div className="warning">
              <CircleAlert size={18} />
              <span>
                {legacyWarning ||
                  "Hay una copia anterior en este navegador diferente de SQLite. No se ha sobrescrito ni importado automáticamente."}{" "}
                {legacyCopy && (
                  <button className="text-button" onClick={downloadLegacy}>
                    Descargar copia anterior
                  </button>
                )}
              </span>
            </div>
          )}
          {storageStatus === "saving" && (
            <p className="storage-status" role="status">
              Guardando en el espacio compartido…
            </p>
          )}
          {message && (
            <div className="notice" role="status">
              <CircleAlert size={18} />
              <span>{message}</span>
              <button onClick={() => setMessage("")} aria-label="Cerrar">
                <X size={16} />
              </button>
            </div>
          )}
          {tab === "Inicio" && <WellnessHome navigate={setTab} />}
          {tab === "Perfiles" && (
            <Profiles profiles={data.profiles} update={updateProfile} />
          )}
          {tab === "Productos" && (
            <>
              <div className="eyebrow muted">VUESTRA DESPENSA</div>
              <h1 className="page-title">
                Productos <em>y envases.</em>
              </h1>
              <p className="intro">
                Añadid los productos que usáis y la cantidad que ya tenéis en
                casa.
              </p>
              <div className="warning">
                <CircleAlert size={19} />
                <span>
                  Consulta individual a una API no oficial de Mercadona para
                  08191. Los precios pueden cambiar y no confirman la
                  disponibilidad en tienda física. Revisa los datos antes de
                  añadirlos.
                </span>
              </div>
              <section className="card">
                <h2>Consultar Mercadona</h2>
                <p className="help">
                  Pega el enlace de un producto de la tienda online o introduce
                  su identificador numérico.
                </p>
                <div className="lookup">
                  <input
                    aria-label="Identificador o enlace de Mercadona"
                    value={mercadonaInput}
                    onChange={(e) => setMercadonaInput(e.target.value)}
                    placeholder="Ej. 10005"
                  />
                  <button
                    className="secondary"
                    disabled={mercadonaBusy}
                    onClick={lookupMercadona}
                  >
                    {mercadonaBusy ? "Consultando…" : "Consultar producto"}
                  </button>
                </div>
              </section>
              <section className="card">
                <h2>Añadir producto</h2>
                <div className="form-grid three">
                  <Field label="Nombre">
                    <input
                      value={product.name}
                      onChange={(e) =>
                        setProduct({ ...product, name: e.target.value })
                      }
                      placeholder="Ej. Garbanzos cocidos"
                    />
                  </Field>
                  <Field label="Unidad">
                    <select
                      value={product.unit}
                      onChange={(e) =>
                        setProduct({ ...product, unit: e.target.value })
                      }
                    >
                      <option>g</option>
                      <option>ml</option>
                      <option>unidades</option>
                    </select>
                  </Field>
                  <NumberField
                    label="Tamaño del envase"
                    value={product.size}
                    onChange={(v) => setProduct({ ...product, size: v })}
                  />
                  <NumberField
                    label="Precio por envase (€)"
                    value={product.price}
                    onChange={(v) => setProduct({ ...product, price: v })}
                    step="0.01"
                  />
                  <NumberField
                    label="Existencias en casa"
                    value={product.stock}
                    onChange={(v) => setProduct({ ...product, stock: v })}
                  />
                  <Field label="Caducidad de existencias (opcional)">
                    <input
                      type="date"
                      value={product.expiresOn || ""}
                      onChange={(e) =>
                        setProduct({
                          ...product,
                          expiresOn: e.target.value || undefined,
                        })
                      }
                    />
                  </Field>
                  <Field label="Origen del dato">
                    <input
                      value={product.source}
                      onChange={(e) =>
                        setProduct({ ...product, source: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <button className="primary" onClick={addProduct}>
                  <Plus size={17} /> Añadir producto
                </button>
              </section>
              <div className="list">
                {data.products.map((p) => (
                  <div className="list-row" key={p.id}>
                    <div>
                      <strong>{p.name}</strong>
                      <p>
                        {p.size} {p.unit} / envase · {p.stock} {p.unit} en casa
                        · {p.source}
                      </p>
                      <label className="field">
                        Existencias actuales ({p.unit})
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={p.stock}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (
                              v === "" ||
                              !Number.isFinite(Number(v)) ||
                              Number(v) < 0
                            )
                              return;
                            setData((s) => ({
                              ...s,
                              products: s.products.map((x) =>
                                x.id === p.id ? { ...x, stock: Number(v) } : x,
                              ),
                            }));
                          }}
                        />
                      </label>
                      <label className="field">
                        Precio por envase (€)
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={p.price}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (
                              v === "" ||
                              !Number.isFinite(Number(v)) ||
                              Number(v) < 0
                            )
                              return;
                            setData((s) => ({
                              ...s,
                              products: s.products.map((x) =>
                                x.id === p.id ? { ...x, price: Number(v) } : x,
                              ),
                            }));
                          }}
                        />
                      </label>
                      <label className="field">
                        Caducidad de existencias
                        <input
                          type="date"
                          value={p.expiresOn || ""}
                          onChange={(e) => {
                            const value = e.target.value || undefined;
                            setData((s) => ({
                              ...s,
                              products: s.products.map((x) =>
                                x.id === p.id ? { ...x, expiresOn: value } : x,
                              ),
                            }));
                          }}
                        />
                      </label>
                    </div>
                    <b>{p.price.toFixed(2)} €</b>
                  </div>
                ))}
              </div>
            </>
          )}
          {tab === "Recetas" && (
            <>
              <div className="eyebrow muted">02 / VUESTRA COCINA</div>
              <h1 className="page-title">
                Vuestras <em>recetas.</em>
              </h1>
              <p className="intro">
                Añadid recetas revisadas con cantidades y valores por ración.
              </p>
              <div className="warning">
                <CircleAlert size={19} />
                <span>
                  Los PDF se procesan en este navegador. Revisa el texto, las
                  raciones y los valores nutricionales antes de guardar. Las
                  sugerencias son orientativas y no validan las recetas ni sus
                  valores nutricionales.
                </span>
              </div>
              <section className="card">
                <h2>Importar un recetario</h2>
                <p className="help">
                  Selecciona un PDF de tu dispositivo. Se crea un borrador por
                  página; las páginas pueden contener índices o varias recetas.
                  Las páginas con poco texto se procesan con OCR en español.
                </p>
                <Field label="Seleccionar PDF">
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    disabled={importing}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void uploadPdf(file);
                    }}
                  />
                </Field>
                {importing && (
                  <p role="status">
                    {importProgress || "Leyendo el documento…"}
                  </p>
                )}
                <p className="help">
                  El PDF y el OCR se procesan en este navegador. Los borradores
                  y el original se guardan en vuestro espacio privado. Revisa
                  manualmente el texto y las recetas detectadas.
                </p>
              </section>
              {(data.drafts || []).length > 0 && (
                <section className="card">
                  <h2>Páginas importadas</h2>
                  <p className="help">
                    Una página puede contener varias recetas. Cuando hayas
                    añadido todas sus recetas, márcala como revisada; si no
                    contiene recetas, márcala como descartada. Filtra por estado
                    en la biblioteca.
                  </p>
                  <div className="draft-list">
                    {(data.drafts || []).map((d) => (
                      <div className="list-row" key={d.id}>
                        <div>
                          <strong>{d.filename}</strong>
                          <p>
                            Página {d.page} ·{" "}
                            {d.method === "ocr"
                              ? "OCR"
                              : d.method === "unreadable"
                                ? "Sin texto legible"
                                : "Texto extraído"}{" "}
                            ·{" "}
                            {pageStatus(d) === "reviewed"
                              ? "Revisada"
                              : pageStatus(d) === "discarded"
                                ? "Descartada"
                                : pageStatus(d) === "reviewing"
                                  ? "En revisión"
                                  : "Pendiente"}{" "}
                            ·{" "}
                            {d.text.slice(0, 90) ||
                              "Revisa el documento original"}
                            …
                          </p>
                        </div>
                        <button
                          className="secondary"
                          onClick={() => reviewDraft(d)}
                        >
                          {selectedDraft === d.id ? "Revisando" : "Revisar"}
                        </button>
                        {pageStatus(d) !== "reviewed" &&
                          pageStatus(d) !== "discarded" &&
                          data.recipes.some(
                            (r) => r.sourceDraftId === d.id,
                          ) && (
                            <button
                              className="text-button"
                              onClick={() => setPageStatus(d, "reviewed")}
                            >
                              Completar revisión
                            </button>
                          )}
                        {pageStatus(d) !== "reviewed" &&
                          pageStatus(d) !== "discarded" &&
                          !data.recipes.some(
                            (r) => r.sourceDraftId === d.id,
                          ) && (
                            <button
                              className="text-button"
                              onClick={() => {
                                setPageStatus(d, "discarded");
                                if (selectedDraft === d.id)
                                  setSelectedDraft(null);
                              }}
                            >
                              No es receta
                            </button>
                          )}
                        {(pageStatus(d) === "reviewed" ||
                          pageStatus(d) === "discarded") && (
                          <button
                            className="text-button"
                            onClick={() => setPageStatus(d, "pending")}
                          >
                            Reabrir
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {selectedDraft &&
                (() => {
                  const d = (data.drafts || []).find(
                    (x) => x.id === selectedDraft,
                  );
                  return d ? (
                    <section className="card">
                      <h2>Comprobar el original</h2>
                      {preview &&
                      preview.documentId === (d.storedDocumentId || d.documentId) &&
                      preview.filename === d.filename ? (
                        <iframe
                          title={`PDF original, página ${d.page}`}
                          className="pdf-preview"
                          src={`${preview.url}#page=${d.page}`}
                        />
                      ) : d.documentPath ? (
                        <div>
                          <p className="help">
                            El original privado está guardado en el hogar y solo
                            se abre con una sesión autorizada.
                          </p>
                          <button
                            className="secondary"
                            disabled={openingDocument === (d.storedDocumentId || d.documentId)}
                            onClick={() => void openDocument(d)}
                          >
                            {openingDocument === (d.storedDocumentId || d.documentId)
                              ? "Abriendo PDF…"
                              : "Abrir PDF original"}
                          </button>
                        </div>
                      ) : (
                        <div>
                          <p className="help">
                            Este borrador antiguo no tiene un original privado.
                            Puedes elegir de nuevo el PDF para compararlo; no se
                            volverá a importar.
                          </p>
                          <Field label="Abrir PDF original">
                            <input
                              type="file"
                              accept="application/pdf,.pdf"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = "";
                                if (!file) return;
                                if (file.name !== d.filename) {
                                  setMessage(
                                    "Selecciona el PDF con el mismo nombre que el borrador.",
                                  );
                                  return;
                                }
                                setPreview({
                                  filename: file.name,
                                  url: URL.createObjectURL(file),
                                  documentId: d.storedDocumentId || d.documentId,
                                });
                              }}
                            />
                          </Field>
                        </div>
                      )}
                    </section>
                  ) : null;
                })()}
              {suggestions && selectedPage && (
                <section className="card">
                  <h2>Datos detectados</h2>
                  <p className="help">
                    Son sugerencias del texto de una página, no datos
                    verificados. Elige solo los valores que correspondan a esta
                    receta y a una ración. Comprueba cantidades y pasos en el
                    original.
                  </p>
                  {suggestions.title && (
                    <div className="suggestion">
                      <span>
                        <strong>Nombre posible:</strong> {suggestions.title}
                      </span>
                      <button
                        className="secondary"
                        onClick={() =>
                          setRecipe((r) => ({ ...r, name: suggestions.title }))
                        }
                      >
                        Usar nombre
                      </button>
                    </div>
                  )}
                  {suggestions.ingredients.length > 0 && (
                    <>
                      <div className="subheading">
                        INGREDIENTES DETECTADOS · REVISA LA LISTA COMPLETA
                      </div>
                      <ul className="suggestion-list">
                        {suggestions.ingredients.map((line, index) => (
                          <li key={index}>{line}</li>
                        ))}
                      </ul>
                      <p className="help">
                        Asocia manualmente cada ingrediente con un producto y
                        ajusta la cantidad por ración en el formulario. No se
                        seleccionan productos automáticamente.
                      </p>
                    </>
                  )}
                  {suggestions.preparation && (
                    <>
                      <div className="subheading">PREPARACIÓN DETECTADA</div>
                      <pre className="suggestion-text">
                        {suggestions.preparation}
                      </pre>
                    </>
                  )}
                  {(Object.keys(suggestions.nutrition).length > 0 ||
                    suggestions.ambiguous.length > 0) && (
                    <>
                      <div className="subheading">NUTRICIÓN DETECTADA</div>
                      {suggestions.per100 && (
                        <div className="warning">
                          El texto menciona valores por 100 g o ml. No se pueden
                          aplicar automáticamente como valores por ración.
                        </div>
                      )}
                      {suggestions.ambiguous.length > 0 && (
                        <div className="warning">
                          Hay valores repetidos o ambiguos; consúltalos en el
                          original.
                        </div>
                      )}
                      <div className="suggestion-nutrients">
                        {(
                          [
                            ["calories", "Energía", "kcal"],
                            ["protein", "Proteínas", "g"],
                            ["carbs", "Carbohidratos", "g"],
                            ["fat", "Grasas", "g"],
                          ] as const
                        ).map(([key, label, unit]) =>
                          suggestions.nutrition[key] !== undefined ? (
                            <div className="suggestion" key={key}>
                              <span>
                                {label}:{" "}
                                <strong>
                                  {suggestions.nutrition[key]} {unit}
                                </strong>
                              </span>
                              <button
                                className="secondary"
                                disabled={suggestions.per100}
                                onClick={() =>
                                  setRecipe((r) => ({
                                    ...r,
                                    [key]: suggestions.nutrition[key],
                                  }))
                                }
                              >
                                Usar valor
                              </button>
                            </div>
                          ) : null,
                        )}
                      </div>
                    </>
                  )}
                </section>
              )}
              <section className="card">
                <h2>Nueva receta</h2>
                <div className="form-grid three">
                  <Field label="Nombre">
                    <input
                      value={recipe.name}
                      onChange={(e) =>
                        setRecipe({ ...recipe, name: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Comida">
                    <select
                      value={recipe.meal}
                      onChange={(e) =>
                        setRecipe({ ...recipe, meal: e.target.value as Meal })
                      }
                    >
                      {meals.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </Field>
                  <NumberField
                    label="Energía por ración (kcal)"
                    value={recipe.calories}
                    onChange={(v) => setRecipe({ ...recipe, calories: v })}
                  />
                  <NumberField
                    label="Proteínas por ración (g)"
                    value={recipe.protein}
                    onChange={(v) => setRecipe({ ...recipe, protein: v })}
                  />
                  <NumberField
                    label="Carbohidratos por ración (g)"
                    value={recipe.carbs}
                    onChange={(v) => setRecipe({ ...recipe, carbs: v })}
                  />
                  <NumberField
                    label="Grasas por ración (g)"
                    value={recipe.fat}
                    onChange={(v) => setRecipe({ ...recipe, fat: v })}
                  />
                  <Field label="Sodio por ración (mg)">
                    <input
                      type="number"
                      min="0"
                      value={recipe.sodiumMg ?? ""}
                      onChange={(e) =>
                        setRecipe({
                          ...recipe,
                          sodiumMg:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                </div>
                <p className="help">
                  Usa sodio total de todos los ingredientes y la sal añadida,
                  por ración. Un valor desconocido debe quedar vacío; 0 solo si
                  se ha verificado. Si solo conoces la sal en gramos, 1 g de sal
                  equivale aproximadamente a 400 mg de sodio.
                </p>
                <Field label="Vitamina D por ración (µg; opcional)">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={recipe.vitaminDMcg ?? ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "") {
                        setRecipe({ ...recipe, vitaminDMcg: undefined });
                        return;
                      }
                      const n = Number(value);
                      if (Number.isFinite(n) && n >= 0)
                        setRecipe({ ...recipe, vitaminDMcg: n });
                    }}
                  />
                </Field>
                <Field label="Fuente de vitamina D (opcional)">
                  <input
                    value={recipe.vitaminDSource || ""}
                    onChange={(e) =>
                      setRecipe({ ...recipe, vitaminDSource: e.target.value })
                    }
                    placeholder="Etiqueta, tabla nutricional…"
                  />
                </Field>
                <p className="help">
                  Registra el total por ración solo si lo conoces. Un valor
                  vacío significa desconocido; 0 µg debe estar verificado. Si la
                  fuente usa unidades internacionales (UI), 40 UI = 1 µg.
                </p>
                <NutritionExtras
                  recipe={recipe}
                  update={(patch) => setRecipe((r) => ({ ...r, ...patch }))}
                />
                <Field label="Preparación y fuente nutricional">
                  <textarea
                    value={recipe.notes}
                    onChange={(e) =>
                      setRecipe({ ...recipe, notes: e.target.value })
                    }
                  />
                </Field>
                <div className="subheading">INGREDIENTES POR RACIÓN</div>
                {data.products.length === 0 && (
                  <p className="help">
                    Añade productos primero para poder seleccionar ingredientes.
                  </p>
                )}
                {data.products.map((p) => {
                  const ingredient = recipe.ingredients.find(
                    (i) => i.productId === p.id,
                  );
                  return (
                    <div className="ingredient" key={p.id}>
                      <span>
                        {p.name} <small>({p.unit})</small>
                      </span>
                      <input
                        aria-label={`Cantidad de ${p.name}`}
                        type="number"
                        min="0"
                        value={ingredient?.amount || ""}
                        placeholder="0"
                        onChange={(e) => {
                          const value = num(e.target.value);
                          setRecipe({
                            ...recipe,
                            ingredients: [
                              ...recipe.ingredients.filter(
                                (i) => i.productId !== p.id,
                              ),
                              ...(value > 0
                                ? [{ productId: p.id, amount: value }]
                                : []),
                            ],
                          });
                        }}
                      />
                    </div>
                  );
                })}
                {selectedDraft && (
                  <label className="review-check">
                    <input
                      type="checkbox"
                      checked={reviewConfirmed}
                      onChange={(e) => setReviewConfirmed(e.target.checked)}
                    />
                    <span>
                      He contrastado el documento original, el número de
                      raciones, todos los ingredientes y los valores por ración.
                    </span>
                  </label>
                )}
                <button className="primary" onClick={addRecipe}>
                  <Check size={17} /> He revisado y quiero guardar
                </button>
              </section>
              <div className="list">
                {data.recipes.map((r) => (
                  <div className="list-row" key={r.id}>
                    <div>
                      <strong>{r.name}</strong>
                      <p>
                        {r.meal} · {r.calories} kcal por ración
                      </p>
                      <label className="field">
                        Sodio por ración (mg; vacío si se desconoce)
                        <input
                          type="number"
                          min="0"
                          value={r.sodiumMg ?? ""}
                          onChange={(e) => {
                            const value =
                              e.target.value === ""
                                ? undefined
                                : Number(e.target.value);
                            setData((s) => ({
                              ...s,
                              recipes: s.recipes.map((x) =>
                                x.id === r.id ? { ...x, sodiumMg: value } : x,
                              ),
                            }));
                          }}
                        />
                      </label>
                      <label className="field">
                        Vitamina D por ración (µg; vacío si se desconoce)
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={r.vitaminDMcg ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (
                              raw !== "" &&
                              (!Number.isFinite(Number(raw)) || Number(raw) < 0)
                            )
                              return;
                            const value = raw === "" ? undefined : Number(raw);
                            setData((s) => ({
                              ...s,
                              recipes: s.recipes.map((x) =>
                                x.id === r.id
                                  ? { ...x, vitaminDMcg: value }
                                  : x,
                              ),
                            }));
                          }}
                        />
                      </label>
                      <label className="field">
                        Fuente de vitamina D
                        <input
                          value={r.vitaminDSource || ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            setData((s) => ({
                              ...s,
                              recipes: s.recipes.map((x) =>
                                x.id === r.id
                                  ? { ...x, vitaminDSource: value }
                                  : x,
                              ),
                            }));
                          }}
                        />
                      </label>
                      <NutritionExtras
                        recipe={r}
                        update={(patch) =>
                          setData((s) => ({
                            ...s,
                            recipes: s.recipes.map((x) =>
                              x.id === r.id ? { ...x, ...patch } : x,
                            ),
                          }))
                        }
                      />
                    </div>
                    <label className="rating">
                      Preferencia{" "}
                      <select
                        value={r.rating}
                        onChange={(e) =>
                          setData((s) => ({
                            ...s,
                            recipes: s.recipes.map((x) =>
                              x.id === r.id
                                ? { ...x, rating: num(e.target.value) }
                                : x,
                            ),
                          }))
                        }
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                ))}
              </div>
            </>
          )}
          {tab === "Menú" && (
            <>
              <div className="eyebrow muted">03 / VUESTRO PLAN</div>
              <h1 className="page-title">
                Una quincena <em>para vosotros.</em>
              </h1>
              <p className="intro">
                Revisad la propuesta antes de generar vuestra lista de la
                compra.
              </p>
              <div className="warning">
                <SlidersHorizontal size={19} />
                <span>
                  El optimizador busca cumplir cada objetivo diario con una
                  tolerancia del 10 %, ajustando las raciones en medios.
                  Equilibra coste, valoraciones, variedad, sobrantes y menor
                  sodio; 1.000 mg de sodio suman una penalización de 0,10 € al
                  cálculo, no al precio de la compra. Solo utiliza recetas con
                  sodio conocido y no garantiza un límite diario. La OMS
                  recomienda menos de 2.000 mg de sodio al día para adultos,
                  contando todos los alimentos. No verifica alergias ni calidad
                  clínica.
                </span>
              </div>
              <OptimizationSettings
                options={data.optimizationOptions || {}}
                update={(patch) =>
                  setData((s) => ({
                    ...s,
                    optimizationOptions: { ...s.optimizationOptions, ...patch },
                    confirmed: false,
                  }))
                }
              />
              <ScenarioCompare data={data} />
              <div className="toolbar">
                <span>
                  {ready
                    ? "Objetivos de ambos perfiles completos"
                    : "Completad los objetivos de ambos perfiles"}{" "}
                  · {data.recipes.length} recetas
                </span>
                <button className="primary" disabled={busy} onClick={generate}>
                  {busy ? "Calculando…" : "Generar menú"} <Sparkles size={17} />
                </button>
              </div>
              {data.plan.length === 0 ? (
                <div className="empty">
                  <CalendarDays size={28} />
                  <h2>Vuestra mesa está por preparar.</h2>
                  <p>
                    Añadid objetivos, productos y al menos una receta revisada
                    para cada comida.
                  </p>
                </div>
              ) : (
                <>
                  <MenuReview
                    data={data}
                    busy={busy}
                    stale={stale}
                    dirty={dirty}
                    updateLock={updateLock}
                  />
                  {data.leftovers && (
                    <section className="card">
                      <h2>Aprovechamiento estimado</h2>
                      <p className="help">
                        Se supone que las existencias se usan antes que las
                        compras. La caducidad se aplica únicamente a las
                        existencias indicadas; no se conoce la conservación de
                        los productos nuevos. El sobrante total incluye
                        existencias que podrían caducar.
                      </p>
                      {data.leftovers.map((x) => (
                        <div className="list-row" key={x.id}>
                          <div>
                            <strong>{x.name}</strong>
                            <p>
                              En casa: {Math.round(x.stock * 10) / 10} {x.unit}{" "}
                              · Compra: {Math.round(x.purchased * 10) / 10}{" "}
                              {x.unit} · Uso: {Math.round(x.used * 10) / 10}{" "}
                              {x.unit}
                            </p>
                            <p>
                              Sobrante total:{" "}
                              {Math.round(x.remaining * 10) / 10} {x.unit}
                              {x.expiredStock > 0
                                ? ` · De existencias, podrían caducar: ${Math.round(x.expiredStock * 10) / 10} ${x.unit}`
                                : ""}
                            </p>
                          </div>
                        </div>
                      ))}
                    </section>
                  )}
                  <button
                    className="primary confirm"
                    disabled={busy || dirty || stale}
                    onClick={() => {
                      setData((s) => ({ ...s, confirmed: true }));
                      setTab("Compra");
                    }}
                  >
                    Confirmar y ver la compra <ArrowRight size={17} />
                  </button>
                </>
              )}
            </>
          )}
          {tab === "Compra" && (
            <>
              <div className="eyebrow muted">VUESTRA LISTA</div>
              <h1 className="page-title">
                Todo listo <em>para comprar.</em>
              </h1>
              <p className="intro">
                Una lista consolidada a partir de vuestro menú confirmado.
              </p>
              <div className="warning">
                <CircleAlert size={19} />
                <span>
                  Esta lista se guarda en el espacio compartido y se sincroniza
                  entre las dos cuentas autorizadas.
                </span>
              </div>
              {!data.confirmed || stale || dirty ? (
                <div className="empty">
                  <ShoppingBasket size={28} />
                  <h2>La lista llegará después.</h2>
                  <p>Generad o recalculad y confirmad primero vuestro menú.</p>
                  <button className="secondary" onClick={() => setTab("Menú")}>
                    Ir al menú
                  </button>
                </div>
              ) : (
                <>
                  <div className="toolbar">
                    <span>
                      {data.shopping.filter((x) => x.checked).length} de{" "}
                      {data.shopping.length} productos tachados
                    </span>
                    <strong>Estimación: {total.toFixed(2)} €</strong>
                  </div>
                  <div className="list shopping">
                    {data.shopping.map((item) => (
                      <label className="list-row" key={item.id}>
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={(e) =>
                            setData((s) => ({
                              ...s,
                              shopping: s.shopping.map((x) =>
                                x.id === item.id
                                  ? { ...x, checked: e.target.checked }
                                  : x,
                              ),
                            }))
                          }
                        />
                        <div className={item.checked ? "crossed" : ""}>
                          <strong>{item.name}</strong>
                          <p>
                            {item.packages} × {item.size} {item.unit}
                          </p>
                        </div>
                        <b>{(item.price * item.packages).toFixed(2)} €</b>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          {tab === "Biblioteca" && (
            <Library
              data={data}
              review={reviewDraft}
              approveDocument={approveDocument}
            />
          )}
          <footer>
            HECHO CON CARIÑO PARA VUESTRA MESA <span>✳</span> &nbsp; 08191
          </footer>
        </div>
      </main>
    </div>
    {(importing || persistingUpload) && (
      <div className="workspace-save-overlay" role="status">
        {persistingUpload
          ? "Guardando el borrador compartido…"
          : importProgress || "Importando el PDF…"}
      </div>
    )}
    </>
  );
}
