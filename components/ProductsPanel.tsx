import { AlertCircle, Plus } from "lucide-react";
import type { Product } from "../lib/types";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function NumberField({ label, value, onChange, step = "1" }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: string;
}) {
  return <Field label={label}><input type="number" min="0" step={step} value={value || ""} onChange={(event) => onChange(Number(event.target.value) || 0)} /></Field>;
}

function ProductEntry({ value, onChange, onAdd }: {
  value: Product;
  onChange: (value: Product) => void;
  onAdd: () => void;
}) {
  return (
    <section className="card">
      <h2>Añadir producto</h2>
      <div className="form-grid three">
        <Field label="Nombre"><input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="Ej. Garbanzos cocidos" /></Field>
        <Field label="Unidad"><select value={value.unit} onChange={(e) => onChange({ ...value, unit: e.target.value })}><option>g</option><option>ml</option><option>unidades</option></select></Field>
        <NumberField label="Tamaño del envase" value={value.size} onChange={(size) => onChange({ ...value, size })} />
        <NumberField label="Precio por envase (€)" value={value.price} onChange={(price) => onChange({ ...value, price })} step="0.01" />
        <NumberField label="Existencias en casa" value={value.stock} onChange={(stock) => onChange({ ...value, stock })} />
        <Field label="Caducidad de existencias (opcional)"><input type="date" value={value.expiresOn || ""} onChange={(e) => onChange({ ...value, expiresOn: e.target.value || undefined })} /></Field>
        <Field label="Origen del dato"><input value={value.source} onChange={(e) => onChange({ ...value, source: e.target.value })} /></Field>
      </div>
      <button className="primary" onClick={onAdd}><Plus size={17} /> Añadir producto</button>
    </section>
  );
}

function ProductRow({ product, update }: {
  product: Product;
  update: (id: string, patch: Partial<Product>) => void;
}) {
  const updateNumber = (field: "stock" | "price", raw: string) => {
    const value = Number(raw);
    if (raw !== "" && Number.isFinite(value) && value >= 0) update(product.id, { [field]: value });
  };
  return (
    <div className="list-row">
      <div>
        <strong>{product.name}</strong>
        <p>{product.size} {product.unit} / envase · {product.stock} {product.unit} en casa · {product.source}</p>
        <Field label={`Existencias actuales (${product.unit})`}><input type="number" min="0" step="0.1" value={product.stock} onChange={(e) => updateNumber("stock", e.target.value)} /></Field>
        <Field label="Precio por envase (€)"><input type="number" min="0" step="0.01" value={product.price} onChange={(e) => updateNumber("price", e.target.value)} /></Field>
        <Field label="Caducidad de existencias"><input type="date" value={product.expiresOn || ""} onChange={(e) => update(product.id, { expiresOn: e.target.value || undefined })} /></Field>
      </div>
      <b>{product.price.toFixed(2)} €</b>
    </div>
  );
}

function ProductList({ products, update }: {
  products: Product[];
  update: (id: string, patch: Partial<Product>) => void;
}) {
  return <div className="list">{products.map((product) => <ProductRow key={product.id} product={product} update={update} />)}</div>;
}

export default function ProductsPanel({ products, product, setProduct, query, setQuery, busy, onLookup, onAdd, onUpdate }: {
  products: Product[];
  product: Product;
  setProduct: (product: Product) => void;
  query: string;
  setQuery: (query: string) => void;
  busy: boolean;
  onLookup: () => void;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<Product>) => void;
}) {
  return (
    <>
      <div className="eyebrow muted">VUESTRA DESPENSA</div>
      <h1 className="page-title">Productos <em>y envases.</em></h1>
      <p className="intro">Añadid los productos que usáis y la cantidad que ya tenéis en casa.</p>
      <div className="warning"><AlertCircle size={19} /><span>Consulta individual a una API no oficial de Mercadona para 08191. Los precios pueden cambiar y no confirman la disponibilidad en tienda física. Revisa los datos antes de añadirlos.</span></div>
      <section className="card">
        <h2>Consultar Mercadona</h2>
        <p className="help">Pega el enlace de un producto de la tienda online o introduce su identificador numérico.</p>
        <div className="lookup"><input aria-label="Identificador o enlace de Mercadona" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ej. 10005" /><button className="secondary" disabled={busy} onClick={onLookup}>{busy ? "Consultando…" : "Consultar producto"}</button></div>
      </section>
      <ProductEntry value={product} onChange={setProduct} onAdd={onAdd} />
      <ProductList products={products} update={onUpdate} />
    </>
  );
}
