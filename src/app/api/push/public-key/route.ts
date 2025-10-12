import { NextResponse } from "next/server";

export async function GET() {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY || "";
  return NextResponse.json({ publicKey });
}


