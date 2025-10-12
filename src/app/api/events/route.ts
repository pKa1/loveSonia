import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { getCurrentPairForUser } from "@/lib/pair";
import { broadcast } from "@/lib/sse";
import { applyTimeOnDateInTz } from "@/lib/tz";
// Local generator to avoid runtime import issues
function generateVirtualForDate(dateUTC: Date, timeZone: string, recs: any[]) {
  const local = new Date(dateUTC.toLocaleString("en-US", { timeZone }));
  const y = local.getFullYear();
  const m = local.getMonth();
  const d = local.getDate();
  const weekday = local.getDay();
  const dayDate = new Date(y, m, d, 0, 0, 0, 0);
  const out: any[] = [];
  for (const r of recs || []) {
    if (Number(r.weekday) !== weekday) continue;
    const from = r.fromDate ? new Date(r.fromDate) : null;
    const to = r.toDate ? new Date(r.toDate) : null;
    const inFrom = from ? dayDate >= new Date(from.getFullYear(), from.getMonth(), from.getDate()) : true;
    const inTo = to ? dayDate <= new Date(to.getFullYear(), to.getMonth(), to.getDate()) : true;
    if (!inFrom || !inTo) continue;
    const sh = Math.floor((Number(r.startMinute) || 0) / 60);
    const sm = (Number(r.startMinute) || 0) % 60;
    const eh = Math.floor((Number(r.endMinute) || 0) / 60);
    const em = (Number(r.endMinute) || 0) % 60;
    const startAt = applyTimeOnDateInTz(new Date(y, m, d), sh, sm, timeZone);
    const endAt = applyTimeOnDateInTz(new Date(y, m, d), eh, em, timeZone);
    out.push({ id: `rec:${r.id}:${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, title: r.title, startAt, endAt, location: r.location ?? null, assignee: (r.assignee || "WE") as any });
  }
  return out;
}

export async function GET(req: Request) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ events: [] });
  const ctx = await getCurrentPairForUser(auth.userId);
  if (!ctx?.pair) return NextResponse.json({ events: [] });
  // parse range
  const url = new URL(req.url);
  const startParam = url.searchParams.get("start"); // YYYY-MM-DD or ISO
  const endParam = url.searchParams.get("end");
  const me = await prisma.user.findUnique({ where: { id: auth.userId }, select: { timezone: true } });
  const timeZone = me?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  let startLocal = new Date();
  let endLocal = new Date();
  if (startParam) startLocal = new Date(startParam);
  if (endParam) endLocal = new Date(endParam);
  if (!startParam && !endParam) {
    // today only
    const nowTz = new Date(new Date().toLocaleString("en-US", { timeZone }));
    startLocal = new Date(nowTz.getFullYear(), nowTz.getMonth(), nowTz.getDate());
    endLocal = startLocal;
  }
  // normalize: if endLocal before startLocal, set endLocal = startLocal
  if (endLocal.getTime() < startLocal.getTime()) endLocal = startLocal;
  // Build UTC bounds for DB query: [startOfStartDay, startOfDay(after endLocal))
  const startUtc = applyTimeOnDateInTz(startLocal, 0, 0, timeZone);
  const endPlusOne = new Date(endLocal); endPlusOne.setDate(endPlusOne.getDate() + 1);
  const endUtcExclusive = applyTimeOnDateInTz(endPlusOne, 0, 0, timeZone);
  // Return events that OVERLAP the requested window: startAt < endExclusive AND endAt > start
  const events = await prisma.event.findMany({
    where: {
      pairId: ctx.pair.id,
      startAt: { lt: endUtcExclusive },
      endAt: { gt: startUtc },
    },
    orderBy: { startAt: "asc" },
    include: { category: true },
  });
  // Generate virtual events from recurring weekly schedule for TODAY in user's TZ
  let virtual: any[] = [];
  try {
    const recs = await prisma.$queryRawUnsafe<any[]>(
      `SELECT r.*, c.id as catId, c.name as catName, c.color as catColor
       FROM "RecurringWeekly" r
       LEFT JOIN "EventCategory" c ON c.id = r."categoryId"
       WHERE r."pairId" = ?
       ORDER BY r."weekday", r."startMinute" ASC`,
      ctx.pair.id
    ).catch(() => [] as any[]);
    // iterate days from startLocal..endLocal inclusive
    for (let dt = new Date(startLocal); dt.getTime() <= endLocal.getTime(); dt.setDate(dt.getDate() + 1)) {
      const v = generateVirtualForDate(new Date(dt), timeZone, recs);
      // attach pairId and other fields for UI consistency
      v.forEach((ev) => {
        // Strictly bind category by exact recurring id from ev.id pattern: rec:<recId>:YYYY-MM-DD
        let recId: string | null = null;
        try {
          const parts = String(ev.id).split(":");
          recId = parts.length >= 3 ? parts[1] : null;
        } catch {}
        const r = recId ? recs.find((x) => String(x.id) === recId) : undefined;
        const category = (r && r.catId)
          ? { id: String(r.catId), name: String(r.catName || ""), color: String(r.catColor || "") }
          : null;
        virtual.push({ ...ev, pairId: ctx.pair.id, allDay: false, category });
      });
    }
  } catch {}
  // Dedupe: hide virtual items that overlap any real event in the window
  function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
    return aStart < bEnd && aEnd > bStart;
  }
  const dedupedVirtual = virtual.filter((v) =>
    !events.some((e: any) => overlaps(new Date(v.startAt), new Date(v.endAt), new Date(e.startAt), new Date(e.endAt)))
  );
  // Workaround to include assignee while client schema may be outdated
  try {
    const rows = await prisma.$queryRaw<{ id: string; assignee: string }[]>`SELECT "id", "assignee" FROM "Event" WHERE "pairId" = ${ctx.pair.id}`;
    const map = new Map(rows.map((r) => [r.id, r.assignee] as const));
    const withAssignee = events.map((e: any) => ({ ...e, assignee: map.get(e.id) || e.assignee }));
    const merged = [...withAssignee, ...dedupedVirtual].sort((a: any, b: any) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    const res = NextResponse.json({ events: merged, _virtual: dedupedVirtual.length });
    res.headers.set("x-virtual", String(dedupedVirtual.length));
    return res;
  } catch {
    const merged = [...events, ...dedupedVirtual].sort((a: any, b: any) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    const res = NextResponse.json({ events: merged, _virtual: dedupedVirtual.length });
    res.headers.set("x-virtual", String(dedupedVirtual.length));
    return res;
  }
}

export async function POST(req: Request) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await getCurrentPairForUser(auth.userId);
  if (!ctx?.pair) return NextResponse.json({ error: "No pair" }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.title !== "string" || !body.startAt || !body.endAt) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const event = await prisma.event.create({
    data: {
      title: body.title.trim(),
      pairId: ctx.pair.id,
      startAt: new Date(body.startAt),
      endAt: new Date(body.endAt),
      location: typeof body.location === "string" ? body.location : undefined,
      allDay: body.allDay === true,
      categoryId: typeof body.categoryId === "string" ? body.categoryId : undefined,
    },
    include: { category: true },
  });
  // Bridge for older Prisma client: set assignee via raw SQL if provided
  if (typeof body.assignee === "string") {
    const ass = String(body.assignee).toUpperCase();
    try {
      await prisma.$executeRaw`UPDATE "Event" SET "assignee" = ${ass} WHERE "id" = ${event.id}`;
    } catch {}
  }
  // Enrich response with assignee
  const assignee = typeof body.assignee === "string" ? String(body.assignee).toUpperCase() : undefined;
  broadcast("events", { action: "create", id: event.id });
  return NextResponse.json({ event: { ...event, assignee } });
}


