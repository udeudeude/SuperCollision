/* Lab-only Chromium smoke test: verifies no unsolicited large transfers,
 * explicit opt-in, complete offline reload, and offline runtime asset access.
 * Device-specific iPhone acceptance still requires separate real-device tests. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../site');
const mime = {
  '.html':'text/html; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json',
  '.webmanifest':'application/manifest+json',
  '.wasm':'application/wasm',
  '.svg':'image/svg+xml',
  '.png':'image/png'
};
const server=createServer(async (req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const full=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  const headers={
    'Cross-Origin-Opener-Policy':'same-origin',
    'Cross-Origin-Embedder-Policy':'require-corp',
    'Cross-Origin-Resource-Policy':'same-origin',
    'Cache-Control':'no-store'
  };
  if(!full.startsWith(root+path.sep)){res.writeHead(403,headers).end();return}
  try{
    const data=await readFile(full);
    res.writeHead(200, {...headers,'Content-Type':mime[path.extname(full)]||'application/octet-stream'}).end(data);
  }catch{
    res.writeHead(404,headers).end('Not found');
  }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port+'/';
const profileDir=await mkdtemp(path.join(os.tmpdir(),'supercollision-lab-test-'));
const browserOptions={headless:true,viewport:{width:390,height:844},isMobile:true,hasTouch:true};
let context;
try{
  context=await chromium.launchPersistentContext(profileDir,browserOptions);
  const page=context.pages()[0]||await context.newPage();
  const requests=[];
  let enginePrompts=0;
  page.on('request',request=>requests.push(new URL(request.url()).pathname));
  page.on('dialog',async dialog=>{
    if(dialog.type()==='confirm' && dialog.message().includes('Starting SuperCollider')) {
      enginePrompts++;
      await dialog.dismiss();
    }else{
      await dialog.accept();
    }
  });
  await page.goto(origin,{waitUntil:'load'});
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('#code').isVisible(),true,'Editor did not load');
  assert.equal(requests.some(x=>x.includes('language-catalog.json')),false,
    'The large language catalog downloaded without permission');
  assert.equal(requests.some(x=>x.startsWith('/runtime/')),false,
    'The audio runtime downloaded without permission');

  // IndexedDB mirror is additive. Confirm it persists edits and offers
  // non-destructive recovery if browser localStorage later differs.
  await page.waitForFunction(() =>
    document.querySelector('#lab-vault-status')?.textContent?.includes('Extra local copy'),
    null, {timeout:10000});
  const storedCode='(\\n{ SinOsc.ar(330, 0, 0.12) ! 2 }.play;\\n)';
  await page.locator('#code').fill(storedCode);
  await page.waitForFunction(expected => {
    try {
      return JSON.parse(localStorage.getItem('supercollision-projects-v1')).Default === expected;
    } catch { return false; }
  }, storedCode, {timeout:10000});
  await page.waitForTimeout(400); // Allow the asynchronous IndexedDB transaction to commit.
  const vaultStatus = await page.locator('#lab-vault-status').textContent();
  assert(vaultStatus.includes('Extra local copy saved'),
    'IndexedDB save status after edit: ' + vaultStatus);
  await page.reload({waitUntil:'load'});
  assert.equal(await page.locator('#code').inputValue(), storedCode,
    'Existing composition did not survive reload');
  await page.waitForFunction(() =>
    document.querySelector('#lab-vault-status')?.textContent?.includes('Extra local copy'),
    null, {timeout:10000});
  // Simulate localStorage contents changing outside this instance.
  // App unload handlers flush the old editor state. Apply divergence on the
  // NEXT document's initialization, after unload but before app startup.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('lab-qa-diverged')) return;
    sessionStorage.setItem('lab-qa-diverged', 'yes');
    localStorage.setItem('supercollision-projects-v1', JSON.stringify({Default:'replaced'}));
  });
  await page.reload({waitUntil:'load'});
  await page.waitForTimeout(750);
  const conflictState=await page.evaluate(async () => {
    const current=JSON.parse(localStorage.getItem('supercollision-projects-v1'));
    const request=indexedDB.open('supercollision-lab-vault-v1');
    const saved=await new Promise((resolve,reject)=>{
      request.onsuccess=()=>{
        const db=request.result;
        const query=db.transaction('snapshots','readonly').objectStore('snapshots').get('compositions');
        query.onsuccess=()=>resolve(query.result);
        query.onerror=()=>reject(query.error);
      };
      request.onerror=()=>reject(request.error);
    });
    return {
      status:document.querySelector('#lab-vault-status')?.textContent,
      recoverHidden:document.querySelector('#lab-vault-recover')?.hidden,
      current, savedProjects:saved?.projects,
      currentActive:localStorage.getItem('supercollision-active-v1')
    };
  });
  assert.equal(conflictState.recoverHidden,false,
    'Expected recovery choices after localStorage diverges: '+JSON.stringify(conflictState));
  assert.equal(await page.locator('#code').inputValue(),'replaced',
    'Vault must not silently overwrite localStorage');
  await page.locator('#lab-vault-recover').evaluate(button => button.click());
  await page.waitForFunction(() =>
    document.querySelector('#lab-vault-status')?.textContent?.includes('Extra local copy saved'),
    null,{timeout:10000});
  assert.equal(await page.locator('#code').inputValue(), 'replaced',
    'Recovery must not replace active composition');
  const recovered=await page.evaluate(() =>
    JSON.parse(localStorage.getItem('supercollision-projects-v1')));
  assert(Object.values(recovered).includes(storedCode),
    'Non-destructive vault recovery lost old composition');
  assert(Object.values(recovered).includes('replaced'),
    'Non-destructive vault recovery lost current composition');


  await page.locator('#engine').click();
  await page.waitForTimeout(200);
  assert.equal(enginePrompts,1,'Engine was not gated by cellular download consent');
  assert.equal(requests.some(x=>x.startsWith('/runtime/')),false,
    'Engine downloaded runtime after user declined consent');

  await page.evaluate(()=>{
    document.querySelector('#file-menu').open=true;
    document.querySelector('#lab-offline-download').closest('details').open=true;
  });
  await page.locator('#lab-offline-download').click();
  await page.waitForFunction(
    ()=>document.querySelector('#lab-offline-status')?.textContent?.startsWith('Offline files installed'),
    null,{timeout:120000});
  const saved=await page.evaluate(async()=>({
    cacheNames:await caches.keys(),
    registration:Boolean((await navigator.serviceWorker.getRegistration())?.active),
    isolated:crossOriginIsolated
  }));
  assert(saved.registration,'Service worker not installed');
  assert(saved.isolated,'Cross-origin isolation missing');
  assert(saved.cacheNames.some(x=>x.startsWith('supercollision-lab-pack-')),
    'No completed offline pack');

  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded',timeout:20000});
  assert.equal(await page.locator('#code').isVisible(),true,'Editor did not reload offline');
  const files=await page.evaluate(async()=>{
    const [wasm,catalog]=await Promise.all([
      fetch('./runtime/sclang/sclang.wasm'),
      fetch('./language-catalog.json')
    ]);
    const engine=await wasm.arrayBuffer();
    return {wasmOk:wasm.ok,wasmBytes:engine.byteLength,catalogOk:catalog.ok};
  });
  assert(files.wasmOk && files.wasmBytes>2_000_000,'Offline SuperCollider engine asset missing');
  assert(files.catalogOk,'Offline language catalog missing');

  // Reproduce the real iPhone failure: POWER was sending uncached HEAD probes,
  // producing "Runtime unavailable: Load failed" in Airplane Mode.
  // The editor and cached wasm files alone were not enough to detect it.
  const offlineHeadRequests=[];
  page.on('request', req=>{
    if(req.method()==='HEAD') offlineHeadRequests.push(req.url());
  });
  await page.locator('#engine').click();
  await page.waitForFunction(()=>{
    const value=document.querySelector('#engine-status')?.textContent||'';
    return /Initializing language and audio server|AUDIO SERVER READY|Runtime unavailable|Audio server failed/.test(value);
  }, null, {timeout:90000});
  const engineState=await page.locator('#engine-status').textContent();
  const consoleState=await page.locator('#console').textContent();
  assert.equal(offlineHeadRequests.length,0,
    'Offline POWER issued network-only HEAD requests: '+offlineHeadRequests.join(', '));
  assert(!/Runtime unavailable|Audio server failed/.test(engineState),
    'Offline SuperCollider engine boot failed: '+engineState+'; '+consoleState.slice(-1000));
  console.log('Offline POWER reached SuperCollider initialization: '+engineState);

  // Full browser-process restart, retaining the on-disk profile and service
  // worker registration. Network is disabled BEFORE reloading the URL.
  await context.close();
  context=null;
  context=await chromium.launchPersistentContext(profileDir,browserOptions);
  await context.setOffline(true);
  const restarted=context.pages()[0]||await context.newPage();
  await restarted.goto(origin,{waitUntil:'domcontentloaded',timeout:20000});
  assert.equal(await restarted.locator('#code').isVisible(),true,
    'Editor failed after complete offline browser-process restart');
  const persistentInfo=await restarted.evaluate(async()=>({
    controlled:!!navigator.serviceWorker?.controller,
    registrations:(await navigator.serviceWorker?.getRegistrations()||[]).length
  }));
  assert(persistentInfo.controlled,'Restarted browser not controlled by service worker: '+JSON.stringify(persistentInfo));
  await restarted.locator('#engine').click();
  await restarted.waitForFunction(()=>{
    const value=document.querySelector('#engine-status')?.textContent||'';
    return /Initializing language and audio server|AUDIO SERVER READY|Runtime unavailable|Audio server failed/.test(value);
  },null,{timeout:90000});
  const restartState=await restarted.locator('#engine-status').textContent();
  assert(!/Runtime unavailable|Audio server failed/.test(restartState),
    'Offline engine failed after browser-process restart: '+restartState);
  console.log('Cold offline browser restart passed: '+restartState);

  // Safari may evict a noncritical cached icon. The service worker should
  // still recover the cached editor and engine without rejecting the entire
  // offline pack because the file count changed.
  const evicted=await restarted.evaluate(async()=>{
    const registration=await navigator.serviceWorker.getRegistration();
    const meta=await caches.open('supercollision-lab-offline-meta');
    const response=await meta.match(new URL('./__lab_offline_pointer__',registration.scope).href);
    if(!response) return false;
    const pointer=await response.json();
    const pack=await caches.open(pointer.name);
    return pack.delete(new URL('./app-icon.svg',registration.scope).href);
  });
  assert(evicted,'Could not simulate optional cache entry eviction');
  await restarted.reload({waitUntil:'domcontentloaded',timeout:20000});
  assert.equal(await restarted.locator('#code').isVisible(),true,
    'Offline page failed after noncritical cache eviction');
  console.log('Optional cache-entry eviction recovery passed');
  console.log('Lab offline browser smoke test passed');
}finally{
  if(context)await context.close();
  await rm(profileDir,{recursive:true,force:true});
  await new Promise(resolve=>server.close(resolve));
}
