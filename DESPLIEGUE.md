# Desplegar GLYSTV-PRO

GLYSTV-PRO es una aplicación **Next.js + PostgreSQL** que además:

- mantiene un **proceso en segundo plano** (el grabador DVR),
- escribe las grabaciones en **disco persistente**,
- reenvía vídeo a través de su **proxy HLS** (respuestas largas).

Por eso necesita un **servidor Node.js siempre encendido** (contenedor o VPS), **no** una plataforma
*serverless* como Vercel o Netlify (allí no hay disco, ni procesos de fondo, y las peticiones se cortan a
los pocos segundos).

## ¿Qué opción elegir?

| Opción | Para quién | Coste aprox. | Grabaciones | Dificultad |
| --- | --- | --- | --- | --- |
| **VPS + Docker Compose** (Hetzner, DigitalOcean, Vultr, Contabo, OVH) ⭐ recomendada | Uso real, varias TV, grabaciones largas | 4–8 €/mes | ✅ ilimitadas (según disco) | Media (10 min con la guía de abajo) |
| **Railway** | Quien no quiera administrar nada | ~5–10 $/mes según uso | ✅ con un *volume* | Baja |
| **Render** | Igual que Railway | 7 $/mes (web) + 7 $/mes (disco) + Postgres | ✅ con *disk* (plan de pago) | Baja |
| **Coolify / Dokploy** sobre un VPS | Quien quiera "su propio Railway" | precio del VPS | ✅ | Media |
| Vercel / Netlify | ❌ no recomendado | — | ❌ | — |

**Mi recomendación:** un VPS pequeño (2 vCPU, 4 GB RAM, 40 GB+ de disco) con **Docker Compose**. Es lo más
barato, el tráfico de vídeo no se factura aparte y las grabaciones solo dependen del tamaño del disco.
Si prefieres cero mantenimiento, **Railway** es la alternativa más sencilla.

> El proxy de vídeo solo se usa cuando el navegador no puede reproducir la señal directamente (CORS). Con la
> mayoría de proveedores Xtream el vídeo va directo del proveedor al dispositivo, así que el servidor apenas
> consume ancho de banda salvo cuando graba.

---

## Opción A · VPS con Docker Compose (recomendada)

1. **Crea el VPS** con Ubuntu 22.04/24.04 y apunta un dominio (p. ej. `tv.tudominio.com`) a su IP
   (registro DNS tipo A). El dominio es necesario para HTTPS, y HTTPS es necesario para la PWA y el
   emparejamiento por QR desde el móvil.

2. **Instala Docker** (una sola línea):

   ```bash
   curl -fsSL https://get.docker.com | sh
   ```

3. **Clona el repositorio** desde GitHub y entra en la carpeta:

   ```bash
   git clone https://github.com/TU_USUARIO/glystv-pro.git
   cd glystv-pro
   ```

   > Alternativa sin compilar en el VPS: usa la imagen que publica GitHub Actions. Añade a `.env`
   > `IMAGE=ghcr.io/<usuario>/<repositorio>:latest` (el nombre exacto aparece en la pestaña *Packages* del
   > repositorio) y arranca con `docker compose pull && docker compose up -d`. Si el repositorio es privado,
   > antes haz `echo TU_TOKEN | docker login ghcr.io -u TU_USUARIO --password-stdin` con un token `read:packages`.

4. **Configura las variables** añadiendo estas líneas al archivo `.env`:

   ```env
   POSTGRES_PASSWORD=una-clave-larga-y-segura
   APP_SECRET=pega-aqui-el-resultado-de: openssl rand -hex 32
   DOMAIN=tv.tudominio.com
   ```

5. **Arranca** todo (app + PostgreSQL + Caddy con HTTPS automático):

   ```bash
   docker compose up -d --build
   ```

6. Abre `https://tv.tudominio.com`. La base de datos se crea sola en el primer arranque.

Comandos útiles:

```bash
docker compose logs -f app          # ver registros
git pull && docker compose up -d --build              # actualizar tras cambiar el código (modo build)
docker compose pull && docker compose up -d           # actualizar si usas la imagen de GHCR
docker compose exec db pg_dump -U postgres app_db > copia.sql   # copia de seguridad de la BD
docker run --rm -v glystv-pro_recordings:/r -v $PWD:/b alpine tar czf /b/grabaciones.tgz -C /r .  # copia de grabaciones
```

Sin dominio (solo pruebas en red local): deja `DOMAIN=localhost` o usa la IP; Caddy servirá un certificado
local y el navegador mostrará un aviso. Para una TV en la misma red puedes abrir `http://IP-DEL-SERVIDOR`
si cambias el Caddyfile a `http://{$DOMAIN}` (sin HTTPS no funcionará la instalación como PWA).

---

## Opción B · Railway

1. Con el proyecto ya en GitHub, en Railway: **New Project → Deploy from GitHub repo**. Detecta el `Dockerfile` automáticamente.
3. Añade **PostgreSQL** (`+ New → Database → PostgreSQL`).
4. En el servicio de la app, pestaña **Variables**:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `RECORDINGS_DIR` = `/app/data/recordings`
5. Pestaña **Volumes**: crea un volumen montado en `/app/data/recordings` (ahí se guardan las grabaciones).
6. **Settings → Networking → Generate Domain** (o añade tu dominio). Railway pone el HTTPS.

## Opción C · Render

1. **New → Web Service**, conecta el repositorio de GitHub, *Runtime: Docker*.
2. **New → PostgreSQL** y copia su *Internal Database URL* en la variable `DATABASE_URL` del servicio web.
3. En el servicio web añade un **Disk** montado en `/app/data/recordings` (los discos requieren plan de pago).
4. Variable `RECORDINGS_DIR=/app/data/recordings`. Render asigna dominio y HTTPS.

