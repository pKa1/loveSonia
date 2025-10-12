import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";

export async function POST(req: Request) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.endpoint !== "string" || !body.keys || typeof body.keys.p256dh !== "string" || typeof body.keys.auth !== "string") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const sub = await prisma.pushSubscription.upsert({
    where: { endpoint: body.endpoint },
    update: { p256dh: body.keys.p256dh, auth: body.keys.auth, userId: auth.userId },
    create: { endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth, userId: auth.userId },
  });
  return NextResponse.json({ ok: true, id: sub.id });
}


