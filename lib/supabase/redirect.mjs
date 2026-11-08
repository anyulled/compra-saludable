export function safeNextUrl(value, baseUrl) {
  const base = new URL(baseUrl);
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//"))
    return new URL("/", base);
  try {
    const target = new URL(value, base);
    return target.origin === base.origin ? target : new URL("/", base);
  } catch {
    return new URL("/", base);
  }
}
