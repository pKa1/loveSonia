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
  // Normalize optional fields
  const data: any = {
    title: typeof body.title === "string" ? body.title : undefined,
    completedAt:
      body.completed === true
        ? new Date()
        : body.completed === false
        ? null
        : undefined,
  };

  // Allow updating assignee when provided
  if (typeof body.assignee === "string") {
    const upper = body.assignee.toUpperCase();
    if (["SELF", "PARTNER", "WE"].includes(upper)) {
      data.assignee = upper as any;
    }
  }

  // Allow updating dueAt (string | null to clear)
  if (Object.prototype.hasOwnProperty.call(body, "dueAt")) {
    if (!body.dueAt) {
      data.dueAt = null;
    } else if (typeof body.dueAt === "string") {
      const parsed = new Date(body.dueAt);
      if (!isNaN(parsed.getTime())) {
        data.dueAt = parsed;
      }
    }
  }

  const updated = await prisma.task.update({
    where: { id },
    data,
  });
  broadcast("tasks", { action: "update", id });
  return NextResponse.json({ task: updated });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  await prisma.task.delete({ where: { id } });
  broadcast("tasks", { action: "delete", id });
  return NextResponse.json({ ok: true });
}


