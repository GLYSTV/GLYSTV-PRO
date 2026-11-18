import { promises as fs } from "node:fs";
import { and, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { bootstrap } from "@/db/bootstrap";
import { epgSources, pairings, programs, providers, recordings, sessions } from "@/db/schema";
import { syncProvider } from "@/lib/providers";
import { deleteRecordingFiles, recordingDir } from "@/lib/recorder";
import { importEpgSource } from "@/lib/xmltv";

/** Days to keep finished recordings (0 = keep forever). */
const RECORDING_RETENTION_DAYS = Number(process.env.RECORDING_RETENTION_DAYS ?? 30);
/** Hours between automatic EPG refreshes. */
const EPG_REFRESH_HOURS = Number(process.env.EPG_REFRESH_HOURS ?? 12);
/** Hours between automatic provider catalogue syncs (0 = disabled). */
const PROVIDER_SYNC_HOURS = Number(process.env.PROVIDER_SYNC_HOURS ?? 24);

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

interface Registry {
  timer?: ReturnType<typeof setInterval>;
  running: boolean;
  lastRun?: Date;
}
const g = globalThis as typeof globalThis & { __glystvMaintenance?: Registry };
function registry(): Registry {
  if (!g.__glystvMaintenance) g.__glystvMaintenance = { running: false };
  return g.__glystvMaintenance;
}

export function startMaintenance() {
  const r = registry();
  if (r.timer) return;
  r.timer = setInterval(() => void runMaintenance(), 15 * 60_000);
  // First pass shortly after boot so a fresh deploy picks up stale data quickly.
  setTimeout(() => void runMaintenance(), 60_000);
}

export async function runMaintenance() {
  const r = registry();
  if (r.running) return;
  r.running = true;
  try {
    await bootstrap();
    const now = new Date();

    // Expired sessions and pairing codes
    await db.delete(sessions).where(lt(sessions.expiresAt, now));
    await db.delete(pairings).where(lt(pairings.expiresAt, new Date(now.getTime() - HOUR)));

    // Old programme data (keep 2 days of history for the guide)
    await db.delete(programs).where(lt(programs.endTime, new Date(now.getTime() - 2 * DAY)));

    // Recording retention + orphaned folders
    if (RECORDING_RETENTION_DAYS > 0) {
      const cutoff = new Date(now.getTime() - RECORDING_RETENTION_DAYS * DAY);
      const old = await db
        .select({ id: recordings.id })
        .from(recordings)
        .where(
          and(
            inArray(recordings.status, ["completed", "failed", "cancelled"]),
            lt(recordings.endTime, cutoff),
          ),
        );
      for (const rec of old) {
        await deleteRecordingFiles(rec.id);
        await db.delete(recordings).where(eq(recordings.id, rec.id));
      }
    }
    await removeOrphanedRecordingFolders();

    // Periodic EPG refresh
    if (EPG_REFRESH_HOURS > 0) {
      const stale = await db
        .select({ id: epgSources.id })
        .from(epgSources)
        .where(
          or(
            sql`${epgSources.lastFetchedAt} is null`,
            lt(epgSources.lastFetchedAt, new Date(now.getTime() - EPG_REFRESH_HOURS * HOUR)),
          ),
        )
        .limit(5);
      for (const source of stale) {
        try {
          await importEpgSource(source.id);
        } catch (err) {
          console.warn(`[maintenance] EPG ${source.id} refresh failed:`, err instanceof Error ? err.message : err);
        }
      }
    }

    // Periodic provider catalogue sync
    if (PROVIDER_SYNC_HOURS > 0) {
      const stale = await db
        .select()
        .from(providers)
        .where(
          and(
            isNotNull(providers.userId),
            or(
              sql`${providers.lastSyncedAt} is null`,
              lt(providers.lastSyncedAt, new Date(now.getTime() - PROVIDER_SYNC_HOURS * HOUR)),
            ),
          ),
        )
        .limit(3);
      for (const provider of stale) {
        try {
          await syncProvider(provider);
        } catch (err) {
          console.warn(`[maintenance] provider ${provider.id} sync failed:`, err instanceof Error ? err.message : err);
        }
      }
    }

    r.lastRun = now;
  } catch (err) {
    console.error("[maintenance] run failed", err);
  } finally {
    r.running = false;
  }
}

async function removeOrphanedRecordingFolders() {
  const root = recordingDir(0).replace(/[\\/]0$/, "");
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch {
    return;
  }
  const ids = entries.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return;
  const existing = await db.select({ id: recordings.id }).from(recordings).where(inArray(recordings.id, ids));
  const keep = new Set(existing.map((r) => r.id));
  for (const id of ids) {
    if (!keep.has(id)) await deleteRecordingFiles(id);
  }
}

export function maintenanceStatus() {
  const r = registry();
  return { scheduled: Boolean(r.timer), running: r.running, lastRun: r.lastRun?.toISOString() ?? null };
}
