import { prisma } from "@/lib/prisma";

export async function getCurrentPairForUser(userId: string) {
  const membership = await prisma.membership.findFirst({ where: { userId } });
  if (!membership) return null;
  const pair = await prisma.pair.findUnique({ where: { id: membership.pairId } });
  return { pair, membership } as const;
}


