const CACHE_NAME = 'bitacolitas-cache-v1';

// 1. Lista de archivos que quieres que funcionen OFFLINE
// ¡OJO con las rutas! Deben coincidir exactamente con tu estructura actual
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './src/css/style.css',
  './src/js/config.js',
  './src/js/main.js',
  './src/assets/iconpet2.png' // <-- Verifica que esté en minúsculas aquí también
];

// Instalación: Guarda los archivos en la caché del teléfono
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Cache abierta con éxito');
      return cache.addAll(urlsToCache);
    })
  );
});

// Activación: Limpia cachés viejas si actualizas la versión
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Estrategia: Primero busca en internet, si falla (offline), busca en caché
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});