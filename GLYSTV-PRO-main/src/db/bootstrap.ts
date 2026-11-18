import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { categories, playlists } from "@/db/schema";
import { seedCategories, seedChannels } from "@/db/seed-data";
import { importEntries, type ImportResult } from "@/lib/import";
import type { M3UEntry } from "@/lib/m3u";

/**
 * Schema management without external migration files.
 *
 * - `SCHEMA_SQL` is idempotent (CREATE/ALTER … IF NOT EXISTS) and brings any
 *   supported database up to the current layout.
 * - A `schema_meta` row records the schema version so future upgrades can run
 *   targeted steps.
 * - Everything runs inside one transaction guarded by an advisory lock, so
 *   several replicas starting at once cannot race each other.
 * - Destructive steps (dropping legacy tables) are NEVER run implicitly: they
 *   require `ALLOW_DESTRUCTIVE_MIGRATION=1`. Otherwise the app refuses to start
 *   and explains what to do.
 */

export const SCHEMA_VERSION = 3;
const LOCK_KEY = 7_364_219; // arbitrary constant shared by all instances

/** Thrown when the database needs a manual decision before the app can run. */
export class MigrationBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationBlockedError";
  }
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "schema_meta" (
  "key" text PRIMARY KEY,
  "value" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "server_url" text NOT NULL,
  "username" text NOT NULL,
  "password_hash" text NOT NULL,
  "name" text NOT NULL,
  "kind" varchar(16) DEFAULT 'xtream' NOT NULL,
  "role" varchar(16) DEFAULT 'member' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "users_server_username_uidx" ON "users" ("server_url","username");
CREATE TABLE IF NOT EXISTS "sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
CREATE INDEX IF NOT EXISTS "sessions_user_idx" ON "sessions" ("user_id");
CREATE TABLE IF NOT EXISTS "profiles" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "avatar" text DEFAULT '📺' NOT NULL,
  "color" text DEFAULT '#8b5cf6' NOT NULL,
  "is_kids" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "profiles_user_idx" ON "profiles" ("user_id");
CREATE TABLE IF NOT EXISTS "pairings" (
  "id" serial PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "secret_hash" text NOT NULL,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "user_id" integer REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "pairings_code_unique" UNIQUE("code")
);

CREATE TABLE IF NOT EXISTS "categories" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "icon" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
CREATE TABLE IF NOT EXISTS "playlists" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer,
  "name" text NOT NULL,
  "source_url" text,
  "kind" varchar(16) DEFAULT 'm3u' NOT NULL,
  "channel_count" integer DEFAULT 0 NOT NULL,
  "last_refreshed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "user_id" integer;
ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "kind" varchar(16) DEFAULT 'm3u' NOT NULL;
ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "last_refreshed_at" timestamp with time zone;
CREATE INDEX IF NOT EXISTS "playlists_user_idx" ON "playlists" ("user_id");

CREATE TABLE IF NOT EXISTS "epg_sources" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer,
  "name" text NOT NULL,
  "url" text NOT NULL,
  "last_fetched_at" timestamp with time zone,
  "channel_count" integer DEFAULT 0 NOT NULL,
  "program_count" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "epg_sources" ADD COLUMN IF NOT EXISTS "user_id" integer;

CREATE TABLE IF NOT EXISTS "providers" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer,
  "name" text NOT NULL,
  "server_url" text NOT NULL,
  "username" text NOT NULL,
  "password" text NOT NULL,
  "stream_format" varchar(8) DEFAULT 'm3u8' NOT NULL,
  "include_vod" boolean DEFAULT false NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "playlist_id" integer REFERENCES "playlists"("id") ON DELETE SET NULL,
  "epg_source_id" integer REFERENCES "epg_sources"("id") ON DELETE SET NULL,
  "status" text,
  "expires_at" timestamp with time zone,
  "max_connections" integer,
  "last_synced_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "user_id" integer;
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "is_primary" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "channels" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer,
  "name" text NOT NULL,
  "stream_url" text NOT NULL,
  "logo_url" text,
  "category_id" integer,
  "playlist_id" integer,
  "tvg_id" text,
  "group_title" text,
  "country" varchar(8),
  "language" varchar(16),
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "channel_number" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "channels_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE set null,
  CONSTRAINT "channels_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "playlists"("id") ON DELETE cascade
);
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "user_id" integer;
CREATE INDEX IF NOT EXISTS "channels_user_idx" ON "channels" ("user_id");
CREATE INDEX IF NOT EXISTS "channels_category_idx" ON "channels" ("category_id");
CREATE INDEX IF NOT EXISTS "channels_playlist_idx" ON "channels" ("playlist_id");
CREATE INDEX IF NOT EXISTS "channels_name_idx" ON "channels" ("name");

