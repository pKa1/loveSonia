import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { getCurrentPairForUser } from "@/lib/pair";
import { randomUUID } from "crypto";
import { broadcast } from "@/lib/sse";

function timeOverlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && aEnd > bStart;
}
function dateRangesOverlap(aFrom?: string | null, aTo?: string | null, bFrom?: string | null, bTo?: string | null) {
  // If either range is open-ended, consider overlapping by default
  if (!aFrom && !aTo) return true;
  if (!bFrom && !bTo) return true;
  const aF = aFrom ? new Date(aFrom).getTime() : -Infinity;
  const aT = aTo ? new Date(aTo).getTime() : Infinity;
  const bF = bFrom ? new Date(bFrom).getTime() : -Infinity;
  const bT = bTo ? new Date(bTo).getTime() : Infinity;
  return aF <= bT && bF <= aT;
}
async function computeOverlapWarnings(pairId: string, current: { id: string; weekday: number; startMinute: number; endMinute: number; fromDate?: string | null; toDate?: string | null; }) {
  try {
    const others = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "id","title","weekday","startMinute","endMinute","fromDate","toDate" FROM "RecurringWeekly" WHERE "pairId" = ? AND "id" <> ?`,
      pairId,
      current.id
    );
    const warnings = [] as Array<{ id: string; title: string; weekday: number; startMinute: number; endMinute: number }>; 
    for (const o of others || []) {
      if (Number(o.weekday) !== Number(current.weekday)) continue;
      if (!timeOverlaps(Number(current.startMinute), Number(current.endMinute), Number(o.startMinute), Number(o.endMinute))) continue;
      if (!dateRangesOverlap(current.fromDate || null, current.toDate || null, o.fromDate || null, o.toDate || null)) continue;
      warnings.push({ id: String(o.id), title: String(o.title || ""), weekday: Number(o.weekday), startMinute: Number(o.startMinute), endMinute: Number(o.endMinute) });
    }
    return warnings;
  } catch {
    return [];
  }
}

async function ensureTable() {
  // Create table if missing (SQLite). Prisma client may be outdated; use raw SQL.
  try {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "RecurringWeekly" (
        "id" TEXT PRIMARY KEY,
        "createdAt" DATETIME NOT NULL,
        "updatedAt" DATETIME NOT NULL,
        "pairId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "weekday" INTEGER NOT NULL,
        "startMinute" INTEGER NOT NULL,
        "endMinute" INTEGER NOT NULL,
        "location" TEXT,
        "assignee" TEXT DEFAULT 'WE',
        "categoryId" TEXT,
        "fromDate" DATETIME,
        "toDate" DATETIME
      )`
    );
  } catch {}
}

export async function GET() {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ items: [] }, { status: 200 });
  const ctx = await getCurrentPairForUser(auth.userId);
  if (!ctx?.pair) return NextResponse.json({ items: [] }, { status: 200 });
  await ensureTable();
  const items = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM "RecurringWeekly" WHERE "pairId" = ? ORDER BY "weekday" ASC`,
    ctx.pair.id
  );
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await getCurrentPairForUser(auth.userId);
  if (!ctx?.pair) return NextResponse.json({ error: "No pair" }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.title !== "string") return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  await ensureTable();
  const id = randomUUID();
  const now = new Date().toISOString();
  const params = [
    id,
    now,
    now,
    ctx.pair.id,
    body.title.trim(),
    Number(body.weekday ?? 1),
    Number(body.startMinute ?? 540),
    Number(body.endMinute ?? 600),
    typeof body.location === "string" ? body.location : null,
    typeof body.assignee === "string" ? String(body.assignee).toUpperCase() : "WE",
    typeof body.categoryId === "string" ? body.categoryId : null,
    body.fromDate ? new Date(body.fromDate).toISOString() : null,
    body.toDate ? new Date(body.toDate).toISOString() : null,
  ];
  await prisma.$executeRawUnsafe(
    `INSERT INTO "RecurringWeekly" ("id","createdAt","updatedAt","pairId","title","weekday","startMinute","endMinute","location","assignee","categoryId","fromDate","toDate") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ...params
  );
  broadcast("events", { action: "recurring:create", id });
  const item = { id, createdAt: now, updatedAt: now, pairId: ctx.pair.id, title: body.title.trim(), weekday: Number(body.weekday ?? 1), startMinute: Number(body.startMinute ?? 540), endMinute: Number(body.endMinute ?? 600), location: typeof body.location === "string" ? body.location : null, assignee: typeof body.assignee === "string" ? String(body.assignee).toUpperCase() : "WE", categoryId: typeof body.categoryId === "string" ? body.categoryId : null, fromDate: body.fromDate ? new Date(body.fromDate).toISOString() : null, toDate: body.toDate ? new Date(body.toDate).toISOString() : null };
  const warnings = await computeOverlapWarnings(ctx.pair.id, { id, weekday: item.weekday, startMinute: item.startMinute, endMinute: item.endMinute, fromDate: item.fromDate, toDate: item.toDate });
  return NextResponse.json({ item, warnings });
}

