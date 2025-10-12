"use client";

import { useEffect, useState } from "react";

export default function ProfilePage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [hasPair, setHasPair] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/profile");
      if (r.status === 401) { window.location.href = "/auth"; return; }
      const d = await r.json();
      if (d.user) {
        setName(d.user.name);
        setEmail(d.user.email);
        setTimezone(d.user.timezone);
      }
      setLoading(false);
    })();
  }, []);

  // Popular timezones for quick selection (can be extended)
  const popularZones = [
    "Europe/Moscow",
    "Europe/Kaliningrad",
    "Asia/Yekaterinburg",
    "Asia/Novosibirsk",
    "Asia/Krasnoyarsk",
    "Asia/Irkutsk",
    "Asia/Yakutsk",
    "Asia/Vladivostok",
    "Asia/Magadan",
    "Asia/Sakhalin",
    "Asia/Kamchatka",
    "Europe/Kyiv",
    "Europe/Minsk",
    "Asia/Almaty",
    "Asia/Tashkent",
  ];
  const systemTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";
  const isPopular = timezone ? popularZones.includes(timezone) : false;
  useEffect(() => {
    (async () => {
      try {
        const p = await fetch("/api/pair/get").then((r) => r.json()).catch(() => ({ pair: null }));
        setHasPair(Boolean(p.pair));
      } catch {}
    })();
  }, []);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="text-2xl font-semibold">Профиль</div>
      {loading ? (
        <div className="text-sm text-muted-foreground">Загрузка...</div>
      ) : (
        <>
          <div className="grid gap-1">
            <label className="text-sm text-muted-foreground">Имя</label>
            <input className="rounded-md border px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <label className="text-sm text-muted-foreground">Email</label>
            <input className="rounded-md border px-3 py-2" value={email} disabled />
          </div>
          <div className="grid gap-2">
            <label className="text-sm text-muted-foreground">Часовой пояс</label>
            <select
              className="rounded-md border px-3 py-2"
              value={isPopular ? timezone : "__custom"}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "__custom") {
                  // keep current custom value
                  if (!timezone) setTimezone(systemTz || "");
                } else {
                  setTimezone(val);
                }
              }}
            >
              <option value="__custom">Другое…</option>
              {popularZones.map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
            {!isPopular && (
              <input
                className="rounded-md border px-3 py-2"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder={systemTz}
              />
            )}
            <div className="text-xs text-muted-foreground">Системный часовой пояс: {systemTz || "не определён"}</div>
          </div>
          {msg && <div className="text-sm text-green-600">{msg}</div>}
          <div className="flex items-center gap-2">
            <button className="rounded-md border px-3 py-2 text-sm" onClick={async () => {
              const r = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, timezone }) });
              if (r.ok) setMsg("Сохранено");
            }}>Сохранить</button>
            <button className="rounded-md border px-3 py-2 text-sm" onClick={async () => { await fetch("/api/profile", { method: "DELETE" }); window.location.href = "/auth"; }}>Выйти</button>
            <a className="rounded-md border px-3 py-2 text-sm" href="/guide">Инструкция</a>
          </div>

          <div className="mt-6 space-y-2">
            <div className="text-sm text-muted-foreground">Управление категориями событий перенесено на вкладку «Пара».</div>
            <a href="/pair" className="rounded-md border px-3 py-2 text-sm inline-block">Открыть вкладку «Пара»</a>
          </div>
        </>
      )}
    </div>
  );
}


