"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const BOT_USERNAME = process.env.NEXT_PUBLIC_TG_BOT_USERNAME || ""; // опционально

export default function TgAuthPage() {
  const [status, setStatus] = useState<string>("Инициализация...");
  const [fallback, setFallback] = useState<boolean>(false);

  useEffect(() => {
    // Подключаем Telegram SDK (безопасно, вне Telegram просто ничего не сделает)
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;
    script.onload = () => attemptAuth();
    script.onerror = () => attemptAuth();
    document.head.appendChild(script);

    const timer = setTimeout(() => {
      // если долго нет initData — показываем фолбэк
      if (!(window as any)?.Telegram?.WebApp?.initData) setFallback(true);
    }, 1200);

    async function attemptAuth() {
      try {
        const anyWin = window as any;
        const tg = anyWin?.Telegram?.WebApp;
        const initData = tg?.initData || "";
        if (!initData) {
          setStatus("Не найден Telegram WebApp. Откройте эту страницу из Telegram.");
          setFallback(true);
          return;
        }
        try { tg.ready?.(); } catch {}
        const r = await fetch("/api/auth/telegram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData }) });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          setStatus(d.error || "Ошибка авторизации");
          setFallback(true);
          return;
        }
        setStatus("Успех. Перехожу...");
        window.location.href = "/calendar";
      } catch {
        setStatus("Сбой авторизации");
        setFallback(true);
      }
    }

    return () => clearTimeout(timer);
  }, []);

  const deepLink = BOT_USERNAME ? `https://t.me/${BOT_USERNAME}?startapp=login` : "https://t.me";

  return (
    <div className="mx-auto max-w-md p-6 text-center">
      <div className="text-xl font-semibold">Telegram вход</div>
      <div className="mt-3 text-sm text-muted-foreground">{status}</div>
      {fallback && (
        <div className="mt-6 space-y-3 text-sm">
          <div>Откройте эту страницу из Telegram Mini App.</div>
          {BOT_USERNAME && (
            <a className="inline-block rounded-md border px-3 py-2" href={deepLink} target="_blank" rel="noreferrer">
              Открыть в Telegram
            </a>
          )}
        </div>
      )}
      <div className="mt-6">
        <Link className="rounded-md border px-3 py-2 text-sm" href="/auth">К выбору входа</Link>
      </div>
    </div>
  );
}


