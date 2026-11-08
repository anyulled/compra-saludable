const BASE = "https://tienda.mercadona.es/api";
const catalogByWarehouse = new Map();
const categoryCache = new Map();
const rootCache = new Map();
function extractId(input) {
  const text = String(input || "").trim();
  if (/^\d{1,12}$/.test(text)) return text;
  try {
    const url = new URL(text);
    if (url.hostname !== "tienda.mercadona.es" || url.protocol !== "https:")
      return null;
    return url.pathname.match(/^\/product\/(\d{1,12})(?:\/|$)/)?.[1] || null;
  } catch {
    return null;
  }
}
function normalizedPrice(instructions) {
  const value = instructions.unit_price;
  if (value === null || value === undefined || value === "") return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

function normalizedPackage(raw, instructions) {
  const size = Number(instructions.unit_size);
  const format = String(instructions.size_format || "").toLowerCase();
  const units = {
    g: ["g", 1],
    kg: ["g", 1000],
    ml: ["ml", 1],
    l: ["ml", 1000],
    ud: ["unidades", 1],
    unidad: ["unidades", 1],
    unidades: ["unidades", 1],
  };
  const mapped = units[format];
  const certain =
    !!mapped &&
    Number.isFinite(size) &&
    size > 0 &&
    !raw.is_variable_weight &&
    !instructions.approx_size &&
    !instructions.is_pack;
  return {
    size: certain ? size * mapped[1] : null,
    unit: certain ? mapped[0] : null,
    certain,
  };
}

function trustedProductUrl(raw) {
  if (typeof raw.share_url !== "string") return null;
  return raw.share_url.startsWith("https://tienda.mercadona.es/") ? raw.share_url : null;
}

function normalizeProduct(raw) {
  if (!raw || !raw.price_instructions || typeof raw.display_name !== "string")
    throw Error("Mercadona no devolvió datos de producto reconocibles.");
  const pack = normalizedPackage(raw, raw.price_instructions);
  return {
    name: raw.display_name,
    price: normalizedPrice(raw.price_instructions),
    size: pack.size,
    unit: pack.unit,
    source: `Mercadona · producto ${raw.id} · consulta ${new Date().toISOString()}`,
    productUrl: trustedProductUrl(raw),
    warning: pack.certain ? null : "El formato o peso del envase requiere revisión manual.",
    published: raw.published === true,
    unavailable: !!raw.unavailable_from,
  };
}
async function lookup(input, fetcher = fetch) {
  const id = extractId(input);
  if (!id)
    throw Error(
      "Introduce un identificador numérico o un enlace de producto de tienda.mercadona.es.",
    );
  const opts = { signal: AbortSignal.timeout(10000), cache: "no-store" };
  const pc = await fetcher(BASE + "/postal-codes/actions/change-pc/", {
    ...opts,
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ new_postal_code: "08191" }),
  });
  if (!pc.ok)
    throw Error(
      "No se pudo consultar el almacén para 08191. Inténtalo de nuevo o introduce el producto manualmente.",
    );
  const wh = pc.headers.get("x-customer-wh");
  if (!wh || !/^[a-zA-Z0-9_-]{1,32}$/.test(wh))
    throw Error("Mercadona no devolvió un almacén válido para 08191.");
  const response = await fetcher(
    BASE + "/products/" + id + "/?lang=es&wh=" + encodeURIComponent(wh),
    opts,
  );
  if (response.status === 404)
    throw Error("No se encontró ese producto en el catálogo.");
  if (!response.ok)
    throw Error(
      "Mercadona no pudo responder a la consulta. Inténtalo de nuevo o introduce el producto manualmente.",
    );
  return normalizeProduct(await response.json());
}

function searchScore(name, query) {
  const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
  const normalizedName = normalize(name);
  const normalizedQuery = normalize(query).trim();
  const tokens = normalizedQuery.split(/\s+/).filter((token) => token.length > 1);
  if (!tokens.length) return 0;
  const matches = tokens.filter((token) => normalizedName.includes(token)).length;
  if (!matches) return 0;
  return (normalizedName === normalizedQuery ? 100 : 0) + matches / tokens.length * 10 + (normalizedName.startsWith(normalizedQuery) ? 5 : 0);
}

function collectProducts(value, products) {
  if (Array.isArray(value)) return value.forEach((entry) => collectProducts(entry, products));
  if (!value || typeof value !== "object") return;
  if (typeof value.id === "string" && typeof value.display_name === "string" && value.price_instructions) products.set(value.id, value);
  Object.values(value).forEach((entry) => collectProducts(entry, products));
}

