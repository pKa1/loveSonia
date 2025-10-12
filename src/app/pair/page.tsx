"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CopyButton } from "@/components/ui/copy-button";

type Pair = {
  id: string;
  code: string;
  weColorHex?: string;
  memberships: Array<{
    id: string;
    role: string;
    colorHex: string;
    user: { id: string; name: string; email: string };
  }>;
};

export default function PairPage() {
  const router = useRouter();
  const [pair, setPair] = useState<Pair | null>(null);
  const [code, setCode] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [myColor, setMyColor] = useState<string>("#9b87f5");
  const [weColor, setWeColor] = useState<string>("#ff8f70");
  const [opacity, setOpacity] = useState<number>(85);
  const [error, setError] = useState<string | null>(null);
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("08:00");
  const [cats, setCats] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#3b82f6");
  const [recItems, setRecItems] = useState<Array<any>>([]);
  const [recTitle, setRecTitle] = useState("Планёрка");
  const [recWeekday, setRecWeekday] = useState<number>(1);
  const [recStart, setRecStart] = useState("09:00");
  const [recEnd, setRecEnd] = useState("10:00");
  const [recFrom, setRecFrom] = useState<string>("");
  const [recTo, setRecTo] = useState<string>("");
  const [recCatId, setRecCatId] = useState<string>("");
  const [recWarnings, setRecWarnings] = useState<Record<string, Array<{ id: string; title: string; weekday: number; startMinute: number; endMinute: number }>>>({});

  const highlightRef = useRef<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("code");
    if (fromUrl) setCode(fromUrl.toUpperCase());
    const slot = params.get("slot");
    if (slot) highlightRef.current = slot;
  }, []);

  async function ensurePair() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/pair/create", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка");
      await refresh();
      await loadQr();
    } catch (e) {
      setError("Не удалось создать пару");
    } finally {
      setLoading(false);
    }
  }

  async function joinByCode() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/pair/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка");
      await refresh();
    } catch (e) {
      setError("Неверный код");
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    const res = await fetch("/api/pair/get");
    const data = await res.json();
    setPair(data.pair);
    if (data.pair) setWeColor(data.pair.weColorHex ?? "#ff8f70");
    const q = await fetch("/api/availability").then((r) => r.json()).catch(() => ({ quietHours: null }));
    if (q.quietHours) {
      setQuietStart(minuteToHHMM(q.quietHours.startMinute));
      setQuietEnd(minuteToHHMM(q.quietHours.endMinute));
    }
    try {
      const c = await fetch("/api/categories").then((r) => r.json()).catch(() => ({ categories: [] }));
      setCats(c.categories ?? []);
    } catch {}
    try {
      const r = await fetch("/api/recurring").then((x) => x.json()).catch(() => ({ items: [] }));
      setRecItems(r.items ?? []);
    } catch {}
    // Если пришли со страницы календаря с ?slot= — подсветим и прокрутим к слоту
    try {
      if (highlightRef.current) {
        setTimeout(() => {
          const el = document.getElementById(`rec-${highlightRef.current}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.classList.add("ring", "ring-2", "ring-accent");
            setTimeout(() => el.classList.remove("ring", "ring-2", "ring-accent"), 2000);
          }
          highlightRef.current = null;
        }, 300);
      }
    } catch {}
  }

  async function loadQr() {
    const res = await fetch("/api/pair/qr");
    if (!res.ok) return;
    const data = await res.json();
    setQr(data.qr);
    setJoinUrl(data.joinUrl);
  }

  useEffect(() => {
    (async () => {
      const me = await fetch("/api/auth/me").then((r) => r.json());
      if (!me.user) {
        router.replace("/auth");
        return;
      }
      refresh();
    })();
  }, [router]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("eventOpacity");
      const val = saved ? Math.max(10, Math.min(100, parseInt(saved, 10))) : 85;
      setOpacity(val);
    } catch {}
  }, []);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="text-2xl font-semibold">Пара</div>

      <div className="rounded-lg border p-4">
        <div className="mb-2 font-medium">Создать пару</div>
        <p className="mb-3 text-sm text-muted-foreground">
          Создайте пару и поделитесь кодом или QR со второй половинкой.
        </p>
        <button
          onClick={ensurePair}
          disabled={loading}
          className="rounded-md border px-3 py-2 text-sm"
        >
          {loading ? "Создаем..." : "Создать/Открыть мою пару"}
        </button>
        {pair?.code && (
          <div className="mt-3 space-y-2 text-sm">
            <div>
              Код: <span className="font-mono text-base">{pair.code}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton text={pair.code}>Скопировать код</CopyButton>
              {joinUrl && <CopyButton text={joinUrl}>Скопировать ссылку</CopyButton>}
              {joinUrl && navigator.share && (
                <button
                  className="rounded-md border px-3 py-2 text-sm"
                  onClick={() => navigator.share({ title: "Присоединяйся к паре", url: joinUrl })}
                >
                  Поделиться
                </button>
              )}
            </div>
          </div>
        )}
        <div className="mt-4">
          <button onClick={loadQr} className="rounded-md border px-3 py-2 text-sm">
            Показать QR
          </button>
          {qr && (
            <div className="mt-3">
              <img src={qr} alt="QR" className="h-40 w-40" />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {joinUrl && (
                  <div className="break-all text-xs text-muted-foreground flex-1 min-w-40">{joinUrl}</div>
                )}
                <a href={qr} download={`pair-qr.png`} className="rounded-md border px-3 py-2 text-sm">Скачать QR</a>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-2 font-medium">Присоединиться по коду</div>
        <div className="flex flex-wrap gap-2">
          <input
            className="flex-1 min-w-0 rounded-md border px-3 py-2"
            placeholder="XXXXXX"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
          />
          <button onClick={joinByCode} className="rounded-md border px-3 py-2 text-sm shrink-0 whitespace-nowrap">
            Присоединиться
          </button>
        </div>
        {error && <div className="mt-2 text-sm text-destructive">{error}</div>}
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-2 font-medium">Участники</div>
        {!pair && <div className="text-sm text-muted-foreground">Пара ещё не создана</div>}
        {pair && (
          <ul className="space-y-2">
            {pair.memberships.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: m.colorHex }} />
                  <div className="text-sm">
                    <div className="font-medium">{m.user.name}</div>
                    <div className="text-xs text-muted-foreground">{m.user.email} · {m.role}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {pair && (
          <div className="mt-4">
            <Link href="/" className="rounded-md border px-3 py-2 text-sm">Перейти к Сегодня</Link>
          </div>
        )}
      </div>

      {pair && (
        <div className="rounded-lg border p-4">
          <div className="mb-2 font-medium">Цвета</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <label className="text-sm text-muted-foreground">Мой цвет</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={myColor}
                  onChange={(e) => setMyColor(e.target.value)}
                />
                <button
                  className="rounded-md border px-3 py-2 text-sm"
                  onClick={async () => {
                    await fetch("/api/pair/colors", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ colorHex: myColor }),
                    });
                    await refresh();
                  }}
                >
                  Сохранить
                </button>
              </div>
            </div>
            <div className="grid gap-1">
              <label className="text-sm text-muted-foreground">Общий цвет “мы”</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={weColor}
                  onChange={(e) => setWeColor(e.target.value)}
                />
                <button
                  className="rounded-md border px-3 py-2 text-sm"
                  onClick={async () => {
                    await fetch("/api/pair/colors", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ weColorHex: weColor }),
                    });
                    await refresh();
                  }}
                >
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pair && (
        <div className="rounded-lg border p-4">
          <div className="mb-2 font-medium">Категории событий</div>
          <div className="text-sm text-muted-foreground mb-2">Создайте несколько категорий и задайте им цвета.</div>
          <div className="space-y-2">
            {cats.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border p-2">
                <div className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-sm border" style={{ backgroundColor: c.color }} />
                  <span className="text-sm font-medium">{c.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input type="color" value={c.color} onChange={async (e) => {
                    const color = e.target.value;
                    await fetch(`/api/categories/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ color }) });
                    const d = await fetch("/api/categories").then((r) => r.json());
                    setCats(d.categories ?? []);
                  }} />
                  <button className="rounded-md border px-2 py-1 text-xs" onClick={async () => {
                    await fetch(`/api/categories/${c.id}`, { method: "DELETE" });
                    const d = await fetch("/api/categories").then((r) => r.json());
                    setCats(d.categories ?? []);
                  }}>Удалить</button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input className="flex-1 rounded-md border px-3 py-2 text-sm" placeholder="Название категории" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} />
            <input type="color" value={newCatColor} onChange={(e) => setNewCatColor(e.target.value)} />
            <button className="rounded-md border px-3 py-2 text-sm" onClick={async () => {
              if (!newCatName.trim()) return;
              const r = await fetch("/api/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newCatName.trim(), color: newCatColor }) });
              if (r.ok) {
                setNewCatName("");
                const d = await fetch("/api/categories").then((r) => r.json());
                setCats(d.categories ?? []);
              }
            }}>Добавить</button>
          </div>
        </div>
      )}

      {pair && (
        <div className="rounded-lg border p-4">
          <div className="mb-2 font-medium">Регулярное расписание</div>
          <div className="text-sm text-muted-foreground mb-2">Добавьте еженедельные слоты (например, планёрка каждый понедельник 09:00–10:00) и задайте период действия.</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Название</span>
              <input className="rounded-md border px-3 py-2" value={recTitle} onChange={(e) => setRecTitle(e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">День недели</span>
              <select className="rounded-md border px-3 py-2" value={recWeekday} onChange={(e) => setRecWeekday(parseInt(e.target.value, 10))}>
                <option value={1}>Понедельник</option>
                <option value={2}>Вторник</option>
                <option value={3}>Среда</option>
                <option value={4}>Четверг</option>
                <option value={5}>Пятница</option>
                <option value={6}>Суббота</option>
                <option value={0}>Воскресенье</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">С</span>
              <input type="time" className="rounded-md border px-3 py-2" value={recStart} onChange={(e) => setRecStart(e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">До</span>
              <input type="time" className="rounded-md border px-3 py-2" value={recEnd} onChange={(e) => setRecEnd(e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Период с</span>
              <input type="date" className="rounded-md border px-3 py-2" value={recFrom} onChange={(e) => setRecFrom(e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">по</span>
              <input type="date" className="rounded-md border px-3 py-2" value={recTo} onChange={(e) => setRecTo(e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Категория</span>
              <select className="rounded-md border px-3 py-2" value={recCatId} onChange={(e) => setRecCatId(e.target.value)}>
                <option value="">Без категории</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-2">
            <button className="rounded-md border px-3 py-2 text-sm" onClick={async () => {
              const startMinute = hhmmToMinute(recStart);
              const endMinute = hhmmToMinute(recEnd);
              const r = await fetch("/api/recurring", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: recTitle, weekday: recWeekday, startMinute, endMinute, fromDate: recFrom || undefined, toDate: recTo || undefined, categoryId: recCatId || undefined }) });
              if (r.ok) {
                try {
                  const data = await r.json();
                  if (data?.item?.id) setRecWarnings((prev) => ({ ...prev, [data.item.id]: Array.isArray(data.warnings) ? data.warnings : [] }));
                } catch {}
                setRecTitle("Планёрка"); setRecCatId(""); await refresh();
              }
            }}>Добавить слот</button>
          </div>
          <div className="mt-3 space-y-2">
            {recItems.length === 0 && (<div className="text-sm text-muted-foreground">Слотов пока нет</div>)}
            {recItems.map((it) => (
              <div key={it.id} id={`rec-${it.id}`} className="rounded-md border p-3 text-sm space-y-2">
                {Array.isArray(recWarnings[it.id]) && recWarnings[it.id].length > 0 && (
                  <div className="rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                    Пересечение со слотами:
                    <ul className="list-disc pl-4">
                      {recWarnings[it.id].map((w) => (
                        <li key={w.id}>{w.title}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-4 sm:items-end">
                  <label className="sm:col-span-2 grid gap-1">
                    <span className="text-xs text-muted-foreground">Название</span>
                    <input className="w-full rounded-md border px-3 py-2 font-medium" value={it.title} onChange={async (e) => {
                      const title = e.target.value;
                      setRecItems((prev) => prev.map((x) => x.id === it.id ? { ...x, title } : x));
                    }} onBlur={async (e) => {
                      const title = e.target.value.trim();
                      await fetch("/api/recurring", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, title }) });
                      await refresh();
                    }} />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-muted-foreground">Категория</span>
                    <select className="rounded-md border px-3 py-2" value={it.categoryId || ""} onChange={async (e) => {
                      const categoryId = e.target.value || null;
                      await fetch("/api/recurring", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, categoryId }) });
                      await refresh();
                    }}>
                      <option value="">Без категории</option>
                      {cats.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-muted-foreground">Назначение</span>
                    <select className="rounded-md border px-3 py-2" value={it.assignee || "WE"} onChange={async (e) => {
                      await fetch("/api/recurring", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, assignee: e.target.value }) });
                      await refresh();
                    }}>
                      <option value="SELF">я</option>
                      <option value="PARTNER">ты</option>
                      <option value="WE">мы</option>
                    </select>
                  </label>
                </div>
                <div className="grid gap-2 sm:grid-cols-4 text-xs text-muted-foreground items-end">
                  <label className="grid gap-1">
                    <span>День недели</span>
                    <select className="rounded-md border px-2 py-1 text-sm" value={it.weekday} onChange={async (e) => {
                      await fetch("/api/recurring", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, weekday: parseInt(e.target.value, 10) }) });
                      await refresh();
                    }}>
                      <option value={1}>Понедельник</option>
                      <option value={2}>Вторник</option>
                      <option value={3}>Среда</option>
                      <option value={4}>Четверг</option>
                      <option value={5}>Пятница</option>
                      <option value={6}>Суббота</option>
                      <option value={0}>Воскресенье</option>
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span>С</span>
                    <input type="time" className="rounded-md border px-2 py-1 text-sm" defaultValue={minuteToHHMM(it.startMinute)} onBlur={async (e) => {
                      const m = hhmmToMinute(e.target.value);
                      const r = await fetch("/api/recurring", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, startMinute: m }) });
                      try { const data = await r.json(); setRecWarnings((prev) => ({ ...prev, [it.id]: Array.isArray(data?.warnings) ? data.warnings : [] })); } catch {}
                      await refresh();
                    }} />
                  </label>
                  <label className="grid gap-1">
                    <span>До</span>
                    <input type="time" className="rounded-md border px-2 py-1 text-sm" defaultValue={minuteToHHMM(it.endMinute)} onBlur={async (e) => {
                      const m = hhmmToMinute(e.target.value);
                      const r = await fetch("/api/recurring", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, endMinute: m }) });
                      try { const data = await r.json(); setRecWarnings((prev) => ({ ...prev, [it.id]: Array.isArray(data?.warnings) ? data.warnings : [] })); } catch {}
                      await refresh();
                    }} />
                  </label>
                  <div className="flex items-end gap-2 sm:justify-end">
                    <button className="rounded-md border px-2 py-1 text-xs" onClick={async () => {
                    await fetch("/api/recurring", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id }) });
                    await refresh();
                    }}>Удалить</button>
                  </div>
                  <div className="sm:col-span-4 flex flex-wrap items-center gap-2">
                    <label className="grid gap-1">
                      <span>с</span>
                      <input type="date" className="rounded-md border px-2 py-1" defaultValue={it.fromDate ? new Date(it.fromDate).toISOString().slice(0,10) : ""} onBlur={async (e) => {
                        const fromDate = e.target.value ? new Date(e.target.value).toISOString() : null;
                        const r = await fetch("/api/recurring", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, fromDate }) });
                        try { const data = await r.json(); setRecWarnings((prev) => ({ ...prev, [it.id]: Array.isArray(data?.warnings) ? data.warnings : [] })); } catch {}
                        await refresh();
                      }} />
                    </label>
                    <label className="grid gap-1">
                      <span>по</span>
                      <input type="date" className="rounded-md border px-2 py-1" defaultValue={it.toDate ? new Date(it.toDate).toISOString().slice(0,10) : ""} onBlur={async (e) => {
                        const toDate = e.target.value ? new Date(e.target.value).toISOString() : null;
                        const r = await fetch("/api/recurring", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, toDate }) });
                        try { const data = await r.json(); setRecWarnings((prev) => ({ ...prev, [it.id]: Array.isArray(data?.warnings) ? data.warnings : [] })); } catch {}
                        await refresh();
                      }} />
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {pair && (
        <div className="rounded-lg border p-4">
          <div className="mb-2 font-medium">Тихие часы</div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-muted-foreground">c</label>
            <input type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} className="rounded-md border px-2 py-1" />
            <label className="text-sm text-muted-foreground">до</label>
            <input type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} className="rounded-md border px-2 py-1" />
            <button
              className="rounded-md border px-3 py-2 text-sm"
              onClick={async () => {
                const startMinute = hhmmToMinute(quietStart);
                const endMinute = hhmmToMinute(quietEnd);
                await fetch("/api/availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startMinute, endMinute }) });
              }}
            >
              Сохранить
            </button>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Например, 22:00–08:00</div>
        </div>
      )}

      {pair && (
        <div className="rounded-lg border p-4">
          <div className="mb-2 font-medium">Прозрачность событий</div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="flex-1"
            />
            <div className="text-sm text-muted-foreground w-12 text-right">{opacity}%</div>
            <button
              className="rounded-md border px-3 py-2 text-sm"
              onClick={() => {
                const v = Math.max(10, Math.min(100, opacity));
                try { localStorage.setItem("eventOpacity", String(v)); } catch {}
                document.documentElement.style.setProperty("--event-opacity", `${v}%`);
              }}
            >
              Сохранить
            </button>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Применяется локально на устройстве, влияет на отображение в календаре.</div>
        </div>
      )}
    </div>
  );
}

function hhmmToMinute(v: string) {
  const [h, m] = v.split(":").map((x) => parseInt(x, 10));
  return (h % 24) * 60 + (m % 60);
}
function minuteToHHMM(n: number) {
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function weekdayName(w: number) {
  return ["Воскресенье","Понедельник","Вторник","Среда","Четверг","Пятница","Суббота"][w] || "";
}


