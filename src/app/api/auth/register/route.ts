import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setAuthCookie } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.name !== "string") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const data = body as { name?: string; email?: string; password?: string; timezone?: string };
  if (!data.email || !data.password || !data.name) {
    return NextResponse.json({ error: "Email, password and name are required" }, { status: 400 });
  }
  const { name } = data;
  const email = data.email;
  const passwordHash = await bcrypt.hash(data.password, 10);
  try {
    const user = await prisma.user.upsert({
      where: { email },
      update: { name, timezone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" },
      create: { email, name, passwordHash, timezone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" },
      select: { id: true, name: true, email: true },
    });
    await setAuthCookie({ userId: user.id });
    return NextResponse.json({ user });
  } catch (e) {
    return NextResponse.json({ error: "Failed to register" }, { status: 500 });
  }
}


