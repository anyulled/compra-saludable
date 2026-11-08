export function requireMercadonaPrice(result) {
  if (!result || result.price === null) {
    throw Error("Mercadona no devolvió un precio válido. Añade el producto manualmente.");
  }
  return result;
}

export function mercadonaResultMessage(result) {
  const availability = !result.published || result.unavailable
    ? "La disponibilidad no está confirmada."
    : "La disponibilidad en tienda física no está confirmada.";
  return [
    "Producto consultado para 08191. Revisa el precio, formato y tamaño antes de añadirlo.",
    result.warning || "",
    availability,
  ].filter(Boolean).join(" ");
}
