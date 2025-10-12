import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";

export async function GET() {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ user: null });
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      id: true,
      name: true,
      email: true,
      pairMemberships: {
        select: { id: true, pairId: true, role: true, colorHex: true },
      },
    },
  });
  return NextResponse.json({ user });
}


