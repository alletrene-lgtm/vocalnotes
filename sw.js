/* ClipVoice — Service Worker v4
   Gère :
   - Cache offline des assets
   - Interception du Share Target POST pour textes longs (> limite URL GET)
     → stocke le texte en sessionStorage via postMessage au client
*/
const CACHE = 'clipvoice-v4';
const ASSETS = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png'];

// ── Installation ─────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activation ───────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Interception du Share Target POST (textes longs)
  if (e.request.method === 'POST' && url.pathname.includes('index.html')) {
    e.respondWith(handleSharePost(e.request));
    return;
  }

  // Stratégie : network-first, fallback cache
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// ── Gestion Share POST ───────────────────────────────
async function handleSharePost(request) {
  try {
    const formData = await request.formData();
    const text  = formData.get('text')  || '';
    const title = formData.get('title') || '';
    const url   = formData.get('url')   || '';
    const combined = [text, title, url].filter(Boolean).join('\n').trim();

    if (combined) {
      // Envoyer le texte à tous les clients ouverts via postMessage
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.postMessage({ type: 'SHARED_TEXT', text: combined });
      }
    }
  } catch (err) {
    console.error('SW share POST error:', err);
  }

  // Rediriger vers l'index (le postMessage aura livré le texte)
  return Response.redirect('./index.html', 303);
}
