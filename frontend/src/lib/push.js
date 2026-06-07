// Web Push helpers (PWA). Calm, consent-based: nothing happens until the user
// taps "Turn on notifications". Degrades gracefully when unsupported.
import api from "./api";

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function permissionState() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

// Ensure our service worker is registered (works in dev too — push needs it).
async function ensureRegistration() {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  const swUrl = `${process.env.PUBLIC_URL || ""}/service-worker.js`;
  await navigator.serviceWorker.register(swUrl);
  return navigator.serviceWorker.ready;
}

// Returns { configured, vapid_public_key } from the backend.
export async function fetchPushConfig() {
  const { data } = await api.get("/notifications/config");
  return data;
}

// Full enable flow: permission → subscribe → save on backend.
// Throws an Error with a friendly message on failure.
export async function enablePush() {
  if (!pushSupported()) {
    const err = new Error("This device or browser doesn't support notifications.");
    err.code = "unsupported";
    throw err;
  }
  const cfg = await fetchPushConfig();
  if (!cfg.configured || !cfg.vapid_public_key) {
    const err = new Error("Notifications aren't available on the server yet.");
    err.code = "server_unconfigured";
    throw err;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    const err = new Error("Notifications were not allowed. You can enable them in your browser settings.");
    err.code = "denied";
    throw err;
  }

  const reg = await ensureRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(cfg.vapid_public_key),
      });
    } catch (e) {
      const err = new Error(
        "This browser couldn't reach a push service. Push works in Chrome, Edge, Firefox, or installed (Add to Home Screen) apps. Reminders still appear inside the app."
      );
      err.code = "no_push_service";
      throw err;
    }
  }

  const json = sub.toJSON();
  await api.post("/notifications/subscribe", {
    endpoint: json.endpoint,
    keys: json.keys,
    tz_offset_minutes: -new Date().getTimezoneOffset(),
  });
  return true;
}

export async function disablePush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) {
    try {
      await api.post("/notifications/unsubscribe", { endpoint: sub.endpoint });
    } catch (e) {
      /* best effort */
    }
    await sub.unsubscribe();
  }
}

// Is this browser currently subscribed?
export async function isSubscribed() {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}

export async function sendTestPush() {
  await api.post("/notifications/test");
}
