const BASE = "https://tienda.mercadona.es/api";
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
function normalizeProduct(raw) {
  if (!raw || !raw.price_instructions || typeof raw.display_name !== "string")
    throw Error("Mercadona no devolvió datos de producto reconocibles.");
  const p = raw.price_instructions;
  const price =
    p.unit_price === null || p.unit_price === undefined || p.unit_price === ""
      ? NaN
      : Number(p.unit_price);
  const size = Number(p.unit_size);
  const format = String(p.size_format || "").toLowerCase();
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
    !p.approx_size &&
    !p.is_pack;
  return {
    name: raw.display_name,
    price: Number.isFinite(price) && price >= 0 ? price : null,
    size: certain ? size * mapped[1] : null,
    unit: certain ? mapped[0] : null,
    source: `Mercadona · producto ${raw.id} · consulta ${new Date().toISOString()}`,
    productUrl:
      typeof raw.share_url === "string" &&
      raw.share_url.startsWith("https://tienda.mercadona.es/")
        ? raw.share_url
        : null,
    warning: certain
      ? null
      : "El formato o peso del envase requiere revisión manual.",
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
module.exports = { extractId, normalizeProduct, lookup };
