// Local copy of tz helpers (JS) for running tests without TS imports
function getTimeZoneOffsetMinutes(atUtc, timeZone) {
  const utcParts = new Date(atUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzParts = new Date(atUtc.toLocaleString("en-US", { timeZone }));
  return Math.round((tzParts.getTime() - utcParts.getTime()) / 60000);
}
function localDateTimeToUtc(year, monthZeroBased, day, hour, minute, timeZone) {
  const naiveUtc = new Date(Date.UTC(year, monthZeroBased, day, hour, minute, 0, 0));
  const offset = getTimeZoneOffsetMinutes(naiveUtc, timeZone);
  return new Date(naiveUtc.getTime() - offset * 60000);
}
function applyTimeOnDateInTz(baseLocalDate, hour, minute, timeZone) {
  const y = baseLocalDate.getFullYear();
  const m = baseLocalDate.getMonth();
  const d = baseLocalDate.getDate();
  return localDateTimeToUtc(y, m, d, hour, minute, timeZone);
}

// rec: { id, title, weekday(0..6), startMinute, endMinute, location?, assignee?, fromDate?, toDate? }
export function generateVirtualForDate(dateUTC, timeZone, recs) {
  const now = dateUTC instanceof Date ? dateUTC : new Date(dateUTC);
  const local = new Date(now.toLocaleString("en-US", { timeZone }));
  const y = local.getFullYear();
  const m = local.getMonth();
  const d = local.getDate();
  const weekday = local.getDay(); // 0..6 Sun..Sat
  const dayDate = new Date(y, m, d, 0, 0, 0, 0);

  const out = [];
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
    out.push({
      id: `rec:${r.id}:${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      title: r.title,
      startAt,
      endAt,
      location: r.location ?? null,
      assignee: (r.assignee || "WE"),
    });
  }
  return out;
}


