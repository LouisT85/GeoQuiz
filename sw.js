/* Service worker : précache tout le jeu pour un fonctionnement 100 % hors-ligne.
   Incrémenter CACHE à chaque mise à jour des fichiers pour la propager. */
const CACHE = "geoquiz-v7";

// countries.js assigne window.GEO_COUNTRIES ; ici, window = self.
self.window = self;
importScripts("js/data/countries.js");

const CORE = [
  "./",
  "index.html",
  "css/style.css",
  "js/vendor/d3.v7.min.js",
  "js/vendor/topojson-client.min.js",
  "js/data/countries.js",
  "js/data/world-topo.js",
  "js/map.js",
  "js/game.js",
  "js/leaderboard.js",
  "js/app.js",
  "manifest.webmanifest",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/apple-touch-icon.png",
];

// Drapeaux du pool + fr/gb (sélecteur de langue).
const FLAGS = [...new Set([...self.GEO_COUNTRIES.map((c) => c.iso2), "fr", "gb"])]
  .map((iso2) => `assets/flags/${iso2}.png`);

// La nouvelle version se précache mais n'est pas activée tout de suite :
// remplacer les fichiers sous une page déjà ouverte lui donnerait un mélange
// d'ancien et de nouveau. C'est la page qui décide (bandeau « Mettre à jour »).
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([...CORE, ...FLAGS])));
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Cache d'abord (tout est précaché), réseau en secours.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Le classement en ligne vit sur un autre domaine : on laisse passer sans
  // toucher au cache (ignoreSearch confondrait deux requêtes différentes).
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(event.request).then((res) => {
          if (res.ok && new URL(event.request.url).origin === location.origin) {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
    )
  );
});
