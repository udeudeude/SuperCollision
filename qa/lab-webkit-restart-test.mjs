/* Diagnostic parity test on Playwright WebKit (not an actual iPhone).
 * Reports offline reload and complete browser shutdown/restart separately.
 * It does not change app or production deployment. */
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {webkit} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../site');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript',
  '.mjs':'text/javascript','.css':'text/css','.json':'application/json',
  '.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml',
  '.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname;
  const full=path.resolve(root,'.'+(name==='/'?'/index.html':name));
  const headers={'Cross-Origin-Opener-Policy':'same-origin',
    'Cross-Origin-Embedder-Policy':'require-corp',
    'Cross-Origin-Resource-Policy':'same-origin',
    'Cache-Control':'no-store'};
  if(!full.startsWith(root+path.sep)){res.writeHead(403,headers).end();return}
  try {
    const body=await readFile(full);
    res.writeHead(200,{...headers,'Content-Type':mime[path.extname(full)]||'application/octet-stream'}).end(body);
  } catch {res.writeHead(404,headers).end('Not found')}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port+'/';
const profile=await mkdtemp(path.join(tmpdir(),'supercollision-webkit-'));
const options={headless:true,viewport:{width:390,height:844},isMobile:true,hasTouch:true};
let context;
let serverStopped=false;
try {
  context=await webkit.launchPersistentContext(profile,options);
  let page=context.pages()[0]||await context.newPage();
  page.on('dialog', dialog=>dialog.accept());
  await page.goto(origin,{waitUntil:'load'});
  assert(await page.locator('#code').isVisible(),'Initial editor did not load');
  await page.evaluate(()=>{
    document.querySelector('#file-menu').open=true;
    document.querySelector('#lab-offline-download').closest('details').open=true;
  });
  await page.locator('#lab-offline-download').click();
  await page.waitForFunction(
    ()=>document.querySelector('#lab-offline-status')?.textContent?.startsWith('Offline ready'),
    null,{timeout:90000});
  const before=await page.evaluate(async()=>({
    controlled:!!navigator.serviceWorker?.controller,
    registration:!!(await navigator.serviceWorker?.getRegistration())?.active,
    isolated:crossOriginIsolated
  }));
  console.log('WebKit installed pack: '+JSON.stringify(before));
  async function diagnosePage(){
    return page.evaluate(async()=>{
      const registration=await navigator.serviceWorker.getRegistration();
      const meta=await caches.open('supercollision-lab-offline-meta');
      const stored=await meta.match(new URL('./__lab_offline_pointer__',registration.scope).href);
      const pointer=stored?await stored.json():null;
      const pack=pointer?await caches.open(pointer.name):null;
      const urls=['./index.html','./runtime/sclang/sclang.wasm','./runtime/scsynth/scsynth.wasm'];
      const required=await Promise.all(urls.map(async relative=>({
        relative,exists:pack?!!(await pack.match(new URL(relative,registration.scope).href)):false
      })));
      const keys=pack?await pack.keys():[];
      const msg=await new Promise(resolve=>{
        const channel=new MessageChannel();
        const timeout=setTimeout(()=>resolve({timeout:true}),4000);
        channel.port1.onmessage=event=>{clearTimeout(timeout);resolve(event.data)};
        registration.active.postMessage({type:'status'},[channel.port2]);
      });
      return {pointer,packKeys:keys.length,required,workerStatus:msg,
        online:navigator.onLine,controller:!!navigator.serviceWorker.controller};
    });
  }
  console.log('WebKit local storage before outage: '+JSON.stringify(await diagnosePage()));
  // Playwright WebKit setOffline(true) is known to break service-worker
  // navigations even when returning literal cached HTML (issue #42775).
  // Use a real unreachable origin: stop the HTTP server without affecting
  // the service worker, then reload and relaunch the browser process.
  await new Promise(resolve=>server.close(resolve));
  serverStopped=true;
  console.log('WebKit local storage after outage: '+JSON.stringify(await diagnosePage()));
  await page.reload({waitUntil:'domcontentloaded',timeout:20000});
  assert(await page.locator('#code').isVisible(),'Offline WebKit reload did not load editor');
  console.log('WebKit same-process offline reload: PASS');

  await context.close();
  context=null;
  context=await webkit.launchPersistentContext(profile,options);
  page=context.pages()[0]||await context.newPage();
  await page.goto(origin,{waitUntil:'domcontentloaded',timeout:20000});
  assert(await page.locator('#code').isVisible(),'Offline WebKit cold browser reopen did not load editor');
  const after=await page.evaluate(async()=>({
    controlled:!!navigator.serviceWorker?.controller,
    registration:!!(await navigator.serviceWorker?.getRegistration())?.active,
    isolated:crossOriginIsolated
  }));
  console.log('WebKit cold offline restart: PASS '+JSON.stringify(after));
} finally {
  if(context)await context.close();
  await rm(profile,{recursive:true,force:true});
  if(!serverStopped)await new Promise(resolve=>server.close(resolve));
}
