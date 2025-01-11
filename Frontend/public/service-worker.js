const CACHE_NAME = 'safe-route-navigator-v1';
const MAP_CACHE_NAME = 'map-tiles-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

// Helper function to cache map tiles within viewport and surrounding area
async function cacheMapTiles(center, zoom) {
  const tileSize = 256;
  const buffer = 2; // Number of extra tiles to cache in each direction
  
  // Calculate tile coordinates for viewport plus buffer
  const centerTile = {
    x: Math.floor((center.lng + 180) / 360 * Math.pow(2, zoom)),
    y: Math.floor((1 - Math.log(Math.tan(center.lat * Math.PI / 180) + 1 / Math.cos(center.lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom))
  };
  
  const tilesToCache = [];
  for (let x = centerTile.x - buffer; x <= centerTile.x + buffer; x++) {
    for (let y = centerTile.y - buffer; y <= centerTile.y + buffer; y++) {
      const url = `https://maps.googleapis.com/maps/api/staticmap?center=${center.lat},${center.lng}&zoom=${zoom}&size=${tileSize}x${tileSize}&key=${MAPS_API_KEY}&signature=${MAP_SIGNATURE}`;
      tilesToCache.push(url);
    }
  }
  
  const cache = await caches.open(MAP_CACHE_NAME);
  return Promise.all(tilesToCache.map(url => 
    fetch(url).then(response => cache.put(url, response))
  ));
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  // Handle map tile requests
  if (event.request.url.includes('maps.googleapis.com')) {
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          return response || fetch(event.request)
            .then(response => {
              const clonedResponse = response.clone();
              caches.open(MAP_CACHE_NAME)
                .then(cache => cache.put(event.request, clonedResponse));
              return response;
            })
            .catch(() => {
              // Return a fallback tile if offline and tile not cached
              return new Response(
                'Map tile unavailable offline',
                { status: 408, statusText: 'Offline Mode' }
              );
            });
        })
    );
    return;
  }

  // Handle API requests with increased caching
  if (event.request.url.includes('/route')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clonedResponse = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, clonedResponse));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Handle all other requests
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});

// Listen for messages from the main app
self.addEventListener('message', event => {
  if (event.data.type === 'CACHE_MAP_REGION') {
    const { center, zoom } = event.data;
    event.waitUntil(cacheMapTiles(center, zoom));
  }
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (![CACHE_NAME, MAP_CACHE_NAME].includes(cacheName)) {
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Claim clients immediately
      self.clients.claim()
    ])
  );
});