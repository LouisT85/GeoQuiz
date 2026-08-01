/* Service worker : précache tout le jeu pour un fonctionnement 100 % hors-ligne.
   Incrémenter VERSION à chaque mise à jour des fichiers pour la propager. */
const VERSION = 11;
const CACHE = `geoquiz-v${VERSION}`;

// Première version dont la page sait afficher le bandeau « Mettre à jour ».
// En dessous, une page ouverte n'a aucun moyen de savoir qu'une version
// l'attend : c'est au service worker d'aller la chercher (voir plus bas).
const BANNER_FROM = 7;

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

/** Numéro de la version déjà installée sur l'appareil, s'il y en a une. */
async function installedVersion() {
  const versions = (await caches.keys())
    .map((key) => /^geoquiz-v(\d+)$/.exec(key))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .filter((n) => n !== VERSION);
  return versions.length ? Math.max(...versions) : null;
}

/**
 * Vrai si la page ouverte tourne sur une version antérieure au bandeau de
 * mise à jour. Ces joueurs-là sont coincés : leur code ne sait pas qu'une
 * nouvelle version existe, et sans intervention leur seul recours serait de
 * vider le cache à la main. On va donc les chercher.
 */
async function pageIsStuck() {
  const installed = await installedVersion();
  return installed !== null && installed < BANNER_FROM;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Le cœur du jeu doit être complet, sinon la version ne vaut rien…
      await cache.addAll(CORE);
      // …les drapeaux, non : un seul échec réseau ne doit pas faire échouer
      // toute l'installation et bloquer la mise à jour. Ceux qui manquent
      // seront récupérés à l'usage par le gestionnaire fetch.
      await Promise.allSettled(FLAGS.map((flag) => cache.add(flag)));

      // Normalement on attend le feu vert de la page (bandeau « Mettre à
      // jour ») : remplacer les fichiers sous une page ouverte lui donnerait
      // un mélange d'ancien et de nouveau. Face à une page trop ancienne pour
      // donner ce feu vert, on prend la main tout de suite.
      if (await pageIsStuck()) await self.skipWaiting();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const stuck = await pageIsStuck(); // avant de supprimer les anciens caches
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
      if (!stuck) return;

      // Une seule fois, pour les versions d'avant le bandeau : on recharge la
      // page à leur place. Les versions récentes, elles, se rechargent seules
      // après le clic sur « Mettre à jour ».
      for (const client of await self.clients.matchAll({ type: "window" })) {
        try { await client.navigate(client.url); } catch { /* onglet fermé */ }
      }
    })()
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
