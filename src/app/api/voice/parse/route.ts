import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getCurrentPairForUser } from "@/lib/pair";
import { prisma } from "@/lib/prisma";
import { applyTimeOnDateInTz, addMinutes as addMin, toYMD as toYMDtz } from "@/lib/tz";
import { parseRussian, parseRussianWithConfidence } from "@/lib/nlp/ru";

// Helper: call AITUNNEL audio transcription (base64 wav/mp3)
async function transcribe(base64: string, format: string): Promise<string> {
  const apiKey = process.env.AITUNNEL_API_KEY;
  if (!apiKey) throw new Error("Missing AITUNNEL_API_KEY");

  async function attempt(fmt: string): Promise<string> {
    // Use whisper-1 transcription endpoint with multipart form-data (OpenAI-compatible)
    const url = "https://api.aitunnel.ru/v1/audio/transcriptions";
    const ext = (() => {
      if (/^mp3$/i.test(fmt)) return "mp3";
      if (/^wav$/i.test(fmt)) return "wav";
      if (/^webm$/i.test(fmt)) return "webm";
      if (/^m4a$/i.test(fmt)) return "m4a";
      if (/^mp4$/i.test(fmt)) return "mp4";
      if (/^ogg$/i.test(fmt)) return "ogg";
      return "webm";
    })();
    const mime = (() => {
      if (ext === "mp3") return "audio/mpeg";
      if (ext === "wav") return "audio/wav";
      if (ext === "webm") return "audio/webm";
      if (ext === "m4a" || ext === "mp4") return "audio/mp4";
      if (ext === "ogg") return "audio/ogg";
      return "application/octet-stream";
    })();
    const bin = Buffer.from(base64, "base64");
    const form = new FormData();
    form.append("model", "whisper-1");
    form.append("language", "ru");
    form.append("file", new Blob([bin], { type: mime }), `speech.${ext}`);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 30000);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body: form,
        signal: controller.signal,
      });
      if (!r.ok) {
        const errTxt = await r.text().catch(() => "");
        throw new Error(`Transcription failed: ${r.status} ${errTxt}`);
      }
      const data = await r.json().catch(() => ({}));
      const text = data?.text || data?.results?.[0]?.text || "";
      return String(text || "").trim();
    } finally {
      clearTimeout(t);
    }
  }

  const tried = new Set<string>();
  const order = [format, "mp3", "wav"].filter((f) => {
    const ok = !tried.has(f);
    tried.add(f);
    return ok;
  });
  for (const fmt of order) {
    try {
      const text = await attempt(fmt);
      if (text && !/^пожалуйста\b/i.test(text)) return text;
    } catch {
      // try next format
    }
  }
  return "";
}

