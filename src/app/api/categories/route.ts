import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { getCurrentPairForUser } from "@/lib/pair";

export async function GET() {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ categories: [] });
  const ctx = await getCurrentPairForUser(auth.userId);
  if (!ctx?.pair) return NextResponse.json({ categories: [] });
  const categories = await prisma.eventCategory.findMany({ where: { pairId: ctx.pair.id }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ categories });
}

export async function POST(req: Request) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await getCurrentPairForUser(auth.userId);
  if (!ctx?.pair) return NextResponse.json({ error: "No pair" }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.name !== "string" || typeof body.color !== "string") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const name = body.name.trim();
  const color = body.color.trim();
  if (!name || !/^#([0-9a-fA-F]{6})$/.test(color)) return NextResponse.json({ error: "Invalid name or color" }, { status: 400 });
  try {
    const cat = await prisma.eventCategory.create({ data: { pairId: ctx.pair.id, name, color } });
    return NextResponse.json({ category: cat });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Category name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}


