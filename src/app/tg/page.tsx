"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function TgAuthPage() {
  const [status, setStatus] = useState<string>("Инициализация...");
  useEffect(() => {
    async function run() {
      try {
        const anyWin = window as any;
        const initData = anyWin?.Telegram?.WebApp?.initData || "";
        if (!initData) {
          setStatus("Не найден Telegram WebApp. Откройте страницу из Telegram.");
          return;
        }
        const r = await fetch("/api/auth/telegram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData }) });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          setStatus(d.error || "Ошибка авторизации");
          return;
        }
        setStatus("Успех. Перехожу...");
        // Куда вести: на календарь
        window.location.href = "/calendar";
      } catch (e) {
        setStatus("Сбой авторизации");
      }
    }
    run();
  }, []);

  return (
    <div className="mx-auto max-w-md p-6 text-center">
      <div className="text-xl font-semibold">Telegram вход</div>
      <div className="mt-3 text-sm text-muted-foreground">{status}</div>
      <div className="mt-6">
        <Link className="rounded-md border px-3 py-2 text-sm" href="/">Домой</Link>
      </div>
    </div>
  );
}


