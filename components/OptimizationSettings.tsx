"use client";
import { foodGroups } from "../lib/nutrients.mjs";
import type { OptimizationOptions } from "../lib/types";
export default function OptimizationSettings({
  options,
  update,
}: {
  options: OptimizationOptions;
  update: (patch: Partial<OptimizationOptions>) => void;
}) {
  return (
    <section className="card">
      <h2>Preferencias del plan</h2>
      <p className="help">
        El cálculo favorece cierta variedad. Los límites siguientes son
        opcionales y obligatorios cuando se activan; pueden hacer que no exista
        solución.
      </p>
      <div className="form-grid">
        <label className="field">
          Inicio del plan
          <input
            type="date"
            value={options.startDate || ""}
            onChange={(e) => update({ startDate: e.target.value || undefined })}
          />
        </label>
        <label className="field">
          Máximo de apariciones de una receta en 14 días
          <input
            type="number"
            min="1"
            max="14"
            step="1"
            value={options.maxRecipeRepetitions ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") {
                update({ maxRecipeRepetitions: undefined });
                return;
              }
              const n = Number(v);
              if (Number.isInteger(n) && n >= 1 && n <= 14)
                update({ maxRecipeRepetitions: n });
            }}
          />
        </label>
      </div>
      <p className="help">
        La fecha es necesaria si hay existencias con caducidad. El máximo cuenta
        cada plato compartido una vez, no por persona.
      </p>
      <div className="subheading">MÍNIMO DE RECETAS POR SEMANA</div>
      <div className="form-grid">
        {foodGroups.map((g) => (
          <label className="field" key={g.key}>
            {g.label} · apariciones/semana
            <input
              type="number"
              min="0"
              max="28"
              step="1"
              value={options.categoryMinimums?.[g.key] ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (
                  v !== "" &&
                  (!Number.isInteger(Number(v)) ||
                    Number(v) < 0 ||
                    Number(v) > 28)
                )
                  return;
                const next = { ...options.categoryMinimums };
                if (v === "") delete next[g.key];
                else next[g.key] = Number(v);
                update({ categoryMinimums: next });
              }}
            />
          </label>
        ))}
      </div>
      <p className="help">
        Depende de cómo clasifiquéis las recetas; una receta puede contar en
        varios grupos. No evalúa la cantidad de cada alimento.
      </p>
    </section>
  );
}
