# Operaciones de terminal

Guía para operar Mesa desde el checkout local. Los ejemplos asumen que se ejecutan desde la raíz del repositorio y que las herramientas (`gh`, `gcloud`, `vercel`, `supabase`, Docker y Node.js) están instaladas. En este equipo, antepón `rtk` a todos los comandos de terminal, por ejemplo `rtk gh repo view`. No copies valores secretos en comandos, archivos versionados, logs ni en el chat.

## Reglas de seguridad y confirmación

- Revisa el contexto antes de actuar: `rtk git status --short --branch`, `rtk gh auth status`, `rtk gcloud config list` y el proyecto vinculado con cada CLI.
- Producción y previsualización son proyectos Supabase distintos. Confirma siempre el project ref antes de enlazar o aplicar migraciones. No pauses ni elimines proyectos existentes para liberar cuota.
- No uses `set -x`, volcados del entorno, `ps` con argumentos completos ni comandos que impriman secretos. No guardes tokens, claves, contraseñas, datos de perfiles o la SQLite de origen en Git.
- Mantén `.env.local` y archivos temporales de credenciales fuera de Git; comprueba `rtk git status --short` antes de cualquier commit. Usa el almacén de secretos del proveedor para credenciales de CI y despliegue.
- Una migración de producción modifica datos remotos. Revisa el diff, la simulación remota y el destino antes de aplicarla. El despliegue automático de migraciones solo corre tras un `push` a `main` cuando pasan build, pruebas, cobertura e integración de base de datos.
- Los cambios en Google OAuth, allowlist, protección de ramas, secretos, dominios, acceso público o datos reales requieren confirmar el alcance y el destino antes de ejecutarlos.

## Variables y credenciales

### Aplicación y Vercel

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `AUTHORIZED_EMAILS` son variables de ejecución de la aplicación. `NEXT_PUBLIC_*` son públicas por diseño; `AUTHORIZED_EMAILS` contiene datos personales y se mantiene solo en el entorno de despliegue/local, nunca en el repo público. Configura valores distintos para producción y Preview. Preview debe apuntar al proyecto Supabase de preview y usar exclusivamente datos ficticios. La aplicación obtiene el UUID del hogar del usuario autenticado mediante `household_members`; ese UUID vive en la base de datos y no se configura en el entorno.

Para desarrollo local copia `.env.example` a `.env.local` y rellena valores de un entorno no productivo:

```sh
rtk cp .env.example .env.local
rtk npm run dev
```

No uses valores reales en capturas, tickets ni documentación. `.env.local` está excluido de Git.

### GitHub Actions

El entorno protegido `production` del repositorio necesita el secreto `SUPABASE_ACCESS_TOKEN`, el secreto `SUPABASE_DB_PASSWORD` y la variable `SUPABASE_PROJECT_REF`. El workflow de CI comprueba que estén presentes, enlaza el project ref, hace `supabase db push --dry-run --remote` y después aplica las migraciones. Si faltan, el trabajo posterior al merge falla antes de enlazar o escribir.

Gestiona estos valores en **Settings → Secrets and variables → Actions**. No uses secretos de producción en ejecuciones de código de pull requests no confiables. Restringe el secreto de producción al entorno `production`.

### Supabase Auth y Google Cloud OAuth

Google OAuth se configura en Google Cloud Console y Supabase Auth. En Google Cloud selecciona el proyecto correcto, configura la pantalla de consentimiento/audiencia y crea un cliente OAuth Web. En Supabase habilita Google y registra la URL callback exacta que muestra el proveedor, además de los redirect URLs de desarrollo y producción. No adivines ni reutilices callback URLs de otro proyecto. La allowlist de dos correos se define en el entorno de la aplicación; el proveedor debe devolver un correo verificado.

Comandos de inspección de Google Cloud:

```sh
rtk gcloud auth list
rtk gcloud config list
rtk gcloud projects list
```

El login interactivo (`gcloud auth login`) y la selección de proyecto (`gcloud config set project PROJECT_ID`) cambian el contexto local. Verifica el proyecto activo antes de cambiar configuración OAuth o APIs. La creación/rotación del secreto OAuth se hace en Google Cloud Console o en el gestor seguro aprobado; no incluyas `client_secret` en argumentos ni salida de terminal. Guarda el client ID y el secreto en el proveedor OAuth de Supabase y verifica el estado del proveedor desde su panel.

## GitHub y pull requests

Este checkout publica en `anyulled/compra-saludable`. Usa GitHub CLI para inspeccionar antes de cambiar:

```sh
rtk gh auth status
rtk gh repo view anyulled/compra-saludable
rtk gh pr list --repo anyulled/compra-saludable
rtk gh run list --repo anyulled/compra-saludable
```

Flujo normal: rama de trabajo, commits, push de rama, PR y auto merge mediante rebase tras los checks requeridos. No fusiones mediante merge commit ni squash:

