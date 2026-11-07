"use client";
import { nutrients } from "../lib/nutrients.mjs";
import { daySummary } from "../lib/plan-review.mjs";
import type { State, PlanLock, Meal } from "../lib/types";
type Props = {
  data: State;
  busy: boolean;
  stale: boolean;
  dirty: boolean;
  updateLock: (day: number, meal: Meal, recipeId: string | null) => void;
};
export default function MenuReview({
  data,
  busy,
  stale,
  dirty,
  updateLock,
}: Props) {
  return (
    <>
      <div className="plan-grid">
        {Array.from({ length: 14 }, (_, day) => (
          <section className="day" key={day}>
            <small>DÍA {String(day + 1).padStart(2, "0")}</small>
            {data.plan
              .filter((x) => x.day === day)
              .map((item) => {
                const lock = (data.planLocks || []).find(
                  (l) => l.day === day && l.meal === item.meal,
                );
                const candidates = data.recipes.filter(
                  (r) =>
                    r.approved &&
                    r.meal === item.meal &&
                    typeof r.sodiumMg === "number" &&
                    Number.isFinite(r.sodiumMg) &&
                    r.sodiumMg >= 0 &&
                    nutrients.every(
                      (n) =>
                        !data.profiles.some(
                          (p) =>
                            p.nutritionGoals?.[
                              n.goal as keyof NonNullable<
                                typeof p.nutritionGoals
                              >
                            ] != null,
                        ) ||
                        (typeof r[n.key as keyof typeof r] === "number" &&
                          Number.isFinite(r[n.key as keyof typeof r]) &&
                          Number(r[n.key as keyof typeof r]) >= 0),
                    ),
                );
                return (
                  <div className="meal" key={item.meal}>
                    <span>{item.meal}</span>
                    <label className="meal-choice">
                      <span className="sr-only">
                        Receta para día {day + 1}, {item.meal}
                      </span>
                      <select
                        disabled={busy}
                        value={lock?.recipeId || item.recipeId}
                        onChange={(e) =>
                          updateLock(day, item.meal, e.target.value)
                        }
                      >
                        {candidates.map((r) => (
                          <option value={r.id} key={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="lock-choice">
                      <input
                        type="checkbox"
                        disabled={busy}
                        checked={!!lock}
                        onChange={(e) =>
                          updateLock(
                            day,
                            item.meal,
                            e.target.checked ? item.recipeId : null,
                          )
                        }
                      />{" "}
                      Fijar receta
                    </label>
                    <p>
                      {data.profiles
                        .map((p, i) => `${p.name}: ${item.portions[i]} r.`)
                        .join(" · ")}
                    </p>
                    {lock && lock.recipeId !== item.recipeId && (
                      <p>Selección pendiente de recalcular.</p>
                    )}
                  </div>
                );
              })}
            <div className="daily-nutrition">
              <strong>Resumen diario</strong>
              {data.profiles.map((profile, i) => {
                const sum = daySummary(data.plan, data.recipes, day, i);
                return (
                  <div key={i}>
                    <span>{profile.name}</span>
                    {sum ? (
                      <p>
                        {Math.round(sum.calories)} / {profile.calories} kcal
                        <br />P {Math.round(sum.protein)} / {profile.protein} g
                        · C {Math.round(sum.carbs)} / {profile.carbs} g · G{" "}
                        {Math.round(sum.fat)} / {profile.fat} g<br />
                        Sodio:{" "}
                        {sum.sodiumMg === null
                          ? "sin datos completos"
                          : `${Math.round(sum.sodiumMg)} mg`}
                        <br />
                        Vitamina D:{" "}
                        {sum.vitaminD.knownMeals === 0
                          ? "sin datos"
                          : `${sum.vitaminD.knownMcg.toFixed(1)} µg${sum.vitaminD.knownMeals < sum.vitaminD.totalMeals ? ` (solo ${sum.vitaminD.knownMeals}/${sum.vitaminD.totalMeals} comidas)` : " de las recetas"}`}
                        {profile.vitaminDGoalMcg !== undefined
                          ? ` · referencia ${profile.vitaminDGoalMcg} µg/día`
                          : ""}
                        {nutrients
                          .filter(
                            (n) =>
                              profile.nutritionGoals?.[
                                n.goal as keyof NonNullable<
                                  typeof profile.nutritionGoals
                                >
                              ] != null,
                          )
                          .map((n) => {
                            const v = sum.extras[n.key];
                            return (
                              <span className="extra-line" key={n.key}>
                                <br />
                                {n.label}:{" "}
                                {v.known === v.total
                                  ? `${v.amount.toFixed(1)} ${n.unit}`
                                  : `datos de ${v.known}/${v.total} comidas`}{" "}
                                · {n.direction === "min" ? "mín." : "máx."}{" "}
                                {
                                  profile.nutritionGoals?.[
                                    n.goal as keyof NonNullable<
                                      typeof profile.nutritionGoals
                                    >
                                  ]
                                }{" "}
                                {n.unit}/día
                              </span>
                            );
                          })}
                      </p>
                    ) : (
                      <p>Datos incompletos; recalcula el menú.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {(dirty || stale) && (
        <p className="warning">
          {stale ? "Los datos usados para este menú han cambiado. " : ""}
          {dirty ? "Hay selecciones pendientes. " : ""}Recalcula antes de
          confirmar; los resúmenes muestran el menú anterior.
        </p>
      )}
    </>
  );
}
