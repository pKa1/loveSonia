// E2E test for recurring slots and calendar rendering via API
// Requires the dev server running (e.g., next dev) on BASE_URL

const BASE_URL = process.env.BASE_URL || "http://localhost:3003";

let cookie = "";
function updateCookie(res) {
  const set = res.headers.get("set-cookie");
  if (!set) return;
  // very naive: keep only trackz_token
  const m = set.match(/trackz_token=[^;]+/);
  if (m) cookie = m[0];
}
async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(BASE_URL + path, { ...opts, headers });
  updateCookie(res);
  let json = null;
  try { json = await res.json(); } catch {}
  return { res, json };
}
function t(name, fn) { return fn().then(() => console.log("✓", name)).catch((e) => { console.error("✗", name, "\n", e?.message || e); process.exitCode = 1; }); }

function isoAt(hh, mm) {
  const d = new Date(); d.setHours(hh, mm, 0, 0); return d.toISOString();
}
function startOfDayISO(d = new Date()) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return x.toISOString(); }
function addDaysISO(d = new Date(), days = 0) { const x = new Date(d); x.setDate(x.getDate() + days); return x.toISOString(); }

(async () => {
  const unique = Math.random().toString(36).slice(2, 8);
  await t("register", async () => {
    const { res } = await api("/api/auth/register", { method: "POST", body: JSON.stringify({ name: "Tester", email: `tester+${unique}@test.local`, password: "test12345" }) });
    if (!res.ok) throw new Error("register failed " + res.status);
  });
  await t("create pair", async () => {
    const { res } = await api("/api/pair/create", { method: "POST" });
    if (!res.ok) throw new Error("pair create failed");
  });
  let categoryId = "";
  await t("create category", async () => {
    const { res, json } = await api("/api/categories", { method: "POST", body: JSON.stringify({ name: "Офис", color: "#ff8f70" }) });
    if (!res.ok) throw new Error("category create failed");
    const { categories } = await api("/api/categories").then((r)=>r.json);
    categoryId = (categories || []).find((c)=>c.name === "Офис")?.id || json?.id || "";
  });
  let slotId = "";
  await t("create recurring slot today 09:00-10:00", async () => {
    const weekday = new Date().getDay(); // 0..6
    const { res, json } = await api("/api/recurring", { method: "POST", body: JSON.stringify({ title: "Планёрка", weekday, startMinute: 9*60, endMinute: 10*60, fromDate: startOfDayISO(), toDate: addDaysISO(new Date(), 14), categoryId }) });
    if (!res.ok) throw new Error("recurring create failed");
    slotId = json?.item?.id || "";
    if (!slotId) throw new Error("no slot id");
  });
  await t("events include 1 virtual for today", async () => {
    const start = startOfDayISO(); const end = start;
    const { res, json } = await api(`/api/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
    if (!res.ok) throw new Error("events failed");
    const rec = (json.events || []).filter((e) => String(e.id).startsWith("rec:"));
    if (rec.length !== 1) throw new Error("expected 1 virtual, got " + rec.length);
    if (!rec[0].category) throw new Error("virtual must have category color");
  });
  await t("update slot title and assignee", async () => {
    const { res } = await api("/api/recurring", { method: "PATCH", body: JSON.stringify({ id: slotId, title: "Планёрка команда", assignee: "SELF" }) });
    if (!res.ok) throw new Error("recurring update failed");
  });
  await t("events reflect updated slot without duplicates", async () => {
    const start = startOfDayISO(); const end = start;
    const { json } = await api(`/api/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
    const list = json.events || [];
    const rec = list.filter((e) => String(e.id).startsWith("rec:"));
    if (rec.length !== 1) throw new Error("expected 1 virtual after update, got " + rec.length);
    if (!rec[0].title.includes("команда")) throw new Error("title not updated");
    const normals = list.filter((e)=>!String(e.id).startsWith("rec:"));
    // no normal duplicates unless explicitly created
    if (normals.length !== 0) throw new Error("unexpected normal events present " + normals.length);
  });
  await t("materialize one-off copy", async () => {
    const start = isoAt(9,0); const end = isoAt(10,0);
    const { res } = await api("/api/events", { method: "POST", body: JSON.stringify({ title: "Планёрка единичная", startAt: start, endAt: end, assignee: "WE", categoryId }) });
    if (!res.ok) throw new Error("create event failed");
  });
  await t("events do not duplicate virtual when overlapping with one-off", async () => {
    const start = startOfDayISO(); const end = start;
    const { json } = await api(`/api/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
    const list = json.events || [];
    const rec = list.filter((e) => String(e.id).startsWith("rec:"));
    const normals = list.filter((e)=>!String(e.id).startsWith("rec:"));
    if (normals.length < 1) throw new Error("one-off not found");
    if (rec.length !== 0) throw new Error("virtual should be hidden due to overlap");
  });
  console.log("Done E2E");
})();


