/* SuperCollision Lab only: explicit, recoverable offline download controls.
 * Does not register a worker or download the large runtime on initial page load. */
const downloadButton = document.querySelector('#lab-offline-download');
const info = document.querySelector('#lab-offline-status');
const engine = document.querySelector('#engine');
const ENGINE_CONSENT = 'supercollision-lab-engine-download-approved';
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
    window.alert('Offline copy saved. You can now test in Airplane Mode. Export important compositions and recordings to Files as backups.');
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
// The original app imports ~6 MB of runtime assets on the first POWER click.
// Prevent an accidental large cellular download by asking at that moment.
// Approval lasts only for the current tab/session, not subsequent visits.
if (engine) {
  engine.addEventListener('click', async event => {
    try {
      if (sessionStorage.getItem(ENGINE_CONSENT) === 'yes') return;
    } catch {}
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
      try { sessionStorage.setItem(ENGINE_CONSENT, 'yes'); } catch {}
      engine.click();
    }
  }, true);
}
