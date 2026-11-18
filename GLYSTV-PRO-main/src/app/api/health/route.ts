import { sql } from "drizzle-orm";
import { db } from "@/db";
import { schemaStatus } from "@/db/bootstrap";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe used by Docker, Compose and the hosting platforms. */
export async function GET() {
  const startedAt = Date.now();
  try {
    await db.execute(sql`select 1`);
    const schema = await schemaStatus();
    const ready = schema.version === schema.expected;
    return Response.json(
      {
        ok: ready,
        db: "up",
        schema: { version: schema.version, expected: schema.expected, ready },
        latencyMs: Date.now() - startedAt,
        uptimeSeconds: Math.round(process.uptime()),
      },
      { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
