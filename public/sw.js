/* Minimal offline-first service worker for cutout-studio. */
const CACHE = "cutout-studio-v3";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg", "/app-icon-192.png"];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(SHELL).catch(() => undefined))
			.then(() => self.skipWaiting()),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
			.then(() => self.clients.claim()),
	);
});

self.addEventListener("fetch", (event) => {
	const request = event.request;
	if (request.method !== "GET") return;

	const url = new URL(request.url);
	const isModelAsset = url.hostname.endsWith("staticimgly.com");
	const isSameOrigin = url.origin === self.location.origin;

	if (!isSameOrigin && !isModelAsset) return;

	// Model weights never change for a given version: cache first.
	if (isModelAsset) {
		event.respondWith(
			caches.match(request).then(
				(hit) =>
					hit ||
					fetch(request).then((response) => {
						const copy = response.clone();
						caches.open(CACHE).then((cache) => cache.put(request, copy));
						return response;
					}),
			),
		);
		return;
	}

	// App shell and assets: network first, fall back to cache when offline.
	event.respondWith(
		fetch(request)
			.then((response) => {
				if (response.ok && response.type === "basic") {
					const copy = response.clone();
					caches.open(CACHE).then((cache) => cache.put(request, copy));
				}
				return response;
			})
			.catch(() => caches.match(request).then((hit) => hit || caches.match("/"))),
	);
});
