/** Optional per-serving recipe fields and explicitly configured per-person daily bounds. */
export const nutrients = [
  {
    key: "fiberG",
    goal: "fiberMinG",
    label: "Fibra",
    unit: "g",
    direction: "min",
  },
  {
    key: "saturatedFatG",
    goal: "saturatedFatMaxG",
    label: "Grasas saturadas",
    unit: "g",
    direction: "max",
  },
  {
    key: "freeSugarG",
    goal: "freeSugarMaxG",
    label: "Azúcares libres",
    unit: "g",
    direction: "max",
  },
  {
    key: "calciumMg",
    goal: "calciumMinMg",
    label: "Calcio",
    unit: "mg",
    direction: "min",
  },
  {
    key: "vitaminDMcg",
    goal: "vitaminDMinMcg",
    label: "Vitamina D",
    unit: "µg",
    direction: "min",
  },
];
export const foodGroups = [
  { key: "legumbres", label: "Legumbres" },
  { key: "pescado", label: "Pescado" },
  { key: "verduras", label: "Verduras" },
  { key: "integrales", label: "Cereales integrales" },
];
