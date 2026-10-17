const VERSION = 'development-v2';
const PREFIX = `schedule:${new URL(self.registration.scope).pathname}:`;
const CACHE = PREFIX + VERSION;
const FILES = ['./','./index.html','./privacy.html','./src/app.js','./src/model.js','./src/runtime.js','./src/config.js','./src/access.js','./src/style.css','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/maskable-512.png','./icons/apple-touch-icon.png'];
const URLS = FILES.map(path => new URL(path,self.registration.scope).href);
self.addEventListener('install',event => {
  // Installation is atomic: an incomplete download never replaces a working version.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(URLS.map(url => new Request(url,{cache:'reload'})))));
});
self.addEventListener('activate',event => {
  event.waitUntil((async () => {
    const keys=await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key!==CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message',event => { if(event.data?.type==='SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch',event => {
  const request=event.request;
  const url=new URL(request.url);
  const scope=new URL(self.registration.scope);
  if(request.method!=='GET' || url.origin!==scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const canonical=url.origin+url.pathname;
  if(request.mode!=='navigate' && !URLS.includes(canonical)) return;
  event.respondWith((async () => {
    const cache=await caches.open(CACHE);
    const key=request.mode==='navigate' && !URLS.includes(canonical)
      ? new URL('./index.html',scope).href : canonical;
    const cached=await cache.match(key);
    return cached || fetch(request);
  })());
});
