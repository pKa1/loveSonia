"use client";

import { ReactNode, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/nav/sidebar";
import { BottomNav } from "@/components/nav/bottom-nav";
import { UserBadge } from "@/components/ui/user-badge";
import { DarkModeToggle } from "@/components/ui/dark-mode-toggle";
type AppShellProps = { children: ReactNode };

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const hideChrome = pathname === "/welcome";
  // Persist client timezone once to ensure correct calendar ranges on server
  useEffect(() => {
    (async () => {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (!tz) return;
        const r = await fetch("/api/profile");
        const d = await r.json().catch(() => ({}));
        const current = d?.user?.timezone;
        if (current !== tz) {
          await fetch("/api/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ timezone: tz }),
          });
        }
      } catch {}
    })();
  }, []);
  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row">
      {!hideChrome && <Sidebar />}
      <div className="flex w-full flex-1 flex-col">
        {!hideChrome && (
          <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2 flex-shrink-0">
                <img src="/icons/Logosvg.svg" alt="Logo" className="h-7 w-auto" />
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <DarkModeToggle />
                <UserBadge />
              </div>
            </div>
          </header>
        )}
        <main className={`flex-1 px-4 py-4 ${hideChrome ? "pb-4" : "pb-24"} md:px-8 md:py-6 md:pb-6`}>{children}</main>
        {!hideChrome && (
          <div className="md:hidden">
            <BottomNav />
          </div>
        )}
      </div>
    </div>
  );
}