// Helper: ask LLM to decide task vs event and return structured JSON
async function classify(text: string, ctx: { timeZone: string; nowISO: string }): Promise<{ kind: "task" | "event"; title: string; start?: string; end?: string; due?: string; date?: string; assignee?: "SELF" | "PARTNER" | "WE"; location?: string; rrule?: string; reminderMinutes?: number }> {
  const apiKey = process.env.AITUNNEL_API_KEY;
  if (!apiKey) throw new Error("Missing AITUNNEL_API_KEY");
  const url = "https://api.aitunnel.ru/v1/chat/completions";
  const system = `Ты парсер голоса. Верни ТОЛЬКО JSON без пояснений по схеме:
{
  "kind": "task" | "event",
  "title": string,
  "assignee"?: "SELF" | "PARTNER" | "WE",
  "start"?: string (ISO),
  "end"?: string (ISO),
  "due"?: string (ISO),
  "date"?: string (YYYY-MM-DD),
  "location"?: string,
  "rrule"?: string,            // RRULE для повторяющихся событий
  "reminderMinutes"?: number   // за сколько минут напомнить
}
Правила:
 - Интерпретируй дату/время в таймзоне ${ctx.timeZone}. Сейчас: ${ctx.nowISO}.
- Слова «встреча», «встречу», «событие», «звонок», «митинг», «совещание» → kind=event.
- Слова «задача», «задачу», «напоминание» → kind=task.
- Удаляй служебные префиксы из title: «давай(‑ка)», «добавь/добавим», «создай/создать», «нужно/надо», «пожалуйста», «можешь», «сделай», а также сами слова «встреча/событие/задача/напоминание» в начале.
- Если указан только start без end для события — ставь end = start + 60 минут.
- Форматы времени: HH:MM, HH.MM, HH MM; диапазоны «с HH[:MM] до HH[:MM]» и «HH:MM–HH:MM». Учти «в 3 дня/вечера/утра/ночи» (вечера/дня → +12ч если < 12, «в 12 ночи» → 00:00). Важное: не путай число месяца (например «17 октября») со временем — если рядом с числом есть слово месяца, это дата, а не время.
- Если в тексте есть явная дата (например, «26 октября», «26.10»), но НЕТ времени — ставь поле "date" (в формате YYYY-MM-DD) и НЕ заполняй start/end.
- Определяй локацию из фраз «в/на/у …», «по адресу …» и помещай в поле location.
- Если распознаны повторяемость/напоминание — заполни rrule/reminderMinutes.
 - Если указан временной диапазон и при этом есть явная дата — выставляй start/end в этот день. Если дата указана одна (например «на 17 октября с 14 до 15:30»), не переносить конец на другой месяц.
 - Если задан только конец «до HH:MM» и есть дата или начало — вычисли разумный start = конец − 60 минут.
Отвечай строго валидным JSON (один объект). Язык ввода: русский.`;
  const messages = [
    { role: "system", content: system },
    { role: "user", content: `Таймзона пользователя: ${ctx.timeZone}. Сейчас: ${ctx.nowISO}. Примеры:\n1) "встреча завтра в 10" -> {"kind":"event","title":"встреча","start":"${ctx.nowISO.slice(0,10)}T10:00:00"}\n2) "звонок в 15 на 30 минут" -> {"kind":"event","title":"звонок","start":"${ctx.nowISO.slice(0,10)}T15:00:00","end":"${ctx.nowISO.slice(0,10)}T15:30:00"}\n3) "задача купить торт в 19" -> {"kind":"task","title":"купить торт","due":"${ctx.nowISO.slice(0,10)}T19:00:00"}\n4) "презентация с 14 до 16" -> {"kind":"event","title":"презентация","start":"${ctx.nowISO.slice(0,10)}T14:00:00","end":"${ctx.nowISO.slice(0,10)}T16:00:00"}\n5) "планерка в понедельник с 9 до 10" -> {"kind":"event","title":"планерка","start":"<дата ближайшего понедельника>T09:00:00","end":"<та же дата>T10:00:00"}\nТекст: ${text}` },
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
  // Robust JSON extraction (remove code fences, pick first {...})
  const cleaned = String(raw).replace(/```json|```/g, "");
  const startIdx = cleaned.indexOf("{");
  const endIdx = cleaned.lastIndexOf("}");
  const slice = startIdx >= 0 && endIdx > startIdx ? cleaned.slice(startIdx, endIdx + 1) : cleaned;
  let parsed: any = {};
  try { parsed = JSON.parse(slice); } catch { parsed = {}; }
  return parsed as any;
}

// Heuristic fallback with Russian intent and time parsing
function parseHeuristic(input: string, timeZone: string) {
  const original = String(input || "").trim();
  if (!original) return null;
  let text = original.toLowerCase();
  // date hints
  const now = new Date();
  const dateBase = new Date(now);
  if (/послезавтра/.test(text)) dateBase.setDate(dateBase.getDate() + 2);
  else if (/завтра/.test(text)) dateBase.setDate(dateBase.getDate() + 1);

  // explicit date: dd.mm(.yyyy), dd/mm(/yyyy), "26 октября", weekdays like "в пятницу"
  const explicit = extractExplicitDate(text, now);
  if (explicit?.date) {
    dateBase.setFullYear(explicit.date.getFullYear(), explicit.date.getMonth(), explicit.date.getDate());
  }

  // strip common prefixes and leading verbs
  const leadPatterns = [
    /^давай(?:-ка)?\s+/,
    /^(?:пожалуйста|нужно|надо|можешь|сделай)\s+/, 
    /^(?:добавь|добавим|создай|создать)\s+/, 
    /^(?:давай\s+добавим|давай\s+создадим)\s+/
  ];
  leadPatterns.forEach((re) => { text = text.replace(re, ""); });

  // intent hints
  const isEventWord = /(встреча|встречу|событие|звонок|митинг|совещание)/;
  const isTaskWord = /(задача|задачу|напоминание)/;
  let kindHint: "event" | "task" | null = null;
  if (isEventWord.test(text)) kindHint = "event";
  if (isTaskWord.test(text)) kindHint = kindHint || "task";

  // capture time range: "с HH[:MM] до HH[:MM]" or "HH[:MM] - HH[:MM]"
  const reRange1 = /\bс\s*(\d{1,2})(?::(\d{2}))?\s*(?:до|по)\s*(\d{1,2})(?::(\d{2}))?/i;
  const reRange2 = /(\d{1,2})(?::(\d{2}))?\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?/;
  const mRange = text.match(reRange1) || text.match(reRange2);
  if (mRange) {
    let h1 = parseInt(mRange[1], 10); const min1 = mRange[2] ? parseInt(mRange[2], 10) : 0;
    let h2 = parseInt(mRange[3], 10); const min2 = mRange[4] ? parseInt(mRange[4], 10) : 0;
    // adjust by period words if present globally
    const hasEvening = /(вечера|вечер)/.test(text) || /(дня)/.test(text);
    if (hasEvening) { if (h1 < 12) h1 += 12; if (h2 < 12) h2 += 12; }
    const start = applyTimeOnDateInTz(dateBase, h1 % 24, min1 % 60, timeZone);
    const end = applyTimeOnDateInTz(dateBase, h2 % 24, min2 % 60, timeZone);
    let title = original;
    title = title.replace(mRange[0], "");
    title = title.replace(/\b(сегодня|завтра|послезавтра)\b/gi, "");
    title = title.replace(isEventWord, "");
    title = title.replace(isTaskWord, "");
    title = title.replace(/^\s*[–—-]\s*/, "");
    title = stripDateTokens(title);
    // extract location from remaining
    const { cleanedTitle, location } = extractLocation(title);
    title = cleanedTitle.trim();
    if (!title) title = "Событие";
    return { kind: "event", title, start: start.toISOString(), end: end.toISOString(), assignee: "WE", location } as const;
  }

  // single time: allow "в HH[:MM]", "на HH[:MM]", "на 16 00", and bare HH[:MM]
  const reTime = /(?:\b(?:в|на)\s*)?(\d{1,2})(?::|\.|\s)?(\d{2})?(?:\s*(утра|вечера|дня|ночи))?\b/i;
  const mTime = text.match(reTime);
  if (mTime) {
    let hh = parseInt(mTime[1], 10);
    const mm = mTime[2] ? parseInt(mTime[2], 10) : 0;
    const period = (mTime[3] || "").toLowerCase();
    if ((period === "вечера" || period === "дня") && hh < 12) hh += 12;
    if (period === "ночи" && hh === 12) hh = 0;
    const base = applyTimeOnDateInTz(dateBase, hh % 24, mm % 60, timeZone);

    // optional duration: "на 2 часа" | "на 30 минут"
    const mDur = text.match(/\bна\s*(\d{1,2})\s*(час(?:а|ов)?|минут(?:у|ы|ы)?|мин)\b/i);
    let end: Date | undefined;
    if (mDur) {
      const qty = parseInt(mDur[1], 10);
      const unit = mDur[2].toLowerCase();
      const minutes = /час/.test(unit) ? qty * 60 : qty;
      end = addMin(base, minutes);
    }

    let title = original;
    title = title.replace(mTime[0], "");
    title = title.replace(/\b(сегодня|завтра|послезавтра)\b/gi, "");
    title = title.replace(isEventWord, "");
    title = title.replace(isTaskWord, "");
    title = title.replace(/^\s*(давай|добавь|добавим|создай|создать)\s+/i, "");
    title = stripDateTokens(title);
    const { cleanedTitle, location } = extractLocation(title);
    title = cleanedTitle.trim();

    const wantEvent = kindHint === "event" || /\b(встреча|звонок)\b/.test(text);
    if (wantEvent) {
      const eventEnd = end || addMin(base, 60);
      if (!title) title = "Встреча";
      return { kind: "event", title, start: base.toISOString(), end: eventEnd.toISOString(), assignee: "WE", location } as const;
    }
    if (!title) title = "Задача";
    return { kind: "task", title, due: base.toISOString(), assignee: "WE" } as const;
  }

  // default title cleanup
  let title = original.replace(isEventWord, "").replace(isTaskWord, "");
  title = title.replace(/\b(сегодня|завтра|послезавтра)\b/gi, "").trim();
  title = stripDateTokens(title);
  if (!title) title = kindHint === "event" ? "Событие" : "Задача";
  const fallbackKind = kindHint || "task";
  if (fallbackKind === "event") {
    const { cleanedTitle, location } = extractLocation(title);
    const dateOnly = explicit?.date ? toYMDtz(explicit.date) : undefined;
    return { kind: "event", title: cleanedTitle || "Событие", assignee: "WE", location, ...(dateOnly ? { date: dateOnly } : {}) } as any;
  }
  return { kind: "task", title, assignee: "WE" };
}

// Extract location from natural phrase endings like "в/на/у ..." avoiding time tokens
function extractLocation(text: string): { cleanedTitle: string; location?: string } {
  let t = String(text || "");
  // remove trailing punctuation spacing
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

// Remove explicit date tokens from title
function stripDateTokens(text: string): string {
  let t = String(text || "");
  // dd.mm(.yyyy) or dd/mm or dd-mm
  t = t.replace(/\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b/gi, "");
  // dd monthname
  t = t.replace(new RegExp(`\\b\\d{1,2}\\s+(?:${MONTH_REGEX_PART()})\\b`, "gi"), "");
  // weekdays
  t = t.replace(/\b(?:в|во)\s+(понедельник|вторник|среду|среда|четверг|пятницу|пятница|субботу|суббота|воскресенье)\b/gi, "");
  return t.trim();
}

// Extract explicit date from text
function extractExplicitDate(lower: string, now: Date): { date?: Date } {
  // dd.mm(.yyyy)
  const m1 = lower.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/);
  if (m1) {
    const d = parseInt(m1[1], 10);
    const m = parseInt(m1[2], 10) - 1;
    let y = m1[3] ? parseInt(m1[3], 10) : now.getFullYear();
    if (y < 100) y += 2000;
    const cand = new Date(y, m, d);
    // if date passed and year not provided, move to next year
    if (!m1[3] && cand < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      cand.setFullYear(cand.getFullYear() + 1);
    }
    return { date: cand };
  }
  // dd monthname (genitive) optionally with year
  const reMon = new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_REGEX_PART()})(?:\\s*(\\d{4}))?\\b`, "i");
  const m2 = lower.match(reMon);
  if (m2) {
    const d = parseInt(m2[1], 10);
    const monKey = m2[2];
    const month = MONTH_MAP()[monKey] ?? 0;
    let y = m2[3] ? parseInt(m2[3], 10) : now.getFullYear();
    const cand = new Date(y, month, d);
    if (!m2[3] && cand < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      cand.setFullYear(cand.getFullYear() + 1);
    }
    return { date: cand };
  }
  // weekday: next occurrence (including today)
  const m3 = lower.match(/\b(?:в|во)\s+(понедельник|вторник|среду|среда|четверг|пятницу|пятница|субботу|суббота|воскресенье)\b/);
  if (m3) {
    const wd = WEEKDAY_INDEX(m3[1]);
    const today = now.getDay(); // 0..6 Sun..Sat
    // Map to 1..7 Mon..Sun for math convenience
    const toMonIdx = (d: number) => (d + 6) % 7; // Mon=0..Sun=6
    const target = wd; // already Mon=0..Sun=6
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
function MONTH_REGEX_PART(): string {
  return Object.keys(MONTH_MAP()).join("|");
}
function WEEKDAY_INDEX(word: string): number {
  const w = word.toLowerCase();
  if (w.startsWith("пон")) return 0; // Monday
  if (w.startsWith("вто")) return 1;
  if (w.startsWith("сре")) return 2;
  if (w.startsWith("чет")) return 3;
  if (w.startsWith("пят")) return 4;
  if (w.startsWith("суб")) return 5;
  return 6; // воскресенье
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function POST(req: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await getCurrentPairForUser(auth.userId);
  if (!ctx?.pair) return NextResponse.json({ error: "No pair" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.audio !== "string") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  // basic base64 validation (characters and padding)
  const b64 = body.audio.trim();
  if (b64.length === 0 || b64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(b64)) {
    return NextResponse.json({ error: "Некорректные данные аудио" }, { status: 400 });
  }
  const providedFormat = typeof body.format === "string" ? String(body.format).toLowerCase() : "";
  // derive safe format token (e.g., webm, mp3, wav, m4a)
  const format = (() => {
    const f = providedFormat.trim();
    if (!f) return "webm";
    // accept typical container extensions only
    if (/(mp3|wav|webm|m4a|mp4|ogg)/.test(f)) return f.match(/(mp3|wav|webm|m4a|mp4|ogg)/)![1];
    return "webm";
  })();
  // size guard: base64 inflates by ~4/3
  const approxBytes = Math.floor((body.audio.length * 3) / 4);
  const MAX_BYTES = 12 * 1024 * 1024; // 12MB
  if (approxBytes > MAX_BYTES) {
    return NextResponse.json({ error: "Аудио слишком большое" }, { status: 413 });
  }

  // Determine timezone: prefer client-provided, then user profile, then server fallback
  let timeZone = (typeof body.timeZone === "string" && body.timeZone) ? body.timeZone : "";
  if (!timeZone) {
    try {
      const me = await prisma.user.findUnique({ where: { id: auth.userId }, select: { timezone: true } });
      timeZone = me?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    }
  }

  // 1) Transcribe
  let text = "";
  try {
    text = await transcribe(body.audio, format);
  } catch (e: any) {
    return NextResponse.json({ error: "Ошибка транскрипции" }, { status: 502 });
  }
  if (!text) return NextResponse.json({ error: "Empty transcription" }, { status: 400 });

  // 2) LLM-only parsing (primary)
  let intent: any = null;
  const clsPrimary = await classify(text, { timeZone, nowISO: new Date().toISOString() }).catch(() => null);
  if (clsPrimary && clsPrimary.kind) intent = clsPrimary;
  // 2b) Safe fallback to rules only if LLM failed completely
  if (!intent) {
    const pr = parseRussianWithConfidence(text, { timeZone });
    intent = pr.intent || parseHeuristic(text, timeZone);
  }
  if (!intent || !intent.kind) {
    return NextResponse.json({ error: "Не удалось распознать" }, { status: 400 });
  }

  // 3) Sanity-correct with explicit tokens from transcript (date/time)
  intent = correctIntentWithExplicitTokens(text, intent, timeZone);
  // 4) Clean title: remove date/time tokens to keep human-friendly short title
  if (intent?.title) {
    const cleaned = sanitizeTitleWithTranscript(String(intent.title), text);
    intent.title = cleaned.cleanedTitle || intent.title;
    if (!intent.location && cleaned.location) intent.location = cleaned.location;
  }

  // 3) Return preview for client confirmation (don’t save yet)
  return NextResponse.json({ preview: intent, transcript: text });
}

function fillMissingFromLLM(base: any, llm: any) {
  const out: any = { ...base };
  for (const k of ["kind","title","start","end","due","date","location","assignee","rrule","reminderMinutes"]) {
    if (out[k] == null && llm[k] != null) out[k] = llm[k];
  }
  return out;
}

function mergeIntentPreferLLMTimes(base: any, llm: any) {
  const out: any = { ...(base || {}) };
  // Always take kind/title if missing
  if (!out.kind && llm.kind) out.kind = llm.kind;
  if (!out.title && llm.title) out.title = llm.title;
  // Prefer LLM for explicit temporal fields when provided
  for (const k of ["start","end","due","date"]) {
    if (llm[k] != null) out[k] = llm[k];
  }
  // Merge the rest if missing
  return fillMissingFromLLM(out, llm);
}

function correctIntentWithExplicitTokens(transcript: string, intent: any, timeZone: string) {
  try {
    if (!intent || !transcript) return intent;
    const lower = String(transcript).toLowerCase();
    const now = new Date();
    const dateDM = extractExplicitDayMonth(lower, now);
    const dateWD = extractExplicitWeekday(lower, now);
    const date = dateDM || dateWD;
    const time = extractExplicitTime(lower);
    const endTime = extractExplicitEndTime(lower);
    function toUtc(y: number, m: number, d: number, hh: number, mi: number) {
      return applyTimeOnDateInTz(new Date(y, m, d), hh, mi, timeZone).toISOString();
    }
    if (intent.kind === "event") {
      let startIso = intent.start as string | undefined;
      let endIso = intent.end as string | undefined;
      if (date && time) {
        startIso = toUtc(date.y, date.m, date.d, time.hh, time.mm);
        if (!endIso) endIso = new Date(new Date(startIso).getTime() + 60 * 60000).toISOString();
      } else if (date && startIso) {
        const s = new Date(startIso);
        startIso = toUtc(date.y, date.m, date.d, s.getHours(), s.getMinutes());
        // если есть endIso — тоже приведём к той же дате
        if (endIso) {
          const e = new Date(endIso);
          endIso = toUtc(date.y, date.m, date.d, e.getHours(), e.getMinutes());
        }
      } else if (time && startIso) {
        const s = new Date(startIso);
        startIso = toUtc(s.getFullYear(), s.getMonth(), s.getDate(), time.hh, time.mm);
      }
      if (startIso) intent.start = startIso;
      // Prefer explicit end token even if LLM already provided end
      if (endTime && (date || startIso)) {
        const base = startIso ? new Date(startIso) : new Date(date!.y, date!.m, date!.d);
        endIso = toUtc(base.getFullYear(), base.getMonth(), base.getDate(), endTime.hh, endTime.mm);
      } else if (!endIso && startIso) {
        endIso = new Date(new Date(startIso).getTime() + 60 * 60000).toISOString();
      }
      if (endIso) intent.end = endIso;
    } else {
      // task
      let dueIso = intent.due as string | undefined;
      if (date && time) dueIso = toUtc(date.y, date.m, date.d, time.hh, time.mm);
      else if (date && dueIso) {
        const d0 = new Date(dueIso);
        dueIso = toUtc(date.y, date.m, date.d, d0.getHours(), d0.getMinutes());
      } else if (time && dueIso) {
        const d0 = new Date(dueIso);
        dueIso = toUtc(d0.getFullYear(), d0.getMonth(), d0.getDate(), time.hh, time.mm);
      }
      if (dueIso) intent.due = dueIso;
    }
    return intent;
  } catch { return intent; }
}

// Remove time tokens/ranges from title text
function stripTimeTokens(text: string): string {
  let t = String(text || "");
  // ranges like "с 9 (утра) до 11 (утра)", "9:00–11:30"
  t = t.replace(/\bс\s*\d{1,2}(?::|\.|\s)?\d{0,2}?(?:\s*(утра|дня|вечера|ночи))?\s*(?:до|по)\s*\d{1,2}(?::|\.|\s)?\d{0,2}?(?:\s*(утра|дня|вечера|ночи))?/gi, "");
  t = t.replace(/\b\d{1,2}(?::|\.|\s)?\d{2}\s*[–—-]\s*\d{1,2}(?::|\.|\s)?\d{2}/g, "");
  // phrases like "до 11 утра", "в 9 утра", "к 10"
  t = t.replace(/\b(?:до|по|в|к|на)\s*\d{1,2}(?::|\.|\s)?\d{0,2}?(?:\s*(утра|дня|вечера|ночи))?/gi, "");
  // bare hh:mm or hh.mm
  t = t.replace(/\b\d{1,2}[:.]\d{2}\b/g, "");
  // collapse leftovers
  t = t.replace(/[\s,.;:]+$/g, "");
  t = t.replace(/\s{2,}/g, " ");
  return t.trim();
}

function sanitizeTitleWithTranscript(title: string, transcript: string): { cleanedTitle: string; location?: string } {
  let t = String(title || "");
  t = stripDateTokens(t);
  t = stripTimeTokens(t);
  const { cleanedTitle, location } = extractLocation(t);
  let out = cleanedTitle.trim();
  out = out.replace(/^[-–—\s]+/, "").replace(/[-–—\s]+$/, "");
  return { cleanedTitle: out, location };
}

function extractExplicitDayMonth(lower: string, now: Date): { y: number; m: number; d: number } | null {
  // Patterns like: "на 14 октября", "в 14-го октября", or just "14 октября"
  const months = "января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря";
  const p0 = new RegExp(`(?:\\bна|\\bв)\\s+(\\d{1,2})(?:-?го|-?е)?\\s+(${months})(?=[^а-яa-z0-9]|$)`);
  const m0 = lower.match(p0);
  if (m0) {
    const d = parseInt(m0[1], 10);
    const month = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"].indexOf(m0[2]);
    let y = now.getFullYear();
    const cand = new Date(y, month, d);
    if (cand < new Date(now.getFullYear(), now.getMonth(), now.getDate())) y += 1;
    return { y, m: month, d };
  }
  const m1 = lower.match(new RegExp(`\\b(\\d{1,2})(?:-?го|-?е)?\\s+(${months})(?=[^а-яa-z0-9]|$)`));
  if (m1) {
    const d = parseInt(m1[1], 10);
    const month = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"].indexOf(m1[2]);
    let y = now.getFullYear();
    const cand = new Date(y, month, d);
    if (cand < new Date(now.getFullYear(), now.getMonth(), now.getDate())) y += 1;
    return { y, m: month, d };
  }
  const m2 = lower.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?(?=[^0-9]|$)/);
  if (m2) {
    const d = parseInt(m2[1], 10); const m = parseInt(m2[2], 10) - 1; let y = m2[3] ? parseInt(m2[3], 10) : now.getFullYear();
    if (y < 100) y += 2000;
    return { y, m, d };
  }
  return null;
}

function extractExplicitWeekday(lower: string, now: Date): { y: number; m: number; d: number } | null {
  // в понедельник/во вторник/... → ближайший такой день (включая сегодня)
  const m = lower.match(/\b(?:в|во)\s+(понедельник|вторник|среду|среда|четверг|пятницу|пятница|субботу|суббота|воскресенье)\b/);
  if (!m) return null;
  const wdWord = m[1];
  const WEEKDAY_INDEX = (word: string): number => {
    const w = word.toLowerCase();
    if (w.startsWith("пон")) return 1; // Mon
    if (w.startsWith("вто")) return 2;
    if (w.startsWith("сре")) return 3;
    if (w.startsWith("чет")) return 4;
    if (w.startsWith("пят")) return 5;
    if (w.startsWith("суб")) return 6;
    return 0; // воскресенье
  };
  const target = WEEKDAY_INDEX(wdWord); // 0..6 Sun..Sat (but map accordingly)
  const cur = now.getDay();
  // Convert to Mon=1..Sun=0 mapping → compute delta to next occurrence
  const map = (d: number) => (d === 0 ? 0 : d); // keep 0 for Sunday
  const diff = (target - map(cur) + 7) % 7;
  const cand = new Date(now);
  cand.setHours(0, 0, 0, 0);
  cand.setDate(cand.getDate() + diff);
  return { y: cand.getFullYear(), m: cand.getMonth(), d: cand.getDate() };
}

function extractExplicitTime(lower: string): { hh: number; mm: number } | null {
  // Prefer times with explicit prepositions first: "в/к/с 9 (утра)" etc.
  const withPrep = lower.match(/\b(?:в|к|с)\s*(\d{1,2})(?::|\.|\s)?(\d{2})?(?:\s*(утра|дня|вечера|ночи))?\b/);
  if (withPrep) {
    let hh = parseInt(withPrep[1], 10);
    const mm = withPrep[2] ? parseInt(withPrep[2], 10) : 0;
    const period = (withPrep[3] || "").toLowerCase();
    if ((period === "вечера" || period === "дня") && hh < 12) hh += 12;
    if (period === "ночи" && hh === 12) hh = 0;
    return { hh, mm };
  }
  // HH:MM or HH.MM without preposition
  const hhmm = lower.match(/\b(\d{1,2})(?::|\.)?(\d{2})\b/);
  if (hhmm) return { hh: parseInt(hhmm[1], 10), mm: parseInt(hhmm[2], 10) };
  // Bare HH not followed by a month name (avoid picking day-of-month like "17 октября")
  const months = "января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря";
  const bare = lower.match(new RegExp(`\\b(\\d{1,2})(?!\\s*(?:${months}))\\b`));
  if (bare) return { hh: parseInt(bare[1], 10), mm: 0 };
  return null;
}

function extractExplicitEndTime(lower: string): { hh: number; mm: number } | null {
  // formats: "до 17:00", "до 17 00", with optional period-of-day, or ranges "14:00–15:00" / "с 14 до 16"
  const r0 = lower.match(/(?:до|по)\s*(\d{1,2})(?::|\.|\s)?(\d{2})?(?:\s*(утра|дня|вечера|ночи))?\b/);
  if (r0) {
    let hh = parseInt(r0[1], 10);
    const mm = r0[2] ? parseInt(r0[2], 10) : 0;
    const period = (r0[3] || "").toLowerCase();
    if ((period === "вечера" || period === "дня") && hh < 12) hh += 12;
    if (period === "ночи" && hh === 12) hh = 0;
    return { hh, mm };
  }
  const r2 = lower.match(/(\d{1,2})(?::|\.|\s)?(\d{2})\s*[–—-]\s*(\d{1,2})(?::|\.|\s)?(\d{2})/);
  if (r2) return { hh: parseInt(r2[3], 10), mm: parseInt(r2[4], 10) };
  const r3 = lower.match(/с\s*(\d{1,2})(?::(\d{2}))?(?:\s*(утра|дня|вечера|ночи))?\s*(?:до|по)\s*(\d{1,2})(?::(\d{2}))?(?:\s*(утра|дня|вечера|ночи))?/);
  if (r3) {
    let hh = parseInt(r3[4], 10);
    const mm = r3[5] ? parseInt(r3[5], 10) : 0;
    const period = (r3[6] || "").toLowerCase();
    if ((period === "вечера" || period === "дня") && hh < 12) hh += 12;
    if (period === "ночи" && hh === 12) hh = 0;
    return { hh, mm };
  }
  return null;
}

export async function PUT(req: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await getCurrentPairForUser(auth.userId);
  if (!ctx?.pair) return NextResponse.json({ error: "No pair" }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.intent !== "object") return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { intent } = body as { intent: any };

  if (intent.kind === "event") {
    // If only date provided without time, default to 12:00-13:00 local
    if (!intent.start && !intent.end && typeof intent.date === "string") {
      const [y, m, d] = intent.date.split("-").map((x: string) => parseInt(x, 10));
      // resolve user tz
      let timeZone = "UTC";
      try {
        const me = await prisma.user.findUnique({ where: { id: auth.userId }, select: { timezone: true } });
        timeZone = me?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      } catch {}
      const start = applyTimeOnDateInTz(new Date(y, (m || 1) - 1, d || 1), 12, 0, timeZone);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      intent.start = start.toISOString();
      intent.end = end.toISOString();
    }
    // Ensure end if only start present
    if (intent.start && !intent.end) {
      const s = new Date(intent.start);
      const e = new Date(s.getTime() + 60 * 60 * 1000);
      intent.end = e.toISOString();
    }
    const event = await prisma.event.create({
      data: {
        pairId: ctx.pair.id,
        title: intent.title,
        startAt: intent.start ? new Date(intent.start) : new Date(),
        endAt: intent.end ? new Date(intent.end) : new Date(),
        assignee: intent.assignee || "WE",
        location: typeof intent.location === "string" && intent.location ? intent.location : undefined,
      },
    });
    return NextResponse.json({ saved: { type: "event", id: event.id } });
  }
  // default task
  const task = await prisma.task.create({
    data: {
      pairId: ctx.pair.id,
      createdById: auth.userId,
      title: intent.title,
      assignee: intent.assignee || "WE",
      dueAt: intent.due ? new Date(intent.due) : undefined,
    },
  });
  return NextResponse.json({ saved: { type: "task", id: task.id } });
}


