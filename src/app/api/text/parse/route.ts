import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getCurrentPairForUser } from "@/lib/pair";
import { applyTimeOnDateInTz, addMinutes as addMin } from "@/lib/tz";
import { parseRussian, parseRussianWithConfidence } from "@/lib/nlp/ru";

async function classify(apiKey: string, text: string, ctx: { timeZone: string; nowISO: string }) {
  const url = "https://api.aitunnel.ru/v1/chat/completions";
  const system = `Ты парсер текста. Верни ТОЛЬКО JSON по схеме:\n{\n  \"kind\": \"task\" | \"event\",\n  \"title\": string,\n  \"assignee\"?: \"SELF\" | \"PARTNER\" | \"WE\",\n  \"start\"?: string (ISO),\n  \"end\"?: string (ISO),\n  \"due\"?: string (ISO),\n  \"date\"?: string (YYYY-MM-DD),\n  \"location\"?: string\n}\nПравила:\n- Интерпретируй дату/время в таймзоне ${ctx.timeZone}. Сейчас: ${ctx.nowISO}.\n- Удаляй служебные префиксы из title (\"давай\", \"добавь\", \"создай\", \"нужно\", \"пожалуйста\").\n- Форматы времени: HH:MM, HH.MM, HH MM; диапазоны «с HH[:MM] до HH[:MM]» и «HH:MM–HH:MM». Учти «в 3 дня/вечера/утра/ночи».\n- Если для события указан только start без end — ставь end = start + 60 минут.\n- Если есть явная дата без времени — используй поле \"date\".\n- Если указан временной диапазон и явная дата — оба времени внутри этой даты.`;
  const messages = [
    { role: "system", content: system },
    { role: "user", content: `Текст: ${text}` },
  ];
  const r = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-5-nano", messages, max_tokens: 1024 }),
  });
  if (!r.ok) {
    const errTxt = await r.text().catch(() => "");
    throw new Error(`NLP classify failed: ${r.status} ${errTxt}`);
  }
  const data = await r.json().catch(() => ({}));
  const raw = data?.choices?.[0]?.message?.content ?? "";
  const cleaned = String(raw).replace(/```json|```/g, "");
  const startIdx = cleaned.indexOf("{");
  const endIdx = cleaned.lastIndexOf("}");
  const slice = startIdx >= 0 && endIdx > startIdx ? cleaned.slice(startIdx, endIdx + 1) : cleaned;
  try { return JSON.parse(slice); } catch { return null; }
}

function parseHeuristic(input: string, timeZone: string) {
  const original = String(input || "").trim();
  if (!original) return null;
  let text = original.toLowerCase();
  const now = new Date();
  const dateBase = new Date(now);
  if (/послезавтра/.test(text)) dateBase.setDate(dateBase.getDate() + 2);
  else if (/завтра/.test(text)) dateBase.setDate(dateBase.getDate() + 1);

  const explicit = extractExplicitDate(text, now);
  if (explicit?.date) {
    dateBase.setFullYear(explicit.date.getFullYear(), explicit.date.getMonth(), explicit.date.getDate());
  }

  const leadPatterns = [
    /^давай(?:-ка)?\s+/, /^(?:пожалуйста|нужно|надо|можешь|сделай)\s+/, /^(?:добавь|добавим|создай|создать)\s+/, /^(?:давай\s+добавим|давай\s+создадим)\s+/
  ];
  leadPatterns.forEach((re) => { text = text.replace(re, ""); });

  const isEventWord = /(встреча|встречу|событие|звонок|митинг|совещание)/;
  const isTaskWord = /(задача|задачу|напоминание)/;
  let kindHint: "event" | "task" | null = null;
  if (isEventWord.test(text)) kindHint = "event";
  if (isTaskWord.test(text)) kindHint = kindHint || "task";

  const reRange1 = /\bс\s*(\d{1,2})(?::(\d{2}))?\s*(?:до|по)\s*(\d{1,2})(?::(\d{2}))?/i;
  const reRange2 = /(\d{1,2})(?::(\d{2}))?\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?/;
  const mRange = text.match(reRange1) || text.match(reRange2);
  if (mRange) {
    let h1 = parseInt(mRange[1], 10); const min1 = mRange[2] ? parseInt(mRange[2], 10) : 0;
    let h2 = parseInt(mRange[3], 10); const min2 = mRange[4] ? parseInt(mRange[4], 10) : 0;
    const hasEvening = /(вечера|вечер)/.test(text) || /(дня)/.test(text);
    if (hasEvening) { if (h1 < 12) h1 += 12; if (h2 < 12) h2 += 12; }
    const start = applyTimeOnDateInTz(dateBase, h1 % 24, min1 % 60, timeZone);
    const end = applyTimeOnDateInTz(dateBase, h2 % 24, min2 % 60, timeZone);
    let title = original.replace(mRange[0], "").replace(/\b(сегодня|завтра|послезавтра)\b/gi, "").replace(isEventWord, "").replace(isTaskWord, "").trim();
    title = stripDateTokens(title);
    const { cleanedTitle, location } = extractLocation(title);
    title = cleanedTitle;
    if (!title) title = "Событие";
    return { kind: "event", title, start: start.toISOString(), end: end.toISOString(), assignee: "WE", location } as const;
  }

  // allow "в HH[:MM]", "на HH[:MM]", "на 16 00"
  const reTime = /(?:\b(?:в|на)\s*)?(\d{1,2})(?::|\.|\s)?(\d{2})?(?:\s*(утра|вечера|дня|ночи))?\b/i;
  const mTime = text.match(reTime);
  if (mTime) {
    let hh = parseInt(mTime[1], 10);
    const mm = mTime[2] ? parseInt(mTime[2], 10) : 0;
    const period = (mTime[3] || "").toLowerCase();
    if ((period === "вечера" || period === "дня") && hh < 12) hh += 12;
    if (period === "ночи" && hh === 12) hh = 0;
    const base = applyTimeOnDateInTz(dateBase, hh % 24, mm % 60, timeZone);
    const mDur = text.match(/\bна\s*(\d{1,2})\s*(час(?:а|ов)?|минут(?:у|ы|ы)?|мин)\b/i);
    let end: Date | undefined;
    if (mDur) {
      const qty = parseInt(mDur[1], 10);
      const unit = mDur[2].toLowerCase();
      const minutes = /час/.test(unit) ? qty * 60 : qty;
      end = addMin(base, minutes);
    }
    let title = original.replace(mTime[0], "").replace(/\b(сегодня|завтра|послезавтра)\b/gi, "").replace(isEventWord, "").replace(isTaskWord, "").trim();
    title = stripDateTokens(title);
    const { cleanedTitle, location } = extractLocation(title);
    title = cleanedTitle;
    const wantEvent = kindHint === "event" || /\b(встреча|звонок)\b/.test(text);
    if (wantEvent) {
      const eventEnd = end || new Date(base.getTime() + 60 * 60000);
      if (!title) title = "Встреча";
      return { kind: "event", title, start: base.toISOString(), end: eventEnd.toISOString(), assignee: "WE", location } as const;
    }
    if (!title) title = "Задача";
    return { kind: "task", title, due: base.toISOString(), assignee: "WE" } as const;
  }

  let title = original.replace(isEventWord, "").replace(isTaskWord, "");
  title = title.replace(/\b(сегодня|завтра|послезавтра)\b/gi, "").trim();
  title = stripDateTokens(title);
  if (!title) title = kindHint === "event" ? "Событие" : "Задача";
  const fallbackKind = kindHint || "task";
  if (fallbackKind === "event") {
    const { cleanedTitle, location } = extractLocation(title);
    return { kind: "event", title: cleanedTitle || "Событие", assignee: "WE", location } as const;
  }
  return { kind: "task", title, assignee: "WE" } as const;
}

