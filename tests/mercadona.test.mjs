import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { extractId, normalizeProduct, lookup } = createRequire(import.meta.url)(
  "../lib/mercadona.cjs",
);
test("acepta solo identificadores y enlaces de la tienda", () => {
  assert.equal(extractId("10005"), "10005");
  assert.equal(
    extractId("https://tienda.mercadona.es/product/10005/chocolate"),
    "10005",
  );
  assert.equal(extractId("https://evil.example/product/10005"), null);
});
test("convierte litros y no adivina envases ambiguos", () => {
  const p = {
    id: "1",
    display_name: "Producto",
    published: true,
    price_instructions: { unit_price: "2.45", unit_size: 1, size_format: "l" },
  };
  const result = normalizeProduct(p);
  assert.equal(result.size, 1000);
  assert.equal(result.unit, "ml");
  assert.equal(result.price, 2.45);
  assert.equal(
    normalizeProduct({
      ...p,
      price_instructions: { ...p.price_instructions, unit_price: null },
    }).price,
    null,
  );
  assert.equal(normalizeProduct({ ...p, is_variable_weight: true }).size, null);
  assert.equal(
    normalizeProduct({
      ...p,
      price_instructions: { ...p.price_instructions, is_pack: true },
    }).size,
    null,
  );
});
test("usa el almacén devuelto para 08191", async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push([url, options]);
    return calls.length === 1
      ? { ok: true, headers: new Headers({ "x-customer-wh": "4362" }) }
      : {
          ok: true,
          json: async () => ({
            id: "1",
            display_name: "A",
            price_instructions: {
              unit_price: "2",
              unit_size: 1,
              size_format: "kg",
            },
          }),
        };
  };
  const result = await lookup("1", fetcher);
  assert.equal(JSON.parse(calls[0][1].body).new_postal_code, "08191");
  assert.match(calls[1][0], /wh=4362/);
  assert.equal(result.size, 1000);
});
test("rechaza almacén ausente y no consulta producto", async () => {
  let n = 0;
  await assert.rejects(
    lookup("1", async () => {
      n++;
      return { ok: true, headers: new Headers() };
    }),
    /almacén/,
  );
  assert.equal(n, 1);
});
