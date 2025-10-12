import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToSubscription } from "@/lib/push";

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("x-cron-secret");
    const url = new URL(req.url);
    const querySecret = url.searchParams.get("secret");
    if (header !== secret && querySecret !== secret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const now = new Date();
  const due = await prisma.taskReminder.findMany({
    where: { deliveredAt: null, remindAt: { lte: now } },
    include: { task: true, user: { include: { pushSubscriptions: true } } },
    take: 100,
  });

  for (const r of due) {
    const payload = r.payload ? JSON.parse(r.payload) : { title: `Напоминание: ${r.task.title}`, data: { url: "/tasks" } };
    for (const sub of r.user.pushSubscriptions) {
      const res = await sendPushToSubscription({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      if (!res.ok && (res.status === 404 || res.status === 410)) {
        await prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } }).catch(() => {});
      }
    }
    await prisma.taskReminder.update({ where: { id: r.id }, data: { deliveredAt: new Date() } });
  }

  return NextResponse.json({ ok: true, sent: due.length });
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}


