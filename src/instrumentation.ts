export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const [{ bootstrap }, { startScheduler }, { startMaintenance }] = await Promise.all([
      import("@/db/bootstrap"),
      import("@/lib/recorder"),
      import("@/lib/maintenance"),
    ]);
    // Prepare the schema eagerly so the first request (and the health check) are instant.
    // Errors are logged here and surfaced again by whichever request hits the database first.
    bootstrap().catch((err: unknown) => {
      console.error("[db] fallo al preparar la base de datos en el arranque:", err instanceof Error ? err.message : err);
    });
    startScheduler();
    startMaintenance();
  }
}
