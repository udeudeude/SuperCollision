/* Experimental SuperCollision Lab offline pack. No automatic large downloads.
 * Each pack is installed atomically only after a user-initiated request. */
const PACK_PREFIX = 'supercollision-lab-pack-';
const META_NAME = 'supercollision-lab-offline-meta';
const POINTER_URL = new URL('./__lab_offline_pointer__', self.registration.scope).href;

async function getPointer() {
  const meta = await caches.open(META_NAME);
  const response = await meta.match(POINTER_URL);
  if (!response) return null;
  try {
    const value = await response.json();
    if (typeof value.name !== 'string' || !value.name.startsWith(PACK_PREFIX) ||
        !Number.isSafeInteger(value.fileCount) || value.fileCount < 1) return null;
    const names = await caches.keys();
    if (!names.includes(value.name)) return null;
    const pack = await caches.open(value.name);
    // Do not invalidate the entire instrument because Safari has evicted
    // one optional cache entry. A complete installation was verified when
    // written; here we verify the essential entrypoints on every restart.
    for (const required of ['./index.html', './runtime/sclang/sclang.wasm',
                            './runtime/scsynth/scsynth.wasm']) {
      if (!(await pack.match(new URL(required, self.registration.scope).href))) return null;
    }
    return value;
  } catch {
    return null;
  }
}

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  // The manifest is deliberately network-fresh so a new pack can be discovered.
  if (url.pathname.endsWith('/lab-offline-assets.json')) return;
  event.respondWith((async () => {
    const pointer = await getPointer();
    const pack = pointer ? await caches.open(pointer.name) : null;

    // iOS Safari may terminate and restart the worker between page visits.
    // The offline entrypoint must be retrievable before any network attempt.
    // An offline navigator hint skips an unnecessary network navigation.
    if (request.mode === 'navigate') {
      const saved = pack && (
        await pack.match(request, {ignoreSearch: true}) ||
        await pack.match(new URL('./index.html', scope).href)
      );
      if (saved && self.navigator?.onLine === false) return saved;
      try {
        const fresh = await fetch(request);
        if (fresh.ok) return fresh;
      } catch {}
      if (saved) return saved;
      // No complete offline pack, no unsafe fallback to a partial version.
      return Response.error();
    }

    if (pack) {
      const cached = await pack.match(request, {ignoreSearch: true});
      if (cached) return cached;
      // A damaged offline copy must never silently fetch the missing large file.
      if (url.pathname.includes('/runtime/') || url.pathname.endsWith('/language-catalog.json')) {
        return new Response('Offline copy incomplete: use File > Storage to reinstall it.',
          {status: 503, headers: {'Content-Type': 'text/plain'}});
      }
    }
    return fetch(request);
  })());
});

async function installPack(manifest, port) {
  if (!manifest || !/^[a-f0-9]{8,64}$/.test(manifest.version) ||
      !Array.isArray(manifest.files) || !manifest.files.length ||
      manifest.files.length > 128) throw Error('Invalid lab offline manifest');
  const packName = PACK_PREFIX + manifest.version + '-' + Date.now();
  const pack = await caches.open(packName);
  let bytes = 0;
  let committed = false;
  try {
    const seen = new Set();
    for (let i = 0; i < manifest.files.length; i++) {
      const asset = manifest.files[i];
      if (!asset || typeof asset.path !== 'string' ||
          !/^\/[a-zA-Z0-9_./-]+$/.test(asset.path) || asset.path.includes('..') ||
          seen.has(asset.path) || !Number.isSafeInteger(asset.bytes) || asset.bytes < 0) {
        throw Error('Invalid offline file entry');
      }
      seen.add(asset.path);
      const url = new URL(asset.path.slice(1), self.registration.scope);
      const response = await fetch(url, {cache: 'reload'});
      if (!response.ok || response.type === 'opaque') throw Error('Could not download ' + asset.path);
      await pack.put(url.href, response);
      bytes += asset.bytes;
      port.postMessage({type: 'progress', completed: i + 1, total: manifest.files.length, path: asset.path});
    }
    if (!seen.has('/index.html') || !seen.has('/runtime/sclang/sclang.wasm') ||
        !seen.has('/runtime/scsynth/scsynth.wasm')) throw Error('Offline pack is missing essential files');
    const meta = await caches.open(META_NAME);
    await meta.put(POINTER_URL, new Response(JSON.stringify({
      name: packName, version: manifest.version, bytes,
      fileCount: manifest.files.length, installed: Date.now()
    }), {headers: {'Content-Type': 'application/json'}}));
    committed = true;
    port.postMessage({type: 'complete', version: manifest.version, bytes});
    // Cleanup is best effort after the pointer is committed. A cleanup error
    // must never remove the new, active offline copy.
    try {
      const names = await caches.keys();
      await Promise.all(names.filter(name => name.startsWith(PACK_PREFIX) && name !== packName)
        .map(name => caches.delete(name)));
    } catch (error) {
      console.warn('Could not remove previous offline pack', error);
    }
  } catch (error) {
    if (!committed) await caches.delete(packName);
    throw error;
  }
}

self.addEventListener('message', event => {
  const port = event.ports && event.ports[0];
  if (!port) return;
  event.waitUntil((async () => {
    try {
      const data = event.data || {};
      if (data.type === 'status') {
        port.postMessage({type: 'status', pointer: await getPointer()});
      } else if (data.type === 'install') {
        await installPack(data.manifest, port);
      } else {
        port.postMessage({type: 'error', message: 'Unsupported offline operation'});
      }
    } catch (error) {
      port.postMessage({type: 'error', message: String(error.message || error)});
    }
  })());
});
