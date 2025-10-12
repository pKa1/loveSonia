// Utilities for working with IANA time zones without external deps
// Convert a local wall time in a given time zone to a UTC Date

export function getTimeZoneOffsetMinutes(atUtc: Date, timeZone: string): number {
  // Difference between the same UTC instant rendered in target tz vs UTC
  const utcParts = new Date(atUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzParts = new Date(atUtc.toLocaleString("en-US", { timeZone }));
  return Math.round((tzParts.getTime() - utcParts.getTime()) / 60000);
}

export function localDateTimeToUtc(year: number, monthZeroBased: number, day: number, hour: number, minute: number, timeZone: string): Date {
  // Start from wall time as if it were UTC, then subtract tz offset at that instant
  const naiveUtc = new Date(Date.UTC(year, monthZeroBased, day, hour, minute, 0, 0));
  const offset = getTimeZoneOffsetMinutes(naiveUtc, timeZone);
  return new Date(naiveUtc.getTime() - offset * 60000);
}

export function applyTimeOnDateInTz(baseLocalDate: Date, hour: number, minute: number, timeZone: string): Date {
  const y = baseLocalDate.getFullYear();
  const m = baseLocalDate.getMonth();
  const d = baseLocalDate.getDate();
  return localDateTimeToUtc(y, m, d, hour, minute, timeZone);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

export function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}


