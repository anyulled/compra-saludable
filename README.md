# Mesa

![Mesa para dos con alimentos frescos y una bolsa de compra](public/images/mesa-saludable.jpg)

Planificador quincenal para dos personas, con recetas, objetivos nutricionales y lista de compra. La aplicación utiliza Supabase Auth y un espacio de datos privado compartido; requiere configurar Supabase y Google antes de poder iniciar sesión.

## Inicio

```sh
cp .env.example .env.local
npm ci
npm run dev
```

Abrir http://localhost:3000. Añadir dos perfiles con objetivos revisados, productos y al menos una receta para cada una de las cuatro comidas. Los valores de una receta son por ración y las cantidades de ingredientes usan las unidades de sus productos. El optimizador exige nutrientes diarios dentro del 10% de cada objetivo y compra envases enteros; tiene en cuenta existencias, preferencia y sodio por ración verificado por el usuario, pero no garantiza variedad, límites de sodio ni valida alergias. Las recetas sin sodio no participan en la optimización; se necesita al menos una receta con sodio por cada franja. Si se registran restricciones, bloquea la optimización.

La estimación de mantenimiento usa Mifflin-St Jeor y el factor de actividad seleccionado, para los dos adultos de esta unidad familiar, donde se ha indicado que no habrá embarazo ni lactancia. Es orientativa y nunca sobrescribe los objetivos. Tras completar la pregunta de seguridad, para IMC igual o superior a 25, propone un déficit inicial orientativo del 10 % y un reparto general de energía 20 % proteína, 50 % carbohidratos y 30 % grasa. Son parámetros elegidos para el prototipo, no una prescripción individual ni un reparto óptimo validado para diabetes o menopausia. No propone valores si el resultado es inferior a 1.200 kcal/día o si hay situaciones que requieren supervisión clínica; ese umbral no garantiza seguridad. La propuesta solo se aplica al confirmar y se puede ajustar; muestra también una comprobación aproximada de coherencia energética. Los objetivos deben revisarse con un profesional, especialmente ante enfermedad hepática o resistencia a la insulina.

## Pendiente antes de uso real

Quedan pendientes la sincronización sin conexión, la extracción estructurada de recetas, la búsqueda por nombre y actualización automática del catálogo de Mercadona, y la incorporación de fuentes nutricionales verificadas. La consulta individual utiliza la API no oficial de Mercadona para 08191. Las recetas con valores sintéticos son datos de demostración.

## Importación de PDF

En Recetas se selecciona un PDF local de hasta 20 MiB. El navegador extrae el texto y ejecuta OCR en español en las páginas con poco texto. El original se conserva en el bucket privado `household-documents` y puede reabrirse después desde una sesión del hogar; cada página se conserva como borrador para su revisión. Los borradores compartidos tienen un límite de 3 MiB para mantener las solicitudes dentro del tamaño admitido por el despliegue. Si el OCR produce demasiados datos, la importación se rechaza antes de subir el original. Las sugerencias de ingredientes y nutrientes pueden ser incompletas; se confirman durante la revisión.

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

En cada receta se pueden revisar estos valores, su fuente y los grupos que contiene. En Menú se puede fijar un máximo de apariciones de cada receta durante los 14 días y mínimos semanales de platos por grupo. Son restricciones estrictas opcionales; una clasificación puede pertenecer a varios grupos y el recuento no garantiza cantidad mínima de alimentos. El modelo penaliza cada repetición adicional en 0,75 unidades equivalentes a euros del objetivo, junto con coste, sodio y valoración. Para acotar el tiempo se explora primero una selección rotatoria de recetas; el resultado no garantiza el óptimo global de todas las combinaciones posibles.

Si una existencia tiene fecha de caducidad, hay que indicar el inicio del plan. El modelo no la utiliza después de su fecha; los productos comprados se suponen disponibles toda la quincena porque no se conoce su conservación. Se calcula sobrante y posible caducidad de existencias suponiendo que se consumen primero. El objetivo añade penalizaciones equivalentes al 5 % del valor estimado del sobrante y al 20 % del valor estimado de existencias no usadas antes de caducar. Son ponderaciones del prototipo, no costes monetarios reales; pueden entrar en conflicto con precio, sodio o preferencias. El usuario debe revisar los resultados y las condiciones de conservación.

## Almacenamiento y migración

Se requiere Node.js 22.13 o posterior. Configura en `.env.local` las variables de `.env.example`: URL y clave publicable de Supabase, exactamente dos correos autorizados y el identificador del hogar. En Supabase Auth configura Google como único método de acceso y desactiva email/contraseña, teléfono y otros proveedores; el servidor también exige identidad Google con correo verificado, además de la allowlist. Registra la ruta `/auth/callback`, crea la membresía de las dos cuentas en el hogar y aplica las migraciones antes de arrancar. Los secretos y los datos personales se mantienen fuera de Git.

El workspace se guarda en Supabase con control de revisión para detectar ediciones simultáneas. Un hogar sin datos queda en estado pendiente de importación; las cuentas autorizadas no pueden crear el primer workspace. El administrador debe sembrar o migrar el estado mediante el script administrativo. La app conserva y permite descargar la copia del navegador mientras espera esa migración. Los navegadores consultan los cambios aproximadamente cada cuatro segundos cuando no hay ediciones pendientes. El adaptador local SQLite y el script de migración se conservan para trasladar instalaciones anteriores.

El botón **Descargar copia** exporta el estado como JSON sin cifrar: guardar el archivo en un lugar seguro. Para una copia física consistente de SQLite usa la API de copia de SQLite; no copies solo el archivo principal mientras la aplicación esté escribiendo, porque puede haber archivos WAL. La importación de copias JSON aún no está implementada.

`lib/storage/contract.ts` define el contrato de lectura y escritura con comparación de revisión atómica. Las migraciones SQL y políticas de aislamiento de hogares están en `supabase/`. El script `scripts/migrate-sqlite-to-supabase.mjs` hace una simulación por defecto y requiere `MESA_LEGACY_DB_PATH`; para importar necesita además credenciales administrativas configuradas fuera del repositorio.
