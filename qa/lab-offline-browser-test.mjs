/* Lab-only Chromium smoke test: verifies no unsolicited large transfers,
 * explicit opt-in, complete offline reload, and offline runtime asset access.
 * Device-specific iPhone acceptance still requires separate real-device tests. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
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
const browser=await chromium.launch({headless:true});
let context;
try{
  context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();
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
    ()=>document.querySelector('#lab-offline-status')?.textContent?.startsWith('Offline ready'),
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
  console.log('Lab offline browser smoke test passed');
}finally{
  if(context)await context.close();
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
