import { parentPort, workerData } from "node:worker_threads";
import { createRequire } from "node:module";

const { optimize } = createRequire(import.meta.url)("./optimizer.cjs");
try {
  parentPort.postMessage({ ok: true, result: await optimize(workerData) });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error instanceof Error ? error.message : "No se pudo calcular el menú." });
}
