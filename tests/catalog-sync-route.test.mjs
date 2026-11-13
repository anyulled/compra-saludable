import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { mockOpts } from "./helpers/mock-module.mjs";

process.env.ENDPOINT_OAUTH = "catalog-test-secret";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test-key";
mock.module("next/server.js", mockOpts({
  NextResponse: { json: (body, init) => Response.json(body, init) },
}));

let syncState = null;
let upserted = [];
let activated = null;
const supabase = {
  from(table) {
    return {
      select() { return { eq() { return { maybeSingle: async () => ({ data: table === "mercadona_catalog_sync_state" ? syncState : null, error: null }) }; } }; },
      upsert(rows) { upserted.push(...rows); return Promise.resolve({ error: null }); },
    };
  },
  async rpc(_name, args) { activated = args; return { error: null }; },
};
mock.module("@supabase/supabase-js", mockOpts({
  createClient: () => supabase,
}));
const { POST } = await import("../app/api/cron/mercadona-catalog/route.ts");

test("rechaza autorización incorrecta", async () => {
  const response = await POST(new Request("https://mesa.example/api/cron/mercadona-catalog", { method: "POST" }));
  assert.equal(response.status, 401);
});

test("descarga, valida y activa el catálogo con productos en lotes", async () => {
  syncState = null;
  upserted = [];
  activated = null;
  const previousFetch = globalThis.fetch;
  let metadataAttempts = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/api/datasets/")) {
      metadataAttempts += 1;
      if (metadataAttempts === 1) return new Response("busy", { status: 503 });
      return Response.json({ sha: "a".repeat(40), lastModified: "2026-11-09", siblings: [{ rfilename: "categories/1.json" }, { rfilename: "README.md" }] });
    }
    const products = Array.from({ length: 101 }, (_, index) => ({ id: String(index), display_name: `Producto ${index}`, price_instructions: { unit_price: "1", unit_size: 100, size_format: "g" } }));
    return Response.json({ products });
  };
  try {
    const request = new Request("https://mesa.example/api/cron/mercadona-catalog", { method: "POST", headers: { authorization: "Bearer catalog-test-secret" } });
    const response = await POST(request);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.status, "updated");
    assert.equal(payload.productCount, 101);
    assert.equal(upserted.length, 101);
    assert.equal(activated.p_product_count, 101);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("devuelve sin cambios cuando la revisión ya está activa", async () => {
  syncState = { active_revision: "b".repeat(40), product_count: 103, synced_at: "2026-11-09T00:00:00Z" };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url) => Response.json({ sha: "b".repeat(40), siblings: [{ rfilename: "categories/1.json" }] });
  try {
    const response = await POST(new Request("https://mesa.example/api/cron/mercadona-catalog", { method: "POST", headers: { authorization: "Bearer catalog-test-secret" } }));
    assert.equal((await response.json()).status, "unchanged");
  } finally {
    globalThis.fetch = previousFetch;
  }
});
