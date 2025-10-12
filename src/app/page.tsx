"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Check } from "lucide-react";
import { useRealtime } from "@/hooks/useRealtime";

type Task = { id: string; title: string; assignee: "SELF" | "PARTNER" | "WE"; dueAt?: string | null; completedAt?: string | null };
type Event = { id: string; title: string; startAt: string; endAt: string; location?: string | null; allDay: boolean; assignee?: "SELF" | "PARTNER" | "WE" };
type TimelineItemTask = { id: string; at: number; type: "task"; title: string; assignee: Task["assignee"]; };
type TimelineItemEvent = { id: string; at: number; end: number; type: "event"; title: string; location?: string | null };
type TimelineItem = TimelineItemTask | TimelineItemEvent;

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [quiet, setQuiet] = useState<{ startMinute: number; endMinute: number } | null>(null);
  const [hasPair, setHasPair] = useState<boolean>(true);
  const [quick, setQuick] = useState("");
  const [myRole, setMyRole] = useState<"self" | "partner" | null>(null);
  const [selected, setSelected] = useState<TimelineItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [voicePreview, setVoicePreview] = useState<any | null>(null);
  const [recState, setRecState] = useState<"idle" | "recording" | "processing" | "error">("idle");
  const [recError, setRecError] = useState<string | null>(null);
  const [recSeconds, setRecSeconds] = useState<number>(0);
  const recTimerRef = useRef<number | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const recStreamRef = useRef<MediaStream | null>(null);
  const [voiceAssigneeUi, setVoiceAssigneeUi] = useState<"я" | "ты" | "мы">("мы");
  const [vpKind, setVpKind] = useState<"event" | "task">("event");
  const [vpTitle, setVpTitle] = useState<string>("");
  const [vpStart, setVpStart] = useState<string>("");
  const [vpEnd, setVpEnd] = useState<string>("");
  const [vpDue, setVpDue] = useState<string>("");

  async function refreshAll() {
    setLoading(true);
    try {
      const [t, e, q, p, me] = await Promise.all([
        fetch("/api/tasks").then((r) => r.json()),
        fetch("/api/events").then((r) => r.json()),
        fetch("/api/availability").then((r) => r.json()).catch(() => ({ quietHours: null })),
        fetch("/api/pair/get").then((r) => r.json()).catch(() => ({ pair: null })),
        (async () => {
          const r = await fetch("/api/auth/me");
          if (r.status === 401) {
            const onboarded = typeof document !== "undefined" && document.cookie.includes("onboarded=1");
            const next = encodeURIComponent("/");
            window.location.href = onboarded ? `/auth?next=${next}` : `/welcome?next=${next}`;
            return { user: null };
          }
          return r.json().catch(() => ({ user: null }));
        })(),
      ]);
      setTasks(t.tasks ?? []);
      setEvents(e.events ?? []);
      setQuiet(q.quietHours ?? null);
      setHasPair(!!p.pair);
      const memberships: Array<{ role: string; pairId: string }> = me.user?.pairMemberships ?? [];
      const role = memberships[0]?.role as "self" | "partner" | undefined;
      if (role === "self" || role === "partner") setMyRole(role);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
  }, []);

  // Periodically re-render and refresh to auto-hide past events as time advances
  useEffect(() => {
    const t = setInterval(() => {
      // lightweight: just bump state to trigger re-render; refresh events less frequently
      setLoading((v) => v);
    }, 30 * 1000);
    const t2 = setInterval(() => {
      refreshAll();
    }, 2 * 60 * 1000);
    return () => {
      clearInterval(t);
      clearInterval(t2);
    };
  }, [refreshAll]);

  const onRealtime = useCallback((type: "tasks" | "events" | "availability") => {
    if (type === "tasks" || type === "events" || type === "availability") {
      refreshAll();
    }
  }, []);
  useRealtime(onRealtime);

  const taskById = useMemo(() => {
    const map = new Map<string, Task>();
    for (const t of tasks) map.set(t.id, t);
    return map;
  }, [tasks]);

  useEffect(() => {
    if (!voicePreview) return;
    const a = voicePreview.preview?.assignee as ("SELF" | "PARTNER" | "WE" | undefined);
    let ui: "я" | "ты" | "мы" = "мы";
    if (a === "WE") ui = "мы";
    else if (a === "SELF") ui = myRole === "partner" ? "ты" : "я";
    else if (a === "PARTNER") ui = myRole === "partner" ? "я" : "ты";
    setVoiceAssigneeUi(ui);
    // prefill edit fields
    setVpKind(voicePreview.preview?.kind === "task" ? "task" : "event");
    setVpTitle(voicePreview.preview?.title || "");
    setVpStart(toInputLocal(voicePreview.preview?.start));
    setVpEnd(toInputLocal(voicePreview.preview?.end));
    setVpDue(toInputLocal(voicePreview.preview?.due));
  }, [voicePreview, myRole]);

  function toInputLocal(dateStr?: string) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }

  const items: TimelineItem[] = useMemo(() => {
    function sameDay(a: Date, b: Date) {
      return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }
    const today = new Date();
    const showAssignee = (a?: "SELF" | "PARTNER" | "WE") => {
      if (!a) return true;
      if (a === "WE") return true;
      if (myRole === "partner") return a === "PARTNER";
      return a === "SELF";
    };
    const taskItems = tasks
      .filter((t) => !!t.dueAt)
      .filter((t) => sameDay(new Date(t.dueAt as string), today))
      .filter((t) => showAssignee(t.assignee))
      .map((t) => ({
        id: `task:${t.id}`,
        at: new Date(t.dueAt as string).getTime(),
        type: "task" as const,
        title: t.title,
        assignee: t.assignee,
      }));
    const eventItems = events
      .filter((e) => sameDay(new Date(e.startAt), today))
      .filter((e) => showAssignee(e.assignee))
      .map((e) => ({
        id: `event:${e.id}`,
        at: new Date(e.startAt).getTime(),
        end: new Date(e.endAt).getTime(),
        type: "event" as const,
        title: e.title,
        location: e.location,
      }));
    return [...taskItems, ...eventItems].sort((a, b) => a.at - b.at);
  }, [tasks, events, myRole]);

  function badgeColor(assignee?: Task["assignee"]) {
    if (!assignee) return "var(--border)";
    if (assignee === "SELF") return "var(--color-self, #9b87f5)";
    if (assignee === "PARTNER") return "var(--color-partner, #7cd4b8)";
    return "var(--color-we, #ff8f70)";
  }

  // naive conflict: two events within 60 minutes
  const conflicts = useMemo(() => {
    for (let i = 1; i < items.length; i++) {
      if (items[i].at - items[i - 1].at < 60 * 60 * 1000) return true;
    }
    // quiet hours marker if any item falls inside quiet
    if (quiet) {
      for (const it of items) {
        const m = new Date(it.at).getHours() * 60 + new Date(it.at).getMinutes();
        if (inQuiet(m, quiet.startMinute, quiet.endMinute)) return true;
      }
    }
    return false;
  }, [items, quiet]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-2xl font-semibold">Сегодня</div>
        {conflicts && (
          <div className="rounded-md border px-2 py-1 text-xs text-destructive">Возможен конфликт</div>
        )}
      </div>
      {!hasPair && (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          Вы ещё не создали пару. <a href="/pair" className="underline">Создать или присоединиться →</a>
        </div>
      )}
      {!quiet && (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          Для лучшего подбора времени задайте тихие часы на странице пары.
        </div>
      )}
      <div className="grid gap-3">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-b-transparent" />
            Обновляем данные...
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          <input
            className="flex-1 rounded-md border px-3 py-2"
            placeholder="Например: завтра 19:00 ужин у мамы"
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter" && quick.trim()) {
                const res = await fetch("/api/text/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: quick }) });
                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                  setQuick("");
                  setVoicePreview(data); // используем ту же модалку предпросмотра
                }
              }
            }}
          />
          <button
            className="rounded-md border px-3 py-2 text-sm"
            onClick={async () => {
              if (!quick.trim()) return;
              const res = await fetch("/api/text/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: quick }) });
              const data = await res.json().catch(() => ({}));
              if (res.ok) { setQuick(""); setVoicePreview(data); }
            }}
          >
            Добавить
          </button>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <button
            className="rounded-md border px-3 py-2 text-sm"
            disabled={recState !== "idle" || (typeof window !== "undefined" && typeof (window as any).MediaRecorder === "undefined")}
            title="Голосовое добавление"
            onClick={async () => {
              try {
                setRecError(null);
                setRecState("recording");
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                recStreamRef.current = stream;
                let rec: MediaRecorder;
                try {
                  rec = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
                } catch {
                  rec = new MediaRecorder(stream);
                }
                recRef.current = rec;
                const chunks: BlobPart[] = [];
                rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
                rec.onstop = async () => {
                  try {
                    setRecState("processing");
                    if (recTimerRef.current) { window.clearInterval(recTimerRef.current); recTimerRef.current = null; }
                    const blob = new Blob(chunks, { type: "audio/webm" });
                    const reader = new FileReader();
                    reader.onloadend = async () => {
                      const result = String(reader.result || "");
                      const base64 = result.includes(",") ? result.split(",")[1] : result;
                      const mimeMatch = result.match(/^data:([^;]+);base64,/);
                      const mimeType = mimeMatch ? mimeMatch[1] : "audio/webm";
                      const format = (() => {
                        const parts = mimeType.split("/");
                        return parts[1]?.split(";")[0] || "webm";
                      })();
                      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
                      const r = await fetch("/api/voice/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audio: base64, format, timeZone: browserTz }) });
                      const data = await r.json().catch(() => ({}));
                      if (r.ok) { setVoicePreview(data); setRecState("idle"); setRecSeconds(0); }
                      else { setRecError(data?.error || "Ошибка распознавания"); setRecState("error"); }
                      // stop stream
                      try { recStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
                      recRef.current = null; recStreamRef.current = null;
                    };
                    reader.readAsDataURL(blob);
                  } catch {
                    setRecError("Не удалось обработать запись");
                    setRecState("error");
                    try { recStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
                    recRef.current = null; recStreamRef.current = null;
                  }
                };
                rec.start();
                // таймер записи и автостоп
                setRecSeconds(0);
                recTimerRef.current = window.setInterval(() => {
                  setRecSeconds((s) => {
                    const next = s + 1;
                    if (next >= 15 && rec.state !== "inactive") rec.stop();
                    return next;
                  });
                }, 1000);
                // клавиши: Space/Enter -> stop, Esc -> cancel
                const onKey = (e: KeyboardEvent) => {
                  if (rec.state === "inactive") return;
                  if (e.key === " " || e.key === "Enter") { e.preventDefault(); rec.stop(); }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    try { recRef.current?.stop(); } catch {}
                    try { recStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
                    setRecState("idle"); setRecSeconds(0);
                    if (recTimerRef.current) { window.clearInterval(recTimerRef.current); recTimerRef.current = null; }
                  }
                };
                window.addEventListener("keydown", onKey, { once: true });
              } catch {
                const supported = typeof window !== "undefined" && typeof (window as any).MediaRecorder !== "undefined";
                setRecError(supported ? "Нет доступа к микрофону" : "Браузер не поддерживает запись аудио");
                setRecState("error");
              }
            }}
          >{recState === "recording" ? `Запись… ${recSeconds}s` : recState === "processing" ? "Обработка…" : "🎤 Голосом"}</button>
          {recState === "recording" && (
            <button className="rounded-md border px-3 py-2 text-sm" onClick={() => {
              try { recRef.current?.stop(); } catch {}
            }}>Стоп</button>
          )}
          {recState === "error" && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-destructive">{recError}</span>
              <button className="rounded-md border px-2 py-1" onClick={() => { setRecError(null); setRecState("idle"); setRecSeconds(0); try { recStreamRef.current?.getTracks().forEach((t)=>t.stop()); } catch {}; recRef.current = null; recStreamRef.current = null; }}>Повторить</button>
            </div>
          )}
          {typeof window !== "undefined" && typeof (window as any).MediaRecorder === "undefined" && (
            <div className="text-xs text-muted-foreground">Ваш браузер не поддерживает запись аудио. Попробуйте Chrome/Firefox на десктопе.</div>
          )}
        </div>
        {voicePreview && (
          <>
            <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setVoicePreview(null)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setVoicePreview(null)}>
              <div className="w-full max-w-md rounded-xl border bg-background p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
                <div className="text-center text-sm font-medium">Подтверждение голосового ввода</div>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="text-xs text-muted-foreground">Распознанный текст</div>
                  <div className="rounded-md border p-2">{voicePreview.transcript}</div>
                  <div className="text-xs text-muted-foreground">Проверьте и при необходимости отредактируйте</div>
                  <div className="flex items-center gap-2">
                    <button className={`flex-1 rounded-md border px-3 py-2 text-sm ${vpKind === "event" ? "bg-accent" : ""}`} onClick={() => setVpKind("event")}>Событие</button>
                    <button className={`flex-1 rounded-md border px-3 py-2 text-sm ${vpKind === "task" ? "bg-accent" : ""}`} onClick={() => setVpKind("task")}>Задача</button>
                  </div>
                  <label className="block">
                    <div className="mb-1 text-muted-foreground">Заголовок</div>
                    <input className="w-full rounded-md border px-3 py-2" value={vpTitle} onChange={(e) => setVpTitle(e.target.value)} />
                  </label>
                  {vpKind === "event" ? (
                    <div className="grid grid-cols-1 gap-2">
                      <label className="block text-sm">
                        <div className="mb-1 text-muted-foreground">Начало</div>
                        <input type="datetime-local" className="w-full rounded-md border px-3 py-2" value={vpStart} onChange={(e) => setVpStart(e.target.value)} />
                      </label>
                      <label className="block text-sm">
                        <div className="mb-1 text-muted-foreground">Конец</div>
                        <input type="datetime-local" className="w-full rounded-md border px-3 py-2" value={vpEnd} onChange={(e) => setVpEnd(e.target.value)} />
                      </label>
                    </div>
                  ) : (
                    <label className="block text-sm">
                      <div className="mb-1 text-muted-foreground">Срок</div>
                      <input type="datetime-local" className="w-full rounded-md border px-3 py-2" value={vpDue} onChange={(e) => setVpDue(e.target.value)} />
                    </label>
                  )}
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">Назначение</div>
                    <div className="flex items-center gap-2">
                      {["я", "ты", "мы"].map((v) => (
                        <button key={v} className={`flex-1 rounded-md border px-3 py-2 text-sm ${voiceAssigneeUi === v ? "bg-accent" : ""}`} onClick={() => setVoiceAssigneeUi(v)}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button className="flex-1 rounded-md border px-3 py-2 text-sm" onClick={() => setVoicePreview(null)}>Отмена</button>
                  <button className="flex-1 rounded-md border px-3 py-2 text-sm" onClick={async () => {
                    const assignee = (() => {
                      if (voiceAssigneeUi === "мы") return "WE";
                      if (myRole === "partner") return voiceAssigneeUi === "я" ? "PARTNER" : "SELF";
                      return voiceAssigneeUi === "я" ? "SELF" : "PARTNER";
                    })();
                    const intent: any = { ...voicePreview.preview, assignee, title: vpTitle, kind: vpKind };
                    if (vpKind === "event") {
                      intent.start = vpStart ? new Date(vpStart).toISOString() : undefined;
                      intent.end = vpEnd ? new Date(vpEnd).toISOString() : undefined;
                    } else {
                      intent.due = vpDue ? new Date(vpDue).toISOString() : undefined;
                      // очистим поля событий, если переключили в задачу
                      intent.start = undefined;
                      intent.end = undefined;
                      intent.date = undefined;
                    }
                    const r = await fetch("/api/voice/parse", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent }) });
                    if (r.ok) { setVoicePreview(null); await refreshAll(); }
                  }}>Сохранить</button>
                </div>
              </div>
            </div>
          </>
        )}
        {items.map((it) => {
          const isTask = it.type === "task";
          const taskId = isTask ? it.id.split(":")[1] : null;
          const completed = isTask && taskId ? Boolean(taskById.get(taskId)?.completedAt) : false;
          return (
            <div
              key={it.id}
              className="flex items-start gap-3 rounded-lg border p-4 text-left"
              role="button"
              tabIndex={0}
              onClick={() => setSelected(it)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(it);
                }
              }}
            >
              <span
                className="mt-1 inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: badgeColor(isTask ? it.assignee : undefined) }}
              />
              {isTask && (
                <button
                  className="mt-[-2px] rounded-full border p-1"
                  title="Готово"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!taskId) return;
                    await fetch(`/api/tasks/${taskId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ completed: !completed }),
                    });
                    await refreshAll();
                  }}
                >
                  <Check className={`h-4 w-4 ${completed ? "text-green-500" : "text-muted-foreground"}`} />
                </button>
              )}
              <div>
                <div className="text-sm text-muted-foreground">
                  {it.type === "event"
                    ? `${new Date(it.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–${new Date((it as TimelineItemEvent).end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : new Date(it.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
                <div className={`mt-1 font-medium ${completed ? "line-through text-muted-foreground" : ""}`}>{it.title}</div>
                {quiet && inQuiet(new Date(it.at).getHours() * 60 + new Date(it.at).getMinutes(), quiet.startMinute, quiet.endMinute) && (
                  <div className="mt-1 text-xs text-amber-600">Тихие часы</div>
                )}
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <div className="rounded-lg border p-4 text-sm text-muted-foreground">На сегодня ничего не запланировано</div>
        )}
      </div>
      {selected && (
        <>
          <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setSelected(null)} />
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4" onClick={() => setSelected(null)}>
            <div className="w-full max-w-md rounded-xl border bg-background p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
              <div className="text-center text-sm font-medium">{selected.type === "event" ? "Событие" : "Задача"}</div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="text-xs text-muted-foreground font-mono">{new Date(selected.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                <div className="text-base font-semibold">{selected.title}</div>
                {selected.type === "event" && selected.location && (<div className="text-muted-foreground">{selected.location}</div>)}
              </div>
              <div className="mt-4 flex gap-2">
                <button className="flex-1 rounded-md border px-3 py-2 text-sm" onClick={() => setSelected(null)}>Закрыть</button>
              </div>
            </div>
          </div>
        </>
      )}
      
    </div>
  );
}

function inQuiet(minute: number, start: number, end: number) {
  if (start === end) return false;
  if (start < end) return minute >= start && minute < end;
  // overnight
  return minute >= start || minute < end;
}
