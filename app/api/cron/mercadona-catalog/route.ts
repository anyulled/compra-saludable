import { timingSafeEqual } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server.js";

export const runtime = "nodejs";
export const maxDuration = 60;

const DATASET = "datania/mercadona-catalog";
const HF_API = `https://huggingface.co/api/datasets/${DATASET}`;
const HF_RAW = `https://huggingface.co/datasets/${DATASET}/resolve/main/`;
const MIN_PRODUCTS = 100;
const BATCH_SIZE = 300;

function retryDelay(attempt: number) {
  return 250 * 2 ** attempt;
}

function retryAfterDelay(response: Response, attempt: number) {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 5) * 1000 : retryDelay(attempt);
}

type CatalogProduct = {
  id: string;
  display_name: string;
  price_instructions: Record<string, unknown>;
  [key: string]: unknown;
};

function matchesBearer(request: Request, secretName: string) {
  const secret = process.env[secretName]?.trim();
  const provided = request.headers.get("authorization") || "";
  if (!secret || !provided.startsWith("Bearer ")) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function fetchJson(url: string) {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: { accept: "application/json", "user-agent": "mesa-catalog-sync/1.0" },
      });
      if (response.ok) return await response.json();
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`Hugging Face respondió ${response.status}.`);
      }
      lastError = new Error(`Hugging Face respondió ${response.status}.`);
      await delay(retryAfterDelay(response, attempt));
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("No se pudo descargar el catálogo.");
      if (attempt < 2) await delay(retryDelay(attempt));
    }
  }
  throw lastError || new Error("No se pudo descargar el catálogo.");
}

async function boundedMap<T, R>(items: T[], concurrency: number, task: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]);
    }
  }));
  return results;
}

function collectProducts(value: unknown, products: Map<string, CatalogProduct>) {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectProducts(entry, products));
    return;
  }
  if (!value || typeof value !== "object") return;
  const candidate = value as Record<string, unknown>;
  if (
    (typeof candidate.id === "string" || typeof candidate.id === "number") &&
    typeof candidate.display_name === "string" &&
    candidate.price_instructions &&
    typeof candidate.price_instructions === "object"
  ) {
    const product = { ...candidate, id: String(candidate.id) } as CatalogProduct;
    products.set(product.id, product);
  }
  Object.values(candidate).forEach((entry) => collectProducts(entry, products));
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Faltan variables privadas de Supabase para sincronizar el catálogo.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function synchronizeCatalog() {
  const supabase = createAdminClient();
  const info = await getDatasetInfo();
  const categoryFiles = extractCategoryFiles(info);
  const current = await readSyncState(supabase);
  if (current?.active_revision === info.sha) return unchangedResult(info.sha, current);
  const products = await fetchProducts(categoryFiles);
  const rows = products.map((product) => ({
    revision: info.sha,
    product_id: product.id,
    display_name: product.display_name,
    product_data: product,
  }));
  await writeProductBatches(supabase, rows);
  const sourceLastModified = typeof info.lastModified === "string" ? info.lastModified : null;
  await activateRevision(supabase, info.sha, sourceLastModified, rows.length);
  return { status: "updated", revision: info.sha, sourceLastModified, syncedAt: new Date().toISOString(), categories: categoryFiles.length, productCount: rows.length };
}

async function getDatasetInfo() {
  const info = await fetchJson(HF_API) as {
    sha?: unknown;
    lastModified?: unknown;
    siblings?: Array<{ rfilename?: unknown }>;
  };
  if (typeof info.sha !== "string" || !/^[a-f0-9]{40}$/.test(info.sha)) {
    throw new Error("Hugging Face no devolvió una revisión válida.");
  }
  return info as { sha: string; lastModified?: unknown; siblings?: Array<{ rfilename?: unknown }> };
}

function extractCategoryFiles(info: { siblings?: Array<{ rfilename?: unknown }> }) {
  const categoryFiles = (info.siblings || [])
    .map((file) => file.rfilename)
    .filter((name): name is string => typeof name === "string" && /^categories\/\d+\.json$/.test(name));
  if (!categoryFiles.length || categoryFiles.length > 500) {
    throw new Error("La lista de categorías de Hugging Face no parece completa.");
  }

  return categoryFiles;
}

async function readSyncState(supabase: ReturnType<typeof createAdminClient>) {
  const { data: current, error } = await supabase
    .from("mercadona_catalog_sync_state")
    .select("active_revision, product_count, synced_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error("No se pudo consultar el estado previo del catálogo en Supabase.");
  return current;
}

function unchangedResult(revision: string, current: { product_count: number; synced_at: string }) {
  return { status: "unchanged", revision, productCount: current.product_count, syncedAt: current.synced_at };
}

async function fetchProducts(categoryFiles: string[]) {
  const categoryPayloads = await boundedMap(categoryFiles, 8, (file) => fetchJson(HF_RAW + file));
  const products = new Map<string, CatalogProduct>();
  categoryPayloads.forEach((category) => collectProducts(category, products));
  if (products.size < MIN_PRODUCTS) {
    throw new Error(`El catálogo descargado solo contiene ${products.size} productos; no se activó.`);
  }
  return [...products.values()];
}

async function writeProductBatches(supabase: ReturnType<typeof createAdminClient>, rows: Array<Record<string, unknown>>) {
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const { error } = await supabase
      .from("mercadona_catalog_products")
      .upsert(rows.slice(offset, offset + BATCH_SIZE), { onConflict: "revision,product_id" });
    if (error) throw new Error(`No se pudo guardar el lote ${Math.floor(offset / BATCH_SIZE) + 1} del catálogo.`);
  }
}

async function activateRevision(supabase: ReturnType<typeof createAdminClient>, revision: string, sourceLastModified: string | null, productCount: number) {
  const { error: activationError } = await supabase.rpc("activate_mercadona_catalog_revision", {
    p_revision: revision,
    p_source_last_modified: sourceLastModified,
    p_product_count: productCount,
  });
  if (activationError) throw new Error("Los datos se guardaron, pero no se pudo activar la nueva revisión.");
}

async function run(request: Request) {
  if (!matchesBearer(request, "ENDPOINT_OAUTH")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    return NextResponse.json(await synchronizeCatalog());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falló la sincronización del catálogo." }, { status: 502 });
  }
}

// External schedulers call POST with Authorization: Bearer <ENDPOINT_OAUTH>.
export async function POST(request: Request) {
  return run(request);
}
