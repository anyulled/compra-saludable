const requiredArrays = ["profiles", "products", "recipes", "plan", "shopping"];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasRequiredCollections(value) {
  return requiredArrays.every((key) => Array.isArray(value[key]));
}

function hasTwoProfileRecords(value) {
  return value.profiles.length === 2 && value.profiles.every(isRecord);
}

function hasOptionalCollections(value) {
  const optionalArrays = ["drafts", "planLocks"];
  return optionalArrays.every((key) => value[key] === undefined || Array.isArray(value[key]));
}

export function isWorkspace(value) {
  if (!isRecord(value)) return false;
  return hasRequiredCollections(value) && hasTwoProfileRecords(value) &&
    typeof value.confirmed === "boolean" && hasOptionalCollections(value);
}
