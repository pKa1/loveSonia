import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";

function generateCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export async function POST() {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // create or reuse a pair if user already in one
  const existing = await prisma.membership.findFirst({ where: { userId: auth.userId } });
  if (existing) {
    const pair = await prisma.pair.findUnique({ where: { id: existing.pairId } });
    return NextResponse.json({ pair });
  }

  const pair = await prisma.pair.create({
    data: { code: generateCode() },
  });
  // creator becomes first member; default color and role
  await prisma.membership.create({
    data: {
      userId: auth.userId,
      pairId: pair.id,
      role: "self",
      colorHex: "#9b87f5", // lilac default
    },
  });
  return NextResponse.json({ pair });
}


