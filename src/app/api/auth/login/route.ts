import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setAuthCookie } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { email, password } = body as { email: string; password: string };
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  await setAuthCookie({ userId: user.id });
  return NextResponse.json({ ok: true });
}


