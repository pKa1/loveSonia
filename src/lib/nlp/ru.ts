import { applyTimeOnDateInTz, addMinutes, toYMD } from "@/lib/tz";

export type RussianIntent = {
  kind: "task" | "event";
  title: string;
  assignee?: "SELF" | "PARTNER" | "WE";
  start?: string;
  end?: string;
  due?: string;
  date?: string; // YYYY-MM-DD if only date
  location?: string;
};

export function parseRussian(input: string, opts: { timeZone: string; now?: Date }): RussianIntent | null {
  const original = String(input || "").trim();
  if (!original) return null;
  const timeZone = opts.timeZone || "UTC";
  const now = opts.now ? new Date(opts.now) : new Date();

  let text = original.toLowerCase();
  const dateBase = new Date(now);
  if (/послезавтра/.test(text)) dateBase.setDate(dateBase.getDate() + 2);
  else if (/завтра/.test(text)) dateBase.setDate(dateBase.getDate() + 1);

  const explicit = extractExplicitDate(text, now);
  if (explicit?.date) {
    dateBase.setFullYear(explicit.date.getFullYear(), explicit.date.getMonth(), explicit.date.getDate());
  }

  // prefixes
  [
    /^давай(?:-ка)?\s+/, /^(?:пожалуйста|нужно|надо|можешь|сделай)\s+/, /^(?:добавь|добавим|создай|создать)\s+/, /^(?:давай\s+добавим|давай\s+создадим)\s+/
  ].forEach((re) => { text = text.replace(re, ""); });

  const isEventWord = /(встреча|встречу|событие|звонок|созвон|митинг|совещание|планерка|планёрка|планерку|планёрку)/;
  const isTaskWord = /(задача|задачу|напоминание)/;
  let kindHint: "event" | "task" | null = null;
  if (isEventWord.test(text)) kindHint = "event";
  if (isTaskWord.test(text)) kindHint = kindHint || "task";

  // Range: с HH до HH | HH-HH
  const reRange1 = /\bс\s*(\d{1,2})(?::(\d{2}))?\s*(?:до|по)\s*(\d{1,2})(?::(\d{2}))?/i;
  const reRange2 = /(\d{1,2})(?::(\d{2}))?\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?/;
  const mRange = text.match(reRange1) || text.match(reRange2);
  if (mRange) {
    let h1 = parseInt(mRange[1], 10); const min1 = mRange[2] ? parseInt(mRange[2], 10) : 0;
    let h2 = parseInt(mRange[3], 10); const min2 = mRange[4] ? parseInt(mRange[4], 10) : 0;
    const hasEvening = /(вечера|вечер|дня)/.test(text);
    if (hasEvening) { if (h1 < 12) h1 += 12; if (h2 < 12) h2 += 12; }
    const start = applyTimeOnDateInTz(dateBase, h1 % 24, min1 % 60, timeZone);
    const end = applyTimeOnDateInTz(dateBase, h2 % 24, min2 % 60, timeZone);
    let title = cleanupTitle(original, [mRange[0]], isEventWord, isTaskWord);
    title = stripDateTokens(title);
    const { cleanedTitle, location } = extractLocation(title);
    title = cleanedTitle.trim() || "Событие";
    return { kind: "event", title, start: start.toISOString(), end: end.toISOString(), assignee: "WE", location };
  }

  // Range: с HH на N часов/минут
  const reStartDur = /\bс\s*(\d{1,2})(?::(\d{2}))?\s*на\s*(\d{1,2})\s*(час(?:а|ов)?|мин(?:ут)?(?:ы)?)\b/i;
  const mStartDur = text.match(reStartDur);
  if (mStartDur) {
    let hh = parseInt(mStartDur[1], 10); const mm = mStartDur[2] ? parseInt(mStartDur[2], 10) : 0;
    const qty = parseInt(mStartDur[3], 10); const unit = mStartDur[4].toLowerCase();
    const minutes = /час/.test(unit) ? qty * 60 : qty;
    const start = applyTimeOnDateInTz(dateBase, hh % 24, mm % 60, timeZone);
    const end = addMinutes(start, minutes);
    let title = cleanupTitle(original, [mStartDur[0]], isEventWord, isTaskWord);
    title = stripDateTokens(title);
    const { cleanedTitle, location } = extractLocation(title);
    title = cleanedTitle.trim() || "Событие";
    return { kind: "event", title, start: start.toISOString(), end: end.toISOString(), assignee: "WE", location };
  }

  // Conversational time
  const conv = parseConversationalTime(text);
  if (conv) {
    const base = applyTimeOnDateInTz(dateBase, conv.hour, conv.minute, timeZone);
    const durMatch = text.match(/\bна\s*(\d{1,2})\s*(час(?:а|ов)?|мин(?:ут)?(?:ы)?)\b/i);
    const end = durMatch ? addMinutes(base, /час/.test(durMatch[2].toLowerCase()) ? parseInt(durMatch[1], 10) * 60 : parseInt(durMatch[1], 10)) : addMinutes(base, 60);
    let title = cleanupTitle(original, conv.consumed, isEventWord, isTaskWord);
    title = stripDateTokens(title);
    const { cleanedTitle, location } = extractLocation(title);
    title = cleanedTitle.trim() || (kindHint === "task" ? "Задача" : "Встреча");
    if (kindHint === "task") return { kind: "task", title, due: base.toISOString(), assignee: "WE" };
    return { kind: "event", title, start: base.toISOString(), end: end.toISOString(), assignee: "WE", location };
  }

  // Single time: в|на|к HH[:MM] or HH MM
  const reTime = /(?:\b(?:в|на|к)\s*)?(\d{1,2})(?::|\.|\s)?(\d{2})?(?:\s*(утра|вечера|дня|ночи))?\b/i;
  const mTime = text.match(reTime);
  if (mTime) {
    let hh = parseInt(mTime[1], 10);
    const mm = mTime[2] ? parseInt(mTime[2], 10) : 0;
    const period = (mTime[3] || "").toLowerCase();
    if ((period === "вечера" || period === "дня") && hh < 12) hh += 12;
    if (period === "ночи" && hh === 12) hh = 0;
    const base = applyTimeOnDateInTz(dateBase, hh % 24, mm % 60, timeZone);
    const dur = text.match(/\bна\s*(\d{1,2})\s*(час(?:а|ов)?|мин(?:ут)?(?:ы)?)\b/i);
    const end = dur ? addMinutes(base, /час/.test(dur[2].toLowerCase()) ? parseInt(dur[1], 10) * 60 : parseInt(dur[1], 10)) : addMinutes(base, 60);

    let title = cleanupTitle(original, [mTime[0]], isEventWord, isTaskWord);
    title = stripDateTokens(title);
    const { cleanedTitle, location } = extractLocation(title);
    title = cleanedTitle.trim();
    const wantEvent = kindHint === "event" || /\b(встреча|звонок|созвон|митинг|совещание|планерка|планёрка)\b/.test(text);
    if (wantEvent) return { kind: "event", title: title || "Встреча", start: base.toISOString(), end: end.toISOString(), assignee: "WE", location };
    return { kind: "task", title: title || "Задача", due: base.toISOString(), assignee: "WE" };
  }

  // Relative: через N (минут|часов|дней|неделю)
  const mRel = text.match(/через\s*(\d{1,2})\s*(минут(?:у|ы)?|мин|час(?:а|ов)?|день|дня|дней|неделю|недели)/i);
  if (mRel) {
    const qty = parseInt(mRel[1], 10);
    const unit = mRel[2].toLowerCase();
    const base = new Date(dateBase);
    if (/мин/.test(unit)) base.setMinutes(base.getMinutes() + qty);
    else if (/час/.test(unit)) base.setHours(base.getHours() + qty);
    else if (/недел/.test(unit)) base.setDate(base.getDate() + qty * 7);
    else base.setDate(base.getDate() + qty);
    const start = applyTimeOnDateInTz(base, base.getHours(), base.getMinutes(), timeZone);
    const end = addMinutes(start, 60);
    let title = cleanupTitle(original, [mRel[0]], isEventWord, isTaskWord);
    title = stripDateTokens(title);
    if (kindHint === "task") return { kind: "task", title: title || "Задача", due: start.toISOString(), assignee: "WE" };
    return { kind: "event", title: title || "Событие", start: start.toISOString(), end: end.toISOString(), assignee: "WE" };
  }

  // Weekends
  if (/на\s+выходных/.test(text)) {
    const base = new Date(dateBase);
    const day = base.getDay(); // Sun=0
    const diffToSat = (6 - day + 7) % 7; // days until Saturday
    base.setDate(base.getDate() + diffToSat);
    const start = applyTimeOnDateInTz(base, 12, 0, timeZone);
    const end = addMinutes(start, 60);
    let title = stripDateTokens(cleanupTitle(original, ["на выходных"], isEventWord, isTaskWord));
    return { kind: "event", title: title || "Событие", start: start.toISOString(), end: end.toISOString(), assignee: "WE" };
  }

  // Fuzzy: end/start of period
  if (/в\s+конце\s+месяца/.test(text)) {
    const base = new Date(dateBase.getFullYear(), dateBase.getMonth() + 1, 0);
    const start = applyTimeOnDateInTz(base, 12, 0, timeZone);
    const end = addMinutes(start, 60);
    let title = stripDateTokens(cleanupTitle(original, ["в конце месяца"], isEventWord, isTaskWord));
    return { kind: "event", title: title || "Событие", start: start.toISOString(), end: end.toISOString(), assignee: "WE" };
  }
  if (/в\s+начале\s+следующей\s+недели/.test(text)) {
    const base = new Date(dateBase);
    const toMonIdx = (d: number) => (d + 6) % 7;
    const cur = toMonIdx(base.getDay());
    const daysToNextMon = (7 - cur) % 7 || 7;
    base.setDate(base.getDate() + daysToNextMon);
    const start = applyTimeOnDateInTz(base, 12, 0, timeZone);
    const end = addMinutes(start, 60);
    let title = stripDateTokens(cleanupTitle(original, ["в начале следующей недели"], isEventWord, isTaskWord));
    return { kind: "event", title: title || "Событие", start: start.toISOString(), end: end.toISOString(), assignee: "WE" };
  }

  // Fallbacks
  let title = original.replace(isEventWord, "").replace(isTaskWord, "");
  title = title.replace(/\b(сегодня|завтра|послезавтра)\b/gi, "").trim();
  title = stripDateTokens(title);
  if (!title) title = kindHint === "event" ? "Событие" : "Задача";
  if (kindHint === "event") {
    const dateOnly = explicit?.date ? toYMD(explicit.date) : undefined;
    const { cleanedTitle, location } = extractLocation(title);
    return { kind: "event", title: cleanedTitle || "Событие", assignee: "WE", location, ...(dateOnly ? { date: dateOnly } : {}) };
  }
  return { kind: "task", title, assignee: "WE" };
}

