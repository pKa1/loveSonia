import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import QRCode from "qrcode";

export async function GET() {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.membership.findFirst({ where: { userId: auth.userId } });
  if (!membership) return NextResponse.json({ error: "No pair" }, { status: 400 });
  const pair = await prisma.pair.findUnique({ where: { id: membership.pairId } });
  if (!pair) return NextResponse.json({ error: "No pair" }, { status: 400 });

  const joinUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/pair?code=${pair.code}`;
  const dataUrl = await QRCode.toDataURL(joinUrl);
  return NextResponse.json({ code: pair.code, qr: dataUrl, joinUrl });
}


