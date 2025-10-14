import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setAuthCookie } from "@/lib/auth";
import crypto from "crypto";

type TgUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return token;
}

// Validate Telegram WebApp initData per official docs
function validateInitData(initData: string): { ok: boolean; data?: Record<string, string> } {
  try {
    const url = new URL("https://dummy.local/?" + initData);
    const params = Array.from(url.searchParams.entries())
      .filter(([k]) => k !== "hash")
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const dataCheckString = params.map(([k, v]) => `${k}=${v}`).join("\n");
    const token = getBotToken();
    const secretKey = crypto.createHmac("sha256", "WebAppData").update(token).digest();
    const signature = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    const hash = url.searchParams.get("hash") || "";
    if (signature !== hash) return { ok: false };
    const data: Record<string, string> = {};
    for (const [k, v] of params) data[k] = v;
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const initData: string | undefined = body?.initData;
  if (!initData || typeof initData !== "string") {
    return NextResponse.json({ error: "initData required" }, { status: 400 });
  }
  const { ok, data } = validateInitData(initData);
  if (!ok || !data) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  // Optional: reject too old auth_date (e.g., > 24h)
  const authDate = Number(data["auth_date"]) || 0;
  if (authDate && Math.abs(Date.now() / 1000 - authDate) > 60 * 60 * 24) {
    return NextResponse.json({ error: "initData expired" }, { status: 401 });
  }

  const rawUser = data["user"] ? JSON.parse(data["user"]) as TgUser : undefined;
  if (!rawUser?.id) return NextResponse.json({ error: "user missing" }, { status: 400 });
  const telegramId = String(rawUser.id);
  const telegramUsername = rawUser.username || null;
  const name = [rawUser.first_name, rawUser.last_name].filter(Boolean).join(" ") || telegramUsername || `tg-${telegramId}`;
  const email = `tg-${telegramId}@telegram.local`;

  // Create or update user linked to telegramId
  const user = await prisma.user.upsert({
    where: { telegramId },
    update: { name, telegramUsername },
    create: { name, email, telegramId, telegramUsername },
    select: { id: true },
  });

  await setAuthCookie({ userId: user.id });
  return NextResponse.json({ ok: true });
}


