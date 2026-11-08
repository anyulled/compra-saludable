import { CircleAlert, ShoppingBasket } from "lucide-react";
import type { ShoppingItem, State } from "../lib/types";

function ShoppingRows({ items, onCheck }: {
  items: ShoppingItem[];
  onCheck: (id: string, checked: boolean) => void;
}) {
  return <div className="list shopping">{items.map((item) => <label className="list-row" key={item.id}><input type="checkbox" checked={item.checked} onChange={(event) => onCheck(item.id, event.target.checked)} /><div className={item.checked ? "crossed" : ""}><strong>{item.name}</strong><p>{item.packages} × {item.size} {item.unit}</p></div><b>{(item.price * item.packages).toFixed(2)} €</b></label>)}</div>;
}

export default function ShoppingPanel({ data, stale, dirty, total, onCheck, onGoToMenu }: {
  data: State;
  stale: boolean;
  dirty: boolean;
  total: number;
  onCheck: (id: string, checked: boolean) => void;
  onGoToMenu: () => void;
}) {
  const ready = data.confirmed && !stale && !dirty;
  return (
    <>
      <div className="eyebrow muted">VUESTRA LISTA</div>
      <h1 className="page-title">Todo listo <em>para comprar.</em></h1>
      <p className="intro">Una lista consolidada a partir de vuestro menú confirmado.</p>
      <div className="warning"><CircleAlert size={19} /><span>Esta lista se guarda en el espacio compartido y se sincroniza entre las dos cuentas autorizadas.</span></div>
      {!ready ? (
        <div className="empty"><ShoppingBasket size={28} /><h2>La lista llegará después.</h2><p>Generad o recalculad y confirmad primero vuestro menú.</p><button className="secondary" onClick={onGoToMenu}>Ir al menú</button></div>
      ) : (
        <>
          <div className="toolbar"><span>{data.shopping.filter((item) => item.checked).length} de {data.shopping.length} productos tachados</span><strong>Estimación: {total.toFixed(2)} €</strong></div>
          <ShoppingRows items={data.shopping} onCheck={onCheck} />
        </>
      )}
    </>
  );
}
