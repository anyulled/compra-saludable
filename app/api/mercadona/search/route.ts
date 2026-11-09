import { NextResponse } from "next/server.js";
import { normalizeProduct, searchManyProducts } from "../../../../lib/mercadona.cjs";
import { requireAuthorizedUser } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const authorization = await requireAuthorizedUser();
  if (!authorization) {
    return NextResponse.json({ error: "Se requiere una sesión autorizada." }, { status: 401 });
  }
  try {
    const queries = await readQueries(request);
    if (!validQueries(queries)) return invalidQueryResponse();
    const results = await searchQueries(authorization.supabase, queries);
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo buscar en Mercadona." }, { status: 502 });
  }
}

async function readQueries(request: Request) {
  const body = await request.json();
  return body?.queries;
}

function validQueries(queries: unknown): queries is string[] {
  if (!Array.isArray(queries) || queries.length < 1 || queries.length > 30) return false;
  for (const query of queries) if (typeof query !== "string" || !query.trim() || query.length > 120) return false;
  return true;
}

function invalidQueryResponse() {
  return NextResponse.json({ error: "Introduce entre 1 y 30 ingredientes de hasta 120 caracteres." }, { status: 400 });
}

async function searchQueries(supabase: any, queries: string[]) {
  const { data, error } = await supabase.rpc("search_mercadona_catalog", { p_queries: queries });
  const results = error || !Array.isArray(data) ? new Map() : await formatCatalogResults(supabase, data);
  const fallbackQueries: string[] = [];
  for (const query of queries) if (!results.get(query)?.products.length) fallbackQueries.push(query);
  if (error || fallbackQueries.length) await mergeLiveResults(results, error ? queries : fallbackQueries);
  return queries.map(toQueryResult, results);
}

function toQueryResult(this: Map<string, any>, query: string) {
  return this.get(query) || { query, products: [] };
}

async function formatCatalogResults(supabase: any, catalogResults: any[]) {
  const { data: state } = await supabase.from("mercadona_catalog_sync_state").select("source_last_modified").eq("id", 1).maybeSingle();
  const updatedAt = state?.source_last_modified ? new Date(state.source_last_modified).toLocaleDateString("es-ES") : null;
  const results = new Map();
  for (const result of catalogResults) results.set(result.query, { query: result.query, products: normalizeCatalogProducts(result.products, updatedAt) });
  return results;
}

function normalizeCatalogProducts(rawProducts: unknown, updatedAt: string | null) {
  if (!Array.isArray(rawProducts)) return [];
  const products = [];
  for (const raw of rawProducts as any[]) {
    try {
      const product = normalizeProduct(raw);
      products.push({ id: raw.id, ...product, source: `Mercadona · catálogo semanal${updatedAt ? ` · datos del ${updatedAt}` : ""}` });
    } catch { /* A malformed catalog row is skipped. */ }
  }
  return products;
}

async function mergeLiveResults(results: Map<string, any>, queries: string[]) {
  const live = await searchManyProducts(queries);
  for (const result of live) if (!results.get(result.query)?.products.length) results.set(result.query, result);
}