function categoryIds(root) {
  const ids = new Set();
  for (const section of root.results || []) {
    const children = Array.isArray(section.categories) ? section.categories : [];
    for (const category of children.length ? children : [section]) {
      if (Number.isInteger(category.id)) ids.add(category.id);
    }
  }
  return [...ids];
}

function matchingCategoryIds(root, query, limit = 8) {
  const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
  const tokens = normalize(query).split(/\s+/).filter((token) => token.length > 2);
  const ranked = [];
  for (const section of root.results || []) {
    const candidates = Array.isArray(section.categories) && section.categories.length ? section.categories : [section];
    for (const entry of candidates) {
      if (!Number.isInteger(entry.id)) continue;
      const label = normalize([section.name, section.display_name, section.title, entry.name, entry.display_name, entry.title, entry.slug].filter(Boolean).join(" "));
      const score = tokens.reduce((sum, token) => sum + (label.includes(token) ? 1 : 0), 0);
      ranked.push({ id: entry.id, score });
    }
  }
  const positive = ranked.filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);
  return [...new Set((positive.length ? positive : ranked).slice(0, Math.min(limit, 4)).map((entry) => entry.id))];
}

async function boundedMap(items, limit, task) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = await task(items[index]); } catch { results[index] = null; }
    }
  }));
  return results;
}

async function loadCatalog(warehouse, query, fetcher) {
  const cacheKey = warehouse + ":" + query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
  if (!catalogByWarehouse.has(cacheKey)) {
    const catalog = (async () => {
      const options = { signal: AbortSignal.timeout(12000), cache: "no-store" };
      if (!rootCache.has(warehouse)) rootCache.set(warehouse, (async () => {
        const rootResponse = await fetcher(BASE + "/categories/?lang=es&wh=" + encodeURIComponent(warehouse), options);
        if (!rootResponse.ok) throw Error("No se pudo consultar el catálogo de categorías de Mercadona.");
        return rootResponse.json();
      })());
      let root;
      try { root = await rootCache.get(warehouse); }
      catch (error) { rootCache.delete(warehouse); throw error; }
      const ids = matchingCategoryIds(root, query);
      const categoryPayloads = await boundedMap(ids, 2, async (id) => {
        const key = warehouse + ":" + id;
        if (!categoryCache.has(key)) categoryCache.set(key, (async () => {
          const response = await fetcher(BASE + "/categories/" + id + "/?lang=es&wh=" + encodeURIComponent(warehouse), options);
          if (!response.ok) throw Error("Mercadona no devolvió una categoría.");
          return response.json();
        })());
        try { return await categoryCache.get(key); }
        catch (error) { categoryCache.delete(key); throw error; }
      });
      const products = new Map();
      categoryPayloads.forEach((payload) => payload && collectProducts(payload, products));
      if (!products.size) throw Error("Mercadona no devolvió productos en las categorías consultadas.");
      return [...products.values()];
    })();
    catalogByWarehouse.set(cacheKey, catalog);
  }
  try { return await catalogByWarehouse.get(cacheKey); }
  catch (error) { catalogByWarehouse.delete(cacheKey); throw error; }
}

function matchCatalog(query, catalog) {
  return catalog.map((raw) => ({ raw, score: searchScore(raw.display_name, query) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.raw.display_name.localeCompare(right.raw.display_name, "es"))
    .slice(0, 12)
    .map(({ raw }) => ({ id: raw.id, ...normalizeProduct(raw) }));
}

async function searchManyProducts(queries, fetcher = fetch) {
  const texts = queries.map((query) => String(query || "").trim());
  if (!texts.length || texts.length > 30 || texts.some((query) => !query || query.length > 120)) throw Error("Introduce hasta 30 ingredientes de no más de 120 caracteres.");
  const pc = await fetcher(BASE + "/postal-codes/actions/change-pc/", {
    signal: AbortSignal.timeout(10000), method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ new_postal_code: "08191" }),
  });
  if (!pc.ok) throw Error("No se pudo consultar el almacén para 08191.");
  const warehouse = pc.headers.get("x-customer-wh");
  if (!warehouse || !/^[a-zA-Z0-9_-]{1,32}$/.test(warehouse)) throw Error("Mercadona no devolvió un almacén válido para 08191.");
  const matched = await boundedMap(texts, 3, async (query) => matchCatalog(query, await loadCatalog(warehouse, query, fetcher)));
  return texts.map((query, index) => ({ query, products: matched[index] || [] }));
}
async function searchProducts(query, fetcher = fetch) {
  const [result] = await searchManyProducts([query], fetcher);
  return result.products;
}
function clearCatalogCache() { catalogByWarehouse.clear(); categoryCache.clear(); rootCache.clear(); }
module.exports = { extractId, normalizeProduct, lookup, searchProducts, searchManyProducts, searchScore, categoryIds, clearCatalogCache };
