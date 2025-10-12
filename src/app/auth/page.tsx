"use client";

import { useState } from "react";

export default function AuthPage() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        if (!res.ok) throw new Error("Failed");
      } else {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!res.ok) throw new Error("Failed");
      }
      window.location.href = "/pair";
    } catch (e) {
      setError("Ошибка регистрации");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <div className="mb-4 flex items-center gap-2 text-2xl font-semibold">
        <button type="button" className={`rounded-md border px-3 py-1 text-sm ${tab === "login" ? "bg-accent" : ""}`} onClick={() => setTab("login")}>Вход</button>
        <button type="button" className={`rounded-md border px-3 py-1 text-sm ${tab === "register" ? "bg-accent" : ""}`} onClick={() => setTab("register")}>Регистрация</button>
      </div>
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
    </div>
  );
}



