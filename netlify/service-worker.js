"use strict";

const ASSET_VERSION = "20261118-1";
const CACHE_NAME = `task-manage-datateam-${ASSET_VERSION}`;
const APP_SHELL = [
  "/",
  "/index.html",
  `/style.css?v=${ASSET_VERSION}`,
  `/app.js?v=${ASSET_VERSION}`,
  `/manifest.webmanifest?v=${ASSET_VERSION}`,
  `/icons/icon.svg?v=${ASSET_VERSION}`,
  `/icons/icon-192.png?v=${ASSET_VERSION}`,
  `/icons/icon-512.png?v=${ASSET_VERSION}`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/index.html")));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    })),
  );
});

self.addEventListener("push", (event) => {
  let payload = { title: "Task Manage DataTeam", body: "タスクに更新があります。", url: "/" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Use the safe default notification when a payload cannot be decoded.
  }

  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: `/icons/icon-192.png?v=${ASSET_VERSION}`,
    badge: `/icons/icon-192.png?v=${ASSET_VERSION}`,
    tag: payload.tag || "task-update",
    renotify: true,
    data: { url: payload.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    for (const client of clients) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  }));
});
