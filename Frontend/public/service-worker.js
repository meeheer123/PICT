const CACHE_NAME = 'safe-route-navigator-v1';
const MAP_CACHE_NAME = 'map-tiles-v1';
const TILE_SIZE = 256;
const BUFFER_SIZE = 5;
const ZOOM_LEVELS = [12, 13, 14, 15, 16, 17, 18];

const urlsToCache = [
'/',
  '/index.html'
];

// Enhanced helper function to cache map tiles
async function cacheMapTiles(center, zoom) {
  const cache = await caches.open(MAP_CACHE_NAME);
  const tilesToCache = [];

  // Cache tiles for multiple zoom levels
  for (const zoomLevel of ZOOM_LEVELS) {
    const centerTile = {
      x: Math.floor((center.lng + 180) / 360 * Math.pow(2, zoomLevel)),
      y: Math.floor((1 - Math.log(Math.tan(center.lat * Math.PI / 180) + 1 / Math.cos(center.lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoomLevel))
    };

    // Calculate wider area coverage
    for (let x = centerTile.x - BUFFER_SIZE; x <= centerTile.x + BUFFER_SIZE; x++) {
      for (let y = centerTile.y - BUFFER_SIZE; y <= centerTile.y + BUFFER_SIZE; y++) {
        // Calculate lat/lng for each tile
        const tileLng = x / Math.pow(2, zoomLevel) * 360 - 180;
        const tileY = y / Math.pow(2, zoomLevel);
        const tileLat = Math.atan(Math.sinh(Math.PI * (1 - 2 * tileY))) * 180 / Math.PI;

        // Create larger tile sizes for better quality
        const sizes = ['256x256', '512x512', '1024x1024'];
        
        for (const size of sizes) {
          const url = `https://maps.googleapis.com/maps/api/staticmap?center=${tileLat},${tileLng}&zoom=${zoomLevel}&size=${size}&key=${MAPS_API_KEY}&signature=${MAP_SIGNATURE}`;
          tilesToCache.push(url);
        }

        // Cache different map types
        const mapTypes = ['roadmap', 'satellite', 'terrain'];
        for (const mapType of mapTypes) {
          const url = `https://maps.googleapis.com/maps/api/staticmap?center=${tileLat},${tileLng}&zoom=${zoomLevel}&size=512x512&maptype=${mapType}&key=${MAPS_API_KEY}&signature=${MAP_SIGNATURE}`;
          tilesToCache.push(url);
        }
      }
    }
  }

  // Cache tiles in batches
  const BATCH_SIZE = 50;
  for (let i = 0; i < tilesToCache.length; i += BATCH_SIZE) {
    const batch = tilesToCache.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(url =>
        fetch(url)
          .then(response => {
            if (response.ok) {
              return cache.put(url, response);
            }
          })
          .catch(error => console.warn(`Failed to cache tile: ${error}`))
      )
    );
  }
}

// Cache size management
async function manageCacheSize() {
  const cache = await caches.open(MAP_CACHE_NAME);
  const entries = await cache.keys();
  const MAX_CACHE_SIZE = 500;

  if (entries.length > MAX_CACHE_SIZE) {
    const entriesToDelete = entries.slice(0, entries.length - MAX_CACHE_SIZE);
    await Promise.all(entriesToDelete.map(entry => cache.delete(entry)));
  }
}

// Cache API response data
async function cacheApiResponse(request, response) {
  const cache = await caches.open(CACHE_NAME);
  const clonedResponse = response.clone();
  await cache.put(request, clonedResponse);
}

// Install event handler
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Try to cache each file individually and ignore failures
        return Promise.allSettled(
          urlsToCache.map(url => 
            cache.add(url).catch(error => {
              console.warn(`Failed to cache ${url}:`, error);
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event handler
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
      self.clients.claim()
    ])
  );
});

// Fetch event handler
self.addEventListener('fetch', event => {
  // Handle map tile requests
  if (event.request.url.includes('maps.googleapis.com')) {
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          if (response) {
            return response;
          }
          return fetch(event.request)
            .then(response => {
              const clonedResponse = response.clone();
              caches.open(MAP_CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, clonedResponse);
                  manageCacheSize();
                });
              return response;
            })
            .catch(() => {
              return new Response(
                'Map tile unavailable offline',
                { status: 408, statusText: 'Offline Mode' }
              );
            });
        })
    );
    return;
  }

  // Handle API requests
  if (event.request.url.includes('/route')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          cacheApiResponse(event.request, response);
          return response.clone();
        })
        .catch(() => {
          return caches.match(event.request)
            .then(cachedResponse => {
              if (cachedResponse) {
                return cachedResponse;
              }
              return new Response(
                JSON.stringify({ error: 'Offline and no cached data available' }),
                { 
                  status: 503, 
                  headers: { 'Content-Type': 'application/json' }
                }
              );
            });
        })
    );
    return;
  }

  // Handle all other requests
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request)
          .then(response => {
            // Cache successful responses for static assets
            if (response.ok && (
              event.request.url.endsWith('.js') ||
              event.request.url.endsWith('.css') ||
              event.request.url.endsWith('.png') ||
              event.request.url.endsWith('.jpg') ||
              event.request.url.endsWith('.svg') ||
              event.request.url.endsWith('.ico')
            )) {
              const clonedResponse = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, clonedResponse));
            }
            return response;
          });
      })
  );
});

// Message event handler
self.addEventListener('message', event => {
  if (event.data.type === 'CACHE_MAP_REGION') {
    const { center, zoom } = event.data;
    event.waitUntil(cacheMapTiles(center, zoom));
  }
});

// Background sync handler
self.addEventListener('sync', event => {
  if (event.tag === 'syncMapData') {
    event.waitUntil(
      // Implement background sync logic here
      Promise.resolve()
    );
  }
});

// Push notification handler
self.addEventListener('push', event => {
  if (event.data) {
    let title = 'Safe Route Navigator';
    let options = {};
    
    try {
      // Try to parse as JSON
      const data = event.data.json();
      title = data.title || title;
      options = {
        body: data.body,
        data: data
      };
      console.log(options);
    } catch (e) {
      // If not JSON, treat as plain text
      options = {
        body: event.data.text()
      };
    }

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  }
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});