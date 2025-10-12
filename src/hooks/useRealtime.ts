"use client";

import { useEffect } from "react";

export function useRealtime(onEvent: (type: "tasks" | "events" | "availability" | "recurring:update") => void) {
  useEffect(() => {
    const ev = new EventSource("/api/realtime");
    const onTasks = (_e: MessageEvent<string>) => onEvent("tasks");
    const onEvents = (_e: MessageEvent<string>) => onEvent("events");
    const onAvailability = (_e: MessageEvent<string>) => onEvent("availability");
    const onRecurring = (_e: MessageEvent<string>) => onEvent("recurring:update");
    ev.addEventListener("tasks", onTasks as EventListener);
    ev.addEventListener("events", onEvents as EventListener);
    ev.addEventListener("availability", onAvailability as EventListener);
    ev.addEventListener("recurring:create", onRecurring as EventListener);
    ev.addEventListener("recurring:update", onRecurring as EventListener);
    ev.addEventListener("recurring:delete", onRecurring as EventListener);
    return () => {
      ev.removeEventListener("tasks", onTasks as EventListener);
      ev.removeEventListener("events", onEvents as EventListener);
      ev.removeEventListener("availability", onAvailability as EventListener);
      ev.removeEventListener("recurring:create", onRecurring as EventListener);
      ev.removeEventListener("recurring:update", onRecurring as EventListener);
      ev.removeEventListener("recurring:delete", onRecurring as EventListener);
      ev.close();
    };
  }, [onEvent]);
}


