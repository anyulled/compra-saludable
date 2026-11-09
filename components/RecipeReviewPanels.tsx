import { AlertCircle } from "lucide-react";
import { pageStatus } from "../lib/import-status.mjs";
import type { RecipeDraft, Recipe, State } from "../lib/types";

export type RecipePdfPreview = { filename: string; url: string; documentId?: string } | null;
type PageState = NonNullable<RecipeDraft["status"]>;
export type PdfImportJobView = { id: string; name: string; status: "queued" | "processing" | "saving" | "done" | "error"; progress: string };

function importJobStatus(job: PdfImportJobView) {
  switch (job.status) {
    case "done": return "Listo para revisar";
    case "error": return "No se pudo importar";
    case "saving": return "Guardando en el espacio compartido…";
    case "processing": return job.progress || "Procesando…";
    default: return "En cola";
  }
}

function ImportJobRow({ job }: { job: PdfImportJobView }) {
  return <li data-status={job.status}><strong>{job.name}</strong><span>{importJobStatus(job)}</span></li>;
}

function renderImportJob(job: PdfImportJobView) {
  return <ImportJobRow key={job.id} job={job} />;
}

export function RecipeImportCard({ importing, progress, jobs, upload }: {
  importing: boolean;
  progress: string;
  jobs: PdfImportJobView[];
  upload: (files: File[]) => void;
}) {
  return (
    <section className="card">
      <h2>Importar un recetario</h2>
      <p className="help">Selecciona uno o varios PDF. Se procesan hasta dos archivos a la vez; mantén esta página abierta hasta que termine y recibirás una notificación si el navegador la permite. Cada página queda pendiente de revisión.</p>
      <label className="field"><span>Seleccionar PDF</span><input type="file" accept="application/pdf,.pdf" multiple disabled={importing} onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ""; if (files.length) upload(files); }} /></label>
      {importing && <p role="status">{progress || "Leyendo el documento…"}</p>}
      {jobs.length > 0 && <ul className="import-job-list" aria-label="Estado de importación">{jobs.map(renderImportJob)}</ul>}
      <p className="help">El PDF y el OCR se procesan en este navegador. Los borradores y el original se guardan en vuestro espacio privado. Revisa manualmente el texto y las recetas detectadas.</p>
    </section>
  );
}

function draftMethod(method: RecipeDraft["method"]) {
  if (method === "ocr") return "OCR";
  if (method === "unreadable") return "Sin texto legible";
  return "Texto extraído";
}

function draftStatusLabel(draft: RecipeDraft) {
  const status = pageStatus(draft);
  if (status === "reviewed") return "Revisada";
  if (status === "discarded") return "Descartada";
  if (status === "reviewing") return "En revisión";
  return "Pendiente";
}

function DraftActions({ draft, hasRecipe, selected, review, setStatus, clearSelected }: {
  draft: RecipeDraft;
  hasRecipe: boolean;
  selected: boolean;
  review: (draft: RecipeDraft) => void;
  setStatus: (draft: RecipeDraft, status: PageState) => void;
  clearSelected: () => void;
}) {
  const status = pageStatus(draft);
  const pending = status !== "reviewed" && status !== "discarded";
  const resolved = status === "reviewed" || status === "discarded";
  return (
    <>
      <button className="secondary" onClick={() => review(draft)}>{selected ? "Revisando" : "Revisar"}</button>
      {pending && hasRecipe && <button className="text-button" onClick={() => setStatus(draft, "reviewed")}>Completar revisión</button>}
      {pending && !hasRecipe && <button className="text-button" onClick={() => { setStatus(draft, "discarded"); clearSelected(); }}>No es receta</button>}
      {resolved && <button className="text-button" onClick={() => setStatus(draft, "pending")}>Reabrir</button>}
    </>
  );
}