export function parseRussianWithConfidence(input: string, opts: { timeZone: string; now?: Date }): { intent: RussianIntent | null; confidence: number } {
  const intent = parseRussian(input, opts);
  if (!intent) return { intent: null, confidence: 0 };
  // Heuristic confidence scoring
  let confidence = 0.6;
  if (intent.kind === "event") confidence += 0.1;
  if (intent.start && intent.end) confidence += 0.2;
  if (intent.due || intent.date) confidence += 0.15;
  if (intent.location) confidence += 0.05;
  if (!intent.title || intent.title.length < 3) confidence -= 0.2;
  confidence = Math.max(0, Math.min(1, confidence));
  return { intent, confidence };
}

function cleanupTitle(source: string, consumed: string[], isEventWord: RegExp, isTaskWord: RegExp) {
  let t = String(source);
  consumed.forEach((c) => { t = t.replace(c, ""); });
  t = t.replace(/\b(сегодня|завтра|послезавтра)\b/gi, "");
  t = t.replace(isEventWord, "");
  t = t.replace(isTaskWord, "");
  t = t.replace(/^\s*(давай|добавь|добавим|создай|создать)\s+/i, "");
  return t;
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

function parseConversationalTime(text: string): { hour: number; minute: number; consumed: string[] } | null {
  // полчетвёртого, полпятого ...
  const halfMap: Record<string, number> = {
    "первого": 0, "второго": 1, "третьего": 2, "четвёртого": 3, "четвертого": 3, "пятого": 4, "шестого": 5, "седьмого": 6, "восьмого": 7, "девятого": 8, "десятого": 9, "одиннадцатого": 10, "двенадцатого": 11,
  };
  const mHalf = text.match(/пол\s*(первого|второго|третьего|четв[её]ртого|пятого|шестого|седьмого|восьмого|девятого|десятого|одиннадцатого|двенадцатого)/);
  if (mHalf) {
    const hour = halfMap[normalizeYo(mHalf[1])] ?? 0;
    return { hour, minute: 30, consumed: [mHalf[0]] };
  }
  // в половине шестого → 5:30
  const mHalf2 = text.match(/в\s+половине\s+(первого|второго|третьего|четв[её]ртого|пятого|шестого|седьмого|восьмого|девятого|десятого|одиннадцатого|двенадцатого)/);
  if (mHalf2) {
    const hour = halfMap[normalizeYo(mHalf2[1])] ?? 0;
    return { hour, minute: 30, consumed: [mHalf2[0]] };
  }
  // без четверти пять → 4:45
  const wordToHour: Record<string, number> = { "час": 1, "два": 2, "три": 3, "четыре": 4, "пять": 5, "шесть": 6, "семь": 7, "восемь": 8, "девять": 9, "десять": 10, "одиннадцать": 11, "двенадцать": 12 };
  const mQuarter = text.match(/без\s+четверти\s+(час|два|три|четыре|пять|шесть|семь|восемь|девять|десять|одиннадцать|двенадцать)/);
  if (mQuarter) {
    const h12 = wordToHour[mQuarter[1]] || 0;
    const hour = (h12 - 1 + 12) % 12; // previous hour
    return { hour, minute: 45, consumed: [mQuarter[0]] };
  }
  return null;
}

function normalizeYo(s: string) { return s.replace("ё", "е"); }


