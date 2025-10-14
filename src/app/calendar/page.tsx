"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRealtime } from "@/hooks/useRealtime";

type ViewMode = "day" | "week" | "month";
type Event = { id: string; title: string; startAt: string; endAt: string; location?: string | null; allDay: boolean; assignee?: "SELF" | "PARTNER" | "WE"; categoryId?: string | null; category?: { id: string; name: string; color: string } | null };

export default function CalendarPage() {
  const [mode, setMode] = useState<ViewMode>("day");
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [assignee, setAssignee] = useState<"я" | "ты" | "мы">("мы");
  const [categories, setCategories] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<"self" | "partner" | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editAssigneeUi, setEditAssigneeUi] = useState<"я" | "ты" | "мы">("мы");
  const [editCategoryId, setEditCategoryId] = useState<string>("");
  const [viewStartMin, setViewStartMin] = useState<number>(8 * 60);
  const [viewEndMin, setViewEndMin] = useState<number>(22 * 60);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { start, end } = currentRange(mode, anchor);
        const url = `/api/events?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error("failed");
        const d = await r.json().catch(() => ({}));
        setEvents(d.events ?? []);
      } catch (e) {
        try { console.warn("[Calendar] initial fetch failed", e); } catch {}
        setEvents([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [mode, anchor]);
  useEffect(() => {
    (async () => {
      const r = await fetch("/api/categories");
      const d = await r.json().catch(() => ({}));
      setCategories(d.categories ?? []);
    })();
  }, []);
  useEffect(() => {
    const id = setInterval(() => {
      const { start, end } = currentRange(mode, anchor);
      const url = `/api/events?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
      fetch(url)
        .then((r) => r.json())
        .then((d) => setEvents(d.events ?? []))
        .catch(() => {});
    }, 10000);
    return () => clearInterval(id);
  }, [mode, anchor]);
  useEffect(() => {
    (async () => {
      try {
        const [meRes, pairRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/pair/get"),
        ]);
        const me = await meRes.json().catch(() => ({}));
        const pair = await pairRes.json().catch(() => ({}));
        const pairId: string | undefined = pair?.pair?.id;
        const memberships: Array<{ role: string; pairId: string }> = me.user?.pairMemberships ?? [];
        let role: "self" | "partner" | undefined;
        if (pairId) {
          role = memberships.find((m) => m.pairId === pairId)?.role as any;
        }
        if (!role) role = memberships[0]?.role as any;
        if (role === "self" || role === "partner") setMyRole(role);
        try {
          console.log("[Calendar] detected role:", role, { pairId, memberships });
        } catch {}
        // load quiet hours to configure calendar range
        try {
          const q = await fetch("/api/availability").then((r) => r.json()).catch(() => ({}));
          if (q?.quietHours) {
            const { startMinute, endMinute } = q.quietHours as { startMinute: number; endMinute: number };
            const span = computeViewSpan(startMinute, endMinute);
            setViewStartMin(span.startMin);
            setViewEndMin(span.endMin);
          } else {
            const span = computeViewSpan(22 * 60, 8 * 60);
            setViewStartMin(span.startMin);
            setViewEndMin(span.endMin);
          }
        } catch {}
      } catch {}
    })();
  }, []);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("eventOpacity");
      const val = saved ? Math.max(10, Math.min(100, parseInt(saved, 10))) : 85;
      document.documentElement.style.setProperty("--event-opacity", `${val}%`);
    } catch {}
  }, []);
  const onRealtime = useCallback((type: "tasks" | "events" | "availability" | "recurring:update") => {
    if (type === "events") {
      const { start, end } = currentRange(mode, anchor);
      const url = `/api/events?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
      fetch(url).then((r) => r.json()).then((d) => setEvents(d.events ?? [])).catch(() => {});
    }
    // Обновляем при изменениях регулярных слотов
    if ((type as string).startsWith("recurring:")) {
      const { start, end } = currentRange(mode, anchor);
      const url = `/api/events?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
      fetch(url).then((r) => r.json()).then((d) => setEvents(d.events ?? [])).catch(() => {});
    }
    if (type === "availability") {
      fetch("/api/availability").then((r) => r.json()).then((q) => {
        if (q?.quietHours) {
          const span = computeViewSpan(q.quietHours.startMinute, q.quietHours.endMinute);
          setViewStartMin(span.startMin);
          setViewEndMin(span.endMin);
        }
      }).catch(() => {});
    }
  }, []);
  useRealtime(onRealtime);
  useEffect(() => {
    if (!selectedEvent) return;
    setEditTitle(selectedEvent.title || "");
    setEditLocation(selectedEvent.location || "");
    setEditStart(toInputDateTimeValue(selectedEvent.startAt));
    setEditEnd(toInputDateTimeValue(selectedEvent.endAt));
    setEditAssigneeUi(assigneeUiFromEvent(myRole, selectedEvent.assignee));
    try {
      setEditCategoryId(selectedEvent.category?.id || selectedEvent.categoryId || "");
    } catch {
      setEditCategoryId("");
    }
  }, [selectedEvent, myRole]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 overflow-x-hidden">
      <div className="space-y-2">
        <div className="text-2xl font-semibold">Календарь</div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="rounded-md border px-3 py-2 text-sm" onClick={() => setOpen(true)}>Добавить</button>
          <div className="flex items-center gap-2">
            <button className="rounded-md border px-2 py-1 text-sm" onClick={() => setAnchor(addDays(anchor, - (mode === "day" ? 1 : mode === "week" ? 7 : 30)))}>{"<"}</button>
            <button className={`rounded-md border px-3 py-2 text-sm ${mode === "day" ? "bg-accent" : ""}`} onClick={() => { setMode("day"); setAnchor(new Date()); }}>Сегодня</button>
          <button className={`rounded-md border px-3 py-2 text-sm ${mode === "week" ? "bg-accent" : ""}`} onClick={() => setMode("week")}>Неделя</button>
          <button className={`rounded-md border px-3 py-2 text-sm ${mode === "month" ? "bg-accent" : ""}`} onClick={() => setMode("month")}>Месяц</button>
            <button className="rounded-md border px-2 py-1 text-sm" onClick={() => setAnchor(addDays(anchor, (mode === "day" ? 1 : mode === "week" ? 7 : 30)))}>{">"}</button>
          </div>
        </div>
      </div>
      {(["week","month"] as const).includes(mode) && categories.length > 0 && (
        <div className="mt-1">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center gap-2 min-w-0">
                <span className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-border shrink-0" style={{ backgroundColor: c.color }} />
                <span className="truncate text-xs text-muted-foreground">{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-r-transparent text-muted-foreground" aria-label="Загрузка" />
        </div>
      ) : (
        <>
          {mode === "day" ? (
            <DayView events={events} anchor={anchor} myRole={myRole} onOpen={(e) => { setSelectedEvent(e); setEditMode(false); }} />
          ) : mode === "week" ? (
            <WeekView events={events} anchor={anchor} myRole={myRole} onOpen={(e) => { setSelectedEvent(e); setEditMode(false); }} />
          ) : (
            <MonthView events={events} anchor={anchor} onOpen={(e) => { setSelectedEvent(e); setEditMode(false); }} />
          )}
        </>
      )}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setOpen(false)} />
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-xl border bg-background p-4 shadow-lg max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="text-center text-sm font-medium">Новое событие</div>
            <div className="mt-3 space-y-3">
              <input className="w-full rounded-md border px-3 py-2" placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} />
              <input className="w-full rounded-md border px-3 py-2" placeholder="Локация (необязательно)" value={location} onChange={(e) => setLocation(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm">
                  <div className="mb-1 text-muted-foreground">Начало</div>
                  <input type="datetime-local" className="w-full rounded-md border px-3 py-2" value={start} onChange={(e) => setStart(e.target.value)} />
                </label>
                <label className="text-sm">
                  <div className="mb-1 text-muted-foreground">Конец</div>
                  <input type="datetime-local" className="w-full rounded-md border px-3 py-2" value={end} onChange={(e) => setEnd(e.target.value)} />
                </label>
              </div>
              <label className="text-sm">
                <div className="mb-1 text-muted-foreground">Категория</div>
                <select className="w-full rounded-md border px-3 py-2" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">Без категории</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-2 mt-2">
                {(["я", "ты", "мы"] as const).map((v) => (
                  <button key={v} className={`flex-1 rounded-md border px-3 py-2 text-sm ${assignee === v ? "bg-accent" : ""}`} onClick={() => setAssignee(v)}>
                    {v}
                  </button>
                ))}
              </div>
              {error && <div className="text-sm text-destructive">{error}</div>}
              <div className="flex gap-2 pt-1">
                <button className="flex-1 rounded-md border px-3 py-2 text-sm" onClick={() => setOpen(false)}>Отмена</button>
                <button
                  className="flex-1 rounded-md border px-3 py-2 text-sm"
                  onClick={async () => {
                    setError(null);
                    const mapSelf: Record<string, string> = { "я": "SELF", "ты": "PARTNER", "мы": "WE" };
                    const mapPartner: Record<string, string> = { "я": "PARTNER", "ты": "SELF", "мы": "WE" };
                    const assigneeValue = (myRole === "partner" ? mapPartner : mapSelf)[assignee];
                    if (!title || !start || !end) { setError("Заполните название, начало и конец"); return; }
                    if (new Date(start).getTime() >= new Date(end).getTime()) { setError("Конец должен быть позже начала"); return; }
                    const res = await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, location: location || undefined, startAt: start, endAt: end, assignee: assigneeValue, categoryId: categoryId || undefined }) });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      setError(data.error || "Не удалось создать событие");
                      return;
                    }
                    const created = await res.json().catch(() => null);
                    setTitle(""); setLocation(""); setStart(""); setEnd(""); setAssignee("мы"); setCategoryId(""); setOpen(false);
                    {
                      const { start, end } = currentRange(mode, anchor);
                      const url = `/api/events?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
                      const d = await fetch(url).then((r) => r.json()); setEvents(d.events ?? []);
                    }
                    try {
                      const nextAnchor = created?.event?.startAt ? new Date(created.event.startAt) : new Date(start);
                      if (!isNaN(nextAnchor.getTime())) setAnchor(nextAnchor);
                    } catch {}
                  }}
                >
                  Создать
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedEvent && (
        <>
          <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setSelectedEvent(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelectedEvent(null)}>
            <div className="w-full max-w-md rounded-xl border bg-background p-4 shadow-lg max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
              {!editMode ? (
                <>
                  <div className="text-center text-sm font-medium">Событие</div>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="text-xs text-muted-foreground font-mono">{fmtRange(new Date(selectedEvent.startAt), new Date(selectedEvent.endAt))}</div>
                    <div className="text-base font-semibold">{selectedEvent.title}</div>
                    {selectedEvent.location && (<div className="text-muted-foreground">{selectedEvent.location}</div>)}
                    <div className="text-muted-foreground">Назначено: {assigneeLabel(myRole, selectedEvent.assignee)}</div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button className="flex-1 rounded-md border px-3 py-2 text-sm" onClick={() => setSelectedEvent(null)}>Закрыть</button>
                    {String(selectedEvent.id).startsWith("rec:") ? (
                      <a className="flex-1 rounded-md border px-3 py-2 text-sm text-center" href={`/pair?slot=${String(selectedEvent.id).split(":")[1]}`}>Изменить слот</a>
                    ) : (
                      <button className="flex-1 rounded-md border px-3 py-2 text-sm" onClick={() => { setEditMode(true); }}>
                        Редактировать
                      </button>
                    )}
                    <button
                      className="rounded-md border px-3 py-2 text-sm"
                      onClick={async () => {
                        if (!selectedEvent) return;
                        if (String(selectedEvent.id).startsWith("rec:")) {
                          // Нельзя удалить виртуальное событие
                          alert("Это регулярный слот. Удалите его во вкладке Пара → Регулярное расписание.");
                          return;
                        }
                        await fetch(`/api/events/${selectedEvent.id}`, { method: "DELETE" });
                        {
                          const { start, end } = currentRange(mode, anchor);
                          const url = `/api/events?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
                          const d = await fetch(url).then((r) => r.json()); setEvents(d.events ?? []);
                        }
                        setSelectedEvent(null);
                      }}
                    >Удалить</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center text-sm font-medium">Редактирование</div>
                  <div className="mt-3 space-y-3 text-sm">
                    <label className="block">
                      <div className="mb-1 text-muted-foreground">Название</div>
                      <input className="w-full rounded-md border px-3 py-2" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                    </label>
                    <label className="block">
                      <div className="mb-1 text-muted-foreground">Локация</div>
                      <input className="w-full rounded-md border px-3 py-2" value={editLocation} onChange={(e) => setEditLocation(e.target.value)} />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-sm">
                        <div className="mb-1 text-muted-foreground">Начало</div>
                        <input type="datetime-local" className="w-full rounded-md border px-3 py-2" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
                      </label>
                      <label className="text-sm">
                        <div className="mb-1 text-muted-foreground">Конец</div>
                        <input type="datetime-local" className="w-full rounded-md border px-3 py-2" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
                      </label>
                    </div>
                    <div>
                  <div className="mb-1 text-muted-foreground">Категория</div>
                  <select className="w-full rounded-md border px-3 py-2" value={editCategoryId} onChange={(e) => setEditCategoryId(e.target.value)}>
                    <option value="">Без категории</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                      <div className="mb-1 text-muted-foreground">Назначение</div>
                      <div className="flex items-center gap-2">
                        {["я", "ты", "мы"].map((v) => (
                          <button key={v} className={`flex-1 rounded-md border px-3 py-2 text-sm ${editAssigneeUi === v ? "bg-accent" : ""}`} onClick={() => setEditAssigneeUi(v as any)}>
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button className="flex-1 rounded-md border px-3 py-2 text-sm" onClick={() => setEditMode(false)}>Назад</button>
                    <button
                      className="flex-1 rounded-md border px-3 py-2 text-sm"
                      onClick={async () => {
                        if (!selectedEvent) return;
                        const assignee = assigneeFromUi(myRole, editAssigneeUi);
                        if (String(selectedEvent.id).startsWith("rec:")) {
                          alert("Это регулярный слот. Изменения вносятся целиком во вкладке Пара → Регулярное расписание.");
                          setEditMode(false);
                          return;
                        }
                        await fetch(`/api/events/${selectedEvent.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: editTitle, location: editLocation || undefined, startAt: editStart || undefined, endAt: editEnd || undefined, assignee, categoryId: editCategoryId || null }) });
                        {
                          const { start, end } = currentRange(mode, anchor);
                          const url = `/api/events?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
                          const d = await fetch(url).then((r) => r.json()); setEvents(d.events ?? []);
                        }
                        setSelectedEvent(null);
                        setEditMode(false);
                      }}
                    >Сохранить</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
function currentRange(mode: ViewMode, anchor: Date) {
  if (mode === "day") {
    const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    return { start: d, end: d };
  }
  if (mode === "week") {
    const start = getStartOfWeek(anchor);
    const end = addDays(start, 6);
    return { start, end };
  }
  // month
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = getStartOfWeek(first);
  const end = addDays(start, 41); // 6 недель - 1
  return { start, end };
}
function DayView({ events, anchor, myRole, onOpen }: { events: Event[]; anchor: Date; myRole: "self" | "partner" | null; onOpen: (e: Event) => void }) {
  const { startMin, endMin } = getViewSpan();
  const hours = Array.from({ length: Math.ceil((endMin - startMin) / 60) }, (_, i) => Math.floor(startMin / 60) + i);
  const dayEvents = events.filter((e) => sameDay(new Date(e.startAt), anchor));
  const headerDate = `${String(anchor.getDate()).padStart(2, "0")}.${String(anchor.getMonth() + 1).padStart(2, "0")}.${anchor.getFullYear()}`;
  const laneOf = (a?: "SELF" | "PARTNER" | "WE") => {
    if (a === "WE") return "both" as const;
    if (myRole === "partner") return a === "SELF" ? 1 : 0; // для партнёра: его "я" = PARTNER справа
    if (myRole === "self") return a === "SELF" ? 0 : 1;
    return "both" as const; // пока роль не определена — в обе колонки, чтобы не путать
  };

  function layoutLane(items: Event[]) {
    // Алгоритм раскладки пересечений на подколонки внутри лейна
    type Laid = { e: Event; col: number; cols: number };
    const byStart = [...items].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    const laid: Laid[] = [];
    let cluster: Event[] = [];
    let clusterEnd = -Infinity;
    function flushCluster() {
      if (cluster.length === 0) return;
      // назначаем колонки по жадному алгоритму
      const columns: Event[][] = [];
      cluster.forEach((ev) => {
        const s = new Date(ev.startAt).getTime();
        const e = new Date(ev.endAt).getTime();
        let placed = false;
        for (let ci = 0; ci < columns.length; ci++) {
          const last = columns[ci][columns[ci].length - 1];
          const lastEnd = new Date(last.endAt).getTime();
          if (s >= lastEnd) {
            columns[ci].push(ev);
            laid.push({ e: ev, col: ci, cols: 0 });
            placed = true;
            break;
          }
        }
        if (!placed) {
          columns.push([ev]);
          laid.push({ e: ev, col: columns.length - 1, cols: 0 });
        }
      });
      const total = columns.length;
      laid.forEach((l) => {
        if (cluster.includes(l.e)) l.cols = total;
      });
      cluster = [];
      clusterEnd = -Infinity;
    }
    byStart.forEach((ev) => {
      const s = new Date(ev.startAt).getTime();
      if (s >= clusterEnd) flushCluster();
      const e = new Date(ev.endAt).getTime();
      cluster.push(ev);
      if (e > clusterEnd) clusterEnd = e;
    });
    flushCluster();
    return laid;
  }
  try {
    const debug = dayEvents.map((e) => ({
      id: e.id,
      title: e.title,
      assignee: e.assignee,
      lane: String(laneOf(e.assignee)),
      start: new Date(e.startAt).toISOString(),
      end: new Date(e.endAt).toISOString(),
    }));
    console.groupCollapsed(`[Calendar DayView] ${headerDate} role=${myRole}`);
    console.table(debug);
    console.groupEnd();
  } catch {}
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="grid grid-cols-5 border-b bg-muted/50 text-xs">
        <div className="col-span-1 px-2 py-2" />
        <div className="col-span-4 px-2 py-2">{headerDate}</div>
      </div>
      <div className="grid grid-cols-5 text-xs">
        <div className="flex flex-col border-r">
          {hours.map((h) => (
            <div key={h} className="h-12 border-b px-2 py-1 text-muted-foreground">{h}:00</div>
          ))}
        </div>
        <div className="relative col-span-4">
          {hours.map((h) => (<div key={h} className="h-12 border-b" />))}
          <div className="absolute inset-0 grid grid-cols-2 gap-1 px-1">
            <div className="relative">
              {(() => {
                const items = dayEvents.filter((e) => laneOf(e.assignee) === 0);
                const isSelfLane = myRole === "self"; // в режиме self левый столбец — мои события
                const laid = isSelfLane ? items.map((e) => ({ e, col: 0, cols: 0 })) : layoutLane(items);
                return laid.map(({ e, col, cols }) => {
                const start = new Date(e.startAt);
                const end = new Date(e.endAt);
                const clipped = blockPosition(start, end);
                if (!clipped) return null;
                const { topPct, heightPct } = clipped;
                const color = e.category?.color || colorOf(myRole, e.assignee);
                const widthPct = cols > 0 ? (100 / cols) : 100;
                const leftPct = cols > 0 ? (col * widthPct) : 0;
                const small = isSmallEvent(start, end);
                return (
                  <div key={e.id} className="absolute rounded-md border p-2 text-[11px] shadow-sm cursor-pointer" onClick={() => onOpen(e)} style={{ top: `${topPct}%`, height: `${heightPct}%`, backgroundColor: withOpacity(color), left: `${leftPct}%`, width: `${widthPct}%` }}>
                    {!small && <div className="text-[10px] font-mono text-muted-foreground">{fmtRange(start, end)}</div>}
                    <div className="font-medium truncate">{e.title}</div>
                    {!small && e.category?.name && <div className="text-[10px] text-muted-foreground truncate">{e.category.name}</div>}
                    {!small && e.location && <div className="text-[10px] text-muted-foreground truncate">{e.location}</div>}
                  </div>
                );
              }); })()}
            </div>
            <div className="relative">
              {(() => {
                const items = dayEvents.filter((e) => laneOf(e.assignee) === 1);
                const isSelfLane = myRole === "partner"; // в режиме partner правый столбец — мои события
                const laid = isSelfLane ? items.map((e) => ({ e, col: 0, cols: 0 })) : layoutLane(items);
                return laid.map(({ e, col, cols }) => {
                const start = new Date(e.startAt);
                const end = new Date(e.endAt);
                const clipped = blockPosition(start, end);
                if (!clipped) return null;
                const { topPct, heightPct } = clipped;
                const color = e.category?.color || colorOf(myRole, e.assignee);
                const widthPct = cols > 0 ? (100 / cols) : 100;
                const leftPct = cols > 0 ? (col * widthPct) : 0;
                const small = isSmallEvent(start, end);
                return (
                  <div key={e.id} className="absolute rounded-md border p-2 text-[11px] shadow-sm cursor-pointer" onClick={() => onOpen(e)} style={{ top: `${topPct}%`, height: `${heightPct}%`, backgroundColor: withOpacity(color), left: `${leftPct}%`, width: `${widthPct}%` }}>
                    {!small && <div className="text-[10px] font-mono text-muted-foreground">{fmtRange(start, end)}</div>}
                    <div className="font-medium truncate">{e.title}</div>
                    {!small && e.category?.name && <div className="text-[10px] text-muted-foreground truncate">{e.category.name}</div>}
                    {!small && e.location && <div className="text-[10px] text-muted-foreground truncate">{e.location}</div>}
                  </div>
                );
              }); })()}
            </div>
          </div>
          <div className="absolute inset-0 px-1 pointer-events-none">
            {dayEvents.filter((e) => laneOf(e.assignee) === "both").map((e) => {
              const start = new Date(e.startAt);
              const end = new Date(e.endAt);
              const clipped = blockPosition(start, end);
              if (!clipped) return null;
              const { topPct, heightPct } = clipped;
              const color = e.category?.color || colorOf(myRole, "WE");
              const small = isSmallEvent(start, end);
              return (
                <div key={e.id} className="absolute left-0 right-0 rounded-md border p-2 text-[11px] shadow-sm cursor-pointer pointer-events-auto" onClick={() => onOpen(e)} style={{ top: `${topPct}%`, height: `${heightPct}%`, backgroundColor: withOpacity(color) }}>
                  {!small && <div className="text-[10px] font-mono text-muted-foreground">{fmtRange(start, end)}</div>}
                  <div className="font-medium truncate">{e.title}</div>
                  {!small && e.category?.name && <div className="text-[10px] text-muted-foreground truncate">{e.category.name}</div>}
                  {!small && e.location && <div className="text-[10px] text-muted-foreground truncate">{e.location}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function WeekView({ events, anchor, myRole, onOpen }: { events: Event[]; anchor: Date; myRole: "self" | "partner" | null; onOpen: (e: Event) => void }) {
  const { startMin, endMin } = getViewSpan();
  const hours = Array.from({ length: Math.ceil((endMin - startMin) / 60) }, (_, i) => Math.floor(startMin / 60) + i);
  const startOfWeek = getStartOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek, i));
  const eventsByDay = useMemo(() => {
    const map: Record<number, Event[]> = {};
    for (let i = 0; i < 7; i++) map[i] = [];
    events.forEach((e) => {
      const d = new Date(e.startAt);
      const idx = dayIndex(d);
      const weekIdx = Math.floor((toYMD(d).time - toYMD(startOfWeek).time) / (24 * 60 * 60 * 1000));
      if (weekIdx >= 0 && weekIdx < 7) map[weekIdx].push(e);
    });
    return map;
  }, [events, startOfWeek]);
  const laneOf = (a?: "SELF" | "PARTNER" | "WE") => {
    if (a === "WE") return "both" as const;
    if (myRole === "partner") return a === "SELF" ? 1 : 0;
    if (myRole === "self") return a === "SELF" ? 0 : 1;
    return 0;
  };
  try {
    console.groupCollapsed(`[Calendar WeekView] role=${myRole}`);
    days.forEach((d, col) => {
      const ds = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
      const dbg = (eventsByDay[col] || []).map((e) => ({
        id: e.id,
        title: e.title,
        assignee: e.assignee,
        lane: String(laneOf(e.assignee)),
        start: new Date(e.startAt).toISOString(),
        end: new Date(e.endAt).toISOString(),
      }));
      console.groupCollapsed(`  Day ${col + 1} ${ds}`);
      console.table(dbg);
      console.groupEnd();
    });
    console.groupEnd();
  } catch {}

  return (
    <div className="rounded-lg border">
      <div className="grid grid-cols-8 border-b bg-muted/50 text-xs">
        <div className="px-2 py-2" />
        {days.map((d, i) => (
          <div key={i} className="px-2 py-2 text-center">
            {WEEKDAY_NAMES[i]} {d.getDate()}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-8 text-xs">
        <div className="flex flex-col border-r">
          {hours.map((h) => (
            <div key={h} className="h-12 border-b px-2 py-1 text-muted-foreground">{h}:00</div>
          ))}
        </div>
        {days.map((_, col) => (
          <div key={col} className="relative">
            {hours.map((h) => (<div key={h} className="h-12 border-b" />))}
            <div className="absolute inset-0 grid grid-cols-2 gap-1 px-1">
              <div className="relative">
                {layoutLane(eventsByDay[col].filter((e) => laneOf(e.assignee) === 0)).map(({ e, col, cols }) => {
                  const start = new Date(e.startAt);
                  const end = new Date(e.endAt);
                const clipped = blockPosition(start, end);
                if (!clipped) return null;
                const { topPct, heightPct } = clipped;
                  const color = e.category?.color || colorOf(myRole, e.assignee);
                  const widthPct = cols > 0 ? (100 / cols) : 100;
                  const leftPct = cols > 0 ? (col * widthPct) : 0;
                  const small = isSmallEvent(start, end);
                  const compact = widthPct < 60 || small;
                  return (
                    <div key={e.id} className="absolute rounded-md border p-1 text-[11px] shadow-sm overflow-hidden cursor-pointer" onClick={() => onOpen(e)} title={`${fmtRange(start, end)} • ${e.title}${e.location ? ` • ${e.location}` : ''}`} style={{ top: `${topPct}%`, height: `${heightPct}%`, backgroundColor: withOpacity(color), left: `${leftPct}%`, width: `${widthPct}%` }}>
                      <div className="flex items-center justify-between gap-1 min-w-0">
                        <div className="font-medium flex-1 min-w-0 truncate">{e.title}</div>
                        <div className="text-[10px] font-mono text-muted-foreground shrink-0">{fmtTime(start)}</div>
                      </div>
                      {!compact && e.category?.name && <div className="text-[10px] text-muted-foreground truncate">{e.category.name}</div>}
                      {!compact && e.location && <div className="text-[10px] text-muted-foreground truncate">{e.location}</div>}
                    </div>
                  );
                })}
              </div>
              <div className="relative">
                {layoutLane(eventsByDay[col].filter((e) => laneOf(e.assignee) === 1)).map(({ e, col, cols }) => {
                  const start = new Date(e.startAt);
                  const end = new Date(e.endAt);
                const clipped = blockPosition(start, end);
                if (!clipped) return null;
                const { topPct, heightPct } = clipped;
                  const color = e.category?.color || colorOf(myRole, e.assignee);
                  const widthPct = cols > 0 ? (100 / cols) : 100;
                  const leftPct = cols > 0 ? (col * widthPct) : 0;
                  const small = isSmallEvent(start, end);
                  const compact = widthPct < 60 || small;
                  return (
                    <div key={e.id} className="absolute rounded-md border p-1 text-[11px] shadow-sm overflow-hidden cursor-pointer" onClick={() => onOpen(e)} title={`${fmtRange(start, end)} • ${e.title}${e.location ? ` • ${e.location}` : ''}`} style={{ top: `${topPct}%`, height: `${heightPct}%`, backgroundColor: withOpacity(color), left: `${leftPct}%`, width: `${widthPct}%` }}>
                      <div className="flex items-center justify-between gap-1 min-w-0">
                        <div className="font-medium flex-1 min-w-0 truncate">{e.title}</div>
                        <div className="text-[10px] font-mono text-muted-foreground shrink-0">{fmtTime(start)}</div>
                      </div>
                      {!compact && e.category?.name && <div className="text-[10px] text-muted-foreground truncate">{e.category.name}</div>}
                      {!compact && e.location && <div className="text-[10px] text-muted-foreground truncate">{e.location}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="absolute inset-0 px-1 pointer-events-none">
              {eventsByDay[col].filter((e) => laneOf(e.assignee) === "both").map((e) => {
              const start = new Date(e.startAt);
              const end = new Date(e.endAt);
                const clipped = blockPosition(start, end);
                if (!clipped) return null;
                const { topPct, heightPct } = clipped;
                const color = e.category?.color || colorOf(myRole, "WE");
                const small = isSmallEvent(start, end);
              return (
                <div key={e.id} className="absolute left-0 right-0 rounded-md border p-2 text-[11px] shadow-sm cursor-pointer pointer-events-auto overflow-hidden" onClick={() => onOpen(e)} style={{ top: `${topPct}%`, height: `${heightPct}%`, backgroundColor: withOpacity(color) }}>
                  <div className="font-medium truncate">{e.title}</div>
                  {!small && e.category?.name && <div className="text-[10px] text-muted-foreground truncate">{e.category.name}</div>}
                  {!small && e.location && <div className="text-[10px] text-muted-foreground truncate">{e.location}</div>}
                </div>
              );
            })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthView({ events, anchor, onOpen }: { events: Event[]; anchor: Date; onOpen: (e: Event) => void }) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = getStartOfWeek(first);
  const weeks = 6;
  const days = 7;
  return (
    <div className="grid gap-px rounded-lg border bg-border overflow-hidden">
      {Array.from({ length: weeks }).map((_, w) => (
        <div key={w} className="grid grid-cols-7 gap-px">
          {Array.from({ length: days }).map((_, d) => {
            const dayDate = addDays(start, w * 7 + d);
            const dayEvents = events.filter((e) => sameDay(new Date(e.startAt), dayDate));
            return (
              <div key={d} className="min-h-24 bg-background p-2 text-xs min-w-0">
                <div className="mb-1 text-muted-foreground">{dayDate.getDate()}</div>
                <div className="space-y-1">
                  {dayEvents.map((e) => {
                    const fallback = e.assignee === "SELF" ? "var(--color-self, #9b87f5)" : e.assignee === "PARTNER" ? "var(--color-partner, #22c55e)" : "var(--color-we, #ff8f70)";
                    const color = e.category?.color || fallback;
                    return (
                      <button key={e.id} className="w-full truncate rounded-sm border px-1 py-0.5 text-left" style={{ backgroundColor: withOpacity(color) }} onClick={() => onOpen(e)}>
                        {e.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// utils
function colorOf(myRole: "self" | "partner" | null, a?: "SELF" | "PARTNER" | "WE") {
  if (a === "WE") return "var(--color-we, #ff8f70)";
  if (myRole === "partner") return a === "PARTNER" ? "var(--color-partner, #22c55e)" : "var(--color-self, #9b87f5)";
  return a === "SELF" ? "var(--color-self, #9b87f5)" : "var(--color-partner, #22c55e)";
}

function withOpacity(hexOrVar: string) {
  // If it's a CSS var, wrap it with opacity via rgba using a mask element
  const opacityVar = getComputedStyle(document.documentElement).getPropertyValue("--event-opacity")?.trim() || "85%";
  const opacity = Number(opacityVar.replace("%", "")) / 100;
  if (hexOrVar.startsWith("var(")) {
    // Use color-mix for modern browsers with variable + opacity fallback
    return `color-mix(in srgb, ${hexOrVar} ${Math.round(opacity*100)}%, transparent)`;
  }
  // hex -> rgba
  const m = hexOrVar.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return hexOrVar;
  let r=0,g=0,b=0;
  const h = m[1];
  if (h.length === 3) {
    r = parseInt(h[0]+h[0],16); g = parseInt(h[1]+h[1],16); b = parseInt(h[2]+h[2],16);
  } else {
    r = parseInt(h.substring(0,2),16); g = parseInt(h.substring(2,4),16); b = parseInt(h.substring(4,6),16);
  }
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtRange(a: Date, b: Date) {
  return `${fmtTime(a)}–${fmtTime(b)}`;
}

function isSmallEvent(a: Date, b: Date) {
  const minutes = Math.max(0, Math.floor((b.getTime() - a.getTime()) / 60000));
  return minutes < 45; // порог для компактного отображения
}

function assigneeLabel(myRole: "self" | "partner" | null, a?: "SELF" | "PARTNER" | "WE") {
  if (a === "WE") return "мы";
  if (myRole === "partner") return a === "PARTNER" ? "я" : "ты";
  return a === "SELF" ? "я" : "ты";
}

function toInputDateTimeValue(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function assigneeUiFromEvent(myRole: "self" | "partner" | null, a?: "SELF" | "PARTNER" | "WE"): "я" | "ты" | "мы" {
  if (a === "WE") return "мы";
  if (myRole === "partner") return a === "PARTNER" ? "я" : "ты";
  return a === "SELF" ? "я" : "ты";
}
function assigneeFromUi(myRole: "self" | "partner" | null, ui: "я" | "ты" | "мы") {
  if (ui === "мы") return "WE";
  if (myRole === "partner") return ui === "я" ? "PARTNER" : "SELF";
  return ui === "я" ? "SELF" : "PARTNER";
}
const WEEKDAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;
function getStartOfWeek(date: Date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // make Monday=0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}
function dayIndex(date: Date) {
  return (date.getDay() + 6) % 7;
}
function posFromTime(date: Date) {
  const { startMin, endMin } = getViewSpan();
  const startMinutes = startMin;
  const span = endMin - startMin;
  const m = date.getHours() * 60 + date.getMinutes();
  const rel = Math.max(0, Math.min(span, m - startMinutes));
  return (rel / span) * 100;
}

function posFromMinutes(minOfDay: number) {
  const { startMin, endMin } = getViewSpan();
  const span = endMin - startMin;
  const rel = Math.max(0, Math.min(span, minOfDay - startMin));
  return (rel / span) * 100;
}

function minutesOfDay(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

function blockPosition(start: Date, end: Date) {
  const { startMin, endMin } = getViewSpan();
  const s = Math.max(startMin, minutesOfDay(start));
  const e = Math.min(endMin, minutesOfDay(end));
  if (e <= s) return null;
  const span = endMin - startMin;
  const topPct = posFromMinutes(s);
  const heightPct = Math.max(6, ((e - s) / span) * 100);
  return { topPct, heightPct };
}

function getViewSpan() {
  // Read dynamic span computed from quiet hours; fallback to 07:00..23:00
  try {
    const s = (window as any).__calendar_startMin;
    const e = (window as any).__calendar_endMin;
    if (typeof s === "number" && typeof e === "number" && e > s) return { startMin: s, endMin: e };
  } catch {}
  return { startMin: 7 * 60, endMin: 23 * 60 };
}

function computeViewSpan(quietStart: number, quietEnd: number) {
  // Quiet hours [quietStart, quietEnd) -> visible hours are the complement within 0..1440
  // We select the largest continuous visible block during daytime.
  // For typical 22:00..08:00 -> visible 08:00..22:00
  const dayStart = 8 * 60; // fallback if needed
  const dayEnd = 22 * 60;
  let startMin = dayStart;
  let endMin = dayEnd;
  // Prefer 08..22 if it doesn't overlap quiet hours; otherwise compute complement
  const qStart = quietStart;
  const qEnd = quietEnd;
  if (!(dayEnd <= qStart || dayStart >= qEnd)) {
    // Overlaps: compute complement segment length around quiet hours
    const seg1 = { s: 0, e: Math.min(qStart, 24 * 60) };
    const seg2 = { s: Math.max(qEnd, 0), e: 24 * 60 };
    const len1 = seg1.e - seg1.s;
    const len2 = seg2.e - seg2.s;
    const pick = len1 >= len2 ? seg1 : seg2;
    startMin = pick.s;
    endMin = pick.e;
  }
  // Persist globally for rendering helpers
  try {
    (window as any).__calendar_startMin = startMin;
    (window as any).__calendar_endMin = endMin;
  } catch {}
  return { startMin, endMin };
}

// Lay out overlapping events into sub-columns within a lane (greedy algorithm)
function layoutLane(items: Event[]) {
  type Laid = { e: Event; col: number; cols: number };
  const byStart = [...items].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const laid: Laid[] = [];
  let cluster: Event[] = [];
  let clusterEnd = -Infinity;
  function flushCluster() {
    if (cluster.length === 0) return;
    const columns: Event[][] = [];
    cluster.forEach((ev) => {
      const s = new Date(ev.startAt).getTime();
      let placed = false;
      for (let ci = 0; ci < columns.length; ci++) {
        const last = columns[ci][columns[ci].length - 1];
        const lastEnd = new Date(last.endAt).getTime();
        if (s >= lastEnd) {
          columns[ci].push(ev);
          laid.push({ e: ev, col: ci, cols: 0 });
          placed = true;
          break;
        }
      }
      if (!placed) {
        columns.push([ev]);
        laid.push({ e: ev, col: columns.length - 1, cols: 0 });
      }
    });
    const total = columns.length;
    laid.forEach((l) => {
      if (cluster.includes(l.e)) l.cols = total;
    });
    cluster = [];
    clusterEnd = -Infinity;
  }
  byStart.forEach((ev) => {
    const s = new Date(ev.startAt).getTime();
    if (s >= clusterEnd) flushCluster();
    const e = new Date(ev.endAt).getTime();
    cluster.push(ev);
    if (e > clusterEnd) clusterEnd = e;
  });
  flushCluster();
  return laid;
}
function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function toYMD(d: Date) {
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return { time: dd.getTime() };
}



