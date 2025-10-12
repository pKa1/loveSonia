"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Plus, Filter, Trash2, Check, Bell } from "lucide-react";
import { useRealtime } from "@/hooks/useRealtime";
import { useNotifications } from "@/hooks/useNotifications";

type Task = {
  id: string;
  title: string;
  assignee: "SELF" | "PARTNER" | "WE";
  dueAt?: string | null;
  completedAt?: string | null;
};

export default function TasksPage() {
  const { requestPermission, schedule, subscribeToPush } = useNotifications();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [who, setWho] = useState<"все" | "я" | "ты" | "мы">("все");
  const [assignee, setAssignee] = useState<"я" | "ты" | "мы">("я");
  const [due, setDue] = useState("");
  const [selected, setSelected] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAssignee, setEditAssignee] = useState<"я" | "ты" | "мы">("я");
  const [editDue, setEditDue] = useState("");
  const [editCompleted, setEditCompleted] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const lastTapTsRef = useRef(0);
  const lastTapTaskIdRef = useRef<string | null>(null);
  const [myRole, setMyRole] = useState<"self" | "partner" | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/tasks");
    const data = await res.json();
    setTasks(data.tasks ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        const memberships: Array<{ role: string }> = data.user?.pairMemberships ?? [];
        const role = memberships[0]?.role as "self" | "partner" | undefined;
        if (role === "self" || role === "partner") setMyRole(role);
      } catch {}
    })();
  }, []);

  const onRealtime = useCallback((type: "tasks" | "events" | "availability") => {
    if (type === "tasks") load();
  }, []);
  useRealtime(onRealtime);

  const filtered = useMemo(() => {
    if (who === "все") return tasks;
    let map: Record<string, Task["assignee"]> = { "я": "SELF", "ты": "PARTNER", "мы": "WE" };
    if (myRole === "partner") {
      map = { "я": "PARTNER", "ты": "SELF", "мы": "WE" };
    }
    return tasks.filter((t) => t.assignee === map[who]);
  }, [who, tasks, myRole]);

  function toInputDateTimeValue(dateStr?: string | null) {
    if (!dateStr) return "";
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

  function formatDue(dateStr?: string | null) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (sameDay) return `сегодня ${time}`;
    if (isTomorrow) return `завтра ${time}`;
    const date = d.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
    return `${date} ${time}`;
  }

  function isOverdue(t: Task) {
    if (!t.dueAt || t.completedAt) return false;
    return new Date(t.dueAt).getTime() < Date.now();
  }

  function openEdit(task: Task) {
    setSelected(task);
    setEditTitle(task.title);
    setEditAssignee(task.assignee === "SELF" ? "я" : task.assignee === "PARTNER" ? "ты" : "мы");
    setEditDue(toInputDateTimeValue(task.dueAt));
    setEditCompleted(Boolean(task.completedAt));
  }

  function getAssigneeColor(a: Task["assignee"]) {
    if (a === "SELF") return "var(--color-self)";
    if (a === "PARTNER") return "var(--color-partner)";
    return "var(--color-we)";
  }

  function assigneeLabel(a: Task["assignee"]) {
    if (a === "WE") return "мы";
    if (myRole === "partner") {
      return a === "PARTNER" ? "я" : "ты";
    }
    // default: self
    return a === "SELF" ? "я" : "ты";
  }

  useEffect(() => {
    // Detect coarse pointer devices (touch)
    try {
      const mq = window.matchMedia("(pointer: coarse)");
      setIsTouchDevice(mq.matches);
    } catch { /* noop */ }
  }, []);

  function handleCardClick(task: Task) {
    const now = Date.now();
    const isSameTask = lastTapTaskIdRef.current === task.id;
    const isDoubleTap = isSameTask && now - lastTapTsRef.current < 350;
    if (isDoubleTap) {
      openEdit(task);
      setExpandedTaskId(null);
      lastTapTaskIdRef.current = null;
      lastTapTsRef.current = 0;
    } else {
      setExpandedTaskId(task.id);
      lastTapTaskIdRef.current = task.id;
      lastTapTsRef.current = now;
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-2xl font-semibold">Задачи</div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1 rounded-md border px-1 py-1 text-sm">
            {(["все", "я", "ты", "мы"] as const).map((v) => (
              <button
                key={v}
                className={`rounded px-2 py-1 ${who === v ? "bg-accent" : ""}`}
                onClick={() => setWho(v)}
              >
                {v}
              </button>
            ))}
          </div>
          <button className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Добавить
          </button>
        </div>
      </div>
      <div className="sm:hidden">
        <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" /> Фильтр по назначению
        </div>
        <div className="flex items-center gap-2">
          {(["все", "я", "ты", "мы"] as const).map((v) => (
            <button
              key={v}
              className={`flex-1 rounded-md border px-3 py-1 text-sm ${who === v ? "bg-accent" : ""}`}
              onClick={() => setWho(v)}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        {loading && <div className="text-sm text-muted-foreground">Загрузка...</div>}
        {filtered.map((t) => (
          <div
            key={t.id}
            className="flex w-full items-center justify-between rounded-lg border p-3 hover:bg-accent/30 cursor-pointer overflow-hidden"
            onClick={() => handleCardClick(t)}
          >
            <div className="mr-3 w-1 self-stretch rounded-sm" style={{ backgroundColor: getAssigneeColor(t.assignee) }} />
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <button
                className="rounded-full border p-1"
                title="Готово"
                onClick={async (e) => {
                  e.stopPropagation();
                  await fetch(`/api/tasks/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed: !t.completedAt }) });
                  await load();
                }}
              >
                <Check className={`h-4 w-4 ${t.completedAt ? "text-green-500" : "text-muted-foreground"}`} />
              </button>
              <div
                className={`font-medium flex-1 min-w-0 ${t.completedAt ? "line-through text-muted-foreground" : ""} ${expandedTaskId === t.id ? "whitespace-normal break-words" : "truncate"}`}
                title={t.title}
              >
                {t.title}
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
              <span className="uppercase">{assigneeLabel(t.assignee)}</span>
              {t.dueAt && (
                <span className={`${isOverdue(t) ? "text-destructive" : ""}`}>{formatDue(t.dueAt)}</span>
              )}
              <button
                title="Напомнить"
                onClick={async (e) => {
                  e.stopPropagation();
                  const ok = await requestPermission();
                  if (!ok) return;
                  const okPush = await subscribeToPush();
                  if (!okPush) return;
                  await fetch("/api/reminders/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: t.id }) });
                }}
              >
                <Bell className="h-4 w-4" />
              </button>
              <button title="Удалить" onClick={async (e) => { e.stopPropagation(); await fetch(`/api/tasks/${t.id}`, { method: "DELETE" }); await load(); }}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setOpen(false)} />
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex md:hidden items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-xl border bg-background p-4 shadow-lg max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="text-center text-sm font-medium">Новая задача</div>
            <div className="mt-3 space-y-3">
              <input className="w-full rounded-md border px-3 py-2" placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} />
              <div className="flex items-center gap-2">
                {( ["я", "ты", "мы"] as const ).map((v) => (
                  <button key={v} className={`flex-1 rounded-md border px-3 py-2 text-sm ${assignee === v ? "bg-accent" : ""}`} onClick={() => setAssignee(v)}>
                    {v}
                  </button>
                ))}
              </div>
              <input type="datetime-local" className="w-full rounded-md border px-3 py-2" value={due} onChange={(e) => setDue(e.target.value)} />
              <div className="flex gap-2">
                <button className="flex-1 rounded-md border px-3 py-2 text-sm" onClick={() => setOpen(false)}>Отмена</button>
                <button
                  className="flex-1 rounded-md border px-3 py-2 text-sm"
                  onClick={async () => {
                    const mapSelf: Record<string, string> = { "я": "SELF", "ты": "PARTNER", "мы": "WE" };
                    const mapPartner: Record<string, string> = { "я": "PARTNER", "ты": "SELF", "мы": "WE" };
                    const assigneeValue = (myRole === "partner" ? mapPartner : mapSelf)[assignee];
                    await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, assignee: assigneeValue, dueAt: due || undefined }) });
                    setTitle("");
                    setDue("");
                    setAssignee("я");
                    setOpen(false);
                    await load();
                  }}
                >
                  Создать
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-50 hidden md:flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-xl border bg-background p-4 shadow-lg max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="text-center text-sm font-medium">Новая задача</div>
            <div className="mt-3 space-y-3">
              <input className="w-full rounded-md border px-3 py-2" placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} />
              <div className="flex items-center gap-2">
                {(["я", "ты", "мы"] as const).map((v) => (
                  <button key={v} className={`flex-1 rounded-md border px-3 py-2 text-sm ${assignee === v ? "bg-accent" : ""}`} onClick={() => setAssignee(v)}>
                    {v}
                  </button>
                ))}
              </div>
              <input type="datetime-local" className="w-full rounded-md border px-3 py-2" value={due} onChange={(e) => setDue(e.target.value)} />
              <div className="flex gap-2">
                <button className="flex-1 rounded-md border px-3 py-2 text-sm" onClick={() => setOpen(false)}>Отмена</button>
                <button
                  className="flex-1 rounded-md border px-3 py-2 text-sm"
                  onClick={async () => {
                    const map: Record<string, string> = { "я": "SELF", "ты": "PARTNER", "мы": "WE" };
                    await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, assignee: map[assignee], dueAt: due || undefined }) });
                    setTitle("");
                    setDue("");
                    setAssignee("я");
                    setOpen(false);
                    await load();
                  }}
                >
                  Создать
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {selected && (
        <>
          <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setSelected(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
            <div className="w-full max-w-md rounded-xl border bg-background p-4 shadow-lg max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
              <div className="text-center text-sm font-medium">Задача</div>
              <div className="mt-3 space-y-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-muted-foreground">Название</span>
                  <input className="w-full rounded-md border px-3 py-2" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                </label>
                <div>
                  <div className="mb-1 text-sm text-muted-foreground">Назначение</div>
                  <div className="flex items-center gap-2">
                    {(["я", "ты", "мы"] as const).map((v) => (
                      <button key={v} className={`flex-1 rounded-md border px-3 py-2 text-sm ${editAssignee === v ? "bg-accent" : ""}`} onClick={() => setEditAssignee(v)}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-sm text-muted-foreground">Срок</div>
                  <div className="flex items-center gap-2">
                    <input type="datetime-local" className="w-full rounded-md border px-3 py-2" value={editDue} onChange={(e) => setEditDue(e.target.value)} />
                    {editDue && (
                      <button className="rounded-md border px-3 py-2 text-sm" onClick={() => setEditDue("")}>Очистить</button>
                    )}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editCompleted} onChange={(e) => setEditCompleted(e.target.checked)} />
                  Пометить выполненной
                </label>
                <div className="flex gap-2 pt-1">
                  <button className="flex-1 rounded-md border px-3 py-2 text-sm" onClick={() => setSelected(null)}>Закрыть</button>
                <button
                    className="flex-1 rounded-md border px-3 py-2 text-sm"
                    onClick={async () => {
                      if (!selected) return;
                    const mapSelf: Record<string, string> = { "я": "SELF", "ты": "PARTNER", "мы": "WE" };
                    const mapPartner: Record<string, string> = { "я": "PARTNER", "ты": "SELF", "мы": "WE" };
                    const assigneeValue = (myRole === "partner" ? mapPartner : mapSelf)[editAssignee];
                      await fetch(`/api/tasks/${selected.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          title: editTitle,
                        assignee: assigneeValue,
                          dueAt: editDue || null,
                          completed: editCompleted,
                        }),
                      });
                      setSelected(null);
                      await load();
                    }}
                  >
                    Сохранить
                  </button>
                  <button
                    className="rounded-md border px-3 py-2 text-sm"
                    onClick={async () => {
                      if (!selected) return;
                      await fetch(`/api/tasks/${selected.id}`, { method: "DELETE" });
                      setSelected(null);
                      await load();
                    }}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