-- Owner foreign keys (added separately so they can be created after the users table).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'playlists_user_id_fkey') THEN
    ALTER TABLE "playlists" ADD CONSTRAINT "playlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'epg_sources_user_id_fkey') THEN
    ALTER TABLE "epg_sources" ADD CONSTRAINT "epg_sources_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'providers_user_id_fkey') THEN
    ALTER TABLE "providers" ADD CONSTRAINT "providers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'channels_user_id_fkey') THEN
    ALTER TABLE "channels" ADD CONSTRAINT "channels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "favorites" (
  "id" serial PRIMARY KEY NOT NULL,
  "profile_id" integer NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "channel_id" integer NOT NULL REFERENCES "channels"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "favorites_profile_channel_uidx" ON "favorites" ("profile_id","channel_id");
CREATE TABLE IF NOT EXISTS "watch_history" (
  "id" serial PRIMARY KEY NOT NULL,
  "profile_id" integer NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "channel_id" integer NOT NULL REFERENCES "channels"("id") ON DELETE CASCADE,
  "watched_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "watch_history_profile_idx" ON "watch_history" ("profile_id","watched_at");

CREATE TABLE IF NOT EXISTS "programs" (
  "id" serial PRIMARY KEY NOT NULL,
  "channel_id" integer NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "genre" text,
  "start_time" timestamp with time zone NOT NULL,
  "end_time" timestamp with time zone NOT NULL,
  "source" varchar(16) DEFAULT 'generated' NOT NULL,
  "epg_source_id" integer REFERENCES "epg_sources"("id") ON DELETE CASCADE,
  CONSTRAINT "programs_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE cascade
);
ALTER TABLE "programs" ADD COLUMN IF NOT EXISTS "source" varchar(16) DEFAULT 'generated' NOT NULL;
ALTER TABLE "programs" ADD COLUMN IF NOT EXISTS "epg_source_id" integer REFERENCES "epg_sources"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "programs_channel_start_idx" ON "programs" ("channel_id","start_time");

CREATE TABLE IF NOT EXISTS "recordings" (
  "id" serial PRIMARY KEY NOT NULL,
  "profile_id" integer NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "channel_id" integer REFERENCES "channels"("id") ON DELETE SET NULL,
  "channel_name" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "stream_url" text NOT NULL,
  "start_time" timestamp with time zone NOT NULL,
  "end_time" timestamp with time zone NOT NULL,
  "status" varchar(16) DEFAULT 'scheduled' NOT NULL,
  "container" varchar(8) DEFAULT 'ts' NOT NULL,
  "segment_count" integer DEFAULT 0 NOT NULL,
  "size_bytes" bigint DEFAULT 0 NOT NULL,
  "duration_seconds" integer DEFAULT 0 NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "recordings_profile_idx" ON "recordings" ("profile_id","start_time");
CREATE INDEX IF NOT EXISTS "recordings_status_idx" ON "recordings" ("status","start_time");
`;

/** Drops the pre-v3 account tables (e-mail based). Only run with explicit consent. */
const LEGACY_ACCOUNTS_DROP_SQL = `
DROP TABLE IF EXISTS "recordings" CASCADE;
DROP TABLE IF EXISTS "watch_history" CASCADE;
DROP TABLE IF EXISTS "favorites" CASCADE;
DROP TABLE IF EXISTS "profiles" CASCADE;
DROP TABLE IF EXISTS "sessions" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;
`;

/** Removes pre-v3 catalogue rows that have no owner account. Only run with explicit consent. */
const LEGACY_CATALOG_DELETE_SQL = `
DELETE FROM "channels" WHERE "user_id" IS NULL;
DELETE FROM "playlists" WHERE "user_id" IS NULL;
DELETE FROM "epg_sources" WHERE "user_id" IS NULL;
DELETE FROM "providers" WHERE "user_id" IS NULL;
`;

type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };

async function tableExists(client: Queryable, table: string): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return rows.length > 0;
}

async function columnExists(client: Queryable, table: string, column: string): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return rows.length > 0;
}

async function countRows(client: Queryable, table: string, where = ""): Promise<number> {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM "${table}" ${where}`);
  return Number(rows[0]?.n ?? 0);
}

