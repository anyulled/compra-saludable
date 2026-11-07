import type { RecipeDraft } from "./types";

/** Read uploaded bytes locally; retain every page, even if OCR cannot read it. */
export async function importPdf(
  file: File,
  progress: (message: string) => void,
): Promise<RecipeDraft[]> {
  if (file.size > 50 * 1024 * 1024)
    throw new Error("El PDF supera el límite de 50 MB.");
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
      const content = await page.getTextContent();
      let text = content.items
        .map((item) =>
          "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
        )
        .join("")
        .trim();
      let method: RecipeDraft["method"] = "text";
      if (text.length < 30) {
        method = "ocr";
        try {
          if (ocrUnavailable) throw new Error("OCR no disponible");
          if (!worker) {
            progress(`Preparando OCR en español para la página ${number}…`);
            const { createWorker } = await import("tesseract.js");
            try {
              worker = await createWorker("spa", 1, {
                workerPath: "/api/ocr-assets/worker.min.js",
                corePath: "/api/ocr-assets",
                langPath: "/api/ocr-assets",
                cacheMethod: "none",
              });
            } catch (e) {
              ocrUnavailable = true;
              throw e;
            }
          }
          const viewport = page.getViewport({ scale: 2 });
          // Avoid excessively large canvas allocations for unusually sized pages.
          if (viewport.width * viewport.height > 24_000_000)
            throw new Error("Página demasiado grande para OCR");
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d");
          if (!context)
            throw new Error("No se pudo preparar la imagen de la página");
          await page.render({ canvas, canvasContext: context, viewport })
            .promise;
          const result = await worker.recognize(canvas);
          text = result.data.text.trim();
          canvas.width = 0;
          canvas.height = 0;
          if (!text) method = "unreadable";
        } catch {
          method = "unreadable";
        }
      }
      drafts.push({
        id: crypto.randomUUID().replaceAll("-", ""),
        filename: file.name,
        documentId,
        page: number,
        text,
        method,
        status: "pending",
      });
      page.cleanup();
    }
    return drafts;
  } finally {
    if (worker) await worker.terminate();
    await task.destroy();
  }
}
