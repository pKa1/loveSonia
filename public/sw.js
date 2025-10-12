self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});


// Handle incoming push messages and show notifications even if no page is open
self.addEventListener("push", (event) => {
  try {
    const data = event.data ? event.data.json() : {};
    const title = data.title || "Напоминание";
    const options = {
      body: data.body || "У вас есть напоминание",
      icon: "/icons/icon-192.svg",
      badge: "/icons/icon-192.svg",
      data: data.data || {},
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (_) {
    // ignore
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/tasks";
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: "window" });
    for (const client of allClients) {
      if (client.url.includes(url) && "focus" in client) {
        return client.focus();
      }
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow(url);
    }
  })());
});

