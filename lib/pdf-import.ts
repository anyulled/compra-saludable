import type { RecipeDraft } from "./types";

export const MAX_PDF_BYTES = 20 * 1024 * 1024;

export async function validatePdfFile(file: File) {
  if (!file.size || file.size > MAX_PDF_BYTES)
    throw new Error("El PDF debe tener contenido y no superar 20 MiB.");
  if (!file.name.toLowerCase().endsWith(".pdf"))
    throw new Error("Selecciona un archivo PDF con extensión .pdf.");
  const prefix = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const signature = [0x25, 0x50, 0x44, 0x46, 0x2d];
  const hasPdfHeader = prefix.some((_, offset) =>
    signature.every((byte, index) => prefix[offset + index] === byte),
  );
  if (!hasPdfHeader) throw new Error("El archivo no contiene una cabecera PDF válida.");
}

/** Read uploaded bytes locally; retain every page, even if OCR cannot read it. */
export async function importPdf(
  file: File,
  progress: (message: string) => void,
): Promise<RecipeDraft[]> {
  await validatePdfFile(file);
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/api/pdf-worker";
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  let worker:
    Awaited<ReturnType<typeof import("tesseract.js").createWorker>> | undefined;
  let ocrUnavailable = false;
  try {
    const doc = await task.promise;
    if (doc.numPages > 500)
      throw new Error("El PDF supera el límite de 500 páginas.");
    const drafts: RecipeDraft[] = [];
    const documentId = crypto.randomUUID();
    for (let number = 1; number <= doc.numPages; number++) {
      progress(`Procesando página ${number} de ${doc.numPages}…`);
      const page = await doc.getPage(number);
      try {
        const result = await textForPage(page, { worker, ocrUnavailable }, progress, number);
        worker = result.worker;
        ocrUnavailable = result.ocrUnavailable;
        drafts.push(createPageDraft(file.name, documentId, number, result.text, result.method));
      } finally {
        page.cleanup();
      }
    }
    return drafts;
  } finally {
    if (worker) await worker.terminate();
    await task.destroy();
  }
}

function pageText(items: Array<{ str?: string; hasEOL?: boolean }>) {
  return items.map(textItem).join("").trim();
}

function textItem(item: { str?: string; hasEOL?: boolean }) {
  if (!("str" in item)) return "";
  return item.str + (item.hasEOL ? "\n" : " ");
}

async function createOcrWorker(progress: (message: string) => void, number: number) {
  progress(`Preparando OCR en español para la página ${number}…`);
  const { createWorker } = await import("tesseract.js");
  return createWorker("spa", 1, {
    workerPath: "/api/ocr-assets/worker.min.js",
    corePath: "/api/ocr-assets",
    langPath: "/api/ocr-assets",
    cacheMethod: "none",
  });
}

async function recognizePage(page: any, worker: Awaited<ReturnType<typeof import("tesseract.js").createWorker>>) {
  const viewport = page.getViewport({ scale: 2 });
  if (viewport.width * viewport.height > 24_000_000) throw new Error("Página demasiado grande para OCR");
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo preparar la imagen de la página");
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  try {
    return (await worker.recognize(canvas)).data.text.trim();
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function textForPage(page: any, state: { worker?: Awaited<ReturnType<typeof import("tesseract.js").createWorker>>; ocrUnavailable: boolean }, progress: (message: string) => void, number: number) {
  let text = pageText((await page.getTextContent()).items);
  if (text.length >= 30) return { text, method: "text" as const, ...state };
  if (state.ocrUnavailable) return { text, method: "unreadable" as const, ...state };
  let worker = state.worker;
  if (!worker) {
    try {
      worker = await createOcrWorker(progress, number);
    } catch {
      return { text, method: "unreadable" as const, worker: undefined, ocrUnavailable: true };
    }
  }
  try {
    const recognized = await recognizePage(page, worker);
    return { text: recognized, method: recognized ? "ocr" as const : "unreadable" as const, worker, ocrUnavailable: false };
  } catch {
    return { text, method: "unreadable" as const, worker, ocrUnavailable: false };
  }
}

function createPageDraft(filename: string, documentId: string, page: number, text: string, method: RecipeDraft["method"]): RecipeDraft {
  return {
    id: crypto.randomUUID().replaceAll("-", ""),
    filename,
    documentId,
    page,
    text,
    method,
    status: "pending",
  };
}
