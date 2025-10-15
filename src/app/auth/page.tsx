"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function AuthPage() {
  const search = useSearchParams();
  const next = useMemo(() => {
    const n = search?.get("next") || "/pair";
    return n.startsWith("/") ? n : "/";
  }, [search]);
  const [tab, setTab] = useState<"login" | "register" | "telegram">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setError(null); }, [tab]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (tab === "register") {
        if (!email || !password || !name) throw new Error("Заполните поля");
        if (password !== password2) throw new Error("Пароли не совпадают");
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password, timezone }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Не удалось зарегистрироваться");
        }
      } else {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Неверный email или пароль");
        }
      }
      window.location.href = next;
    } catch (e: any) {
      setError(e?.message || (tab === "register" ? "Ошибка регистрации" : "Ошибка входа"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <div className="mb-4 grid grid-cols-3 gap-2 text-2xl font-semibold">
        <button type="button" className={`rounded-md border px-3 py-1 text-sm ${tab === "login" ? "bg-accent" : ""}`} onClick={() => setTab("login")}>Вход</button>
        <button type="button" className={`rounded-md border px-3 py-1 text-sm ${tab === "register" ? "bg-accent" : ""}`} onClick={() => setTab("register")}>Регистрация</button>
        <button type="button" className={`rounded-md border px-3 py-1 text-sm ${tab === "telegram" ? "bg-accent" : ""}`} onClick={() => setTab("telegram")}>Telegram</button>
      </div>
      {tab !== "telegram" && (
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid gap-1">
          {tab === "register" && (
            <>
              <label className="text-sm text-muted-foreground">Имя</label>
              <input className="rounded-md border px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} required={tab === "register"} />
            </>
          )}
        </div>
        <div className="grid gap-1">
          <label className="text-sm text-muted-foreground">Email</label>
          <input type="email" className="rounded-md border px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="grid gap-1">
          <label className="text-sm text-muted-foreground">Пароль</label>
          <input type="password" className="rounded-md border px-3 py-2" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {tab === "register" && (
          <div className="grid gap-1">
            <label className="text-sm text-muted-foreground">Повторите пароль</label>
            <input type="password" className="rounded-md border px-3 py-2" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
          </div>
        )}
        {error && <div className="text-sm text-destructive">{error}</div>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-md border px-3 py-2 text-sm"
          >
            {loading ? "Сохраняем..." : tab === "register" ? "Зарегистрироваться" : "Войти"}
          </button>
        </div>
      </form>
      )}

      {tab === "telegram" && (
        <div className="space-y-3 text-sm">
          <div className="text-muted-foreground">Быстрый вход через Telegram Mini App</div>
          <a className="inline-block rounded-md border px-3 py-2" href={`/tg?next=${encodeURIComponent(next)}`}>Открыть Telegram вход</a>
          <div className="text-xs text-muted-foreground">Если открывается в браузере — нажмите и откройте внутри Telegram.</div>
        </div>
      )}
    </div>
  );
}



