const CACHE_NAME = 'devsync-dashboard-v1';
const ASSETS_TO_CACHE = [
  '/public/dashboard.html',
  '/public/manifest.json',
  '/public/icon-192x192.png',
  '/public/icon-512x512.png',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).then(
          response => {
            // Check if we received a valid response
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // IMPORTANT: Clone the response. A response is a stream
            // and because we want the browser to consume the response
            // as well as the cache consuming the response, we need
            // to clone it so we have two streams.
            var responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                // Don't cache API requests
                if (!event.request.url.includes('/api/')) {
                   cache.put(event.request, responseToCache);
                }
              });

            return response;
          }
        );
      })
  );
});
