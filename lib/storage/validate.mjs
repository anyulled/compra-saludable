export function isWorkspace(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (
    ["profiles", "products", "recipes", "plan", "shopping"].every((k) =>
      Array.isArray(value[k]),
    ) &&
    value.profiles.length === 2 &&
    value.profiles.every(
      (p) => p && typeof p === "object" && !Array.isArray(p),
    ) &&
    typeof value.confirmed === "boolean" &&
    (value.drafts === undefined || Array.isArray(value.drafts)) &&
    (value.planLocks === undefined || Array.isArray(value.planLocks))
  );
}
