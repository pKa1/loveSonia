import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { getCurrentPairForUser } from "@/lib/pair";
import { broadcast } from "@/lib/sse";
import { applyTimeOnDateInTz } from "@/lib/tz";

export async function POST(req: Request) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await getCurrentPairForUser(auth.userId);
  if (!ctx?.pair) return NextResponse.json({ error: "No pair" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.text !== "string") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const text = body.text.trim();
  if (!text) return NextResponse.json({ error: "Empty" }, { status: 400 });

  const now = new Date();
  const dateBase = new Date(now);
  // resolve user's timezone
  let timeZone = "UTC";
  try {
    const me = await prisma.user.findUnique({ where: { id: auth.userId }, select: { timezone: true } });
    timeZone = me?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {}
  // naive date hints
  if (/завтра/i.test(text)) dateBase.setDate(dateBase.getDate() + 1);
  if (/послезавтра/i.test(text)) dateBase.setDate(dateBase.getDate() + 2);

  // explicit date support: dd.mm, dd monthname, weekdays
  const lower = text.toLowerCase();
  const explicit = extractExplicitDate(lower, now);
  if (explicit?.date) {
    dateBase.setFullYear(explicit.date.getFullYear(), explicit.date.getMonth(), explicit.date.getDate());
  }

  // fuzzy period phrases → create event with default 12:00–13:00
  if (/в\s+конце\s+месяца/.test(lower)) {
    const taskWord = /(задача|задачу|напоминание)/.test(lower);
    const base = new Date(dateBase.getFullYear(), dateBase.getMonth() + 1, 0);
    const start = applyTimeOnDateInTz(base, 12, 0, timeZone);
    const end = new Date(start.getTime() + 60 * 60000);
    const after = stripDateTokens(text.replace(/в\s+конце\s+месяца/gi, "").trim());
    const { cleanedTitle, location } = extractLocation(after);
    const title = (cleanedTitle || (taskWord ? "Задача" : "Событие")).trim();
    if (taskWord) {
      const task = await prisma.task.create({ data: { pairId: ctx.pair.id, createdById: auth.userId, title, assignee: "WE", dueAt: start } });
      broadcast("tasks", { action: "create", id: task.id });
      return NextResponse.json({ created: { type: "task", id: task.id } });
    } else {
      const event = await prisma.event.create({ data: { pairId: ctx.pair.id, title, startAt: start, endAt: end, location: location || undefined } });
      broadcast("events", { action: "create", id: event.id });
      return NextResponse.json({ created: { type: "event", id: event.id } });
    }
  }
  if (/в\s+начале\s+следующей\s+недели/.test(lower)) {
    const taskWord = /(задача|задачу|напоминание)/.test(lower);
    const base = new Date(dateBase);
    const toMonIdx = (d: number) => (d + 6) % 7; // Mon=0
    const cur = toMonIdx(base.getDay());
    const daysToNextMon = (7 - cur) % 7 || 7;
    base.setDate(base.getDate() + daysToNextMon);
    const start = applyTimeOnDateInTz(base, 12, 0, timeZone);
    const end = new Date(start.getTime() + 60 * 60000);
    const after = stripDateTokens(text.replace(/в\s+начале\s+следующей\s+недели/gi, "").trim());
    const { cleanedTitle, location } = extractLocation(after);
    const title = (cleanedTitle || (taskWord ? "Задача" : "Событие")).trim();
    if (taskWord) {
      const task = await prisma.task.create({ data: { pairId: ctx.pair.id, createdById: auth.userId, title, assignee: "WE", dueAt: start } });
      broadcast("tasks", { action: "create", id: task.id });
      return NextResponse.json({ created: { type: "task", id: task.id } });
    } else {
      const event = await prisma.event.create({ data: { pairId: ctx.pair.id, title, startAt: start, endAt: end, location: location || undefined } });
      broadcast("events", { action: "create", id: event.id });
      return NextResponse.json({ created: { type: "event", id: event.id } });
    }
  }
  if (/на\s+выходных/.test(lower)) {
    const taskWord = /(задача|задачу|напоминание)/.test(lower);
    const base = new Date(dateBase);
    const day = base.getDay(); // Sun=0
    const diffToSat = (6 - day + 7) % 7;
    base.setDate(base.getDate() + diffToSat);
    const start = applyTimeOnDateInTz(base, 12, 0, timeZone);
    const end = new Date(start.getTime() + 60 * 60000);
    const after = stripDateTokens(text.replace(/на\s+выходных/gi, "").trim());
    const { cleanedTitle, location } = extractLocation(after);
    const title = (cleanedTitle || (taskWord ? "Задача" : "Событие")).trim();
    if (taskWord) {
      const task = await prisma.task.create({ data: { pairId: ctx.pair.id, createdById: auth.userId, title, assignee: "WE", dueAt: start } });
      broadcast("tasks", { action: "create", id: task.id });
      return NextResponse.json({ created: { type: "task", id: task.id } });
    } else {
      const event = await prisma.event.create({ data: { pairId: ctx.pair.id, title, startAt: start, endAt: end, location: location || undefined } });
      broadcast("events", { action: "create", id: event.id });
      return NextResponse.json({ created: { type: "event", id: event.id } });
    }
  }

  // intent hints
  // lower already computed above
  const isEventWord = /(встреча|встречу|встретиться|встретимся|встреться|событие|звонок|созвон|митинг|совещание|планерка|планёрка)/.test(lower);
  const isTaskWord = /(задача|задачу|напоминание)/.test(lower);

  // time range: HH:MM-HH:MM or "с HH до HH"
  // NOTE: avoid \b for Cyrillic; use (?:^|\s) to anchor at word start
  const mRange = lower.match(/(?:^|\s)[cс]\s*(\d{1,2})(?::(\d{2}))?\s*(?:до|по)\s*(\d{1,2})(?::(\d{2}))?/) || lower.match(/(\d{1,2})(?::(\d{2}))?\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?/);
  if (mRange) {
    let h1 = parseInt(mRange[1], 10);
    const min1 = mRange[2] ? parseInt(mRange[2], 10) : 0;
    let h2 = parseInt(mRange[3], 10);
    const min2 = mRange[4] ? parseInt(mRange[4], 10) : 0;
    const hasEvening = /(вечера|вечер|дня)/.test(lower);
    if (hasEvening) { if (h1 < 12) h1 += 12; if (h2 < 12) h2 += 12; }
    const start = applyTimeOnDateInTz(dateBase, h1 % 24, min1 % 60, timeZone);
    const end = applyTimeOnDateInTz(dateBase, h2 % 24, min2 % 60, timeZone);
    // extract location for event ranges
    const after = text.replace(mRange[0], "").replace(/\b(сегодня|завтра|послезавтра)\b/gi, "").trim();
    const after2 = stripDateTokens(after);
    const { cleanedTitle, location } = extractLocation(after2);
    const title = cleanedTitle || "Событие";
    const event = await prisma.event.create({
      data: { pairId: ctx.pair.id, title, startAt: start, endAt: end, location: location || undefined },
    });
    broadcast("events", { action: "create", id: event.id });
    return NextResponse.json({ created: { type: "event", id: event.id } });
  }

  // single time: "в HH:MM" or "HH:MM" or "в HH"
  // allow "в HH[:MM]", "на HH[:MM]", "на 16 00"
  const mTime = lower.match(/(?:\b(?:в|на)\s*)?(\d{1,2})(?::|\.|\s)?(\d{2})?(?:\s*(утра|вечера|дня|ночи))?\b/i);
  let dueAt: Date | null = null;
  if (mTime) {
    let hh = parseInt(mTime[1], 10);
    const mm = mTime[2] ? parseInt(mTime[2], 10) : 0;
    const period = (mTime[3] || "").toLowerCase();
    if ((period === "вечера" || period === "дня") && hh < 12) hh += 12;
    if (period === "ночи" && hh === 12) hh = 0;
    dueAt = applyTimeOnDateInTz(dateBase, hh % 24, mm % 60, timeZone);
  }
  // decide event vs task for single times
  const titleBaseRaw = stripDateTokens(text.replace(/(сегодня|завтра|послезавтра)/gi, "").replace(mTime?.[0] ?? "", "").trim());
  const { cleanedTitle: titleBase, location } = extractLocation(titleBaseRaw);
  // If phrase contains a range hint like "с 14 до 16" but the range regex missed, still treat as event
  const mEndHint = lower.match(/(?:до|по)\s*(\d{1,2})(?::(\d{2}))?/);
  const hasRangeHint = /(?:^|\s)[cс]\s*\d{1,2}(?::\d{2})?\s*(?:до|по)\s*\d{1,2}(?::\d{2})?/.test(lower);
  // Weekday mention with a concrete time -> event
  const hasWeekdayMention = /(?:^|\s)(?:в|во)\s+(понедельник|вторник|среду|среда|четверг|пятницу|пятница|субботу|суббота|воскресенье)\b/.test(lower);
  const timePresent = !!mTime;
  if (isEventWord || hasRangeHint || (hasWeekdayMention && timePresent) || (timePresent && !isTaskWord)) {
    const start = dueAt || new Date(dateBase);
    const end = mEndHint
      ? (() => { const eh = parseInt(mEndHint[1], 10); const em = mEndHint[2] ? parseInt(mEndHint[2], 10) : 0; const e = new Date(dateBase); e.setHours(eh % 24, em % 60, 0, 0); return e; })()
      : new Date(start.getTime() + 60 * 60000);
    const title = (titleBase || "Встреча").trim();
    const event = await prisma.event.create({ data: { pairId: ctx.pair.id, title, startAt: start, endAt: end, location: location || undefined } });
    broadcast("events", { action: "create", id: event.id });
    return NextResponse.json({ created: { type: "event", id: event.id } });
  }

  const title = (titleBase || text).trim();
  const task = await prisma.task.create({
    data: { pairId: ctx.pair.id, createdById: auth.userId, title, assignee: "WE", dueAt: dueAt ?? undefined },
  });
  broadcast("tasks", { action: "create", id: task.id });
  return NextResponse.json({ created: { type: "task", id: task.id } });

  function extractLocation(val: string): { cleanedTitle: string; location?: string } {
    let t = String(val || "");
    t = t.replace(/[\s,.;:]+$/g, "");
    const re = /\b(?:в|на|у)\s+(?!\d{1,2}(?:\s*[.:]?\s*\d{2})?\b)(.+)$/i;
    const m = t.match(re);
    if (m) {
      const loc = m[1].trim();
      const cleaned = t.replace(m[0], "").trim();
      if (loc && !/^на\s*\d{1,2}\s*(?:[.:]?\s*\d{2})?$/i.test(m[0])) {
        return { cleanedTitle: cleaned, location: loc };
      }
    }
    return { cleanedTitle: t };
  }

  function stripDateTokens(val: string): string {
    let t = String(val || "");
    t = t.replace(/\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b/gi, "");
    t = t.replace(new RegExp(`\\b\\d{1,2}\\s+(?:${MONTH_REGEX_PART()})\\b`, "gi"), "");
    t = t.replace(/\b(?:в|во)\s+(понедельник|вторник|среду|среда|четверг|пятницу|пятница|субботу|суббота|воскресенье)\b/gi, "");
    return t.trim();
  }

  function extractExplicitDate(lower: string, now: Date): { date?: Date } {
    const m1 = lower.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/);
    if (m1) {
      const d = parseInt(m1[1], 10);
      const m = parseInt(m1[2], 10) - 1;
      let y = m1[3] ? parseInt(m1[3], 10) : now.getFullYear();
      if (y < 100) y += 2000;
      const cand = new Date(y, m, d);
      if (!m1[3] && cand < new Date(now.getFullYear(), now.getMonth(), now.getDate())) cand.setFullYear(cand.getFullYear() + 1);
      return { date: cand };
    }
    const reMon = new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_REGEX_PART()})(?:\\s*(\\d{4}))?\\b`, "i");
    const m2 = lower.match(reMon);
    if (m2) {
      const d = parseInt(m2[1], 10);
      const monKey = m2[2];
      const month = MONTH_MAP()[monKey] ?? 0;
      let y = m2[3] ? parseInt(m2[3], 10) : now.getFullYear();
      const cand = new Date(y, month, d);
      if (!m2[3] && cand < new Date(now.getFullYear(), now.getMonth(), now.getDate())) cand.setFullYear(cand.getFullYear() + 1);
      return { date: cand };
    }
    const m3 = lower.match(/\b(?:в|во)\s+(понедельник|вторник|среду|среда|четверг|пятницу|пятница|субботу|суббота|воскресенье)\b/);
    if (m3) {
      const wd = WEEKDAY_INDEX(m3[1]);
      const today = now.getDay();
      const toMonIdx = (d: number) => (d + 6) % 7;
      const target = wd;
      const cur = toMonIdx(today);
      const diff = (target - cur + 7) % 7;
      const cand = new Date(now);
      cand.setHours(0, 0, 0, 0);
      cand.setDate(cand.getDate() + diff);
      return { date: cand };
    }
    return {};
  }

  function MONTH_MAP(): Record<string, number> {
    return {
      "января": 0, "янв": 0,
      "февраля": 1, "фев": 1,
      "марта": 2, "мар": 2,
      "апреля": 3, "апр": 3,
      "мая": 4, "май": 4,
      "июня": 5, "июн": 5,
      "июля": 6, "июл": 6,
      "августа": 7, "авг": 7,
      "сентября": 8, "сен": 8, "сент": 8,
      "октября": 9, "окт": 9,
      "ноября": 10, "ноя": 10,
      "декабря": 11, "дек": 11,
    };
  }
  function MONTH_REGEX_PART(): string { return Object.keys(MONTH_MAP()).join("|"); }
  function WEEKDAY_INDEX(word: string): number {
    const w = word.toLowerCase();
    if (w.startsWith("пон")) return 0; if (w.startsWith("вто")) return 1; if (w.startsWith("сре")) return 2; if (w.startsWith("чет")) return 3; if (w.startsWith("пят")) return 4; if (w.startsWith("суб")) return 5; return 6;
  }
}


