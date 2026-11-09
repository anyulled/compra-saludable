import test, { mock } from "node:test";
import assert from "node:assert/strict";

const catalogProduct = { id: "x1", display_name: "Garbanzos", published: true, price_instructions: { unit_price: "1.25", unit_size: 500, size_format: "g" } };
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-public-key";
process.env.AUTHORIZED_EMAILS = "one@example.test,two@example.test";
let catalogResults = [];
let catalogError = null;
let liveQueries = [];
const supabase = {
  async rpc(_name, args) { assert.deepEqual(args.p_queries, ["garbanzos"]); return { data: catalogResults, error: catalogError }; },
  from() { return { select() { return { eq() { return { maybeSingle: async () => ({ data: { source_last_modified: "2026-11-09T00:00:00Z" } }) }; } }; } }; },
};
const user = { id: "10000000-0000-4000-8000-000000000001", email: "one@example.test", email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: { provider: "google", providers: ["google"] }, identities: [{ provider: "google" }] };
supabase.auth = { getUser: async () => ({ data: { user }, error: null }) };
mock.module("next/server.js", { exports: { NextResponse: { json: (body, init) => Response.json(body, init) } } });
mock.module("@supabase/ssr", { exports: { createServerClient: () => supabase } });
mock.module("next/headers", { exports: { cookies: async () => ({ getAll: () => [], set() {} }) } });
mock.module("../lib/mercadona.cjs", { exports: { normalizeProduct: (value) => ({ name: value.display_name, unit: "g", size: 500, price: 1.25, source: "Mercadona" }), searchManyProducts: async (queries) => { liveQueries = queries; return queries.map((query) => ({ query, products: [{ id: "live", name: "Garbanzos", unit: "g", size: 500, price: 1.3 }] })); } } });
const { POST } = await import("../app/api/mercadona/search/route.ts");
const request = () => new Request("https://mesa.example/api/mercadona/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ queries: ["garbanzos"] }) });

test("prioriza el catálogo semanal y normaliza los productos", async () => {
  catalogResults = [{ query: "garbanzos", products: [catalogProduct] }];
  catalogError = null;
  liveQueries = [];
  const response = await POST(request());
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.results[0].products[0].id, "x1");
  assert.deepEqual(liveQueries, []);
});

test("usa la búsqueda en directo si el catálogo no ofrece resultados válidos", async () => {
  catalogResults = [{ query: "garbanzos", products: [null] }];
  catalogError = null;
  liveQueries = [];
  const response = await POST(request());
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(liveQueries, ["garbanzos"]);
  assert.equal(payload.results[0].products[0].id, "live");
});

test("usa la búsqueda en directo cuando falla el catálogo", async () => {
  catalogResults = null;
  catalogError = new Error("catalog unavailable");
  liveQueries = [];
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.deepEqual(liveQueries, ["garbanzos"]);
  catalogError = null;
});
