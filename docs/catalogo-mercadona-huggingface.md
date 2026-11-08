# Sincronización del catálogo de Mercadona

La aplicación importa el catálogo público de [datania/mercadona-catalog](https://huggingface.co/datasets/datania/mercadona-catalog), que se actualiza semanalmente. GitHub Actions llama al endpoint cada martes a las 08:17 UTC, después de la actualización prevista del lunes.

La importación descarga los ficheros de categorías, valida que la revisión y el número de productos sean plausibles, y guarda los productos por revisión en Supabase. Solo activa la revisión nueva cuando se han guardado todos los lotes. Si el proceso falla, la revisión activa anterior sigue disponible. Cuando Hugging Face conserva la misma revisión, la llamada termina sin volver a importar.

La búsqueda de alternativas de producto usa primero el catálogo semanal y conserva la consulta en vivo a la API de Mercadona como alternativa. El dataset ofrece nombres, precio, formato, imagen y otros datos del catálogo. No aporta valores numéricos completos de macronutrientes; el importador no los inventa.

## Variables privadas

Configura estos valores en Production:

- `SUPABASE_SERVICE_ROLE_KEY`: clave de servidor de Supabase para guardar y activar revisiones. Nunca debe llevar el prefijo `NEXT_PUBLIC_`.
- `ENDPOINT_OAUTH`: token que el endpoint valida para las llamadas externas con `POST`.

Configura también `ENDPOINT_OAUTH` como secreto del repositorio GitHub `anyulled/compra-saludable`; el workflow programado lo envía al endpoint. No hace falta configurar ningún cron en Vercel.

## Endpoint autenticado

`POST /api/cron/mercadona-catalog` acepta una petición sin cuerpo y exige el token externo:

```sh
curl --fail-with-body --request POST \
  --header "Authorization: Bearer $ENDPOINT_OAUTH" \
  "$MESA_BASE_URL/api/cron/mercadona-catalog"
```

El workflow semanal y las llamadas externas usan `POST` con `ENDPOINT_OAUTH`. La respuesta indica `updated` o `unchanged`, revisión de Hugging Face, cantidad de productos y hora de actualización. Las peticiones sin token válido reciben HTTP 401.

La hora del workflow es UTC: a las 09:17 en invierno peninsular y a las 10:17 durante el horario de verano. GitHub puede retrasar los eventos programados con carga alta; el horario suele ejecutarse después del minuto 17. En este repositorio público, GitHub puede desactivar workflows programados si no hay actividad del repositorio durante 60 días.

## Migración y activación

Antes de importar, aplica la migración `202611080002_mercadona_huggingface_catalog.sql` mediante el flujo habitual de Supabase. Después de desplegar la aplicación y configurar las dos variables privadas y el secreto de GitHub, ejecuta el workflow manualmente para comprobar la primera carga. Las invocaciones programadas se ejecutarán desde la rama por defecto; también puedes usar `workflow_dispatch` para forzar una sincronización.