## Opción D · Coolify o Dokploy (panel propio en tu VPS)

Instala el panel en el VPS, crea un recurso **Docker Compose** apuntando a este repositorio y define las
variables `POSTGRES_PASSWORD` y `DOMAIN`. El panel se encarga de los certificados.

---

## Integración continua (GitHub Actions)

El repositorio incluye dos flujos en `.github/workflows/`:

- **`ci.yml`**: en cada *push* o *pull request* instala dependencias desde `package.json` con `npm install`
  (el repositorio no incluye `package-lock.json`), ejecuta ESLint, TypeScript, el build de producción y una
  comprobación de arranque contra `/api/health` con un PostgreSQL temporal.
- **`docker.yml`**: en cada *push* a `main` (y en etiquetas `v*`) construye la imagen para `amd64` y `arm64`
  y la publica en **GitHub Container Registry** como `ghcr.io/TU_USUARIO/glystv-pro`. No requiere
  configurar secretos: usa el `GITHUB_TOKEN` automático. La primera vez, el paquete aparece como privado en
  *Packages*; puedes hacerlo público desde la configuración del paquete.

## Variables de entorno

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Cadena de conexión PostgreSQL. |
| `APP_SECRET` | recomendada | Clave (p. ej. `openssl rand -hex 32`) con la que se cifran las contraseñas de proveedores en la BD. No la cambies una vez en uso. |
| `RECORDINGS_DIR` | opcional | Carpeta de grabaciones (por defecto `./data/recordings`). Debe estar en un volumen persistente. |
| `RECORDING_RETENTION_DAYS` | opcional | Días que se conservan las grabaciones terminadas (30; `0` = para siempre). |
| `EPG_REFRESH_HOURS` | opcional | Horas entre actualizaciones automáticas de las guías XMLTV (12; `0` = desactivar). |
| `PROVIDER_SYNC_HOURS` | opcional | Horas entre sincronizaciones automáticas de los catálogos Xtream (24; `0` = desactivar). |
| `ALLOW_PRIVATE_URLS` | opcional | `1` para permitir proveedores/listas en IPs de red local (por defecto bloqueadas: protección SSRF). |
| `ALLOW_DESTRUCTIVE_MIGRATION` | solo en emergencias | `1` autoriza, por un único arranque, eliminar tablas de formatos antiguos que no se pueden conservar. Ver «Actualizaciones». |
| `PORT` | opcional | Puerto HTTP (3000). |

Tareas automáticas incluidas (sin cron externo): limpieza de sesiones y códigos QR caducados, borrado de
programación antigua, retención de grabaciones, refresco de EPG y resincronización de proveedores.

No hace falta ejecutar migraciones: la aplicación crea y actualiza las tablas al arrancar, dentro de una
transacción y con un bloqueo que impide que varias réplicas lo hagan a la vez.

## Actualizaciones y copias de seguridad

1. **Antes de actualizar** haz copia de la base de datos y de las grabaciones:

   ```bash
   docker compose exec db pg_dump -U postgres app_db | gzip > backup-$(date +%F).sql.gz
   ```

2. Actualiza (`git pull && docker compose up -d --build` o `docker compose pull && docker compose up -d`).
3. Comprueba `https://tu-dominio/api/health`: debe responder `"ok": true` con `schema.ready: true`.

Si una versión nueva **no puede conservar** datos antiguos (por ejemplo, cuentas de un formato anterior), la
aplicación **no arranca**: `/api/health` responde `503`, la web muestra «GLYSTV-PRO no puede arrancar» y en
`docker compose logs app` aparece `ARRANQUE BLOQUEADO` con la explicación. En ese caso, y solo tras la copia de
seguridad, arranca **una vez** con `ALLOW_DESTRUCTIVE_MIGRATION=1`, comprueba que todo funciona y retira la
variable. Nunca se borra nada sin esta autorización explícita.

Para restaurar una copia: `gunzip -c backup.sql.gz | docker compose exec -T db psql -U postgres app_db`.

## Si usas otro proxy inverso (Nginx, Traefik…)

Reenvía las cabeceras `Host`, `X-Forwarded-Proto` y `X-Forwarded-Host` (las *Server Actions* de Next.js
comprueban el origen y las cookies seguras dependen de `X-Forwarded-Proto: https`). Desactiva el búfer de
respuesta (`proxy_buffering off;` en Nginx) para que el vídeo del proxy y las descargas fluyan.

---

## Instalar en la TV (APK)

GLYSTV-PRO es una **PWA**, así que hay varias formas de llevarla a una Android TV / Fire TV:

1. **Navegador de TV** (TV Bro, Puffin TV, Silk): abre `https://tu-dominio`, usa el QR para entrar desde el
   móvil y añádela a favoritos. Es lo más rápido.
2. **APK propia tipo WebView**: una app Android mínima con un `WebView` a pantalla completa que cargue
   `https://tu-dominio` (con `javaScriptEnabled`, `domStorageEnabled`, `mediaPlaybackRequiresUserGesture=false`
   y aceleración por hardware). Funciona con el mando porque la app ya incluye navegación espacial ("Modo TV").
   Herramientas sin programar: *WebIntoApp*, *Median.co*, *AppsGeyser*; o un proyecto de Android Studio con
   la plantilla *Empty Views Activity* + `WebView`.
3. **PWABuilder** (`pwabuilder.com`): genera un paquete Android (TWA) a partir de la URL. Ideal para móviles y
   tabletas; en Android TV requiere un navegador Chromium instalado, por lo que la opción 2 suele ser más fiable.

En todos los casos la app necesita **HTTPS** y conexión a internet; las grabaciones se hacen en el servidor,
no en la TV.