const DESTRUCTIVE_OK = process.env.ALLOW_DESTRUCTIVE_MIGRATION === "1";

/**
 * Detects databases from previous versions that cannot be upgraded without
 * data loss and either blocks startup or (with consent) performs the cleanup.
 */
async function migrateLegacy(client: Queryable): Promise<string[]> {
  const notes: string[] = [];

  // v1/v2 → v3: users keyed by e-mail (no server_url column)
  if ((await tableExists(client, "users")) && !(await columnExists(client, "users", "server_url"))) {
    const legacyUsers = await countRows(client, "users");
    if (!DESTRUCTIVE_OK) {
      throw new MigrationBlockedError(
        `La base de datos contiene ${legacyUsers} cuenta(s) del formato antiguo (acceso por correo). ` +
          `La versión actual usa cuentas por proveedor y no puede conservarlas. ` +
          `Haz una copia de seguridad (pg_dump) y arranca una vez con ALLOW_DESTRUCTIVE_MIGRATION=1 ` +
          `para eliminar las tablas antiguas; después retira esa variable.`,
      );
    }
    await client.query(LEGACY_ACCOUNTS_DROP_SQL);
    notes.push(`eliminadas ${legacyUsers} cuenta(s) del formato antiguo (autorizado)`);
  }

  // v1/v2 favourites/history without profile column (single-user era)
  for (const table of ["favorites", "watch_history"]) {
    if ((await tableExists(client, table)) && !(await columnExists(client, table, "profile_id"))) {
      const rows = await countRows(client, table);
      if (!DESTRUCTIVE_OK) {
        throw new MigrationBlockedError(
          `La tabla ${table} tiene ${rows} fila(s) del formato antiguo sin perfil. ` +
            `Haz una copia de seguridad y arranca una vez con ALLOW_DESTRUCTIVE_MIGRATION=1.`,
        );
      }
      await client.query(`DROP TABLE "${table}" CASCADE`);
      notes.push(`tabla ${table} antigua eliminada (${rows} filas, autorizado)`);
    }
  }

  return notes;
}

/** After the schema exists: catalogue rows without owner (pre-v3) cannot be assigned to anyone. */
async function cleanLegacyCatalog(client: Queryable): Promise<string[]> {
  const orphanChannels = await countRows(client, "channels", `WHERE "user_id" IS NULL`);
  const orphanPlaylists = await countRows(client, "playlists", `WHERE "user_id" IS NULL`);
  if (orphanChannels === 0 && orphanPlaylists === 0) return [];
  if (!DESTRUCTIVE_OK) {
    throw new MigrationBlockedError(
      `Hay ${orphanChannels} canal(es) y ${orphanPlaylists} lista(s) del formato antiguo sin cuenta propietaria. ` +
        `Haz una copia de seguridad (pg_dump) y arranca una vez con ALLOW_DESTRUCTIVE_MIGRATION=1 para eliminarlos.`,
    );
  }
  await client.query(LEGACY_CATALOG_DELETE_SQL);
  return [`eliminados ${orphanChannels} canal(es) y ${orphanPlaylists} lista(s) sin propietario (autorizado)`];
}

