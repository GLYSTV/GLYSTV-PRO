# Modificaciones de preparación para GitHub — GLYSTV-PRO

Se conservaron las carpetas, pantallas, API, reproductor, módulos IPTV, base de datos y documentación del proyecto original.

## Cambios realizados

1. `package.json`: se cambió el nombre interno de la plantilla a `glystv-pro`.
2. `.github/workflows/ci.yml`: se eliminó la dependencia de `package-lock.json` en `npm ci` y en la caché automática de `setup-node`. Ahora instala con `npm install --no-audit --no-fund` y mantiene las comprobaciones de ESLint, TypeScript, build y `/api/health`.
3. `Dockerfile`: la etapa de dependencias instala desde `package.json` con `npm install --no-audit --no-fund`, sin requerir un lockfile ausente.
4. `README.md` y `DESPLIEGUE.md`: se actualizó la explicación de instalación y CI.
5. `.nvmrc`: se fijó Node.js 22 como versión recomendada para desarrollo local.

## Archivos que se conservaron

Se mantuvieron los módulos existentes de autenticación, perfiles, listas M3U/M3U8, Xtream, guía XMLTV/EPG, favoritos, historial, reproductor HLS, proxy, grabaciones DVR, PostgreSQL, PWA y navegación para TV.

## Verificación y limitaciones

- JSON de `package.json`: validado.
- Sintaxis YAML de los workflows y `docker-compose.yml`: validada.
- No se pudo ejecutar instalación de dependencias ni build en este entorno porque el acceso al registro npm agotó el tiempo de espera.
- Por esa razón, el proyecto queda preparado para que GitHub Actions haga la instalación y las pruebas, pero no se declara todavía un build exitoso.

## Para publicar

Sube el contenido de este ZIP a la raíz del repositorio GitHub, confirma que `.github/workflows/ci.yml` y `.github/workflows/docker.yml` estén presentes y revisa la pestaña **Actions** después del primer push. Para producción usa un VPS con Docker Compose y configura las variables de `.env` siguiendo `DESPLIEGUE.md`.
