"use client";

export function useNotifications() {
  async function requestPermission() {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    const res = await Notification.requestPermission();
    return res === "granted";
  }

  function schedule(title: string, when: Date) {
    if (!("Notification" in window)) return false;
    const delay = when.getTime() - Date.now();
    if (delay <= 0) {
      try { new Notification(title); } catch {}
      return true;
    }
    setTimeout(() => {
      try { new Notification(title); } catch {}
    }, delay);
    return true;
  }

  async function urlBase64ToUint8Array(base64String: string) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  async function subscribeToPush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const res = await fetch("/api/push/public-key");
      const { publicKey } = await res.json();
      if (!publicKey) return false;
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: await urlBase64ToUint8Array(publicKey) });
    }
    await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
    return true;
  }

  return { requestPermission, schedule, subscribeToPush };
}