async function ensureSchema() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialise schema work across replicas; released automatically at COMMIT/ROLLBACK.
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);

    const notes = await migrateLegacy(client);
    await client.query(SCHEMA_SQL);
    notes.push(...(await cleanLegacyCatalog(client)));

    const { rows } = await client.query(`SELECT value FROM "schema_meta" WHERE key = 'version'`);
    const previous = rows[0] ? Number(rows[0].value) : null;
    if (previous !== null && previous > SCHEMA_VERSION) {
      throw new MigrationBlockedError(
        `La base de datos está en la versión de esquema ${previous}, más reciente que la de esta aplicación (${SCHEMA_VERSION}). ` +
          `Actualiza la aplicación en lugar de usar una versión anterior.`,
      );
    }
    await client.query(
      `INSERT INTO "schema_meta" (key, value, updated_at) VALUES ('version', $1, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [String(SCHEMA_VERSION)],
    );
    await client.query("COMMIT");

    if (previous !== SCHEMA_VERSION) {
      console.log(`[db] esquema ${previous === null ? "creado" : `actualizado de v${previous}`} a v${SCHEMA_VERSION}`);
    }
    for (const note of notes) console.warn(`[db] migración: ${note}`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Inserts the built-in categories that are missing (shared by all accounts). */
export async function ensureSeedCategories(): Promise<Map<string, { id: number; name: string }>> {
  const existing = await db.select().from(categories);
  const bySlug = new Map(existing.map((c) => [c.slug, { id: c.id, name: c.name }]));
  for (const cat of seedCategories) {
    if (bySlug.has(cat.slug)) continue;
    const [inserted] = await db
      .insert(categories)
      .values({ name: cat.name, slug: cat.slug, icon: cat.icon, sortOrder: cat.sortOrder })
      .onConflictDoNothing()
      .returning();
    if (inserted) bySlug.set(inserted.slug, { id: inserted.id, name: inserted.name });
  }
  return bySlug;
}

export const DEMO_PLAYLIST_NAME = "Canales de demostración";

/**
 * Adds (or refreshes) the built-in demo channels in the given account's
 * catalogue. Existing demo channels are updated in place so favourites and
 * recordings keep working.
 */
export async function importDemoCatalog(userId: number): Promise<ImportResult> {
  const cats = await ensureSeedCategories();
  const entries: M3UEntry[] = seedChannels.map((c) => ({
    name: c.name,
    url: c.streamUrl,
    logo: c.logoUrl ?? undefined,
    group: cats.get(c.category)?.name ?? c.category,
    country: c.country ?? undefined,
    language: c.language ?? undefined,
    description: c.description,
  }));
  const [existing] = await db
    .select({ id: playlists.id })
    .from(playlists)
    .where(and(eq(playlists.userId, userId), eq(playlists.kind, "demo")))
    .limit(1);
  return importEntries(entries, {
    userId,
    name: DEMO_PLAYLIST_NAME,
    sourceUrl: null,
    kind: "demo",
    playlistId: existing?.id,
  });
}

const globalForBootstrap = globalThis as typeof globalThis & {
  __iptvBootstrapPromise?: Promise<void>;
};

/**
 * Makes sure the schema and built-in categories exist. Memoised per process so
 * it only runs real work once; failures reset the memo so the next request retries.
 */
export function bootstrap(): Promise<void> {
  if (!globalForBootstrap.__iptvBootstrapPromise) {
    globalForBootstrap.__iptvBootstrapPromise = (async () => {
      await ensureSchema();
      await ensureSeedCategories();
    })().catch((err) => {
      globalForBootstrap.__iptvBootstrapPromise = undefined;
      if (err instanceof MigrationBlockedError) {
        console.error(`\n[db] ARRANQUE BLOQUEADO: ${err.message}\n`);
      }
      throw err;
    });
  }
  return globalForBootstrap.__iptvBootstrapPromise;
}

/** Quick check used by /api/health: does the schema match this build? */
export async function schemaStatus(): Promise<{ version: number | null; expected: number }> {
  const { rows } = await pool.query(`SELECT value FROM "schema_meta" WHERE key = 'version'`).catch(() => ({ rows: [] as Array<{ value: string }> }));
  return { version: rows[0] ? Number(rows[0].value) : null, expected: SCHEMA_VERSION };
}

// `sql` is re-exported for callers that build raw maintenance statements.
export { sql };
