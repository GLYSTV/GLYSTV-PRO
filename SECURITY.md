# Política de seguridad

## Versiones con soporte

Solo la rama `main` recibe correcciones de seguridad.

## Cómo reportar una vulnerabilidad

No abras un *issue* público. Usa **Security → Report a vulnerability** en GitHub (aviso privado) e incluye:

- descripción del problema y su impacto,
- pasos para reproducirlo,
- versión/commit afectado.

Se intentará responder en un plazo de 72 horas.

## Recomendaciones de despliegue

- Sirve la aplicación **solo por HTTPS** (el `docker-compose.yml` incluido lo hace con Caddy).
- Define `APP_SECRET` (cadena larga y aleatoria) para cifrar las contraseñas de los proveedores en la base de
  datos, y **no lo cambies** después (los secretos dejarían de poder descifrarse).
- Usa una `POSTGRES_PASSWORD` fuerte y no expongas el puerto 5432 a internet.
- Haz copias de seguridad periódicas de la base de datos y del volumen de grabaciones.
- Mantén las dependencias al día (Dependabot abre *pull requests* automáticamente).
- La aplicación bloquea por defecto las URLs hacia redes privadas (protección SSRF). Si tu proveedor está en
  tu red local, actívalo conscientemente con `ALLOW_PRIVATE_URLS=1`.
