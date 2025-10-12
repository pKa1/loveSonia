"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Calendar, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";

type BottomNavProps = {
  className?: string;
};

export function BottomNav({ className }: BottomNavProps) {
  const pathname = usePathname();

  const items = [
    { href: "/", label: "Сегодня", icon: CalendarDays },
    { href: "/calendar", label: "Календарь", icon: Calendar },
    { href: "/tasks", label: "Задачи", icon: ListTodo },
  ];

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75",
        className
      )}
    >
      <ul className="mx-auto grid max-w-screen-sm grid-cols-3 px-2 py-2">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <li key={href} className="flex items-center justify-center">
              <Link
                href={href}
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-1 rounded-md px-3 py-2 text-xs font-medium",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
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
  );
}


