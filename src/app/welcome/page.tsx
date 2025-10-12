"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

export default function WelcomePage() {
  const [nextUrl, setNextUrl] = useState<string>("/");

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const n = url.searchParams.get("next");
      if (n) setNextUrl(n);
    } catch {}
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <div className="flex items-center justify-center pt-2">
        <Image src="/icons/Logosvg.svg" alt="ЛюблюСоню" width={200} height={200} priority />
      </div>
      <div className="rounded-lg border p-4 space-y-3 text-sm text-muted-foreground">
        <div className="text-foreground font-medium">Как это работает</div>
        <ul className="list-disc pl-6 space-y-1">
          <li>Совместный календарь и задачи для пары. Назначения: <b>я</b>, <b>ты</b>, <b>мы</b>.</li>
          <li>Во вкладке «Пара» создайте пару (код/QR) или присоединитесь по коду.</li>
          <li>Сегодня — быстрый обзор дня; Быстрое добавление понимает «завтра 19:00 ужин».</li>
          <li>Недельный и месячный виды для планирования; цвета и тихие часы настраиваются во вкладке «Пара».</li>
          <li className="text-foreground"><b>Голосовой ввод:</b> нажмите «🎤 Голосом» на главной и продиктуйте «планёрка в понедельник с 9 до 10».</li>
        </ul>
      </div>

      <div className="flex items-center justify-center gap-3">
        <a
          href={`/auth?next=${encodeURIComponent(nextUrl)}`}
          className="rounded-md border px-4 py-2 text-sm"
          onClick={() => {
            // пометим, что онбординг пройден
            document.cookie = `onboarded=1; path=/; max-age=${60 * 60 * 24 * 365}`;
          }}
        >
          Войти или зарегистрироваться
        </a>
      </div>

      <div className="rounded-lg border p-4 space-y-2">
        <div className="text-sm text-muted-foreground">Краткая памятка:</div>
        <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
          <li>Задачи: один клик — развернуть; двойной клик — редактировать.</li>
          <li>События: клик — открыть подробности; редактировать/удалить — в окне события.</li>
          <li className="text-foreground">Голосом: «встреча завтра в 10», «задача купить цветы в 18:30».</li>
        </ul>
      </div>
    </div>
  );
}


