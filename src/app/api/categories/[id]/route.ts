import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { getCurrentPairForUser } from "@/lib/pair";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const pair = await getCurrentPairForUser(auth.userId);
  if (!pair?.pair) return NextResponse.json({ error: "No pair" }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const data: any = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.color === "string" && /^#([0-9a-fA-F]{6})$/.test(body.color)) data.color = body.color.trim();
  // Ensure category belongs to current pair BEFORE updating
  const existing = await prisma.eventCategory.findUnique({ where: { id } });
  if (!existing || existing.pairId !== pair.pair.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const updated = await prisma.eventCategory.update({ where: { id }, data });
  return NextResponse.json({ category: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const pair = await getCurrentPairForUser(auth.userId);
  if (!pair?.pair) return NextResponse.json({ error: "No pair" }, { status: 400 });
  const cat = await prisma.eventCategory.findUnique({ where: { id } });
  if (!cat || cat.pairId !== pair.pair.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.eventCategory.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}


