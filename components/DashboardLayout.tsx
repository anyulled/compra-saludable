import { BookOpen, CalendarDays, Check, ChefHat, Leaf, ShoppingBasket, Sparkles, Users } from "lucide-react";
import type { State } from "../lib/types";

export type DashboardTab = "Inicio" | "Perfiles" | "Recetas" | "Biblioteca" | "Productos" | "Menú" | "Compra";
const tabs: DashboardTab[] = ["Inicio", "Perfiles", "Recetas", "Biblioteca", "Productos", "Menú", "Compra"];
const icons = [Leaf, Users, ChefHat, BookOpen, ShoppingBasket, CalendarDays, Check];

export default function DashboardLayout({ children, email, tab, onTabChange, data, downloadCurrent, importing, persistingUpload, importProgress }: {
  children: React.ReactNode;
  email: string;
  tab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  data: State;
  downloadCurrent: () => void;
  importing: boolean;
  persistingUpload: boolean;
  importProgress: string;
}) {
  return (
    <>
      <div className="shell" inert={importing || persistingUpload || undefined}>
        <aside className="sidebar">
          <div className="brand"><span className="brand-icon"><Leaf size={19} /></span><div><strong>mesa</strong><small>COMER BIEN, JUNTOS</small></div></div>
          <div className="nav-label">TU ESPACIO</div>
          <nav>{tabs.map((item, index) => { const Icon = icons[index]; return <button key={item} className={tab === item ? "nav active" : "nav"} onClick={() => onTabChange(item)}><Icon size={18} />{item}{item === "Compra" && data.shopping.length > 0 && <span className="nav-count">{data.shopping.length}</span>}</button>; })}</nav>
          <div className="side-note"><span className="side-spark"><Sparkles size={17} /></span><strong>Un poco de planificación,</strong><p>mucho más tiempo para disfrutar.</p></div>
          <div className="side-bottom">HECHO PARA VUESTRA MESA <span>♥</span></div>
        </aside>
        <main className="main">
          <header className="topbar"><span>VUESTRO ESPACIO <span className="slash">/</span> {tab.toUpperCase()}</span><div><button className="text-button" onClick={downloadCurrent}>Descargar copia</button><span className="location">◉ &nbsp; 08191</span><span className="avatar" title={email}>{email.slice(0, 1).toUpperCase() || "M"}</span><form action="/auth/signout" method="post" className="signout-form"><button className="text-button" type="submit">Cerrar sesión</button></form></div></header>
          {children}
        </main>
      </div>
      {(importing || persistingUpload) && <div className="workspace-save-overlay" role="status">{persistingUpload ? "Guardando el borrador compartido…" : importProgress || "Importando el PDF…"}</div>}
    </>
  );
}
