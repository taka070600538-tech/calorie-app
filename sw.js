const CACHE_NAME = 'calorie-app-v18';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './data/mext-foods.json',
  './data/kurume-dishes.json',
  './js/app.js',
  './js/db.js',
  './js/nutrition.js',
  './js/foodSearch.js',
  './js/mextTable.js',
  './js/dishTable.js',
  './js/render.js',
  './js/mealForm.js',
  './js/foodForm.js',
  './js/settings.js',
  './js/goalsView.js',
  './js/dateUtils.js',
  './js/exerciseSync.js',
  './js/analytics.js',
  './js/lineChart.js',
  './js/analyticsView.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './js/backup.js',
  './js/photoRecognition.js',
  './js/photoMealForm.js',
];

self.addEventListener('install', (event) => {
  // GitHub Pagesはmax-age=600で配信するため、通常のfetchだとブラウザのHTTPキャッシュに残った
  // 古いJSを新しいCACHE_NAMEのキャッシュに取り込んでしまう。cache:'reload'で必ずサーバーから取得する。
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
