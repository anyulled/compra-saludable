# Mesa

Prototipo local de planificación quincenal para dos personas. Los datos se guardan en SQLite en este equipo: **no hay autenticación, cifrado de la base de datos ni protección adecuada para publicar datos de salud en Internet**. No hay sincronización remota. No desplegarlo públicamente ni introducir información sensible real en esta versión.

## Inicio

```sh
npm install
npm run dev
```

Abrir http://localhost:3000. Añadir dos perfiles con objetivos revisados, productos y al menos una receta para cada una de las cuatro comidas. Los valores de una receta son por ración y las cantidades de ingredientes usan las unidades de sus productos. El optimizador exige nutrientes diarios dentro del 10% de cada objetivo y compra envases enteros; tiene en cuenta existencias, preferencia y sodio por ración verificado por el usuario, pero no garantiza variedad, límites de sodio ni valida alergias. Las recetas sin sodio no participan en la optimización; se necesita al menos una receta con sodio por cada franja. Si se registran restricciones, bloquea la optimización.

La estimación de mantenimiento usa Mifflin-St Jeor y el factor de actividad seleccionado, para los dos adultos de esta unidad familiar, donde se ha indicado que no habrá embarazo ni lactancia. Es orientativa y nunca sobrescribe los objetivos. Tras completar la pregunta de seguridad, para IMC igual o superior a 25, propone un déficit inicial orientativo del 10 % y un reparto general de energía 20 % proteína, 50 % carbohidratos y 30 % grasa. Son parámetros elegidos para el prototipo, no una prescripción individual ni un reparto óptimo validado para diabetes o menopausia. No propone valores si el resultado es inferior a 1.200 kcal/día o si hay situaciones que requieren supervisión clínica; ese umbral no garantiza seguridad. La propuesta solo se aplica al confirmar y se puede ajustar; muestra también una comprobación aproximada de coherencia energética. Los objetivos deben revisarse con un profesional, especialmente ante enfermedad hepática o resistencia a la insulina.

## Pendiente antes de uso real

Autenticación, base de datos privada, sincronización y recuperación sin conexión; mejora de la extracción estructurada de recetas; búsqueda por nombre y actualización automática de productos de Mercadona; fuentes nutricionales verificadas; restricciones avanzadas de variedad en el menú; restricciones alimentarias seguras; explicaciones más precisas de inviabilidad, variedad y desperdicio; validación clínica. La consulta individual de productos usa la API no oficial de Mercadona, resuelve el almacén para 08191 y requiere revisar el precio y el formato antes de añadir. No rastrea el catálogo. La disponibilidad en tienda física no está verificada.

## Importación de PDF

En Recetas se selecciona un PDF local. El navegador extrae el texto y ejecuta OCR en español en las páginas con poco texto, utilizando recursos servidos por la propia aplicación. Conserva cada página como borrador, incluso cuando no se puede leer. Se puede comparar el texto con el PDF mientras está seleccionado; el original no se guarda. Para cada página, la aplicación sugiere un nombre, líneas de ingredientes, pasos y valores nutricionales cuando los identifica claramente. Estas sugerencias pueden ser incompletas o erróneas; los valores se copian individualmente tras revisión y no se aplican si se detecta una referencia por 100 g o ml. Las raciones y la asociación de todos los ingredientes a productos deben revisarse manualmente antes de aprobar. Las páginas y recetas se guardan en SQLite en este equipo; el PDF original no se guarda.

## Estados y biblioteca

Cada PDF se agrupa como una importación independiente. Sus páginas pueden estar pendientes, en revisión, revisadas o descartadas. Guarda todas las recetas de una página antes de marcarla revisada; marca índices u otras páginas que no sean recetas como descartadas. Cuando todas las páginas están resueltas, la biblioteca permite aprobar el archivo expresamente. Al reabrir una página se revoca la aprobación del archivo. Los borradores anteriores que no tenían identificador de importación se agrupan por nombre y se consideran pendientes; las recetas antiguas permanecen aprobadas sin asignarles una página automáticamente. La biblioteca permite filtrar recetas aprobadas y páginas por estado.

## Revisión del menú

El menú muestra un resumen diario por persona calculado con las raciones y los nutrientes introducidos. Se puede fijar o cambiar una receta para una franja y recalcular. Los cambios de perfiles, recetas o productos invalidan la confirmación hasta que se recalcule; los planes antiguos sin huella de datos también requieren un nuevo cálculo. La tolerancia del 10 % y los datos manuales son limitaciones del prototipo.

## Sodio

