"use client";
import { useState } from "react";
import { makeScenario, scenarios, summarizeScenario, scenarioBasis } from "../lib/scenarios.mjs";
import type { State } from "../lib/types";

type Row = { id: string; label: string; cost?: number; sodiumDaily?: number[]; error?: string };

export default function ScenarioCompare({ data }: { data: State }) {
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [basis, setBasis] = useState("");
  const [progress, setProgress] = useState("");
  const run = async () => {
    setRunning(true);
    setRows([]);
    const snapshot = structuredClone(data);
    const key = scenarioBasis(snapshot);
    try {
      // Sequential requests bound peak solver memory, particularly on Vercel.
      for (const [index, scenario] of scenarios.entries()) {
        setProgress(`Calculando escenario ${index + 1} de ${scenarios.length}…`);
        let row: Row;
        try {
          const response = await fetch("/api/optimize", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(makeScenario(snapshot, scenario.id)),
          });
          const result = await response.json();
          if (!response.ok) throw Error(result.error || "No se pudo calcular.");
          row = { ...scenario, ...summarizeScenario(result, snapshot.recipes) };
        } catch (error) {
          row = { ...scenario, error: error instanceof Error ? error.message : "No se pudo calcular." };
        }
        setRows((current) => [...current.filter((existing) => existing.id !== scenario.id), row]);
      }
      setBasis(key);
    } finally {
      setProgress("");
      setRunning(false);
    }
  };
  return <section className="card scenario-panel">
    <h2>Comparar escenarios</h2>
    <p className="help">Simula una compra sin despensa y otra con precios un 10 % mayores. Cada escenario recalcula el menú completo con los límites y recetas fijadas actuales. Los resultados no modifican vuestro menú ni la lista.</p>
    <button type="button" className="secondary" disabled={running} onClick={() => void run()}>{running ? "Calculando…" : "Comparar escenarios"}</button>
    {running && <p role="status" className="help">{progress}</p>}
    {rows.length > 0 && <>
      {basis && basis !== scenarioBasis(data) && <p className="warning">Los datos han cambiado desde esta comparación; vuelve a calcularla.</p>}
      <div className="scenario-table-wrap"><table className="scenario-table"><thead><tr><th>Escenario</th><th>Compra estimada</th><th>Sodio medio por día</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><th scope="row">{row.label}</th>{row.error ? <td colSpan={2}>{row.error}</td> : <><td>{row.cost?.toFixed(2)} €</td><td>{row.sodiumDaily?.map((n, i) => `${data.profiles[i].name}: ${Math.round(n)} mg`).join(" · ")}</td></>}</tr>)}</tbody></table></div>
      <p className="help">El sodio es un promedio de los 14 días, no un máximo diario. El precio simulado no representa una oferta real.</p>
    </>}
  </section>;
}
