import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { broadcast } from "@/lib/sse";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { id } = await context.params;
  const updated = await prisma.event.update({
    where: { id },
    data: {
      title: typeof body.title === "string" ? body.title : undefined,
      startAt: body.startAt ? new Date(body.startAt) : undefined,
      endAt: body.endAt ? new Date(body.endAt) : undefined,
      location: typeof body.location === "string" ? body.location : undefined,
      allDay: typeof body.allDay === "boolean" ? body.allDay : undefined,
      categoryId: body.hasOwnProperty("categoryId") ? (typeof body.categoryId === "string" ? body.categoryId : null) : undefined,
    },
  });
  if (typeof body.assignee === "string") {
    try {
      await prisma.$executeRaw`UPDATE "Event" SET "assignee" = ${String(body.assignee).toUpperCase()} WHERE "id" = ${id}`;
    } catch {}
  }
  broadcast("events", { action: "update", id });
  return NextResponse.json({ event: updated });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  await prisma.event.delete({ where: { id } });
  broadcast("events", { action: "delete", id });
  return NextResponse.json({ ok: true });
}


