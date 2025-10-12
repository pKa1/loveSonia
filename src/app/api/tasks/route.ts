import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { getCurrentPairForUser } from "@/lib/pair";
import { broadcast } from "@/lib/sse";

export async function GET() {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ tasks: [] });
  const ctx = await getCurrentPairForUser(auth.userId);
  if (!ctx?.pair) return NextResponse.json({ tasks: [] });
  const tasks = await prisma.task.findMany({
    where: { pairId: ctx.pair.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ tasks });
}

export async function POST(req: Request) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await getCurrentPairForUser(auth.userId);
  if (!ctx?.pair) return NextResponse.json({ error: "No pair" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.title !== "string" || typeof body.assignee !== "string") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const dueAt = body.dueAt ? new Date(body.dueAt) : null;
  const task = await prisma.task.create({
    data: {
      title: body.title.trim(),
      pairId: ctx.pair.id,
      createdById: auth.userId,
      assignee: body.assignee.toUpperCase(),
      dueAt: dueAt || undefined,
    },
  });
  broadcast("tasks", { action: "create", id: task.id });
  return NextResponse.json({ task });
}


