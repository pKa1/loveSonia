import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";

export async function POST(req: Request) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.taskId !== "string") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const task = await prisma.task.findFirst({
    where: { id: body.taskId, pair: { memberships: { some: { userId: auth.userId } } } },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = Date.now();
  const twoHoursMs = 2 * 60 * 60 * 1000;
  let remindAt = new Date(now + twoHoursMs);
  if (task.dueAt) {
    const dueMs = new Date(task.dueAt).getTime();
    const candidate = new Date(dueMs - twoHoursMs);
    if (candidate.getTime() > now) remindAt = candidate;
  }

  await prisma.taskReminder.create({
    data: {
      userId: auth.userId,
      taskId: task.id,
      remindAt,
      payload: JSON.stringify({ url: "/tasks", title: `Напоминание: ${task.title}` }),
    },
  });

  return NextResponse.json({ ok: true, remindAt });
}