```sh
rtk git switch -c fix/descripcion
rtk git add ruta/al/cambio
rtk git commit -m "Describe el cambio"
rtk git push -u origin fix/descripcion
rtk gh pr create --repo anyulled/compra-saludable --base main
rtk gh pr checks --repo anyulled/compra-saludable PR_NUMBER
rtk gh pr merge --repo anyulled/compra-saludable PR_NUMBER --auto --rebase
```

No deshabilites checks requeridos para hacer pasar una PR. Comprueba el resultado remoto con `gh pr view` y `gh run view`; un test local verde no demuestra que el workflow o el despliegue remoto hayan terminado.

## Supabase CLI y migraciones

Las migraciones versionadas están en `supabase/migrations/`; las pruebas SQL de aislamiento están en `supabase/tests/household_isolation.sql`. CI crea un proyecto efímero, ejecuta primero dry-run, aplica las migraciones y corre las pruebas de SQL. Para operaciones locales, inicia Supabase local con Docker:

```sh
rtk supabase --version
rtk supabase start
rtk supabase status
rtk supabase db reset
```

`db reset` reconstruye la base local y borra sus datos locales. No lo ejecutes contra un proyecto remoto. Para un remoto, confirma el project ref; primero vincula y revisa las migraciones pendientes:

```sh
rtk supabase projects list
rtk supabase link --project-ref PROJECT_REF
rtk supabase db push --dry-run --remote
```

Solo después de inspeccionar la lista y validar el destino, la aplicación manual remota sería `rtk supabase db push --yes --remote`. En producción, sigue el flujo protegido de GitHub Actions; evita una aplicación manual que pueda competir con el workflow.

La CLI puede autenticarse interactivamente con `rtk supabase login`; los tokens y contraseñas deben introducirse mediante el flujo seguro de la CLI/gestor de secretos, no como literales en comandos. Para configurar `SUPABASE_DB_PASSWORD` en Actions, utiliza el secreto del entorno `production`.

## Vercel CLI

El proyecto Vercel se vincula desde la raíz. Los comandos de inspección habituales son:

```sh
rtk vercel whoami
rtk vercel project ls
rtk vercel ls
rtk vercel inspect DEPLOYMENT_URL
```

`rtk vercel link` crea o actualiza `.vercel/` local y vincula el directorio. Comprueba el equipo y el proyecto antes de hacerlo. `rtk vercel env ls` permite revisar nombres/entornos configurados; evita comandos de descarga o volcados de variables a logs. Agrega variables sensibles desde el panel de Vercel o con el flujo interactivo de `vercel env add`, seleccionando explícitamente Production o Preview. En Preview configura únicamente el proyecto Supabase de previsualización.

Un despliegue de producción se inicia desde `main` mediante integración GitHub. No publiques una Preview con datos reales. Antes de modificar protección de despliegues o dominios, verifica el acceso privado y la autenticación de la aplicación.

## Migrar la SQLite antigua

El importador `scripts/migrate-sqlite-to-supabase.mjs` abre SQLite en solo lectura y funciona en modo simulación si no se pasa `--apply`. Requiere `MESA_LEGACY_DB_PATH`; antes de migrar, comprueba que es una copia de respaldo correcta de la base elegida y conserva el original sin modificar.

Simulación (no escribe en Supabase):

```sh
MESA_LEGACY_DB_PATH="/ruta/privada/mesa.sqlite" rtk node scripts/migrate-sqlite-to-supabase.mjs
```

La aplicación real requiere además `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `MESA_HOUSEHOLD_MEMBER_IDS` (UUIDs de ambos usuarios ya creados por Auth). En modo `--apply`, el importador reutiliza el hogar al que ya pertenezcan esos miembros o genera un UUID y lo guarda en Supabase; no se configura en Vercel. Para evitar secretos en historial de shell, cárgalos desde un gestor seguro o un archivo temporal con permisos restrictivos que esté fuera del repositorio; no escribas sus valores aquí. Después de verificar entorno, destino, conteos y documentos, ejecuta el mismo script añadiendo `--apply`. El script verifica PDFs por SHA-256, evita sobrescribir un workspace remoto distinto y deja la SQLite de origen intacta. No ejecutes contra Preview con datos reales ni contra producción hasta que ambos usuarios estén creados en Auth.

## CI, pruebas y estado remoto

Antes de abrir una PR:

```sh
rtk npm ci
rtk npm test
rtk npm run test:coverage
rtk npm run build
rtk git diff --check
```

El gate exige 90 % de cobertura de líneas global. Para revisar pipelines y despliegues:

```sh
rtk gh run list --repo anyulled/compra-saludable
rtk gh run view RUN_ID --repo anyulled/compra-saludable
rtk vercel ls
```

Reporta por separado el estado de build/tests, integración local SQL, migración remota y despliegue Vercel. Que el sitio esté `Ready` no prueba que OAuth, variables, migración o acceso de usuarios estén configurados.
