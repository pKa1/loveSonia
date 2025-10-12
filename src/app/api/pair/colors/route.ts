import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { broadcast } from "@/lib/sse";

export async function POST(req: Request) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || (typeof body.colorHex !== "string" && typeof body.weColorHex !== "string")) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const membership = await prisma.membership.findFirst({ where: { userId: auth.userId } });
  if (!membership) return NextResponse.json({ error: "No pair" }, { status: 400 });

  if (typeof body.colorHex === "string") {
    await prisma.membership.update({
      where: { id: membership.id },
      data: { colorHex: body.colorHex },
    });
  }
  if (typeof body.weColorHex === "string") {
    await prisma.pair.update({
      where: { id: membership.pairId },
      data: { weColorHex: body.weColorHex },
    });
  }
  // Notify clients to refresh color variables
  broadcast("pair", { action: "colors:update", pairId: membership.pairId });
  return NextResponse.json({ ok: true });
}


