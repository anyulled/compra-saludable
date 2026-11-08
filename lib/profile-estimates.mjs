const factors = [1.2, 1.375, 1.55, 1.725];
const hasAdultAge = (profile) => Number.isInteger(profile.age) && profile.age >= 18 && profile.age <= 120;
const hasValidHeight = (profile) => Number.isFinite(profile.height) && profile.height >= 80 && profile.height <= 250;
const hasValidWeight = (profile) => Number.isFinite(profile.weight) && profile.weight >= 20 && profile.weight <= 400;
const hasValidSex = (profile) => ["male", "female"].includes(profile.sex);
const hasValidActivity = (profile) => factors.includes(profile.activity);

function validationErrors(profile) {
  const errors = [];
  const checks = [
    [hasAdultAge(profile), "Introduce una edad adulta entre 18 y 120 años."],
    [hasValidHeight(profile), "Introduce una altura entre 80 y 250 cm."],
    [hasValidWeight(profile), "Introduce un peso entre 20 y 400 kg."],
    [hasValidSex(profile), "Selecciona la fórmula de referencia."],
    [hasValidActivity(profile), "Selecciona el nivel de actividad."],
  ];
  for (const [valid, message] of checks) if (!valid) errors.push(message);
  return errors;
}

function calculateBodyMassIndex(profile) {
  return profile.weight / (profile.height / 100) ** 2;
}

function calculateRestingEnergy(profile) {
  return 10 * profile.weight + 6.25 * profile.height - 5 * profile.age +
    (profile.sex === "male" ? 5 : -161);
}

/** Only general adult estimates; explicit goal setting stays separate. */
export function estimateProfile(profile) {
  const errors = validationErrors(profile);
  if (errors.length)
    return { errors, bmi: null, resting: null, maintenance: null };
  const bmi = calculateBodyMassIndex(profile);
  const resting = calculateRestingEnergy(profile);
  return {
    errors: [],
    bmi,
    resting: Math.round(resting),
    maintenance: Math.round(resting * profile.activity),
  };
}
export function macroCheck(profile) {
  const values = [
    profile.protein,
    profile.carbs,
    profile.fat,
    profile.calories,
  ];
  if (values.some((x) => !Number.isFinite(x) || x <= 0))
    return { complete: false, energy: null, difference: null };
  const energy = 4 * profile.protein + 4 * profile.carbs + 9 * profile.fat;
  return {
    complete: true,
    energy,
    difference: (energy - profile.calories) / profile.calories,
  };
}

export function otherSafetyStatus(p) {
  return p.otherSafety ?? (p.clinicalReview === "no" ? "no" : "unknown");
}
export function recommendationBasis(p) {
  return JSON.stringify([
    p.age,
    p.height,
    p.weight,
    p.sex,
    p.activity,
    p.medicationRisk ?? "no",
    otherSafetyStatus(p),
  ]);
}

/** Preliminary adult-only example; never substitute it for clinician-directed care. */
export function recommendGoals(profile) {
  const estimate = estimateProfile(profile);
  if (estimate.errors.length)
    return {
      proposal: null,
      reason: "Completa los datos necesarios para estimar el gasto.",
    };
  if (
    (profile.medicationRisk ?? "no") !== "no" ||
    otherSafetyStatus(profile) !== "no"
  )
    return {
      proposal: null,
      reason:
        "Confirma las preguntas de seguridad. Si respondes sí o no lo sabes, utiliza objetivos personalizados por un profesional.",
    };
  if (estimate.bmi < 25)
    return {
      proposal: null,
      reason:
        "Con un IMC inferior a 25 no se propone un déficit automático; consulta un objetivo personalizado.",
    };
  const calories = Math.round(estimate.maintenance * 0.9);
  if (calories < 1200)
    return {
      proposal: null,
      reason:
        "El resultado cae por debajo del límite de 1.200 kcal/día configurado para esta propuesta. Pide un objetivo individualizado.",
    };
  // A general, adjustable starting split, not an optimal distribution for diabetes.
  return {
    proposal: {
      calories,
      protein: Math.round((calories * 0.2) / 4),
      carbs: Math.round((calories * 0.5) / 4),
      fat: Math.round((calories * 0.3) / 9),
      maintenance: estimate.maintenance,
      deficit: estimate.maintenance - calories,
    },
    reason: null,
  };
}
