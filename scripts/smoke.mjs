const base = process.env.BASE || "http://localhost:3000";
const jar = {};
import assert from "node:assert/strict";

async function req(path, opts = {}) {
  opts.headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  const res = await fetch(base + path, { redirect: "manual", ...opts });
  const set = res.headers.get("set-cookie");
  if (set) jar.cookie = set.split(";")[0];
  const bodyText = await res.text();
  let body;
  try { body = JSON.parse(bodyText); } catch { body = bodyText; }
  return { status: res.status, body };
}

async function authed(path, opts = {}) {
  opts.headers = { ...(opts.headers || {}), cookie: jar.cookie };
  return req(path, opts);
}

async function main() {
  console.log("register");
  const email = `smoke+${Date.now()}@test.local`;
  let r = await req("/api/auth/register", { method: "POST", body: JSON.stringify({ name: "Smoke", email, password: "test12345" }) });
  console.log(r.status, r.body.user ? "ok" : r.body);

  console.log("pair create");
  r = await authed("/api/pair/create", { method: "POST" });
  console.log(r.status, r.body.pair?.code);

  console.log("task create");
  r = await authed("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Тест задача", assignee: "WE" }) });
  console.log(r.status, r.body.task?.id);

  console.log("event create");
  const now = new Date();
  const later = new Date(now.getTime() + 60 * 60 * 1000);
  r = await authed("/api/events", { method: "POST", body: JSON.stringify({ title: "Тест встреча", startAt: now, endAt: later }) });
  console.log(r.status, r.body.event?.id);

  console.log("availability set");
  r = await authed("/api/availability", { method: "POST", body: JSON.stringify({ startMinute: 22*60, endMinute: 8*60 }) });
  console.log(r.status, r.body.quietHours?.id);

  console.log("nlp create");
  r = await authed("/api/nlp", { method: "POST", body: JSON.stringify({ text: "завтра 19:00 ужин у мамы" }) });
  console.log(r.status, r.body.created);

  // NLP phrase suite
  const cases = [
    { text: "Встреча с клиентом 26 октября в 16 00 в офисе", expect: "event" },
    { text: "Презентация с 14 до 16 в Zoom", expect: "event" },
    { text: "Звонок в 15 на 30 минут", expect: "event" },
    { text: "в половине шестого встреча", expect: "event" },
    { text: "встреча через 2 часа", expect: "event" },
    { text: "задача купить торт в 19", expect: "task" },
    { text: "в пятницу 14:30 встреча", expect: "event" },
    { text: "в конце месяца оплатить аренду", expect: "event" },
    { text: "в начале следующей недели демо", expect: "event" },
    { text: "26.10 встреча", expect: "event" },
    { text: "26-10-25 встреча", expect: "event" },
    { text: "на выходных прогулка", expect: "event" },
    { text: "создай задачу позвонить Васе завтра в 10", expect: "task" },
    // more coverage
    { text: "Встреча завтра в 10:00", expect: "event" },
    { text: "Созвон послезавтра в 18:30", expect: "event" },
    { text: "Совещание на 11 15", expect: "event" },
    { text: "Митинг 10:00–11:30", expect: "event" },
    { text: "С 9 до 10 тренировка", expect: "event" },
    { text: "Встреча 26/10/2025 в 19:00", expect: "event" },
    { text: "Задача купить молоко", expect: "task" },
    { text: "Напоминание позвонить маме завтра в 10", expect: "task" },
    { text: "Задачу оформить отчёт", expect: "task" },
    { text: "Встреча в 16 в офисе на Ленина", expect: "event" },
    { text: "В понедельник 08:00 созвон", expect: "event" },
    { text: "Совещание с 18:00 до 20:30", expect: "event" },
    { text: "Созвон в 09 00 на 15 минут", expect: "event" },
    { text: "Задача на завтра купить билет", expect: "task" },
    { text: "Встреча 26.10 в 12:00", expect: "event" },
    { text: "Митинг завтра в 10", expect: "event" },
    { text: "Встреча в 3 дня", expect: "event" },
    { text: "Встреча в 10 ночи", expect: "event" },
    { text: "Звонок партнёру в 11:45", expect: "event" },
    { text: "Встреча с 7 до 8 утра", expect: "event" },
    { text: "Совещание с 13 до 15 дня", expect: "event" },
    { text: "Встреча 26-10-2025 в 09:00", expect: "event" },
    { text: "Задача оплатить интернет в пятницу", expect: "task" },
    { text: "Добавь задачу купить хлеб утром", expect: "task" },
    { text: "Напоминание завтра в 08:00 зарядка", expect: "task" },
    { text: "Задачу договор отправить в 14:00", expect: "task" },
    { text: "Встреча сегодня в 18", expect: "event" },
    { text: "Звонок завтра в 09:30", expect: "event" },
    { text: "Совещание на 10 00 у метро", expect: "event" },
    { text: "Митинг 12:00–13:00 в переговорной", expect: "event" },
    { text: "Встреча 31.12 в 23:00", expect: "event" },
    { text: "Встреча в субботу 12:00", expect: "event" },
    { text: "В воскресенье 18:00 созвон", expect: "event" },
    { text: "Встреча через 1 день", expect: "event" },
    { text: "Встреча через 30 минут", expect: "event" },
    { text: "Встреча через 1 неделю", expect: "event" },
    { text: "Презентация с 9 до 11", expect: "event" },
    { text: "Презентация 10:00 - 12:00", expect: "event" },
    { text: "Звонок в 17 на 45 минут", expect: "event" },
    { text: "Совещание в 08 30", expect: "event" },
    { text: "Встреча 01/01 в 10:00", expect: "event" },
    { text: "Задача дописать план", expect: "task" },
    { text: "Напоминание сдать отчёт завтра", expect: "task" },
    { text: "Создай задачу отправить письмо в 16:00", expect: "task" },
    { text: "Встреча в 14.00 на 2 часа", expect: "event" },
    { text: "Совещание во вторник 11:00", expect: "event" },
    { text: "Митинг в четверг 15:00", expect: "event" },
    { text: "Встреча 10.10.2025 в 18:00", expect: "event" },
    { text: "Задача подготовить презентацию в пятницу", expect: "task" },
    { text: "Напоминание позвонить завтра", expect: "task" }
    ,{ text: "Созвон к 10 в офисе", expect: "event" }
    ,{ text: "Встреча к 13:15", expect: "event" }
    ,{ text: "Встретиться в 18.45 у метро", expect: "event" }
    ,{ text: "C 12 до 13 обед с коллегой", expect: "event" }
    ,{ text: "12:00-13:00 ланч", expect: "event" }
    ,{ text: "10.11 встреча с отделом", expect: "event" }
    ,{ text: "10/11 встреча с отделом", expect: "event" }
    ,{ text: "10-11 встреча с отделом", expect: "event" }
    ,{ text: "в среду 16:00 созвон", expect: "event" }
    ,{ text: "во вторник 09:00 планёрка", expect: "event" }
    ,{ text: "в четверг 19:30 ужин", expect: "event" }
    ,{ text: "в субботу 10 30 тренировка", expect: "event" }
    ,{ text: "в воскресенье 21:00 фильм", expect: "event" }
    ,{ text: "через 3 часа встреча у входа", expect: "event" }
    ,{ text: "через 45 минут звонок", expect: "event" }
    ,{ text: "через 2 дня поездка", expect: "event" }
    ,{ text: "через 1 неделю брифинг", expect: "event" }
    ,{ text: "полчетвертого созвон", expect: "event" }
    ,{ text: "в половине пятого встреча", expect: "event" }
    ,{ text: "без четверти пять встреча", expect: "event" }
    ,{ text: "в 7 утра пробежка", expect: "event" }
    ,{ text: "в 8 вечера концерт", expect: "event" }
    ,{ text: "в 11 дня бранч", expect: "event" }
    ,{ text: "в 2 ночи рейс", expect: "event" }
    ,{ text: "на 09 00 совещание", expect: "event" }
    ,{ text: "на 18.00 встреча", expect: "event" }
    ,{ text: "к 10:00 подойти к ресепшн", expect: "event" }
    ,{ text: "с 15 на два часа демо", expect: "event" }
    ,{ text: "с 9:30 на 90 минут презентация", expect: "event" }
    ,{ text: "встреча 05.01 в 09:00", expect: "event" }
    ,{ text: "встреча 05/01/2026 в 09:00", expect: "event" }
    ,{ text: "встреча 05-01-26 в 09:00", expect: "event" }
    ,{ text: "встреча 5 января в 09:00", expect: "event" }
    ,{ text: "встреча 5 января", expect: "event" }
    ,{ text: "митинг 7 фев в 10", expect: "event" }
    ,{ text: "митинг 7 февраля", expect: "event" }
    ,{ text: "митинг 7 февраля в 10:30", expect: "event" }
    ,{ text: "совещание 12 мар в 12:00", expect: "event" }
    ,{ text: "звонок клиенту к 17", expect: "event" }
    ,{ text: "созвон на 14 15", expect: "event" }
    ,{ text: "бриф к 09 45", expect: "event" }
    ,{ text: "собеседование в 16 00", expect: "event" }
    ,{ text: "собеседование 16:00–17:00", expect: "event" }
    ,{ text: "лекция 18:00 - 19:30", expect: "event" }
    ,{ text: "семинар с 10 до 13", expect: "event" }
    ,{ text: "митап 19.00", expect: "event" }
    ,{ text: "митап 19 00", expect: "event" }
    ,{ text: "митап на 19:00", expect: "event" }
    ,{ text: "встреча на 2 часа в 14:00", expect: "event" }
    ,{ text: "звонок на 20 минут в 10:10", expect: "event" }
    ,{ text: "созвон в 12 по адресу офис", expect: "event" }
    ,{ text: "встреча в 18 у метро Площадь", expect: "event" }
    ,{ text: "встреча к 12 в кафе", expect: "event" }
    ,{ text: "встреча в 09 00 в переговорной", expect: "event" }
    ,{ text: "встреча 30.06 в 18:30 на 2 часа", expect: "event" }
    ,{ text: "встреча завтра в 20:00 на 15 минут", expect: "event" }
    ,{ text: "задача купить билеты", expect: "task" }
    ,{ text: "добавь задачу оплатить телефон", expect: "task" }
    ,{ text: "нужно сделать задачу: собрать отчёт", expect: "task" }
    ,{ text: "пожалуйста, напоминание позвонить врачу", expect: "task" }
    ,{ text: "напоминание завтра в 7:30 зарядка", expect: "task" }
    ,{ text: "задача в 13:00 отправить счёт", expect: "task" }
    ,{ text: "задачу дописать спецификацию к 17:00", expect: "task" }
    ,{ text: "напоминание через 3 часа отправить письмо", expect: "task" }
    ,{ text: "задача через 2 дня подготовить документы", expect: "task" }
    ,{ text: "напоминание через неделю продлить подписку", expect: "task" }
    ,{ text: "задачу проверить отчёт в пятницу", expect: "task" }
    ,{ text: "задача утром забрать посылку", expect: "task" }
    ,{ text: "напоминание вечером полить цветы", expect: "task" }
    ,{ text: "задачу завтра до 10 загрузить файл", expect: "task" }
    ,{ text: "напоминание сегодня в 21:00 принять витамины", expect: "task" }
    ,{ text: "задача на выходных навести порядок", expect: "task" }
    ,{ text: "встреча с партнёром завтра в 11:00", expect: "event" }
    ,{ text: "созвон с командой в 09:00", expect: "event" }
    ,{ text: "презентация для клиента с 16:00 до 17:30", expect: "event" }
    ,{ text: "брифинг в 10:05 на 25 минут", expect: "event" }
    ,{ text: "встреча через 10 минут", expect: "event" }
    ,{ text: "встреча через 90 минут", expect: "event" }
    ,{ text: "демо к 13:00", expect: "event" }
    ,{ text: "демо на 13 00", expect: "event" }
    ,{ text: "митинг к 18 45", expect: "event" }
    ,{ text: "совещание на 08.30", expect: "event" }
    ,{ text: "встреча в 12 дня на 1 час", expect: "event" }
    ,{ text: "созвон в 9 утра на 15 минут", expect: "event" }
    ,{ text: "звонок в 10 вечера", expect: "event" }
    ,{ text: "встреча во вторник в 12:00", expect: "event" }
    ,{ text: "встреча в четверг в 18", expect: "event" }
    ,{ text: "встреча 15.01.2026 в 14:00", expect: "event" }
    ,{ text: "встреча 15/01 в 14:00", expect: "event" }
    ,{ text: "встреча 15-01 в 14:00", expect: "event" }
    ,{ text: "встреча 15 января 14:00", expect: "event" }
    ,{ text: "встреча пятница 14:00", expect: "event" }
    ,{ text: "созвон понедельник 09:00", expect: "event" }
    ,{ text: "встреча сегодня 13:00", expect: "event" }
    ,{ text: "встреча завтра 18:00", expect: "event" }
    ,{ text: "встреча послезавтра 10:00", expect: "event" }
    ,{ text: "митинг завтра 10:30", expect: "event" }
    ,{ text: "совещание сегодня 16:20", expect: "event" }
    ,{ text: "звонок завтра 08:55", expect: "event" }
    ,{ text: "прогон 12:00-12:30", expect: "event" }
    ,{ text: "конференция 11.11 в 11:11", expect: "event" }
    ,{ text: "конференция 11/11 в 11:11", expect: "event" }
    ,{ text: "конференция 11-11 в 11:11", expect: "event" }
    ,{ text: "конференция 11 ноября в 11:11", expect: "event" }
  ];
  for (const c of cases) {
    const rr = await authed("/api/nlp", { method: "POST", body: JSON.stringify({ text: c.text }) });
    assert.equal(rr.status, 200, `status for '${c.text}'`);
    assert.equal(rr.body.created?.type, c.expect, `type for '${c.text}'`);
    console.log("✓ nlp:", c.text);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