export async function PATCH(req: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await getCurrentPairForUser(auth.userId);
  if (!ctx?.pair) return NextResponse.json({ error: "No pair" }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string") return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { id, ...rest } = body;
  await ensureTable();
  const fields: string[] = [];
  const values: any[] = [];
  if (typeof rest.title === "string") { fields.push(`"title" = ?`); values.push(rest.title.trim()); }
  if (typeof rest.weekday === "number") { fields.push(`"weekday" = ?`); values.push(rest.weekday); }
  if (typeof rest.startMinute === "number") { fields.push(`"startMinute" = ?`); values.push(rest.startMinute); }
  if (typeof rest.endMinute === "number") { fields.push(`"endMinute" = ?`); values.push(rest.endMinute); }
  if (typeof rest.location === "string") { fields.push(`"location" = ?`); values.push(rest.location); }
  if (typeof rest.assignee === "string") { fields.push(`"assignee" = ?`); values.push(String(rest.assignee).toUpperCase()); }
  if (rest.categoryId === null) { fields.push(`"categoryId" = NULL`); }
  else if (typeof rest.categoryId === "string") { fields.push(`"categoryId" = ?`); values.push(rest.categoryId); }
  if (rest.fromDate) { fields.push(`"fromDate" = ?`); values.push(new Date(rest.fromDate).toISOString()); }
  if (rest.toDate) { fields.push(`"toDate" = ?`); values.push(new Date(rest.toDate).toISOString()); }
  fields.push(`"updatedAt" = ?`); values.push(new Date().toISOString());
  await prisma.$executeRawUnsafe(
    `UPDATE "RecurringWeekly" SET ${fields.join(", ")} WHERE "id" = ?`,
    ...values,
    id
  );
  const [item] = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "RecurringWeekly" WHERE "id" = ?`, id);
  broadcast("events", { action: "recurring:update", id });
  // Compute warnings against other slots in the pair
  let warnings: Array<{ id: string; title: string; weekday: number; startMinute: number; endMinute: number }> = [];
  try {
    warnings = await computeOverlapWarnings(ctx.pair.id, { id, weekday: Number(item.weekday), startMinute: Number(item.startMinute), endMinute: Number(item.endMinute), fromDate: item.fromDate || null, toDate: item.toDate || null });
  } catch {}
  return NextResponse.json({ item, warnings });
}

export async function DELETE(req: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await getCurrentPairForUser(auth.userId);
  if (!ctx?.pair) return NextResponse.json({ error: "No pair" }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string") return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  await ensureTable();
  await prisma.$executeRawUnsafe(`DELETE FROM "RecurringWeekly" WHERE "id" = ?`, body.id);
  broadcast("events", { action: "recurring:delete", id: body.id });
  return NextResponse.json({ ok: true });
}


