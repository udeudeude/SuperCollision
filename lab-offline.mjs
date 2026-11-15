/* SuperCollision Lab only: explicit, recoverable offline download controls.
 * Does not register a worker or download the large runtime on initial page load. */
const downloadButton = document.querySelector('#lab-offline-download');
const info = document.querySelector('#lab-offline-status');
const engine = document.querySelector('#engine');
let engineApprovedForNextClick = false;
function notice(message) {
  if (info) info.textContent = message;
}
function displaySize(bytes) {
  return (bytes / 1_000_000).toFixed(1) + ' MB';
}
async function registration() {
  if (!('serviceWorker' in navigator)) throw Error('Offline support is unavailable in this browser');
  return navigator.serviceWorker.register('./lab-sw.js');
}
async function messageWorker(worker, type, manifest, onProgress) {
  if (!worker) throw Error('No active offline worker');
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(Error('Offline operation timed out. Existing saved files are unaffected.'));
    }, 240_000);
    channel.port1.onmessage = event => {
      const data = event.data || {};
      if (data.type === 'progress') {
        onProgress?.(data);
        return;
      }
      clearTimeout(timer);
      channel.port1.close();
      if (data.type === 'error') reject(Error(data.message || 'Offline operation failed'));
      else resolve(data);
    };
    worker.postMessage({type, manifest}, [channel.port2]);
  });
}
async function existingPack() {
  if (!('serviceWorker' in navigator)) return null;
  const entry = await navigator.serviceWorker.getRegistration();
  if (!entry?.active) return null;
  const result = await messageWorker(entry.active, 'status');
  return result.pointer || null;
}
async function downloadPack() {
  if (!navigator.onLine) throw Error('Connect to the internet to prepare the offline copy.');
  const manifestResponse = await fetch('./lab-offline-assets.json', {cache: 'no-store'});
  if (!manifestResponse.ok) throw Error('The experimental download manifest is unavailable');
  const manifest = await manifestResponse.json();
  if (!Array.isArray(manifest.files) || typeof manifest.version !== 'string')
    throw Error('The experimental download manifest is invalid');
  const bytes = manifest.files.reduce((total, item) => total + (item.bytes || 0), 0);
  const current = await existingPack();
  if (current?.version === manifest.version) {
    notice('Offline copy is already installed (' + displaySize(current.bytes || bytes) + ').');
    window.alert('This version is already saved for offline use.');
    return;
  }
  // This confirmation is deliberately required regardless of browser connection hints:
  // on iPhone, even a reported "fast" connection does not prove it is Wi-Fi.
  if (!window.confirm(
    'SuperCollision Lab will download about ' + displaySize(bytes) +
    ' of application, synthesizer and catalog files. iOS cannot reliably identify Wi-Fi. ' +
    'Tap OK only if you are on Wi-Fi, or if you explicitly authorize this download on cellular.'
  )) return;
  downloadButton.disabled = true;
  try {
    notice('Preparing offline download...');
    const entry = await registration();
    const ready = entry.active || (await navigator.serviceWorker.ready).active;
    const result = await messageWorker(ready, 'install', manifest, progress => {
      notice('Saving offline: ' + progress.completed + '/' + progress.total + ' files');
    });
    if (result.type !== 'complete') throw Error('Offline installation did not finish');
    notice('Offline ready (' + displaySize(result.bytes) + '). Files and recordings still need backups.');
    downloadButton.textContent = 'Check offline copy';
    window.alert('Offline files saved. Verify Airplane Mode reload and reopening Safari before depending on them. Export important compositions and recordings to Files as backups.');
  } finally {
    downloadButton.disabled = false;
  }
}
if (downloadButton) {
  downloadButton.addEventListener('click', () => {
    downloadPack().catch(error => {
      notice('Offline download failed: ' + (error.message || error));
      window.alert('Offline download failed. ' + (error.message || error));
    });
  });
  existingPack().then(pack => {
    if (pack) {
      notice('Offline copy installed (' + displaySize(pack.bytes || 0) + ').');
      downloadButton.textContent = 'Check offline copy';
    } else {
      notice('Offline copy not installed. No large resources will be preloaded.');
    }
  }).catch(() => notice('Offline status unknown.'));
}
// Diagnostics perform only local storage reads: no network or cellular transfer.
// This distinguishes a missing offline pack from a page that has no controller.
// If Safari cannot open the page at all, the user can inspect this on Wi-Fi.
const diagnostics = document.querySelector('#lab-offline-diagnostics');
if (diagnostics) diagnostics.addEventListener('click', async () => {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    const active = !!registration?.active;
    const controlled = !!navigator.serviceWorker?.controller;
    const pointer = active ? await existingPack() : null;
    const important = [
      './index.html', './lab-offline.mjs', './lab-composition-vault.mjs',
      './instrument-layout.css', './instrument-layout.js',
      './runtime/sclang/sclang.js', './runtime/sclang/sclang.wasm',
      './runtime/sclang/sclang.data',
      './runtime/scsynth/scsynth.js', './runtime/scsynth/scsynth.wasm',
      './runtime/scsynth/init.js'
    ];
    let missing = [];
    if (pointer) {
      const pack = await caches.open(pointer.name);
      const results = await Promise.all(important.map(async name =>
        ({name, found: !!(await pack.match(new URL(name,registration.scope)))})));
      missing = results.filter(item=>!item.found).map(item=>item.name);
    }
    const lines = [
      'Service worker: '+(active?'active':'not active'),
      'This page controlled: '+(controlled?'yes':'no'),
      'Offline pack: '+(pointer?'installed':'not found'),
      'Essential cached files: '+(pointer ? (important.length-missing.length)+'/'+important.length : 'unknown'),
      'Cross-origin isolation: '+(crossOriginIsolated?'yes':'no'),
      'Browser reports online: '+(navigator.onLine?'yes':'no')
    ];
    if (missing.length) lines.push('Missing: '+missing.join(', '));
    if (active && !controlled) lines.push('Reload on Wi-Fi before testing offline.');
    lines.push('Note: only a real offline restart establishes reliability on iPhone.');
    const report=lines.join('\n');
    notice(lines.slice(0,4).join(' | '));
    window.alert(report);
  } catch (error) {
    notice('Offline diagnosis failed: '+(error.message||error));
    window.alert('Offline diagnosis failed: '+(error.message||error));
  }
});

// The original app imports ~6 MB of runtime assets on the first POWER click.
// Prevent an accidental large cellular download by asking at that moment.
// Approval lasts only for the current tab/session, not subsequent visits.
if (engine) {
  engine.addEventListener('click', async event => {
    if (engineApprovedForNextClick) {
      engineApprovedForNextClick = false;
      return;
    }
    event.stopImmediatePropagation();
    event.preventDefault();
    let approved = false;
    try {
      approved = Boolean(await existingPack());
    } catch {}
    if (!approved) {
      approved = window.confirm(
        'Starting SuperCollider without an offline copy may download about 6 MB. ' +
        'iOS cannot reliably tell whether you are on Wi-Fi. Tap OK only if you are ' +
        'on Wi-Fi or explicitly permit this one download over cellular.'
      );
    }
    if (approved) {
      engineApprovedForNextClick = true;
      engine.click();
    }
  }, true);
}
