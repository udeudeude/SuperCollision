/* Laboratory-only composition mirror. The existing localStorage save remains
 * primary. IndexedDB is an independent recovery copy, never an implicit restore.
 * Neither store protects against iOS evicting ALL website data. Export to Files.
 */
const DATABASE = 'supercollision-lab-vault-v1';
const STORE = 'snapshots';
const RECORD = 'compositions';
const recover = document.querySelector('#lab-vault-recover');
const replace = document.querySelector('#lab-vault-keep');
const status = document.querySelector('#lab-vault-status');
const snapshot = window.SCCompositionSnapshot;
const importRecovered = window.SCCompositionRecover;
let db;
let stored = null;
let blocked = false;
let latest = null;
let pending = Promise.resolve();

function describe(message) {
  if (status) status.textContent = message;
}
function valid(data) {
  return data && data.format === 'supercollision-lab-vault-v1' &&
    data.projects && typeof data.projects === 'object' && !Array.isArray(data.projects) &&
    Object.keys(data.projects).length <= 1000 &&
    Object.entries(data.projects).every(([name, code]) =>
      name && name !== '__proto__' && name.length <= 80 &&
      typeof code === 'string' && code.length <= 2_000_000) &&
    typeof data.active === 'string';
}
function normalized(data) {
  return JSON.stringify({projects:data.projects, active:data.active});
}
function openVault() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(Error('IndexedDB is unavailable'));
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(request.error || Error('Cannot open local vault'));
    request.onsuccess = () => resolve(request.result);
  });
}
function readVault() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readonly');
    const request = transaction.objectStore(STORE).get(RECORD);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || Error('Cannot read local vault'));
  });
}
function saveVault(data) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put({
      format: 'supercollision-lab-vault-v1',
      projects: data.projects,
      active: data.active,
      savedAt: Date.now()
    }, RECORD);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || Error('Cannot save local vault'));
    transaction.onabort = () => reject(transaction.error || Error('Local vault transaction aborted'));
  });
}
function setConflict(value) {
  blocked = value;
  if (recover) recover.hidden = !value;
  if (replace) replace.hidden = !value;
}
function enqueue(data) {
  // Keep the last snapshot but finish each database write in order.
  if (!valid(data)) {
    describe('Local backup not updated: invalid composition data.');
    return;
  }
  latest = structuredClone(data);
  if (blocked) return;
  pending = pending.catch(() => {}).then(async () => {
    if (blocked || !latest) return;
    const next = latest;
    latest = null;
    await saveVault(next);
    stored = next;
    describe('Extra local copy saved. Export to Files for a durable backup.');
  }).catch(error => {
    describe('Extra local copy failed: ' + (error.message || error));
  });
}
async function start() {
  if (!recover || !replace || typeof snapshot !== 'function' ||
      typeof importRecovered !== 'function') return;
  recover.hidden = true;
  replace.hidden = true;
  try {
    db = await openVault();
    const existing = await readVault();
    const current = snapshot();
    if (!valid(current)) throw Error('Current compositions are invalid');
    if (!existing) {
      enqueue(current);
    } else if (!valid(existing)) {
      setConflict(true);
      describe('Existing local backup is unreadable. Export current compositions to Files.');
      recover.disabled = true;
    } else if (normalized(existing) !== normalized(current)) {
      stored = existing;
      setConflict(true);
      describe('Local copies differ. Choose Recover or Keep current in File > Storage.');
    } else {
      stored = existing;
      describe('Extra local copy available. Export to Files for a durable backup.');
    }

    window.addEventListener('supercollision:compositions-saved', event => {
      if (event.detail) enqueue(event.detail);
    });
    recover.addEventListener('click', () => {
      if (!valid(stored)) return;
      const count = Object.keys(stored.projects).length;
      if (!confirm('Recover ' + count + ' composition(s) as separate named copies? Existing compositions will not be overwritten.')) return;
      try {
        importRecovered(stored);
        setConflict(false);
        enqueue(snapshot());
      } catch (error) {
        describe('Recovery failed: ' + (error.message || error));
      }
    });
    replace.addEventListener('click', () => {
      if (!confirm('Replace the extra local backup with the current compositions? Old backup contents will no longer be recoverable. Export a Files backup first.')) return;
      setConflict(false);
      enqueue(snapshot());
    });
  } catch (error) {
    describe('Extra local copy unavailable: ' + (error.message || error));
  }
}
start();
