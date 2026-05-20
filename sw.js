const CACHE_NAME = 'schedule-v1';
const ASSETS = [
    'index.html',
    'styles.css',
    'app.js',
    'schedule.json',
    'manifest.json',
    'icon.svg'
];

// インストール時にアセットをキャッシュ
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS))
    );
});

// フェッチ時にキャッシュを優先 (Stale-While-Revalidate)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                const fetchPromise = fetch(event.request).then((networkResponse) => {
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                    });
                    return networkResponse;
                });
                return cachedResponse || fetchPromise;
            })
    );
});
