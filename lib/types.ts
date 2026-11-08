export type Meal = "Desayuno" | "Comida" | "Cena" | "Tentempié";
export type Profile = {
  name: string;
  age: number;
  height: number;
  weight: number;
  sex: "male" | "female" | "";
  activity: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  restrictions: string;
  clinicalReview?: "yes" | "no" | "unknown";
  medicationRisk?: "yes" | "no" | "unknown";
  otherSafety?: "yes" | "no" | "unknown";
  recommendationBasis?: string;
  vitaminDGoalMcg?: number;
  nutritionGoals?: NutritionGoals;
  objectiveSource?: "professional" | "personal" | "suggested" | "";
};
export type NutritionGoals = {
  fiberMinG?: number;
  saturatedFatMaxG?: number;
  freeSugarMaxG?: number;
  calciumMinMg?: number;
  vitaminDMinMcg?: number;
};
export type OptimizationOptions = {
  startDate?: string;
  maxRecipeRepetitions?: number;
  categoryMinimums?: Record<string, number>;
};
export type Product = {
  id: string;
  name: string;
  unit: string;
  size: number;
  price: number;
  stock: number;
  expiresOn?: string;
  source: string;
};
export type IngredientProductOption = {
  id: string;
  name: string;
  unit: string | null;
  size: number | null;
  price: number | null;
  source: string;
  warning: string | null;
  productUrl: string | null;
};
export type Ingredient = {
  productId?: string;
  name?: string;
  unit?: string;
  amount: number;
  productOptions?: IngredientProductOption[];
};
export type Recipe = {
  id: string;
  name: string;
  meal: Meal;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: Ingredient[];
  rating: number;
  sodiumMg?: number;
  vitaminDMcg?: number;
  vitaminDSource?: string;
  fiberG?: number;
  saturatedFatG?: number;
  freeSugarG?: number;
  calciumMg?: number;
  nutritionExtrasSource?: string;
  foodGroups?: string[];
  notes: string;
  approved: boolean;
  sourceDraftId?: string;
};
export type RecipeDraft = {
  id: string;
  filename: string;
  page: number;
  text: string;
  documentId?: string;
  storedDocumentId?: string;
  documentPath?: string;
  status?: "pending" | "reviewing" | "reviewed" | "discarded";
  method?: "text" | "ocr" | "unreadable";
};
export type PlanItem = {
  day: number;
  meal: Meal;
  recipeId: string;
  portions: number[];
};
export type PlanLock = { day: number; meal: Meal; recipeId: string };
export type Leftover = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  purchased: number;
  used: number;
  remaining: number;
  expiredStock: number;
};
export type ShoppingItem = {
  id: string;
  name: string;
  packages: number;
  size: number;
  unit: string;
  price: number;
  checked: boolean;
};
export type State = {
  profiles: Profile[];
  products: Product[];
  recipes: Recipe[];
  plan: PlanItem[];
  shopping: ShoppingItem[];
  confirmed: boolean;
  drafts?: RecipeDraft[];
  approvedDocuments?: Record<string, boolean>;
  planLocks?: PlanLock[];
  planDirty?: boolean;
  planBasis?: string;
  optimizationOptions?: OptimizationOptions;
  leftovers?: Leftover[];
};
export const meals: Meal[] = ["Desayuno", "Comida", "Cena", "Tentempié"];
export const emptyProfile = (name: string): Profile => ({
  name,
  age: 0,
  height: 0,
  weight: 0,
  sex: "",
  activity: 0,
  medicationRisk: "no",
  otherSafety: "no",
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  restrictions: "",
});
export const initial: State = {
  profiles: [emptyProfile("Persona 1"), emptyProfile("Persona 2")],
  products: [],
  recipes: [],
  plan: [],
  shopping: [],
  confirmed: false,
  drafts: [],
  approvedDocuments: {},
};
