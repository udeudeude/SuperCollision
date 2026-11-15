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
    const verified = await existingPack();
    if (!verified || verified.version !== manifest.version)
      throw Error('Saved files could not be verified. Existing copies were not erased.');
    notice('Offline files installed (' + displaySize(result.bytes) + '). Restart behavior still needs testing on iPhone.');
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
// Readiness diagnostics use only local Cache Storage, with no network fetch.
// Never dismiss the File menu to show an asynchronous browser alert: Safari
// may suppress dialogs after an await and leave the user with no feedback.
const diagnostics = document.querySelector('#lab-offline-diagnostics');
const offlineReport = document.querySelector('#lab-offline-report');
async function inspectOfflineCopy() {
  const registration = await navigator.serviceWorker?.getRegistration();
  const active = Boolean(registration?.active);
  const controlled = Boolean(navigator.serviceWorker?.controller);
  let pointer = null;
  let cachedFiles = 0;
  let missing = [];
  let storageError = '';
  const essential = [
    './index.html','./lab-offline.mjs','./lab-composition-vault.mjs',
    './instrument-layout.css','./instrument-layout.js',
    './runtime/sclang/sclang.js','./runtime/sclang/sclang.wasm',
    './runtime/sclang/sclang.data','./runtime/scsynth/scsynth.js',
    './runtime/scsynth/scsynth.wasm','./runtime/scsynth/init.js'
  ];
  try {
    if (active && 'caches' in window) {
      const meta = await caches.open('supercollision-lab-offline-meta');
      const response = await meta.match(new URL('./__lab_offline_pointer__', registration.scope).href);
      if (response) {
        const data = await response.json();
        if (typeof data.name === 'string' && data.name.startsWith('supercollision-lab-pack-')) {
          const names = await caches.keys();
          if (names.includes(data.name)) {
            pointer = data;
            const pack = await caches.open(data.name);
            const checks = await Promise.all(essential.map(async relative => ({
              path:relative,
              found:Boolean(await pack.match(new URL(relative,registration.scope).href))
            })));
            cachedFiles=checks.filter(check=>check.found).length;
            missing=checks.filter(check=>!check.found).map(check=>check.path);
          }
        }
      }
    }
  } catch (error) {
    storageError=String(error.message||error);
  }
  const lines=[
    'Service worker: '+(active?'active':'NOT ACTIVE'),
    'Page controlled: '+(controlled?'yes':'NO'),
    'Saved package: '+(pointer?'found':'NOT FOUND'),
    'Essential files: '+(pointer?cachedFiles+'/'+essential.length:'unknown'),
    'Isolation: '+(crossOriginIsolated?'yes':'NO'),
    'Connection: '+(navigator.onLine?'online':'offline')
  ];
  if(missing.length)lines.push('Missing: '+missing.join(', '));
  if(storageError)lines.push('Storage error: '+storageError);
  if(!active||!controlled||!pointer||missing.length||!crossOriginIsolated)
    lines.push('Not ready for reliable offline reopening.');
  else
    lines.push('Cached files look ready; an offline restart still needs testing.');
  return lines.join('\n');
}
if(diagnostics && offlineReport) diagnostics.addEventListener('click',()=>{
  diagnostics.setAttribute('aria-expanded','true');
  offlineReport.hidden=false;
  offlineReport.textContent='Checking saved files on this phone...';
  // A browser with unhealthy storage must not leave the user waiting forever.
  Promise.race([
    inspectOfflineCopy(),
    new Promise((_,reject)=>setTimeout(()=>reject(Error('Local storage check timed out')),7000))
  ]).then(report=>{
    offlineReport.textContent=report;
    notice('Offline readiness check finished. See results below.');
  }).catch(error=>{
    offlineReport.textContent='Offline readiness check failed: '+String(error.message||error)+
      '\nNo new files were downloaded.';
    notice('Offline readiness check failed; see report below.');
  }).finally(()=>{
    requestAnimationFrame(()=>offlineReport.scrollIntoView({block:'nearest',inline:'nearest'}));
  });
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
