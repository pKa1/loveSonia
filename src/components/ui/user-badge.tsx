"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Me = {
  id: string;
  name: string;
  email: string;
  pairMemberships: { id: string; colorHex: string }[];
};

export function UserBadge() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setMe(d.user ?? null))
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    const ev = new EventSource("/api/realtime");
    const onPair = () => {
      fetch("/api/auth/me")
        .then((r) => r.json())
        .then((d) => setMe(d.user ?? null))
        .catch(() => {});
    };
    ev.addEventListener("pair", onPair as EventListener);
    return () => {
      ev.removeEventListener("pair", onPair as EventListener);
      ev.close();
    };
  }, []);

  if (!me) return null;
  const color = me.pairMemberships[0]?.colorHex ?? "#9b87f5";
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Link href="/profile" className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm flex-shrink-0">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <span>{me.name}</span>
      </Link>
      <Link href="/pair" className="rounded-md border px-2 py-1 text-xs">Пара</Link>
    </div>
  );
}


