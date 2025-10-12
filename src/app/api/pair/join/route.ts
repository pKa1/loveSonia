import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";

export async function POST(req: Request) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.code !== "string") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const code = body.code.trim().toUpperCase();

  const pair = await prisma.pair.findUnique({ where: { code } });
  if (!pair) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // if already member, return
  const existing = await prisma.membership.findFirst({
    where: { userId: auth.userId, pairId: pair.id },
  });
  if (existing) return NextResponse.json({ pair });

  // second member joins with partner role and default mint color
  await prisma.membership.create({
    data: {
      userId: auth.userId,
      pairId: pair.id,
      role: "partner",
      colorHex: "#7cd4b8",
    },
  });
  return NextResponse.json({ pair });
}