function extractLocation(text: string): { cleanedTitle: string; location?: string } {
  let t = String(text || "");
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

function stripDateTokens(text: string): string {
  let t = String(text || "");
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
    const diff = (target - cur + 7) % 7; // include today if same
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

export async function POST(req: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await getCurrentPairForUser(auth.userId);
  if (!ctx?.pair) return NextResponse.json({ error: "No pair" }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.text !== "string") return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const text = body.text.trim();
  if (!text) return NextResponse.json({ error: "Empty" }, { status: 400 });

  // Determine timezone for parsing (server-side only)
  let timeZone = "UTC";
  try {
    const { prisma } = await import("@/lib/prisma");
    const tzUser = await prisma.user.findUnique({ where: { id: auth.userId }, select: { timezone: true } });
    timeZone = tzUser?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }

  const apiKey = process.env.AITUNNEL_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Missing AITUNNEL_API_KEY" }, { status: 500 });

  // LLM-only first (unified with voice)
  let intent: any = await classify(apiKey, text, { timeZone, nowISO: new Date().toISOString() }).catch(() => null);
  // Fallback to rules if LLM fails
  if (!intent) {
    const pr = parseRussianWithConfidence(text, { timeZone });
    intent = pr.intent || parseHeuristic(text, timeZone);
  }
  if (intent?.title) {
    intent.title = stripTimeTokens(stripDateTokens(String(intent.title)));
  }
  if (!intent || !intent.kind) return NextResponse.json({ error: "Не удалось распознать" }, { status: 400 });
  return NextResponse.json({ preview: intent, transcript: text });
}

function fillMissingFromLLM(base: any, llm: any) {
  const out: any = { ...base };
  for (const k of ["kind","title","start","end","due","date","location","assignee","rrule","reminderMinutes"]) {
    if (out[k] == null && llm[k] != null) out[k] = llm[k];
  }
  return out;
}

// Keep title clean by removing time/date tokens
function stripTimeTokens(text: string): string {
  let t = String(text || "");
  t = t.replace(/\bс\s*\d{1,2}(?::|\.|\s)?\d{0,2}?(?:\s*(утра|дня|вечера|ночи))?\s*(?:до|по)\s*\d{1,2}(?::|\.|\s)?\d{0,2}?(?:\s*(утра|дня|вечера|ночи))?/gi, "");
  t = t.replace(/\b\d{1,2}(?::|\.|\s)?\d{2}\s*[–—-]\s*\d{1,2}(?::|\.|\s)?\d{2}/g, "");
  t = t.replace(/\b(?:до|по|в|к|на)\s*\d{1,2}(?::|\.|\s)?\d{0,2}?(?:\s*(утра|дня|вечера|ночи))?/gi, "");
  t = t.replace(/\b\d{1,2}[:.]\d{2}\b/g, "");
  t = t.replace(/[\s,.;:]+$/g, "");
  t = t.replace(/\s{2,}/g, " ");
  return t.trim();
}

function mergeIntentPreferLLMTimes(base: any, llm: any) {
  const out: any = { ...(base || {}) };
  if (!out.kind && llm.kind) out.kind = llm.kind;
  if (!out.title && llm.title) out.title = llm.title;
  for (const k of ["start","end","due","date"]) {
    if (llm[k] != null) out[k] = llm[k];
  }
  return fillMissingFromLLM(out, llm);
}


