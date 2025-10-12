import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth, clearAuth } from "@/lib/auth";

export async function GET() {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ user: null }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { id: true, name: true, email: true, timezone: true } });
  return NextResponse.json({ user });
}

export async function POST(req: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const data: { name?: string; timezone?: string } = {};
  if (typeof body.name === "string") data.name = body.name;
  if (typeof body.timezone === "string") data.timezone = body.timezone;
  const user = await prisma.user.update({ where: { id: auth.userId }, data, select: { id: true, name: true, email: true, timezone: true } });
  return NextResponse.json({ user });
}

export async function DELETE() {
  await clearAuth();
  return NextResponse.json({ ok: true });
}


