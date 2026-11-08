"use client";
import Image from "next/image";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Calculator,
  Check,
  Droplets,
  Heart,
  Scale,
  ShoppingBasket,
  Sparkles,
  Sprout,
  Users,
  Wheat,
} from "lucide-react";

type Destination = "Perfiles" | "Recetas" | "Menú" | "Biblioteca";
type Props = { navigate: (destination: Destination) => void };
const evidence = [
  {
    icon: Heart,
    color: "salmon",
    tag: "SALUD HEPÁTICA",
    title: "Un progreso gradual",
    body: "Si hay sobrepeso u obesidad, una pérdida gradual del 3–5 % del peso corporal puede reducir la grasa del hígado; puede ser necesario perder entre un 7–10 % para reducir inflamación o fibrosis. El objetivo y el ritmo deben acordarse individualmente; perder peso rápidamente puede ser perjudicial.",
    source: "NIDDK · tratamiento del hígado graso",
    url: "https://www.niddk.nih.gov/health-information/liver-disease/nafld-nash/treatment",
  },
  {
    icon: Wheat,
    color: "sage",
    tag: "SALUD METABÓLICA",
    title: "La calidad también cuenta",
    body: "Las verduras, legumbres y cereales integrales aportan fibra. No existe un reparto ideal de carbohidratos, proteínas y grasas para todas las personas con diabetes o riesgo de desarrollarla.",
    source: "ADA · consenso de nutrición",
    url: "https://diabetesjournals.org/care/article/42/5/731/40480/Nutrition-Therapy-for-Adults-With-Diabetes-or",
  },
  {
    icon: Droplets,
    color: "butter",
    tag: "MENOS SODIO",
    title: "Una referencia, no una garantía",
    body: "La OMS recomienda en adultos menos de 2.000 mg de sodio al día, contando todos los alimentos; equivale a menos de 5 g de sal. Un gramo de sal contiene aproximadamente 400 mg de sodio.",
    source: "OMS · reducción de sodio",
    url: "https://www.who.int/news-room/fact-sheets/detail/sodium-reduction",
  },
  {
    icon: Sprout,
    color: "lavender",
    tag: "MENOPAUSIA Y HUESOS",
    title: "Cuidar la salud ósea",
    body: "Una alimentación equilibrada que incluya fuentes de calcio, junto con actividad física de fuerza y con apoyo de peso, contribuye al cuidado de los huesos. Las necesidades personales deben revisarse individualmente.",
    source: "NHS · menopausia y bienestar",
    url: "https://www.nhs.uk/conditions/menopause-and-perimenopause/things-you-can-do/",
  },
];
const ideas = [
  {
    num: "01",
    title: "Calidad nutricional y fibra",
    body: "Registrar fibra, grasas saturadas y azúcares libres y, si lo acordáis, fijar límites diarios por persona.",
    needs: "Disponible con datos y objetivos revisados.",
  },
  {
    num: "02",
    title: "Salud ósea",
    body: "Registrar calcio y vitamina D por receta y activar límites personales cuando contéis con objetivos revisados.",
    needs: "Disponible con datos por ración y objetivos personales.",
  },
  {
    num: "03",
    title: "Variedad y preferencias",
    body: "Fijar un máximo de repeticiones y mínimos semanales de recetas por grupo, además de tener en cuenta vuestras valoraciones.",
    needs: "Disponible mediante clasificación manual.",
  },
  {
    num: "04",
    title: "Despensa y desperdicio",
    body: "Estimar sobrantes y registrar la fecha de caducidad de las existencias de casa para planificar su uso.",
    needs: "Disponible; la conservación de las compras sigue pendiente.",
  },
  {
    num: "05",
    title: "Seguimiento compartido",
    body: "Contrastar objetivos con evolución y adherencia a lo largo del tiempo, evitando interpretar cambios a corto plazo como resultados clínicos.",
    needs: "Requiere almacenamiento privado y validación profesional.",
  },
];
export default function WellnessHome({ navigate }: Props) {
  return (
    <div className="wellness-home">
      <section className="wellness-hero">
        <div className="wellness-hero-copy">
          <div className="wellness-kicker">
            <span className="kicker-dot" /> VUESTRA GUÍA PARA COMER MEJOR
          </div>
          <h1>
            Una forma más
            <br />
            <em>tranquila de cuidaros.</em>
          </h1>
          <p>
            Vuestras recetas, una compra inteligente y un plan pensado para las
            dos personas que se sientan a la mesa.
          </p>
          <div className="wellness-actions">
            <button className="primary" onClick={() => navigate("Perfiles")}>
              Preparar mis perfiles <ArrowRight size={16} />
            </button>
            <a href="#criterios" className="wellness-link">
              Ver los criterios <span>↘</span>
            </a>
          </div>
        </div>
        <div className="wellness-hero-art">
          <Image
            src="/images/mesa-saludable.jpg"
            alt="Una mesa para dos con verduras, legumbres y pan integral"
            fill
            sizes="(max-width: 650px) 100vw, (max-width: 1050px) 35vw, 40vw"
            preload
          />
        </div>
        <div className="wellness-hero-bottom">
          <span>01 — PENSADO PARA DOS</span>
          <span>02 — MENÚ DE 14 DÍAS</span>
          <span>03 — COMPRA CON SENTIDO</span>
        </div>
      </section>
      <section className="wellness-section" id="criterios">
        <div className="wellness-section-top">
          <div>
            <span className="wellness-label">01 / LO QUE HEMOS CONSULTADO</span>
            <h2>
              La salud, en el centro <em>de la mesa.</em>
            </h2>
          </div>
          <p>
            Ideas respaldadas por fuentes sanitarias, para orientar la
            conversación y revisar el plan.
          </p>
        </div>
        <div className="evidence-grid">
          {evidence.map((item) => {
            const Icon = item.icon;
            return (
              <article className="evidence-card" key={item.tag}>
                <div className={`wellness-icon ${item.color}`}>
                  <Icon size={19} />
                </div>
                <div className="evidence-tag">{item.tag}</div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <a href={item.url} target="_blank" rel="noreferrer">
                  {item.source} <span aria-hidden="true">↗</span>
                </a>
              </article>
            );
          })}
        </div>
      </section>
      <section className="wellness-section">
        <div className="wellness-section-top">
          <div>
            <span className="wellness-label">02 / CÓMO FUNCIONA HOY</span>
            <h2>
              Del objetivo <em>al plato.</em>
            </h2>
          </div>
          <p>
            El cálculo combina vuestras decisiones con las recetas que habéis
            revisado.
          </p>
        </div>
        <div className="how-grid">
          <article>
            <div className="how-number">01</div>
            <div className="how-icon">
              <Users size={19} />
            </div>
            <h3>Dos perfiles</h3>
            <p>
              Edad, peso, altura y actividad permiten estimar el mantenimiento.
              Cuando se cumplen las condiciones de seguridad, la app propone
              restar un 10 % del mantenimiento estimado y usar un reparto
              general de macros. Son reglas iniciales del prototipo, no una
              pauta validada individualmente; podéis confirmarlas o ajustarlas.
            </p>
            <button onClick={() => navigate("Perfiles")}>
              Revisar perfiles <ArrowRight size={14} />
            </button>
          </article>
          <article>
            <div className="how-number">02</div>
            <div className="how-icon">
              <Calculator size={19} />
            </div>
            <h3>Un menú con criterio</h3>
            <p>
              La programación lineal entera combina objetivos diarios, raciones,
              productos, precio y preferencias. Favorece menos sodio, pero no
              impone un máximo diario.
            </p>
            <button onClick={() => navigate("Menú")}>
              Explorar el menú <ArrowRight size={14} />
            </button>
          </article>
          <article>
            <div className="how-number">03</div>
            <div className="how-icon">
              <ShoppingBasket size={19} />
            </div>
            <h3>Una compra más sencilla</h3>
            <p>
              Se suman ingredientes y se calculan envases teniendo en cuenta la
              despensa. La lista se guarda en el espacio compartido.
            </p>
            <button onClick={() => navigate("Recetas")}>
              Preparar recetas <ArrowRight size={14} />
            </button>
          </article>
        </div>
        <div className="honesty-strip">
          <Check size={17} />
          <p>
            <strong>
              Los límites opcionales de fibra, calcio y otros nutrientes
              requieren datos revisados. Aún no se verifican automáticamente las
              alergias.
            </strong>{" "}
            Las recetas sin datos de sodio quedan fuera del cálculo.
          </p>
        </div>
      </section>
      <section className="wellness-section next-section">
        <div className="wellness-section-top">
          <div>
            <span className="wellness-label">03 / MÁS ALLÁ DEL MENÚ</span>
            <h2>
              Cómo seguir <em>mejorando.</em>
            </h2>
          </div>
          <p>
            Opciones disponibles y mejoras pendientes, con datos y objetivos
            fiables.
          </p>
        </div>
        <div className="idea-list">
          {ideas.map((idea) => (
            <article className="idea-row" key={idea.num}>
              <span className="idea-number">{idea.num}</span>
              <div>
                <h3>{idea.title}</h3>
                <p>{idea.body}</p>
              </div>
              <span className="idea-needs">{idea.needs}</span>
            </article>
          ))}
        </div>
      </section>
      <section className="wellness-cta">
        <span className="cta-icon">
          <Sparkles size={19} />
        </span>
        <div>
          <span className="wellness-label">EMPECEMOS POR LO IMPORTANTE</span>
          <h2>Una buena mesa se construye juntos.</h2>
          <p>
            Revisad vuestros perfiles y recetas para preparar la primera
            quincena.
          </p>
        </div>
        <button onClick={() => navigate("Perfiles")}>
          Ir a mis perfiles <ArrowRight size={16} />
        </button>
      </section>
    </div>
  );
}
