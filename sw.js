// エンジェラサバイバーズ — Service Worker
// HTML はネットワーク優先(更新を即反映)、画像・音声はキャッシュ優先(高速・オフライン対応)
const CACHE = "angela-survivors-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const isAsset = /\.(png|mp3|json)$/i.test(url.pathname);

  if (isAsset) {
    // 画像・音声・manifest: キャッシュ優先(重く変化が少ない)
    e.respondWith(
      caches.match(e.request).then((cached) =>
        cached || fetch(e.request).then((resp) => {
          if (resp && resp.status === 200) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return resp;
        })
      )
    );
  } else {
    // HTML 等: ネットワーク優先(オフライン時のみキャッシュにフォールバック)
    e.respondWith(
      fetch(e.request).then((resp) => {
        if (resp && resp.status === 200) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return resp;
      }).catch(() => caches.match(e.request))
    );
  }
});
