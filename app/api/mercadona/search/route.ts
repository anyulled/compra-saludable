import { NextResponse } from "next/server";
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
    const body = await request.json();
    const queries = body?.queries;
    if (!Array.isArray(queries) || queries.length < 1 || queries.length > 30 || queries.some((query: unknown) => typeof query !== "string" || !query.trim() || query.length > 120)) {
      return NextResponse.json({ error: "Introduce entre 1 y 30 ingredientes de hasta 120 caracteres." }, { status: 400 });
    }
    const { supabase } = authorization;
    const { data: catalogResults, error: catalogError } = await supabase.rpc("search_mercadona_catalog", {
      p_queries: queries,
    });
    const resultsByQuery = new Map<string, { query: string; products: unknown[] }>();
    if (!catalogError && Array.isArray(catalogResults)) {
      const { data: state } = await supabase
        .from("mercadona_catalog_sync_state")
        .select("source_last_modified")
        .eq("id", 1)
        .maybeSingle();
      const updatedAt = state?.source_last_modified
        ? new Date(state.source_last_modified).toLocaleDateString("es-ES")
        : null;
      for (const result of catalogResults) {
        const rawProducts = Array.isArray(result.products) ? result.products : [];
        const products = rawProducts.flatMap((raw: unknown) => {
          try {
            const product = normalizeProduct(raw);
            return [{
              id: (raw as { id: string }).id,
              ...product,
              source: `Mercadona · catálogo semanal${updatedAt ? ` · datos del ${updatedAt}` : ""}`,
            }];
          } catch {
            return [];
          }
        });
        resultsByQuery.set(result.query, { query: result.query, products });
      }
    }

    const missingQueries = queries.filter((query: string) => !resultsByQuery.get(query)?.products.length);
    if (catalogError || missingQueries.length) {
      const liveResults = await searchManyProducts(missingQueries.length ? missingQueries : queries);
      for (const result of liveResults) {
        if (!resultsByQuery.get(result.query)?.products.length || catalogError) {
          resultsByQuery.set(result.query, result);
        }
      }
    }
    return NextResponse.json({ results: queries.map((query: string) => resultsByQuery.get(query) || { query, products: [] }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo buscar en Mercadona." }, { status: 502 });
  }
}
