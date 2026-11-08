import test, { afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
mock.module("next/image", {
  defaultExport: ({ src, alt }) => React.createElement("img", { src, alt }),
});
let uploadedPaths = [];
let downloadedPaths = [];
mock.module("../lib/pdf-import.ts", {
  namedExports: {
    importPdf: async (file) => [{ id: "mock-page", documentId: "11111111-1111-4111-8111-111111111111", filename: file.name, page: 1, status: "pending", method: "text", text: "ENSALADA\n100 g tomate\n1. Mezclar." }],
  },
});
mock.module("../lib/supabase/browser.ts", {
  namedExports: {
    getSupabaseBrowserClient: () => ({ storage: { from: () => ({
      upload: async (path) => { uploadedPaths.push(path); return { error: null }; },
      remove: async () => ({ error: null }),
      download: async (path) => { downloadedPaths.push(path); return { data: new Blob(["%PDF-1.4"]), error: null }; },
    }) } }),
  },
});

const { render, screen, within, fireEvent, cleanup, waitFor } = await import("@testing-library/react");
const { default: NutritionExtras } = await import("../components/NutritionExtras.tsx");
const { default: OptimizationSettings } = await import("../components/OptimizationSettings.tsx");
const { default: Library } = await import("../components/Library.tsx");
const { default: MenuReview } = await import("../components/MenuReview.tsx");
const { default: Profiles } = await import("../components/Profiles.tsx");
const { default: WellnessHome } = await import("../components/WellnessHome.tsx");
const { default: Dashboard } = await import("../app/dashboard.tsx");

afterEach(cleanup);

test("los nutrientes distinguen entre cero revisado y dato desconocido, y clasifican grupos", () => {
  const patches = [];
  const recipe = { fiberG: 4, foodGroups: ["pescado"], nutritionExtrasSource: "Etiqueta" };
  render(React.createElement(NutritionExtras, { recipe, update: (patch) => patches.push(patch) }));
  const fiber = screen.getByLabelText("Fibra (g)");
  fireEvent.change(fiber, { target: { value: "0" } });
  fireEvent.change(fiber, { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Fuente de los nutrientes"), { target: { value: "Recetario" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Legumbres" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Pescado" }));
  assert.deepEqual(patches, [
    { fiberG: 0 }, { fiberG: undefined }, { nutritionExtrasSource: "Recetario" },
    { foodGroups: ["pescado", "legumbres"] }, { foodGroups: [] },
  ]);
});

test("preferencias del plan rechazan límites inválidos y permiten desactivarlos", () => {
  const patches = [];
  const options = { startDate: "2026-11-08", maxRecipeRepetitions: 4, categoryMinimums: { pescado: 2 } };
  render(React.createElement(OptimizationSettings, { options, update: (patch) => patches.push(patch) }));
  const max = screen.getByLabelText("Máximo de apariciones de una receta en 14 días");
  fireEvent.change(max, { target: { value: "15" } });
  assert.equal(patches.length, 0);
  fireEvent.change(max, { target: { value: "6" } });
  fireEvent.change(max, { target: { value: "" } });
  const fish = screen.getByLabelText("Pescado · apariciones/semana");
  fireEvent.change(fish, { target: { value: "29" } });
  fireEvent.change(fish, { target: { value: "3" } });
  fireEvent.change(fish, { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Inicio del plan"), { target: { value: "" } });
  assert.deepEqual(patches, [
    { maxRecipeRepetitions: 6 }, { maxRecipeRepetitions: undefined },
    { categoryMinimums: { pescado: 3 } }, { categoryMinimums: {} }, { startDate: undefined },
  ]);
});

test("la biblioteca filtra recetas y permite abrir páginas o aprobar un documento completo", () => {
  const opened = [], approved = [];
  const page = { id: "page-1", documentId: "doc-1", filename: "Cocina.pdf", page: 1, text: "ENSALADA DE LENTEJAS\n100 g de lentejas", status: "pending" };
  const recipe = { id: "r1", name: "Salmón al horno", meal: "Cena", calories: 300, approved: true };
  const data = { drafts: [page], approvedDocuments: {}, recipes: [recipe] };
  const view = render(React.createElement(Library, { data, review: (d) => opened.push(d), approveDocument: (id) => approved.push(id) }));
  fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
  assert.equal(opened[0].id, "page-1");
  fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "approved" } });
  assert.ok(screen.getByText("Salmón al horno"));
  assert.equal(screen.queryByRole("button", { name: "Abrir" }), null);
  fireEvent.change(screen.getByLabelText("Buscar por nombre o archivo"), { target: { value: "inexistente" } });
  assert.ok(screen.getByText("No hay resultados para este filtro."));
  view.rerender(React.createElement(Library, { data: { ...data, drafts: [{ ...page, status: "reviewed" }] }, review: () => {}, approveDocument: (id) => approved.push(id) }));
  fireEvent.click(screen.getByRole("button", { name: "Aprobar archivo" }));
  assert.deepEqual(approved, ["doc-1"]);
});

test("el menú muestra el resumen individual y envía la selección fijada", () => {
  const meals = ["Desayuno", "Comida", "Cena", "Tentempié"];
  const recipes = meals.map((meal, i) => ({ id: `r${i}`, name: `Plato ${i}`, meal, approved: true, calories: 300, protein: 20, carbs: 30, fat: 10, sodiumMg: 100, vitaminDMcg: 1 }));
  recipes.push({ ...recipes[1], id: "alternative", name: "Alternativa" });
  const data = { recipes, profiles: [{ name: "A", calories: 1800, protein: 90, carbs: 180, fat: 60 }, { name: "B", calories: 1500, protein: 75, carbs: 150, fat: 50 }], plan: meals.map((meal, i) => ({ day: 0, meal, recipeId: `r${i}`, portions: [1, 0.5] })), planLocks: [] };
  const calls = [];
  render(React.createElement(MenuReview, { data, busy: false, stale: true, dirty: false, updateLock: (...args) => calls.push(args) }));
  assert.ok(screen.getByText(/1200 \/ 1800 kcal/));
  assert.ok(screen.getByText(/Los datos usados para este menú han cambiado/));
  fireEvent.change(screen.getByLabelText("Receta para día 1, Comida"), { target: { value: "alternative" } });
  const lunch = screen.getByLabelText("Receta para día 1, Comida").closest(".meal");
  fireEvent.click(within(lunch).getByRole("checkbox", { name: "Fijar receta" }));
  assert.deepEqual(calls, [[0, "Comida", "alternative"], [0, "Comida", "r1"]]);
});

test("los perfiles omiten las preguntas respondidas y aplican la propuesta con ambas respuestas negativas", () => {
  const p = { name: "Persona 1", age: 43, height: 184, weight: 102, sex: "male", activity: 1.2, calories: 0, protein: 0, carbs: 0, fat: 0, restrictions: "" };
  const calls = [];
  render(React.createElement(Profiles, { profiles: [p, { ...p, name: "Persona 2" }], update: (i, patch) => calls.push([i, patch]) }));
  assert.equal(screen.queryByText(/¿Usas insulina/), null);
  assert.equal(screen.queryByText(/¿Tienes enfermedad renal/), null);
  assert.equal(screen.queryByText(/La estimación no es una prescripción/), null);
  const apply = screen.getAllByRole("button", { name: "Confirmar y aplicar propuesta" });
  fireEvent.click(apply[0]);
  assert.equal(calls[0][0], 0);
  assert.equal(calls[0][1].medicationRisk, "no");
  assert.equal(calls[0][1].otherSafety, "no");
  assert.ok(calls[0][1].calories > 0);
  fireEvent.change(screen.getAllByLabelText("Peso (kg)")[0], { target: { value: "98" } });
  fireEvent.change(screen.getAllByLabelText("Energía (kcal/día)")[0], { target: { value: "1900" } });
  fireEvent.change(screen.getAllByLabelText("Mínimo fibra (g/día)")[0], { target: { value: "25" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Usar referencia EFSA de 15 µg" })[0]);
  assert.deepEqual(calls.slice(1), [
    [0, { weight: 98 }],
    [0, { calories: 1900, objectiveSource: "personal", recommendationBasis: undefined }],
    [0, { nutritionGoals: { fiberMinG: 25 } }],
    [0, { vitaminDGoalMcg: 15 }],
  ]);
});

test("inicio muestra la imagen y permite navegar a perfiles, menú y recetas", () => {
  const destinations = [];
  render(React.createElement(WellnessHome, { navigate: (destination) => destinations.push(destination) }));
  assert.ok(screen.getByAltText("Una mesa para dos con verduras, legumbres y pan integral"));
  assert.equal(screen.queryByText(/Esta información es general/), null);
  fireEvent.click(screen.getByRole("button", { name: /Preparar mis perfiles/ }));
  fireEvent.click(screen.getByRole("button", { name: /Explorar el menú/ }));
  fireEvent.click(screen.getByRole("button", { name: /Preparar recetas/ }));
  assert.deepEqual(destinations, ["Perfiles", "Menú", "Recetas"]);
});

test("dashboard carga el hogar y guarda un producto añadido manualmente", async () => {
  const previousFetch = globalThis.fetch;
  const profile = { name: "Persona", age: 40, height: 170, weight: 80, sex: "female", activity: 1.2, calories: 1800, protein: 90, carbs: 180, fat: 60, restrictions: "", medicationRisk: "no", otherSafety: "no" };
  const meals = ["Desayuno", "Comida", "Cena", "Tentempié"];
  const recipes = meals.map((meal, i) => ({ id: `r${i}`, name: `Receta ${i}`, meal, approved: true, calories: 300, protein: 20, carbs: 30, fat: 10, sodiumMg: 100, ingredients: [], rating: 3, notes: "" }));
  let stored = { profiles: [profile, { ...profile, name: "Persona 2" }], recipes, products: [], plan: [], shopping: [], confirmed: false, drafts: [], approvedDocuments: {} };
  let revision = 1;
  globalThis.fetch = async (url, init = {}) => {
    if (url === "/api/workspace" && init.method === "PUT") {
      const payload = JSON.parse(init.body);
      assert.equal(payload.expectedRevision, revision);
      stored = payload.state;
      revision++;
      return new Response(JSON.stringify({ ok: true, revision }), { status: 200 });
    }
    if (url === "/api/workspace") return new Response(JSON.stringify({ state: stored, revision }), { status: 200 });
    if (url === "/api/optimize") return new Response(JSON.stringify({ plan: meals.map((meal, i) => ({ day: 0, meal, recipeId: `r${i}`, portions: [1, 1] })), shopping: [{ id: "local", name: "Producto local", packages: 1, size: 500, unit: "g", price: 2.5, checked: false }], leftovers: [] }), { status: 200 });
    throw Error(`Petición inesperada: ${url}`);
  };
  try {
    render(React.createElement(Dashboard, { email: "user@example.com", householdId: "00000000-0000-4000-8000-000000000001" }));
    await screen.findByText(/Una forma más/);
    fireEvent.click(screen.getAllByRole("button", { name: "Productos" })[0]);
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Producto local" } });
    fireEvent.change(screen.getByLabelText("Tamaño del envase"), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText("Precio por envase (€)"), { target: { value: "2.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir producto" }));
    assert.ok(screen.getByText("Producto local"));
    await waitFor(() => assert.equal(stored.products.length, 1), { timeout: 3000 });
    assert.equal(stored.products[0].size, 500);
    assert.equal(stored.products[0].price, 2.5);
    fireEvent.click(screen.getAllByRole("button", { name: "Perfiles" })[0]);
    assert.ok(screen.getByText(/Dos perfiles independientes/));
    fireEvent.click(screen.getAllByRole("button", { name: "Recetas" })[0]);
    const form = screen.getByRole("heading", { name: "Nueva receta" }).closest("section");
    fireEvent.change(within(form).getByLabelText("Nombre"), { target: { value: "Plato casero" } });
    fireEvent.change(within(form).getByLabelText("Energía por ración (kcal)"), { target: { value: "300" } });
    fireEvent.change(within(form).getByLabelText("Proteínas por ración (g)"), { target: { value: "20" } });
    fireEvent.change(within(form).getByLabelText("Carbohidratos por ración (g)"), { target: { value: "30" } });
    fireEvent.change(within(form).getByLabelText("Grasas por ración (g)"), { target: { value: "10" } });
    fireEvent.change(within(form).getByLabelText("Sodio por ración (mg)"), { target: { value: "100" } });
    fireEvent.change(within(form).getByLabelText("Cantidad de Producto local"), { target: { value: "100" } });
    fireEvent.click(within(form).getByRole("button", { name: /He revisado y quiero guardar/ }));
    await waitFor(() => assert.equal(stored.recipes.length, 5), { timeout: 3000 });
    assert.equal(stored.recipes[4].ingredients[0].amount, 100);
    const addedRecipe = screen.getByText("Plato casero").closest(".list-row");
    fireEvent.change(within(addedRecipe).getByLabelText("Sodio por ración (mg; vacío si se desconoce)"), { target: { value: "90" } });
    fireEvent.change(within(addedRecipe).getByLabelText("Vitamina D por ración (µg; vacío si se desconoce)"), { target: { value: "1.5" } });
    fireEvent.change(within(addedRecipe).getByLabelText("Fuente de vitamina D"), { target: { value: "Etiqueta" } });
    fireEvent.change(within(addedRecipe).getByLabelText("Preferencia"), { target: { value: "5" } });
    await waitFor(() => assert.equal(stored.recipes[4].rating, 5), { timeout: 3000 });
    assert.equal(stored.recipes[4].sodiumMg, 90);
    assert.equal(stored.recipes[4].vitaminDMcg, 1.5);
    assert.equal(stored.recipes[4].vitaminDSource, "Etiqueta");
    fireEvent.click(screen.getAllByRole("button", { name: "Biblioteca" })[0]);
    assert.ok(screen.getByText("Plato casero"));
    fireEvent.click(screen.getAllByRole("button", { name: "Compra" })[0]);
    assert.ok(screen.getByText("La lista llegará después."));
    fireEvent.click(screen.getAllByRole("button", { name: "Menú" })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Generar menú/ }));
    const confirm = await screen.findByRole("button", { name: /Confirmar y ver la compra/ });
    assert.equal(confirm.disabled, false);
    fireEvent.click(confirm);
    const item = screen.getByText("Producto local").closest("label");
    fireEvent.click(within(item).getByRole("checkbox"));
    await waitFor(() => assert.equal(stored.shopping[0]?.checked, true), { timeout: 3000 });
    assert.equal(stored.confirmed, true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("revisar una página importada permite usar sugerencias y aprobar el recetario", async () => {
  const previousFetch = globalThis.fetch;
  const profile = { name: "Persona", age: 40, height: 170, weight: 80, sex: "female", activity: 1.2, calories: 1800, protein: 90, carbs: 180, fat: 60, restrictions: "", medicationRisk: "no", otherSafety: "no" };
  const page = { id: "page-1", documentId: "doc-1", filename: "Cocina.pdf", page: 1, method: "text", status: "pending", text: "ENSALADA DE LENTEJAS\nINGREDIENTES\n150 g lentejas cocidas\n1. Mezcla y sirve.\nINFORMACIÓN NUTRICIONAL\nCalorías: 300 kcal\nProteínas: 20 g\nCarbohidratos: 30 g\nGrasas: 10 g" };
  let stored = { profiles: [profile, { ...profile, name: "Persona 2" }], recipes: [{ id: "r1", sourceDraftId: "page-1", name: "Lentejas", meal: "Comida", calories: 300, protein: 20, carbs: 30, fat: 10, sodiumMg: 100, ingredients: [], rating: 3, notes: "", approved: true }], products: [], plan: [], shopping: [], confirmed: false, drafts: [page], approvedDocuments: {} };
  let revision = 1;
  globalThis.fetch = async (url, init = {}) => {
    if (url === "/api/workspace" && init.method === "PUT") {
      const payload = JSON.parse(init.body);
      assert.equal(payload.expectedRevision, revision);
      stored = payload.state;
      return new Response(JSON.stringify({ ok: true, revision: ++revision }), { status: 200 });
    }
    if (url === "/api/workspace") return new Response(JSON.stringify({ state: stored, revision }), { status: 200 });
    throw Error(`Petición inesperada: ${url}`);
  };
  try {
    render(React.createElement(Dashboard, { email: "user@example.com", householdId: "00000000-0000-4000-8000-000000000001" }));
    await screen.findByText(/Una forma más/);
    fireEvent.click(screen.getAllByRole("button", { name: "Recetas" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Revisar" }));
    assert.ok(screen.getByRole("heading", { name: "Datos detectados" }));
    assert.ok(screen.getByText(/Este borrador antiguo no tiene un original privado/));
    fireEvent.click(screen.getByRole("button", { name: "Usar nombre" }));
    const form = screen.getByRole("heading", { name: "Nueva receta" }).closest("section");
    assert.equal(within(form).getByLabelText("Nombre").value, "ENSALADA DE LENTEJAS");
    fireEvent.click(screen.getByRole("button", { name: "Completar revisión" }));
    await waitFor(() => assert.equal(stored.drafts[0].status, "reviewed"), { timeout: 3000 });
    fireEvent.click(screen.getAllByRole("button", { name: "Biblioteca" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Aprobar archivo" }));
    await waitFor(() => assert.equal(stored.approvedDocuments["doc-1"], true), { timeout: 3000 });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("el dashboard comunica los errores al añadir un producto o generar el menú", async () => {
  const previousFetch = globalThis.fetch;
  const p = { name: "A", age: 0, height: 0, weight: 0, sex: "", activity: 0, calories: 0, protein: 0, carbs: 0, fat: 0, restrictions: "", medicationRisk: "no", otherSafety: "no" };
  const state = { profiles: [p, { ...p, name: "B" }], recipes: [], products: [], plan: [], shopping: [], confirmed: false, drafts: [] };
  globalThis.fetch = async (url) => {
    if (url === "/api/workspace") return new Response(JSON.stringify({ state, revision: 1 }), { status: 200 });
    if (url === "/api/optimize") return new Response(JSON.stringify({ error: "Completa los objetivos para generar el menú." }), { status: 422 });
    throw Error(`Petición inesperada: ${url}`);
  };
  try {
    render(React.createElement(Dashboard, { email: "user@example.com", householdId: "00000000-0000-4000-8000-000000000001" }));
    await screen.findByText(/Una forma más/);
    fireEvent.click(screen.getAllByRole("button", { name: "Productos" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Añadir producto" }));
    assert.ok(await screen.findByText("Introduce nombre, tamaño del envase y un precio válido."));
    fireEvent.click(screen.getAllByRole("button", { name: "Menú" })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Generar menú/ }));
    assert.ok(await screen.findByText("Completa los objetivos para generar el menú."));
    assert.ok(screen.getByText("Vuestra mesa está por preparar."));
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("un espacio sin inicializar no se sobrescribe automáticamente", async () => {
  const previousFetch = globalThis.fetch;
  const methods = [];
  globalThis.fetch = async (url, init = {}) => {
    methods.push(init.method || "GET");
    if (url === "/api/workspace") return new Response(JSON.stringify({ state: null, revision: 0 }), { status: 200 });
    throw Error(`Petición inesperada: ${url}`);
  };
  try {
    render(React.createElement(Dashboard, { email: "user@example.com", householdId: "00000000-0000-4000-8000-000000000001" }));
    assert.ok(await screen.findByText(/pendiente de importación/i));
    assert.deepEqual(methods, ["GET"]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("importar un PDF guarda el original privado y permite revisar sus páginas", async () => {
  const previousFetch = globalThis.fetch;
  const previousCreate = URL.createObjectURL, previousRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => "blob:pdf-test";
  URL.revokeObjectURL = () => {};
  uploadedPaths = [];
  const p = { name: "A", age: 40, height: 170, weight: 80, sex: "female", activity: 1.2, calories: 1800, protein: 90, carbs: 180, fat: 60, restrictions: "", medicationRisk: "no", otherSafety: "no" };
  let stored = { profiles: [p, { ...p, name: "B" }], recipes: [], products: [], plan: [], shopping: [], confirmed: false, drafts: [], approvedDocuments: {} };
  let revision = 1;
  globalThis.fetch = async (url, init = {}) => {
    if (url === "/api/workspace" && init.method === "PUT") {
      const payload = JSON.parse(init.body);
      assert.equal(payload.expectedRevision, revision);
      stored = payload.state;
      return new Response(JSON.stringify({ ok: true, revision: ++revision }), { status: 200 });
    }
    if (url === "/api/workspace") return new Response(JSON.stringify({ state: stored, revision }), { status: 200 });
    throw Error(`Petición inesperada: ${url}`);
  };
  try {
    const householdId = "00000000-0000-4000-8000-000000000001";
    render(React.createElement(Dashboard, { email: "user@example.com", householdId }));
    await screen.findByText(/Una forma más/);
    fireEvent.click(screen.getAllByRole("button", { name: "Recetas" })[0]);
    const file = new dom.window.File(["%PDF-1.4"], "Cocina.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Seleccionar PDF"), { target: { files: [file] } });
    assert.ok(await screen.findByText(/Se han creado 1 páginas para revisión/));
    assert.equal(stored.drafts.length, 1);
    assert.equal(stored.drafts[0].documentPath, `${householdId}/11111111-1111-4111-8111-111111111111.pdf`);
    assert.deepEqual(uploadedPaths, [stored.drafts[0].documentPath]);
    fireEvent.click(screen.getByRole("button", { name: "Revisar" }));
    assert.ok(screen.getByTitle("PDF original, página 1"));
    fireEvent.click(screen.getByRole("button", { name: "No es receta" }));
    await waitFor(() => assert.equal(stored.drafts[0].status, "discarded"), { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "Reabrir" }));
    await waitFor(() => assert.equal(stored.drafts[0].status, "pending"), { timeout: 3000 });
  } finally {
    globalThis.fetch = previousFetch;
    URL.createObjectURL = previousCreate;
    URL.revokeObjectURL = previousRevoke;
  }
});

test("una página ya guardada abre su PDF privado tras recargar", async () => {
  const previousFetch = globalThis.fetch;
  const previousCreate = URL.createObjectURL, previousRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => "blob:pdf-reloaded";
  URL.revokeObjectURL = () => {};
  downloadedPaths = [];
  const householdId = "00000000-0000-4000-8000-000000000001";
  const documentId = "11111111-1111-4111-8111-111111111111";
  const p = { name: "A", age: 40, height: 170, weight: 80, sex: "female", activity: 1.2, calories: 1800, protein: 90, carbs: 180, fat: 60, restrictions: "", medicationRisk: "no", otherSafety: "no" };
  let stored = { profiles: [p, { ...p, name: "B" }], recipes: [], products: [], plan: [], shopping: [], confirmed: false, drafts: [{ id: "page-1", documentId, documentPath: `${householdId}/${documentId}.pdf`, filename: "Cocina.pdf", page: 1, status: "pending", method: "text", text: "ENSALADA\n100 g tomate\n1. Mezclar." }], approvedDocuments: {} };
  let revision = 1;
  globalThis.fetch = async (url, init = {}) => {
    if (url === "/api/workspace" && init.method === "PUT") {
      stored = JSON.parse(init.body).state;
      return new Response(JSON.stringify({ ok: true, revision: ++revision }), { status: 200 });
    }
    if (url === "/api/workspace") return new Response(JSON.stringify({ state: stored, revision }), { status: 200 });
    throw Error(`Petición inesperada: ${url}`);
  };
  try {
    render(React.createElement(Dashboard, { email: "user@example.com", householdId }));
    await screen.findByText(/Una forma más/);
    fireEvent.click(screen.getAllByRole("button", { name: "Recetas" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Revisar" }));
    assert.ok(await screen.findByTitle("PDF original, página 1"));
    assert.deepEqual(downloadedPaths, [`${householdId}/${documentId}.pdf`]);
  } finally {
    globalThis.fetch = previousFetch;
    URL.createObjectURL = previousCreate;
    URL.revokeObjectURL = previousRevoke;
  }
});
