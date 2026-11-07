"use client";
import { Users, CircleAlert } from "lucide-react";
import {
  estimateProfile,
  macroCheck,
  recommendGoals,
  recommendationBasis,
  otherSafetyStatus,
} from "../lib/profile-estimates.mjs";
import { nutrients } from "../lib/nutrients.mjs";
import type { Profile, NutritionGoals } from "../lib/types";
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function NumberField({
  label,
  value,
  onChange,
  step = "1",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        min="0"
        step={step}
        value={value || ""}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </Field>
  );
}
export default function Profiles({
  profiles,
  update,
}: {
  profiles: Profile[];
  update: (index: number, patch: Partial<Profile>) => void;
}) {
  return (
    <>
      <div className="eyebrow muted">01 / VOSOTROS</div>
      <h1 className="page-title">
        Vuestros <em>perfiles.</em>
      </h1>
      <p className="intro">
        Dos perfiles independientes para adaptar los objetivos y las raciones.
      </p>
      <div className="warning">
        <CircleAlert size={19} />
        <span>
          La estimación no es una prescripción. Con hígado graso, resistencia a
          la insulina u otras condiciones, revisad los objetivos con un
          profesional. La pérdida rápida de peso puede empeorar la enfermedad
          hepática.
        </span>
      </div>
      <div className="profile-grid">
        {profiles.map((p, i) => {
          const estimate = estimateProfile(p);
          const macros = macroCheck(p);
          const recommendation = recommendGoals(p);
          return (
            <section className="card" key={i}>
              <div className="card-head">
                <div>
                  <small>PERFIL 0{i + 1}</small>
                  <h2>{p.name}</h2>
                </div>
                <span className="round-icon">
                  <Users size={20} />
                </span>
              </div>
              <div className="form-grid">
                <Field label="Nombre">
                  <input
                    value={p.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                  />
                </Field>
                <NumberField
                  label="Edad (años)"
                  value={p.age}
                  onChange={(v) => update(i, { age: v })}
                />
                <NumberField
                  label="Altura (cm)"
                  value={p.height}
                  onChange={(v) => update(i, { height: v })}
                />
                <NumberField
                  label="Peso (kg)"
                  value={p.weight}
                  step="0.1"
                  onChange={(v) => update(i, { weight: v })}
                />
                <Field label="Fórmula de referencia">
                  <select
                    value={p.sex}
                    onChange={(e) =>
                      update(i, { sex: e.target.value as Profile["sex"] })
                    }
                  >
                    <option value="">Selecciona</option>
                    <option value="female">Femenina</option>
                    <option value="male">Masculina</option>
                  </select>
                </Field>
                <Field label="Actividad habitual">
                  <select
                    value={p.activity}
                    onChange={(e) =>
                      update(i, { activity: Number(e.target.value) })
                    }
                  >
                    <option value="0">Selecciona</option>
                    <option value="1.2">Sedentaria</option>
                    <option value="1.375">Ligera</option>
                    <option value="1.55">Moderada</option>
                    <option value="1.725">Alta</option>
                  </select>
                </Field>
              </div>
              <p className="help">
                La fórmula usa una de dos variantes y estima el gasto en reposo
                a partir de edad, peso y altura. La actividad es una
                aproximación; las necesidades reales pueden ser diferentes.
              </p>
              <div className="estimate-box">
                <strong>Estimación orientativa</strong>
                {estimate.errors.length ? (
                  <p>
                    Completa los datos para verla: {estimate.errors.join(" ")}
                  </p>
                ) : (
                  <>
                    <p>
                      IMC: <strong>{estimate.bmi?.toFixed(1)} kg/m²</strong> ·
                      Gasto en reposo:{" "}
                      <strong>{estimate.resting} kcal/día</strong>
                    </p>
                    <p>
                      Mantenimiento aproximado:{" "}
                      <strong>{estimate.maintenance} kcal/día</strong>
                    </p>
                    <p>
                      El IMC no describe por sí solo la composición corporal ni
                      determina un objetivo de pérdida de peso.
                    </p>
                  </>
                )}
              </div>
              <div className="subheading">PROPUESTA PARA BAJAR DE PESO</div>
              <Field label="¿Usas insulina, sulfonilureas o meglitinidas?">
                <select
                  value={p.medicationRisk || "no"}
                  onChange={(e) =>
                    update(i, {
                      medicationRisk: e.target
                        .value as Profile["medicationRisk"],
                    })
                  }
                >
                  <option value="no">No</option>
                  <option value="yes">Sí</option>
                  <option value="unknown">No lo sé</option>
                </select>
              </Field>
              <Field label="¿Tienes enfermedad renal, cirrosis, un trastorno alimentario o una enfermedad grave?">
                <select
                  value={otherSafetyStatus(p)}
                  onChange={(e) =>
                    update(i, {
                      otherSafety: e.target.value as Profile["otherSafety"],
                    })
                  }
                >
                  <option value="unknown">No lo sé / sin confirmar</option>
                  <option value="no">No</option>
                  <option value="yes">Sí</option>
                </select>
              </Field>
              <p className="help">
                Si respondes sí o no lo sabes, pide objetivos individualizados.
                Esta pregunta no detecta todas las situaciones que necesitan
                atención profesional.
              </p>
              {recommendation.proposal ? (
                <div className="estimate-box">
                  <strong>Propuesta orientativa, pendiente de confirmar</strong>
                  <p>
                    {recommendation.proposal.calories} kcal/día · déficit
                    estimado: {recommendation.proposal.deficit} kcal/día (10 %
                    del mantenimiento estimado).
                  </p>
                  <p>
                    Proteínas {recommendation.proposal.protein} g ·
                    carbohidratos {recommendation.proposal.carbs} g · grasas{" "}
                    {recommendation.proposal.fat} g al día.
                  </p>
                  <p>
                    El 10 % es una regla inicial de la app, no una recomendación
                    clínica validada para ti. El reparto 20 % / 50 % / 30 % es
                    un punto de partida general, no el reparto óptimo para
                    resistencia a la insulina ni menopausia. Revisadlo con un
                    profesional.
                  </p>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      const x = recommendation.proposal;
                      if (x)
                        update(i, {
                          calories: x.calories,
                          protein: x.protein,
                          carbs: x.carbs,
                          fat: x.fat,
                          objectiveSource: "suggested",
                          recommendationBasis: recommendationBasis(p),
                        });
                    }}
                  >
                    Confirmar y aplicar propuesta
                  </button>
                </div>
              ) : (
                <p className="help">{recommendation.reason}</p>
              )}
              {p.objectiveSource === "suggested" &&
                p.recommendationBasis !== recommendationBasis(p) && (
                  <div className="warning">
                    El perfil ha cambiado desde que confirmaste la propuesta.
                    Vuelve a confirmarla o introduce objetivos personalizados
                    antes de generar un menú.
                  </div>
                )}
              <div className="subheading">OBJETIVOS DIARIOS PARA EL MENÚ</div>
              <p className="help">
                Confirma la propuesta o introduce y ajusta los objetivos. Los
                cálculos nunca sustituyen los valores guardados sin tu acción.
              </p>
              <div className="form-grid">
                <NumberField
                  label="Energía (kcal/día)"
                  value={p.calories}
                  onChange={(v) =>
                    update(i, {
                      calories: v,
                      objectiveSource: "personal",
                      recommendationBasis: undefined,
                    })
                  }
                />
                <NumberField
                  label="Proteínas (g/día)"
                  value={p.protein}
                  onChange={(v) =>
                    update(i, {
                      protein: v,
                      objectiveSource: "personal",
                      recommendationBasis: undefined,
                    })
                  }
                />
                <NumberField
                  label="Carbohidratos (g/día)"
                  value={p.carbs}
                  onChange={(v) =>
                    update(i, {
                      carbs: v,
                      objectiveSource: "personal",
                      recommendationBasis: undefined,
                    })
                  }
                />
                <NumberField
                  label="Grasas (g/día)"
                  value={p.fat}
                  onChange={(v) =>
                    update(i, {
                      fat: v,
                      objectiveSource: "personal",
                      recommendationBasis: undefined,
                    })
                  }
                />
              </div>
              <Field label="Origen de los objetivos">
                <select
                  value={p.objectiveSource || ""}
                  onChange={(e) =>
                    update(i, {
                      objectiveSource: e.target
                        .value as Profile["objectiveSource"],
                    })
                  }
                >
                  <option value="">Sin indicar</option>
                  <option value="professional">
                    Indicados por un profesional
                  </option>
                  <option value="personal">Introducidos por mí</option>
                  <option value="suggested">
                    Propuesta de la app confirmada
                  </option>
                </select>
              </Field>
              {macros.complete && (
                <p
                  className={
                    Math.abs(macros.difference || 0) > 0.1 ? "warning" : "help"
                  }
                >
                  Los macronutrientes suman aproximadamente{" "}
                  {Math.round(macros.energy || 0)} kcal/día (4 kcal/g para
                  proteínas y carbohidratos; 9 kcal/g para grasas).
                  {Math.abs(macros.difference || 0) > 0.1
                    ? " La diferencia con el objetivo energético supera el 10 %; revisa ambos objetivos."
                    : ""}
                </p>
              )}
              <div className="subheading">VITAMINA D · REFERENCIA EDITABLE</div>
              <p className="help">
                La EFSA establece para adultos sanos una ingesta adecuada de 15
                µg/día suponiendo síntesis cutánea mínima. Es una referencia
                poblacional, no una dosis de suplemento ni un objetivo
                específico para la menopausia.{" "}
                <a
                  href="https://www.efsa.europa.eu/en/press/news/161028"
                  target="_blank"
                  rel="noreferrer"
                >
                  Consultar EFSA ↗
                </a>
              </p>
              <Field label="Referencia de vitamina D (µg/día; opcional)">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={p.vitaminDGoalMcg ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "") {
                      update(i, { vitaminDGoalMcg: undefined });
                      return;
                    }
                    const n = Number(value);
                    if (Number.isFinite(n) && n >= 0)
                      update(i, { vitaminDGoalMcg: n });
                  }}
                />
              </Field>
              <button
                type="button"
                className="secondary"
                onClick={() => update(i, { vitaminDGoalMcg: 15 })}
              >
                Usar referencia EFSA de 15 µg
              </button>
              <p className="help">
                El resumen solo refleja los alimentos planificados con datos
                conocidos. No incluye exposición solar, otros alimentos ni
                suplementos; no diagnostica déficits. Consulta con un
                profesional si necesitas un objetivo personal o un suplemento.
              </p>
              <div className="subheading">LÍMITES NUTRICIONALES OPCIONALES</div>
              <p className="help">
                Son límites diarios estrictos, no recomendaciones automáticas.
                Acordadlos con un profesional y activad solo aquellos para los
                que tengáis datos fiables en todas las recetas que queráis usar.
                Una referencia de vitamina D no activa por sí sola un mínimo.
              </p>
              <div className="form-grid">
                {nutrients.map((n) => (
                  <Field
                    label={`${n.direction === "min" ? "Mínimo" : "Máximo"} ${n.label.toLowerCase()} (${n.unit}/día)`}
                    key={n.goal}
                  >
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={
                        p.nutritionGoals?.[n.goal as keyof NutritionGoals] ?? ""
                      }
                      onChange={(e) => {
                        const value = e.target.value;
                        if (
                          value !== "" &&
                          (!Number.isFinite(Number(value)) || Number(value) < 0)
                        )
                          return;
                        update(i, {
                          nutritionGoals: {
                            ...p.nutritionGoals,
                            [n.goal]: value === "" ? undefined : Number(value),
                          },
                        });
                      }}
                    />
                  </Field>
                ))}
              </div>
              <Field label="Alergias y restricciones">
                <input
                  placeholder="Ej. frutos secos"
                  value={p.restrictions}
                  onChange={(e) => update(i, { restrictions: e.target.value })}
                />
              </Field>
              <p className="help">
                La comprobación automática de alergias aún no está disponible:
                si introduces restricciones, la generación del menú se
                bloqueará.
              </p>
            </section>
          );
        })}
      </div>
    </>
  );
}