Registra los miligramos de sodio por ración, incluyendo la sal añadida y todos los ingredientes. Un dato ausente no es cero; se excluye del cálculo hasta revisarlo. Una cifra real de cero es válida. El objetivo combinado suma 0,10 € de penalización por cada 1.000 mg de sodio de las raciones planificadas, además del coste y preferencias. Esta ponderación es una decisión del prototipo; puede seleccionar más sodio si reduce otros costes y no impone un máximo diario. El resumen diario solo cubre las recetas planificadas. La OMS recomienda en adultos menos de 2.000 mg de sodio por día; 1 g de sal equivale aproximadamente a 400 mg de sodio.

## Vitamina D

Cada perfil permite guardar una referencia opcional (µg/día), incluida la ingesta adecuada de referencia de EFSA para adultos sanos suponiendo síntesis cutánea mínima: 15 µg/día. No es una recomendación específica para menopausia ni una dosis de suplemento. Cada receta admite un contenido opcional de vitamina D por ración y su fuente; el resumen diario suma solo las comidas conocidas e indica la cobertura. No incluye sol, suplementos ni otros alimentos, ni diagnostica déficit. Solo influye en el optimizador si se activa explícitamente un mínimo diario independiente de la referencia informativa. EFSA: https://www.efsa.europa.eu/en/press/news/161028; NHS: https://www.nhs.uk/live-well/bone-health/food-for-strong-bones/

## Límites y aprovechamiento del optimizador

En cada perfil se pueden activar límites diarios estrictos de fibra, grasas saturadas, azúcares libres, calcio y vitamina D. No se proponen valores clínicos automáticos: deben revisarse con un profesional. Al activar un límite, solo se consideran recetas que tengan ese dato por ración; el dato desconocido nunca equivale a cero. Los azúcares libres no son lo mismo que el total de azúcares de una etiqueta.

En cada receta se pueden revisar estos valores, su fuente y los grupos que contiene. En Menú se puede fijar un máximo de apariciones de cada receta durante los 14 días y mínimos semanales de platos por grupo. Son restricciones estrictas opcionales; una clasificación puede pertenecer a varios grupos y el recuento no garantiza cantidad mínima de alimentos. Sin límite, el modelo penaliza cada repetición adicional en 0,15 unidades equivalentes a euros del objetivo, junto con coste, sodio y valoración.

Si una existencia tiene fecha de caducidad, hay que indicar el inicio del plan. El modelo no la utiliza después de su fecha; los productos comprados se suponen disponibles toda la quincena porque no se conoce su conservación. Se calcula sobrante y posible caducidad de existencias suponiendo que se consumen primero. El objetivo añade penalizaciones equivalentes al 5 % del valor estimado del sobrante y al 20 % del valor estimado de existencias no usadas antes de caducar. Son ponderaciones del prototipo, no costes monetarios reales; pueden entrar en conflicto con precio, sodio o preferencias. El usuario debe revisar los resultados y las condiciones de conservación.

## Almacenamiento y migración

La aplicación escucha solo en `127.0.0.1` por defecto y guarda el estado de la unidad familiar en `.data/mesa.sqlite`. Se requiere Node.js 22.13 o posterior con `node:sqlite` (en Node 22/24 está marcado como experimental). El archivo se crea con permisos 0600 y la carpeta local con 0700 en sistemas compatibles; no está cifrado. No exponer la aplicación a Internet ni usarla como servicio multiusuario. `MESA_DB_PATH` permite elegir otra ruta local y debe mantenerse fuera de cualquier directorio público o repositorio.

Al abrir la nueva versión en el navegador anterior, si la base está vacía, se importa automáticamente `mesa-v1`. La copia original en el navegador se conserva. Si SQLite ya contiene datos distintos, no se sobrescribe: la app ofrece descargar la copia anterior para recuperarla. Los datos de otros navegadores u orígenes no se importan por sí solos. Con dos pestañas, los cambios se refrescan aproximadamente cada cuatro segundos; si coinciden ediciones se avisa y se permite descargar los cambios locales antes de cargar la versión guardada.

El botón **Descargar copia** exporta el estado como JSON sin cifrar: guardar el archivo en un lugar seguro. Para una copia física consistente de SQLite usa la API de copia de SQLite; no copies solo el archivo principal mientras la aplicación esté escribiendo, porque puede haber archivos WAL. La importación de copias JSON aún no está implementada.

`lib/storage/contract.ts` define el contrato de lectura y escritura con comparación de revisión atómica y `lib/storage/index.ts` selecciona el adaptador local. Un futuro adaptador SQL o NoSQL deberá conservar esa semántica, añadir autenticación, autorización, cifrado y gestión de conflictos. No hay proveedor remoto configurado ni se transmiten datos a uno.
