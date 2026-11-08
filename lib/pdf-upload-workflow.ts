import type { RecipeDraft, State } from "./types";
import { appendPdfDraftsToWorkspace } from "./pdf-workspace.mjs";
import { fitsWorkspaceLimit, WorkspaceWriteUncertainError } from "./workspace-limits.mjs";

type PdfStorage = {
  upload(path: string, file: File, options: { contentType: string; cacheControl: string; upsert: boolean }): Promise<{ error: unknown | null }>;
  remove(paths: string[]): Promise<{ error: unknown | null }>;
};

export function prepareStoredPdfDrafts(drafts: RecipeDraft[], householdId: string, current: State) {
  const documentId = drafts[0]?.documentId;
  if (!documentId) throw Error("El PDF no contiene páginas para importar.");
  if (!/^[0-9a-f-]{36}$/i.test(householdId)) throw Error("No se ha configurado el hogar para guardar el original.");
  const documentPath = `${householdId}/${documentId}.pdf`;
  const storedDrafts = drafts.map((draft) => ({ ...draft, documentPath }));
  if (!fitsWorkspaceLimit(appendPdfDraftsToWorkspace(current, storedDrafts))) {
    throw Error("Los borradores superarían el límite de 3 MiB del espacio compartido.");
  }
  return { documentId, documentPath, storedDrafts };
}

export async function uploadPdfBatchAndPersist({ items, storage, getLatestWorkspace, persist }: {
  items: Array<{ file: File; drafts: RecipeDraft[]; documentPath: string }>;
  storage: PdfStorage;
  getLatestWorkspace: () => State;
  persist: (state: State) => Promise<void>;
}) {
  const uploadedPaths: string[] = [];
  try {
    for (const item of items) {
      uploadedPaths.push(item.documentPath);
      const { error } = await storage.upload(item.documentPath, item.file, { contentType: "application/pdf", cacheControl: "3600", upsert: false });
      if (error) throw Error(`No se pudo guardar el PDF original ${item.file.name} en el hogar.`);
    }
    const drafts = items.flatMap((item) => item.drafts);
    const nextState = appendPdfDraftsToWorkspace(getLatestWorkspace(), drafts);
    if (!fitsWorkspaceLimit(nextState)) throw Error("El lote de borradores supera el límite de 3 MiB del espacio compartido.");
    await persist(nextState);
    return nextState;
  } catch (error) {
    if (error instanceof WorkspaceWriteUncertainError) throw error;
    const { error: cleanupError } = await storage.remove(uploadedPaths);
    if (cleanupError) throw Error("No se pudo confirmar la limpieza de los PDF del lote que no se guardó.");
    throw error;
  }
}
