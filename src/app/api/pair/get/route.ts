import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";

export async function GET() {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ pair: null });

  const membership = await prisma.membership.findFirst({
    where: { userId: auth.userId },
  });
  if (!membership) return NextResponse.json({ pair: null });

  const pair = await prisma.pair.findUnique({
    where: { id: membership.pairId },
    include: {
      memberships: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });
  return NextResponse.json({ pair });
}


