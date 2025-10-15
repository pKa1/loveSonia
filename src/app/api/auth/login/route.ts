import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setAuthCookie } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const password = (body as { email: string; password: string }).password;
  const emailInput = String((body as { email: string }).email).trim();
  const email = emailInput.toLowerCase();

  // Primary: normalized exact match
  let user = await prisma.user.findUnique({ where: { email } });
  // Fallback for legacy records with mixed-case emails in SQLite (case-sensitive)
  if (!user) {
    try {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, passwordHash FROM User WHERE LOWER(email) = LOWER(?) LIMIT 1`,
        emailInput,
      );
      if (rows && rows.length > 0) {
        user = await prisma.user.findUnique({ where: { id: rows[0].id } }) as any;
      }
    } catch {
      // ignore and continue with null user
    }
  }
  if (!user || !user.passwordHash) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  await setAuthCookie({ userId: user.id });
  return NextResponse.json({ ok: true });
}


