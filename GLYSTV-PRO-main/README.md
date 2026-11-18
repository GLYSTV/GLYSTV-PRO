# GLYSTV-PRO · Reproductor IPTV

Reproductor IPTV completo para navegador, móvil y Smart TV, construido con **Next.js 16**, **PostgreSQL** y **Drizzle ORM**.

[![CI](../../actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)

## Funciones

| Área | Qué incluye |
| --- | --- |
| **Acceso** | Inicio de sesión con **URL del servidor + usuario + contraseña** (API Xtream Codes / XUI). Cuenta demo con canales públicos de ejemplo. |
| **Emparejamiento QR** | La TV muestra un código QR; escribes los datos en el móvil y la TV inicia sesión sola. |
| **Perfiles** | Hasta 6 perfiles por cuenta, con avatar, color y **perfil infantil** (solo categoría Infantil). |
| **Catálogo** | Importación automática del proveedor, listas **M3U/M3U8** por URL o pegadas, otros proveedores Xtream, exportación a `.m3u`. |
| **Reproductor** | HLS (hls.js), selector de calidad, pantalla completa, **Picture-in-Picture**, zapping con teclado/mando, marcado directo de número de canal, proxy HLS automático ante bloqueos CORS. |
| **Guía TV (EPG)** | Parrilla con línea de tiempo en vivo; importa guías **XMLTV** (`.xml` / `.xml.gz`) y empareja por `tvg-id` o nombre. |
| **Grabaciones (DVR)** | Grabación **en el servidor** (sigue aunque cierres la app): grabar ahora, hasta el final del programa o programar desde la guía; ver, descargar y gestionar. |
| **Smart TV** | **Modo TV**: navegación espacial con el mando, tecla Atrás, teclas multimedia y Canal ±. |
| **PWA** | Instalable en móvil/escritorio, iconos, pantalla sin conexión. |

## Requisitos

- Node.js 22+
- PostgreSQL 14+ (o Docker)

## Inicio rápido (desarrollo)

```bash
git clone https://github.com/TU_USUARIO/glystv-pro.git
cd glystv-pro
cp .env.example .env          # ajusta DATABASE_URL
npm install --no-audit --no-fund
npm run dev                   # http://localhost:3000
```

Las tablas se crean y actualizan automáticamente al arrancar (con bloqueo entre réplicas y sin pasos
destructivos implícitos); no hay que ejecutar migraciones.
Pulsa **"Probar con la cuenta demo"** para entrar sin proveedor.

## Despliegue en producción

La app necesita un servidor Node **siempre encendido** y **disco persistente** (grabaciones), por lo que
**no** es apta para Vercel/Netlify. Opción recomendada: un VPS con Docker Compose (app + PostgreSQL + HTTPS
automático con Caddy):

```bash
cp .env.example .env          # define POSTGRES_PASSWORD y DOMAIN
docker compose up -d --build
```

También hay instrucciones para **Railway**, **Render** y **Coolify/Dokploy** en [`DESPLIEGUE.md`](DESPLIEGUE.md).

La integración continua instala dependencias con `npm install` (este proyecto no incluye `package-lock.json`) y verifica lint, tipos, build y salud. Cada *push* a `main` publica además la imagen Docker en GitHub Container Registry:
`ghcr.io/TU_USUARIO/glystv-pro:latest` (ver `.github/workflows/docker.yml`).

## Variables de entorno

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Cadena de conexión PostgreSQL. |
| `APP_SECRET` | recomendada | Cifra las contraseñas de proveedores en la BD (`openssl rand -hex 32`). |
| `RECORDINGS_DIR` | — | Carpeta de grabaciones (por defecto `./data/recordings`). |
| `RECORDING_RETENTION_DAYS`, `EPG_REFRESH_HOURS`, `PROVIDER_SYNC_HOURS` | — | Mantenimiento automático (30 días / 12 h / 24 h). |
| `ALLOW_PRIVATE_URLS` | — | `1` para permitir proveedores en la red local. |
| `POSTGRES_PASSWORD`, `DOMAIN` | solo Docker Compose | Contraseña de la BD y dominio público para HTTPS. |

Consulta `.env.example` para ver todas las opciones comentadas.

## Seguridad

- Sesiones con cookies `httpOnly` y contraseñas de cuenta con *scrypt*; contraseñas de proveedor cifradas con AES-256-GCM (`APP_SECRET`).
- Límite de intentos en inicio de sesión y emparejamiento QR; códigos QR de un solo uso y 10 minutos de validez.
- Protección **SSRF**: toda URL introducida por el usuario (streams, listas, XMLTV, paneles Xtream) se valida y se siguen las redirecciones manualmente, bloqueando redes privadas.
- Cabeceras de seguridad (`nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`).
- Ver [`SECURITY.md`](SECURITY.md) para reportar vulnerabilidades.

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Build y servidor de producción |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm run check` | Todo lo anterior + arranque y comprobación de salud (igual que la CI) |

## Estructura

```
src/
├─ app/            rutas (App Router): (auth) login y QR · (account) perfiles · (app) aplicación · api/
├─ components/     reproductor, guía EPG, gestores de fuentes, barra lateral, modo TV…
├─ lib/            auth, cuentas/emparejamiento, Xtream, XMLTV, importación M3U, grabador DVR
└─ db/             esquema Drizzle, bootstrap (migración automática) y datos demo
```

## Aviso

GLYSTV-PRO es únicamente un reproductor: no incluye ni distribuye canales. Los canales de demostración son
señales públicas emitidas gratuitamente por sus propias cadenas. Usa solo contenido al que tengas derecho de acceso.

## Contribuir

Lee [`CONTRIBUTING.md`](CONTRIBUTING.md). Las plantillas de *issues* y *pull requests* están en `.github/`.

## Licencia

MIT
