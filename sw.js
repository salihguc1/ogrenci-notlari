// Öğrenci Notları — çevrimdışı çalışma
// İlke: uygulama HER ZAMAN telefondaki kopyadan anında açılır (internet yavaş, yok ya da
// "giriş yapın" sayfası çıkarıyor olsa bile). Yeni sürüm arka planda indirilir; gelen her
// dosya doğrulanır, biri bile bozuksa güncelleme reddedilir ve çalışan kopyaya dokunulmaz.
const VERSION = '1.16';
const CACHE = 'ogrenci-notlari-' + VERSION;
const FILES = ['./', 'index.html', 'app.js', 'excel.js', 'pdf.js', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png'];

// Dosyanın gerçekten bizim dosyamız olduğunu kontrol et (giriş sayfası / hata sayfası değil)
async function validated(path) {
  const r = await fetch(path, { cache: 'no-store', redirect: 'follow' });
  if (!r.ok) throw new Error('indirilemedi: ' + path + ' ' + r.status);
  if (r.redirected && new URL(r.url).origin !== self.location.origin) throw new Error('yönlendirildi: ' + path);
  const ct = (r.headers.get('content-type') || '').toLowerCase();
  const p = path === './' ? 'index.html' : path;
  if (p.endsWith('.js')) {
    if (!/javascript|ecmascript/.test(ct)) throw new Error('js değil: ' + path);
    const t = await r.clone().text();
    if (/^\s*</.test(t)) throw new Error('js yerine html: ' + path);
  } else if (p.endsWith('.html')) {
    const t = await r.clone().text();
    if (!t.includes('<div id="app">') || !t.includes('app.js')) throw new Error('uygulama sayfası değil: ' + path);
  } else if (p.endsWith('.png')) {
    if (!ct.includes('image/png')) throw new Error('resim değil: ' + path);
  } else if (p.endsWith('.webmanifest')) {
    try { JSON.parse(await r.clone().text()); } catch (e) { throw new Error('manifest bozuk'); }
  }
  return r;
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const responses = [];
    for (const f of FILES) responses.push([f, await validated(f)]);   // biri hatalıysa kurulum iptal
    const c = await caches.open(CACHE);
    for (const [f, r] of responses) await c.put(f, r);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    if (req.mode === 'navigate') {
      return (await c.match('./')) || (await c.match('index.html')) || fetch(req);
    }
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    return fetch(req);
  })());
});