function DraftRow({ draft, recipes, selectedDraft, review, setStatus, setSelectedDraft }: {
  draft: RecipeDraft;
  recipes: State["recipes"];
  selectedDraft: string | null;
  review: (draft: RecipeDraft) => void;
  setStatus: (draft: RecipeDraft, status: PageState) => void;
  setSelectedDraft: (id: string | null) => void;
}) {
  const hasRecipe = recipes.some((recipe) => recipe.sourceDraftId === draft.id);
  return (
    <div className="list-row">
      <div><strong>{draft.filename}</strong><p>Página {draft.page} · {draftMethod(draft.method)} · {draftStatusLabel(draft)} · {draft.text.slice(0, 90) || "Revisa el documento original"}…</p></div>
      <DraftActions draft={draft} hasRecipe={hasRecipe} selected={selectedDraft === draft.id} review={review} setStatus={setStatus} clearSelected={() => selectedDraft === draft.id && setSelectedDraft(null)} />
    </div>
  );
}

export function DraftReviewList({ drafts, recipes, selectedDraft, review, setStatus, setSelectedDraft }: {
  drafts: RecipeDraft[];
  recipes: State["recipes"];
  selectedDraft: string | null;
  review: (draft: RecipeDraft) => void;
  setStatus: (draft: RecipeDraft, status: PageState) => void;
  setSelectedDraft: (id: string | null) => void;
}) {
  if (drafts.length === 0) return null;
  return <section className="card"><h2>Páginas importadas</h2><p className="help">Una página puede contener varias recetas. Cuando hayas añadido todas sus recetas, márcala como revisada; si no contiene recetas, márcala como descartada. Filtra por estado en la biblioteca.</p><div className="draft-list">{drafts.map((draft) => <DraftRow key={draft.id} draft={draft} recipes={recipes} selectedDraft={selectedDraft} review={review} setStatus={setStatus} setSelectedDraft={setSelectedDraft} />)}</div></section>;
}

function ExistingPdfPreview({ draft, preview, openDocument, openingDocument }: {
  draft: RecipeDraft;
  preview: RecipePdfPreview;
  openDocument: (draft: RecipeDraft) => void;
  openingDocument: string | null;
}) {
  const documentId = draft.storedDocumentId || draft.documentId;
  if (preview && preview.documentId === documentId && preview.filename === draft.filename) return <iframe title={`PDF original, página ${draft.page}`} className="pdf-preview" src={`${preview.url}#page=${draft.page}`} />;
  if (!draft.documentPath) return null;
  const isOpening = openingDocument === documentId;
  return <div><p className="help">El original privado está guardado en el hogar y solo se abre con una sesión autorizada.</p><button className="secondary" disabled={isOpening} onClick={() => openDocument(draft)}>{isOpening ? "Abriendo PDF…" : "Abrir PDF original"}</button></div>;
}

function LocalPdfPicker({ draft, setPreview, setMessage }: {
  draft: RecipeDraft;
  setPreview: (preview: RecipePdfPreview) => void;
  setMessage: (message: string) => void;
}) {
  return (
    <div>
      <p className="help">Este borrador antiguo no tiene un original privado. Puedes elegir de nuevo el PDF para compararlo; no se volverá a importar.</p>
      <label className="field"><span>Abrir PDF original</span><input type="file" accept="application/pdf,.pdf" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; if (file.name !== draft.filename) { setMessage("Selecciona el PDF con el mismo nombre que el borrador."); return; } setPreview({ filename: file.name, url: URL.createObjectURL(file), documentId: draft.storedDocumentId || draft.documentId }); }} /></label>
    </div>
  );
}

export function DraftOriginalCard({ drafts, selectedDraft, preview, setPreview, openingDocument, openDocument, setMessage }: {
  drafts: RecipeDraft[];
  selectedDraft: string | null;
  preview: RecipePdfPreview;
  setPreview: (preview: RecipePdfPreview) => void;
  openingDocument: string | null;
  openDocument: (draft: RecipeDraft) => void;
  setMessage: (message: string) => void;
}) {
  const draft = drafts.find((item) => item.id === selectedDraft);
  if (!draft) return null;
  return <section className="card"><h2>Comprobar el original</h2><ExistingPdfPreview draft={draft} preview={preview} openingDocument={openingDocument} openDocument={openDocument} />{!draft.documentPath && <LocalPdfPicker draft={draft} setPreview={setPreview} setMessage={setMessage} />}</section>;
}

export function RecipeWarning() {
  return <div className="warning"><AlertCircle size={19} /><span>Los PDF se procesan en este navegador. Revisa el texto, las raciones y los valores nutricionales antes de guardar. Las sugerencias son orientativas y no validan las recetas ni sus valores nutricionales.</span></div>;
}
