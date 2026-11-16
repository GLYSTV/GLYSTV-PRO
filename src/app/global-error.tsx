"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Last-resort error boundary. Shown when the root layout itself fails, e.g.
 * when the database is unreachable or a migration needs manual confirmation.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, background: "#0b0d14", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <div style={{ maxWidth: 560, textAlign: "center" }}>
            <div
              style={{
                margin: "0 auto",
                width: 64,
                height: 64,
                borderRadius: 16,
                background: "rgba(239,68,68,0.15)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <AlertTriangle size={30} color="#f87171" />
            </div>
            <h1 style={{ fontSize: 24, marginTop: 20 }}>GLYSTV-PRO no puede arrancar</h1>
            <p style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.6 }}>
              La aplicación no pudo conectar con la base de datos o la base de datos necesita una acción manual.
              Revisa los registros del servidor (<code>docker compose logs app</code>): allí se indica exactamente
              qué hacer.
            </p>
            {error.digest && <p style={{ color: "#64748b", fontSize: 12 }}>Referencia: {error.digest}</p>}
            <button
              type="button"
              onClick={() => reset()}
              style={{
                marginTop: 20,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 20px",
                borderRadius: 999,
                border: 0,
                background: "#8b5cf6",
                color: "white",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <RefreshCw size={16} /> Reintentar
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
