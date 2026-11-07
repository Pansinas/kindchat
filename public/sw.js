/* KindChat service worker.
 * Makes the app installable and shows a friendly page when a page is opened offline.
 * It deliberately caches NOTHING: private messages and pages are never stored by the worker.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KindChat — offline</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#f7f4ee;color:#2b2a33;font-family:system-ui,sans-serif;text-align:center;padding:24px}
@media (prefers-color-scheme:dark){body{background:#16151a;color:#ece9f2}}button{margin-top:16px;border:0;border-radius:999px;
padding:12px 22px;background:#2b2a33;color:#fffdf9;font-size:15px}@media (prefers-color-scheme:dark){button{background:#ece9f2;color:#16151a}}</style>
</head><body><div><h1 style="font-size:22px;margin:0 0 8px">You're offline</h1><p style="margin:0;opacity:.75">KindChat will reconnect as soon as you're back online.</p>
<button onclick="location.reload()">Try again</button></div></body></html>`;

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return; // everything else goes straight to the network
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
    ),
  );
});
