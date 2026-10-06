/* ══════════ PHARMACY SERVICE WORKER ══════════ */
const CACHE_NAME = 'pharmacy-v1.0.0';
const RUNTIME_CACHE = 'pharmacy-runtime-v1.0.0';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './logo.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-database-compat.js'
];

/* ══════════ INSTALL ══════════ */
self.addEventListener('install', (event) => {
  console.log('[Pharmacy SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Pharmacy SW] Precaching app shell');
        return cache.addAll(PRECACHE_URLS).catch(err => {
          console.log('[Pharmacy SW] Some precache failed (likely external):', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

/* ══════════ ACTIVATE ══════════ */
self.addEventListener('activate', (event) => {
  console.log('[Pharmacy SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('[Pharmacy SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

/* ══════════ FETCH ══════════ */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  /* تجاهل Firebase وطلبات API */
  if (url.hostname.includes('firebase') ||
      url.hostname.includes('firebaseio') ||
      (url.hostname.includes('googleapis.com') && url.pathname.includes('identitytoolkit'))) {
    return;
  }

  /* تجاهل طلبات POST/PUT/DELETE */
  if (request.method !== 'GET') return;

  /* Network First للـ HTML */
  if (request.mode === 'navigate' || 
      (request.headers.get('accept') && request.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(request).then(cached => {
            return cached || caches.match('./index.html');
          });
        })
    );
    return;
  }

  /* Cache First للـ assets (CSS, JS, images, fonts) */
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        /* تحديث الكاش في الخلفية */
        fetch(request).then((response) => {
          if (response && response.status === 200) {
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, response);
            });
          }
        }).catch(() => {});
        
        return cachedResponse;
      }

      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const responseClone = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => {
          cache.put(request, responseClone);
        });
        return response;
      }).catch(() => {
        /* fallback للصور */
        if (request.destination === 'image') {
          return caches.match('./logo.png');
        }
      });
    })
  );
});

/* ══════════ MESSAGE (تحديث) ══════════ */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ══════════ PUSH NOTIFICATIONS ══════════ */
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'صيدلية مشوار';
  const options = {
    body: data.body || 'لديك إشعار جديد',
    icon: './logo.png',
    badge: './logo.png',
    dir: 'rtl',
    lang: 'ar'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('./index.html'));
});