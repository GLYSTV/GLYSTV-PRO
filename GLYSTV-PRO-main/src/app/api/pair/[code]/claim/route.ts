import { NextRequest, NextResponse } from "next/server";
import { bootstrap } from "@/db/bootstrap";
import { claimPairing } from "@/lib/account";
import { startSessionFor } from "@/lib/auth";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Polled by the TV. Once the phone has sent valid credentials, the TV gets its session here. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  await bootstrap();
  // The TV polls every 3 s → ~200 per 10 min per code; allow headroom but stop brute force.
  const limit = rateLimit(`pair-claim:${await clientIp()}`, 600, 10 * 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);
  const { code } = await params;
  let secret = "";
  try {
    const body = (await req.json()) as { secret?: unknown };
    secret = typeof body.secret === "string" ? body.secret : "";
  } catch {
    // no body
  }
  if (!secret) return NextResponse.json({ status: "invalid" }, { status: 400 });

  const result = await claimPairing(code, secret);
  if (result.status !== "ok") return NextResponse.json({ status: result.status });

  const redirect = await startSessionFor(result.userId);
  return NextResponse.json({ status: "ok", redirect });
}
