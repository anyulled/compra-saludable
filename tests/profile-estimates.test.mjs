import test from "node:test";
import assert from "node:assert/strict";
import {
  estimateProfile,
  macroCheck,
  recommendGoals,
  recommendationBasis,
} from "../lib/profile-estimates.mjs";
const profile = () => ({
  age: 32,
  height: 180,
  weight: 80,
  sex: "male",
  activity: 1.2,
  calories: 2000,
  protein: 100,
  carbs: 200,
  fat: 80,
});
test("calcula IMC, gasto en reposo y mantenimiento sin alterar el objetivo", () => {
  const p = profile();
  const e = estimateProfile(p);
  assert.ok(Math.abs(e.bmi - 24.691) < 0.01);
  assert.equal(e.resting, 1770);
  assert.equal(e.maintenance, 2124);
  assert.equal(p.calories, 2000);
});
test("usa la variante femenina explicitamente", () => {
  const e = estimateProfile({ ...profile(), sex: "female" });
  assert.equal(e.resting, 1604);
  assert.equal(e.maintenance, 1925);
});
test("no estima con edad infantil o datos obligatorios ausentes", () => {
  for (const p of [{ age: 17 }, { sex: "" }, { height: 0 }, { activity: 0 }])
    assert.equal(estimateProfile({ ...profile(), ...p }).maintenance, null);
});
test("comprueba coherencia energética de macros sin modificar objetivos", () => {
  const p = profile();
  const m = macroCheck(p);
  assert.equal(m.energy, 1920);
  assert.equal(m.complete, true);
  assert.ok(Math.abs(m.difference + 0.04) < 1e-10);
  assert.equal(p.calories, 2000);
  assert.equal(macroCheck({ ...p, fat: 0 }).complete, false);
});

test("propone un déficit moderado y macros sin aplicar objetivos", () => {
  const p = { ...profile(), weight: 90, clinicalReview: "no" };
  const r = recommendGoals(p);
  assert.equal(r.proposal.maintenance, 2244);
  assert.equal(r.proposal.calories, 2020);
  assert.equal(r.proposal.deficit, 224);
  assert.deepEqual(
    [r.proposal.protein, r.proposal.carbs, r.proposal.fat],
    [101, 253, 67],
  );
  assert.equal(p.calories, 2000);
});
test("no propone déficit con datos incompletos, IMC bajo o situaciones clínicas no descartadas", () => {
  const p = { ...profile(), weight: 90 };
  for (const patch of [
    { clinicalReview: "yes" },
    { clinicalReview: "unknown" },
    { clinicalReview: undefined },
    { weight: 70, clinicalReview: "no" },
    { age: 16, clinicalReview: "no" },
  ])
    assert.equal(recommendGoals({ ...p, ...patch }).proposal, null);
});
test("no propone un objetivo inferior a 1200 kcal", () => {
  const p = {
    ...profile(),
    age: 100,
    height: 140,
    weight: 50,
    sex: "female",
    clinicalReview: "no",
  };
  assert.equal(recommendGoals(p).proposal, null);
});
test("la huella de la propuesta cambia con datos y seguridad", () => {
  const p = { ...profile(), clinicalReview: "no" };
  assert.notEqual(
    recommendationBasis(p),
    recommendationBasis({ ...p, weight: 81 }),
  );
  assert.notEqual(
    recommendationBasis(p),
    recommendationBasis({ ...p, clinicalReview: "yes" }),
  );
});

test("respeta la ausencia de medicación conocida sin asumir otras condiciones", () => {
  const p = { ...profile(), weight: 90 };
  delete p.clinicalReview;
  assert.equal(recommendGoals(p).proposal, null);
  assert.ok(recommendGoals({ ...p, otherSafety: "no" }).proposal);
  assert.equal(
    recommendGoals({ ...p, otherSafety: "no", medicationRisk: "yes" }).proposal,
    null,
  );
});

test("una respuesta antigua afirmativa a una pregunta combinada no se atribuye a otra enfermedad", () => {
  const p = { ...profile(), weight: 90, clinicalReview: "yes" };
  assert.equal(recommendGoals(p).proposal, null);
  assert.ok(recommendGoals({ ...p, otherSafety: "no" }).proposal);
});
