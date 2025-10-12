import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { getCurrentPairForUser } from "@/lib/pair";
import { broadcast } from "@/lib/sse";

export async function GET() {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ quietHours: null });
  const ctx = await getCurrentPairForUser(auth.userId);
  if (!ctx?.pair) return NextResponse.json({ quietHours: null });
  const qh = await prisma.quietHours.findUnique({ where: { pairId: ctx.pair.id } });
  return NextResponse.json({ quietHours: qh });
}

export async function POST(req: Request) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await getCurrentPairForUser(auth.userId);
  if (!ctx?.pair) return NextResponse.json({ error: "No pair" }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.startMinute !== "number" || typeof body.endMinute !== "number") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const data = { startMinute: clampMinute(body.startMinute), endMinute: clampMinute(body.endMinute), pairId: ctx.pair.id };
  const qh = await prisma.quietHours.upsert({ where: { pairId: ctx.pair.id }, update: data, create: data });
  broadcast("availability", { action: "update" });
  return NextResponse.json({ quietHours: qh });
}

function clampMinute(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.min(1439, Math.max(0, Math.floor(n)));
}


