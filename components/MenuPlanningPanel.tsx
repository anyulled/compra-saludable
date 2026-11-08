import { ArrowRight, CalendarDays, SlidersHorizontal, Sparkles } from "lucide-react";
import MenuReview from "./MenuReview";
import OptimizationSettings from "./OptimizationSettings";
import ScenarioCompare from "./ScenarioCompare";
import type { Meal, State } from "../lib/types";

type Options = NonNullable<State["optimizationOptions"]>;

function LeftoverSummary({ items }: { items: NonNullable<State["leftovers"]> }) {
  return (
    <section className="card">
      <h2>Aprovechamiento estimado</h2>
      <p className="help">Se supone que las existencias se usan antes que las compras. La caducidad se aplica únicamente a las existencias indicadas; no se conoce la conservación de los productos nuevos. El sobrante total incluye existencias que podrían caducar.</p>
      {items.map((item) => <div className="list-row" key={item.id}><div><strong>{item.name}</strong><p>En casa: {Math.round(item.stock * 10) / 10} {item.unit} · Compra: {Math.round(item.purchased * 10) / 10} {item.unit} · Uso: {Math.round(item.used * 10) / 10} {item.unit}</p><p>Sobrante total: {Math.round(item.remaining * 10) / 10} {item.unit}{item.expiredStock > 0 ? ` · De existencias, podrían caducar: ${Math.round(item.expiredStock * 10) / 10} ${item.unit}` : ""}</p></div></div>)}
    </section>
  );
}

export default function MenuPlanningPanel({ data, ready, busy, stale, dirty, onGenerate, onUpdateOptions, onUpdateLock, onConfirm }: {
  data: State;
  ready: boolean;
  busy: boolean;
  stale: boolean;
  dirty: boolean;
  onGenerate: () => void;
  onUpdateOptions: (patch: Partial<Options>) => void;
  onUpdateLock: (day: number, meal: Meal, recipeId: string | null) => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <div className="eyebrow muted">03 / VUESTRO PLAN</div>
      <h1 className="page-title">Una quincena <em>para vosotros.</em></h1>
      <p className="intro">Revisad la propuesta antes de generar vuestra lista de la compra.</p>
      <div className="warning"><SlidersHorizontal size={19} /><span>El optimizador busca cumplir cada objetivo diario con una tolerancia del 10 %, ajustando las raciones en medios. Equilibra coste, valoraciones, variedad, sobrantes y menor sodio; 1.000 mg de sodio suman una penalización de 0,10 € al cálculo, no al precio de la compra. Solo utiliza recetas con sodio conocido y no garantiza un límite diario. La OMS recomienda menos de 2.000 mg de sodio al día para adultos, contando todos los alimentos.</span></div>
      <OptimizationSettings options={data.optimizationOptions || {}} update={onUpdateOptions} />
      <ScenarioCompare data={data} />
      <div className="toolbar"><span>{ready ? "Objetivos de ambos perfiles completos" : "Completad los objetivos de ambos perfiles"} · {data.recipes.length} recetas</span><button className="primary" disabled={busy} onClick={onGenerate}>{busy ? "Calculando…" : "Generar menú"} <Sparkles size={17} /></button></div>
      {data.plan.length === 0 ? (
        <div className="empty"><CalendarDays size={28} /><h2>Vuestra mesa está por preparar.</h2><p>Añadid objetivos, productos y al menos una receta revisada para cada comida.</p></div>
      ) : (
        <>
          <MenuReview data={data} busy={busy} stale={stale} dirty={dirty} updateLock={onUpdateLock} />
          {data.leftovers && <LeftoverSummary items={data.leftovers} />}
          <button className="primary confirm" disabled={busy || dirty || stale} onClick={onConfirm}>Confirmar y ver la compra <ArrowRight size={17} /></button>
        </>
      )}
    </>
  );
}
