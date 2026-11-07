"use client";
import { useState } from "react";
import { extractRecipe } from "../lib/recipe-extraction.mjs";
import { summarizeImports, pageStatus } from "../lib/import-status.mjs";
import type { State, RecipeDraft } from "../lib/types";

type Props = {
  data: State;
  review: (draft: RecipeDraft) => void;
  approveDocument: (id: string) => void;
};
const labels: Record<string, string> = {
  pending: "Pendiente",
  reviewing: "En revisión",
  ready: "Revisado · pendiente de aprobar",
  approved: "Aprobado",
};
export default function Library({ data, review, approveDocument }: Props) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const documents = summarizeImports(
    data.drafts || [],
    data.approvedDocuments || {},
  );
  const drafts = (data.drafts || []).filter(
    (d) => pageStatus(d) !== "reviewed",
  );
  const search = query.trim().toLocaleLowerCase("es");
  const match = (s: string) => s.toLocaleLowerCase("es").includes(search);
  const visibleDrafts = drafts.filter(
    (d) =>
      (filter === "all" || filter === pageStatus(d)) &&
      match(
        `${d.filename} ${extractRecipe(d.text).title} ${d.text.slice(0, 200)}`,
      ),
  );
  const visibleRecipes = data.recipes.filter(
    (r) =>
      (filter === "all" || filter === (r.approved ? "approved" : "pending")) &&
      match(r.name),
  );
  return (
    <>
      <div className="eyebrow muted">VUESTRA COLECCIÓN</div>
      <h1 className="page-title">
        Biblioteca de <em>recetas.</em>
      </h1>
      <p className="intro">
        Consulta el avance de cada PDF y filtra las recetas y páginas que quedan
        por revisar.
      </p>
      <section className="card">
        <h2>Recetarios importados</h2>
        <p className="help">
          Un archivo puede aprobarse cuando todas sus páginas estén revisadas o
          marcadas como no receta. El estado del archivo no sustituye la
          revisión de cada receta.
        </p>
        {documents.length === 0 ? (
          <p className="help">Todavía no hay archivos importados.</p>
        ) : (
          documents.map((doc) => (
            <div className="list-row" key={doc.id}>
              <div>
                <strong>{doc.filename}</strong>
                <p>
                  {labels[doc.status]} · {doc.pages.length} páginas ·{" "}
                  {doc.pending} pendientes · {doc.reviewing} en revisión ·{" "}
                  {doc.reviewed} revisadas · {doc.discarded} descartadas
                </p>
              </div>
              {doc.status === "ready" && (
                <button
                  className="secondary"
                  onClick={() => approveDocument(doc.id)}
                >
                  Aprobar archivo
                </button>
              )}
              {doc.status === "approved" && (
                <span className="status-pill">Aprobado</span>
              )}
            </div>
          ))
        )}
      </section>
      <section className="card">
        <h2>Recetas y páginas</h2>
        <div className="form-grid">
          <label className="field">
            <span>Buscar por nombre o archivo</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label className="field">
            <span>Estado</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">Todos</option>
              <option value="pending">Pendientes</option>
              <option value="reviewing">En revisión</option>
              <option value="approved">Recetas aprobadas</option>
              <option value="discarded">Descartadas</option>
            </select>
          </label>
        </div>
        <p className="help">
          Las páginas pendientes son borradores: pueden contener varias recetas
          o ninguna. Las recetas aprobadas se muestran por separado.
        </p>
        {visibleDrafts.map((d) => (
          <div className="list-row" key={d.id}>
            <div>
              <strong>
                {extractRecipe(d.text).title || `Página ${d.page}`}
              </strong>
              <p>
                {d.filename} · página {d.page} ·{" "}
                {pageStatus(d) === "discarded"
                  ? "Descartada"
                  : pageStatus(d) === "reviewing"
                    ? "En revisión"
                    : "Pendiente"}
              </p>
            </div>
            <button className="secondary" onClick={() => review(d)}>
              Abrir
            </button>
          </div>
        ))}
        {visibleRecipes.map((r) => (
          <div className="list-row" key={r.id}>
            <div>
              <strong>{r.name}</strong>
              <p>
                {r.meal} · {r.calories} kcal por ración
              </p>
            </div>
            <span className="status-pill">
              {r.approved ? "Aprobada" : "Pendiente"}
            </span>
          </div>
        ))}
        {!visibleDrafts.length && !visibleRecipes.length && (
          <p className="help">No hay resultados para este filtro.</p>
        )}
      </section>
    </>
  );
}
