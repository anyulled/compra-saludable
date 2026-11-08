import { NextResponse } from "next/server";
import { Worker } from "node:worker_threads";
import { resolve } from "node:path";
import { requireAuthorizedUser } from "../../../lib/supabase/server";
import { MAX_REQUEST_BODY_BYTES } from "../../../lib/workspace-limits.mjs";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  if (!(await requireAuthorizedUser()))
    return NextResponse.json({ error: "Se requiere una sesión autorizada." }, { status: 401 });
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_REQUEST_BODY_BYTES)
      return NextResponse.json({ error: "La solicitud supera el límite de 4 MiB." }, { status: 413 });
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BODY_BYTES)
      return NextResponse.json({ error: "La solicitud supera el límite de 4 MiB." }, { status: 413 });
    const data = JSON.parse(body);
    const outcome = await new Promise<{ ok: boolean; result?: unknown; error?: string }>((resolveResult, reject) => {
      const worker = new Worker(resolve(process.cwd(), "lib/optimizer-worker.mjs"), { workerData: data });
      let settled = false;
      const finish = (error?: Error, value?: { ok: boolean; result?: unknown; error?: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate();
        if (error) reject(error);
        else resolveResult(value!);
      };
      const timer = setTimeout(() => finish(new Error("El cálculo ha excedido el tiempo disponible. Ajusta los objetivos o reduce las recetas y vuelve a intentarlo.")), 50_000);
      worker.once("message", (value) => finish(undefined, value));
      worker.once("error", (error) => finish(error instanceof Error ? error : new Error("Falló el cálculo del menú.")));
      worker.once("exit", (code) => finish(new Error(`El proceso de optimización terminó sin resultado (${code}).`)));
    });
    if (!outcome.ok) throw new Error(outcome.error || "No se pudo generar el menú.");
    return NextResponse.json(outcome.result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo generar el menú.",
      },
      { status: 400 },
    );
  }
}
