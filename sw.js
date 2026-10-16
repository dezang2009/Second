// 오프라인 플레이용 서비스 워커: 앱 셸을 캐시하고 네트워크 우선으로 갱신
const CACHE = 'kickoff-manager-v2';
const SHELL = ['./', 'index.html', 'styles.css', 'icon.svg', 'manifest.webmanifest',
  'src/util.js', 'src/data.js', 'src/realdata.js', 'src/world.js', 'src/engine.js', 'src/season.js', 'src/render.js', 'src/ui.js', 'src/main.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
