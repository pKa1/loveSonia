"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Calendar, ListTodo, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();
  const items = [
    { href: "/", label: "Сегодня", icon: CalendarDays },
    { href: "/calendar", label: "Календарь", icon: Calendar },
    { href: "/tasks", label: "Задачи", icon: ListTodo },
    { href: "/pair", label: "Пара", icon: Users },
    { href: "/profile", label: "Профиль", icon: Users },
  ];

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:border-r md:bg-card/50">
      <div className="flex items-center gap-2 px-4 py-4 text-lg font-semibold">
        <img src="/icons/Logosvg.svg" alt="Logo" className="h-8 w-auto" />
      </div>
      <nav className="flex-1 px-2 py-2">
        <ul className="space-y-1">
          {items.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="h-5 w-5" />
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}


