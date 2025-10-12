import assert from "node:assert";
import { generateVirtualForDate } from "../src/lib/recurring.js";

function t(name, fn) { try { fn(); console.log("✓", name); } catch (e) { console.error("✗", name, "\n", e); process.exitCode = 1; } }

const tz = "Europe/Moscow";

// Pick a Monday in UTC reference
const mondayUtc = new Date("2025-10-13T09:00:00Z");

t("Generates slot on same weekday within period", () => {
  const recs = [{ id: "r1", title: "Планерка", weekday: 1, startMinute: 9*60, endMinute: 10*60, fromDate: "2025-10-01T00:00:00Z", toDate: "2025-12-31T00:00:00Z" }];
  const out = generateVirtualForDate(mondayUtc, tz, recs);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, "Планерка");
});

t("Skips slot on other weekday", () => {
  const recs = [{ id: "r1", title: "Планерка", weekday: 2, startMinute: 9*60, endMinute: 10*60 }];
  const out = generateVirtualForDate(mondayUtc, tz, recs);
  assert.equal(out.length, 0);
});

t("Skips outside period", () => {
  const recs = [{ id: "r1", title: "Планерка", weekday: 1, startMinute: 9*60, endMinute: 10*60, fromDate: "2025-11-01T00:00:00Z" }];
  const out = generateVirtualForDate(mondayUtc, tz, recs);
  assert.equal(out.length, 0);
});

console.log("Done");


