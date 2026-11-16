# Contribuir a GLYSTV-PRO

¡Gracias por tu interés! Estas son las pautas básicas.

## Entorno de desarrollo

```bash
cp .env.example .env         # apunta DATABASE_URL a tu PostgreSQL
npm install
npm run dev
```

## Antes de abrir un pull request

```bash
npm run check        # lint + tipos + build + arranque con comprobación de salud
```

La integración continua ejecuta exactamente estos pasos con un PostgreSQL temporal.

## Convenciones

- TypeScript estricto; componentes de servidor por defecto, `"use client"` solo cuando hace falta.
- Interfaz en **español**; comentarios de código en inglés.
- Cambios en la base de datos: actualiza `src/db/schema.ts` **y** el SQL idempotente de `src/db/bootstrap.ts`,
  e incrementa `SCHEMA_VERSION` (la app migra sola al arrancar; no hay archivos de migración). Nunca añadas
  `DROP`/`DELETE` al SQL automático: los pasos destructivos van en `migrateLegacy` protegidos por
  `ALLOW_DESTRUCTIVE_MIGRATION`.
- Toda petición a URLs introducidas por el usuario debe pasar por `safeFetch` / `checkPublicUrl`.
- Cualquier ruta nueva de la API debe comprobar la sesión con `apiUser()` / `apiProfile()` y limitar los datos
  al `userId` de la cuenta.

## Commits y ramas

- Ramas: `feature/nombre-corto`, `fix/nombre-corto`.
- Mensajes de commit en imperativo: «Añade…», «Corrige…».
