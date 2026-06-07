/* MemoryMate service worker — minimal, privacy-first.
 * - Precaches the app shell so it loads offline.
 * - Network-first for navigations (always try fresh HTML, fall back to cached shell).
 * - Cache-first for static build assets (JS/CSS/fonts/icons).
 * - NEVER caches /api requests — patient data is always fetched live.
 */
const CACHE = "memorymate-v1";
const SHELL = ["./", "./index.html", "./manifest.json", "./icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ---- Web Push: calm, family-friendly notifications ----
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "MemoryMate", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "MemoryMate";
  const options = {
    body: data.body || "",
    icon: "./icon.svg",
    badge: "./icon.svg",
    tag: data.tag || "memorymate",
    renotify: false,
    data: { url: data.url || "/", kind: data.kind || "info" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Never cache API or auth traffic — data must be live and private.
  if (url.pathname.includes("/api/")) return;

  // App navigations: network-first, fall back to cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // On localhost, don't cache static assets — keeps dev/HMR fresh while push
  // (which only needs an active SW, not the cache) still works.
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return;

  // Static assets: cache-first, then network (and cache the result).
  event.respondWith(
    caches.match(request).then((cached) =>
      cached ||
      fetch(request).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      }).catch(() => cached)
    )
  );
});
