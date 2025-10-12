"use client";

import { useEffect } from "react";

export function ColorClient() {
  useEffect(() => {
    async function refreshColors() {
      try {
        const res = await fetch("/api/pair/get");
        const data = await res.json();
        const pair = data.pair as
          | {
              weColorHex?: string;
              memberships: { role: string; colorHex: string }[];
            }
          | null;
        if (!pair) return;
        const self = pair.memberships.find((m) => m.role === "self");
        const partner = pair.memberships.find((m) => m.role === "partner");
        const root = document.documentElement;
        if (self?.colorHex) root.style.setProperty("--color-self", self.colorHex);
        if (partner?.colorHex)
          root.style.setProperty("--color-partner", partner.colorHex);
        if (pair.weColorHex)
          root.style.setProperty("--color-we", pair.weColorHex);
      } catch {}
    }
    refreshColors();

    // Listen realtime to color changes
    const ev = new EventSource("/api/realtime");
    const onPair = () => refreshColors();
    ev.addEventListener("pair", onPair as EventListener);
    return () => {
      ev.removeEventListener("pair", onPair as EventListener);
      ev.close();
    };
  }, []);
  return null;
}


