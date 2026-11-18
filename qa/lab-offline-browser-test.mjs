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
let interfaceNetworkHits=0;
const server=createServer(async (req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  // Emulate Cloudflare Pages' canonical-index redirect. Safari rejects an
  // offline navigation if this redirected response is cached unmodified.
  if (pathname === '/index.html' && req.method === 'GET') {
    res.writeHead(302, {'Location':'/'}).end();
    return;
  }
  if(pathname==='/lab-offline.mjs')interfaceNetworkHits++;
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
  // Save a realistic redirected HTML response before the service worker
  // exists so we can reproduce a legacy Safari offline cache later.
  const legacyRedirected=await page.evaluate(async()=>{
    const response=await fetch('./index.html',{cache:'reload'});
    const fixture=await caches.open('lab-qa-redirect-fixture');
    await fixture.put(new URL('./index.html',location.href).href,response.clone());
    return response.redirected;
  });
  assert(legacyRedirected,'Redirect fixture did not simulate Cloudflare');
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('#code').isVisible(),true,'Editor did not load');
  assert.equal(requests.some(x=>x.includes('language-catalog.json')),false,
    'The large language catalog downloaded without permission');
  assert.equal(requests.some(x=>x.startsWith('/runtime/')),false,
    'The audio runtime downloaded without permission');

  // Phone-sized File drawer must reveal the selected category automatically.
  // Previously the Storage section expanded below a scroll boundary, hiding
  // both the offline controls and later recovery actions.
  await page.locator('#file-menu > summary').click();
  const storageGroup=page.locator('#file-menu .file-submenu').filter({
    has:page.locator('summary:text-is("STORAGE")')
  });
  await storageGroup.locator('summary').click();
  await page.waitForFunction(()=>document.querySelector('#file-menu')?.classList.contains('file-section-focused'));
  const menuLayout=await page.evaluate(()=>{
    const menu=document.querySelector('#file-menu');
    const body=document.querySelector('#file-menu-items');
    const actions=[...menu.querySelector('.file-submenu[open] .file-submenu-items').children];
    const visibles=actions.filter(element=>getComputedStyle(element).display!=='none');
    return {
      menuOpen:menu.open,
      backVisible:!document.querySelector('#file-menu-back').hidden,
      otherGroupsHidden:[...menu.querySelectorAll('.file-submenu:not([open])')]
        .every(group=>getComputedStyle(group).display==='none'),
      buttonsVisible:visibles.every(element=>{
        const box=element.getBoundingClientRect();
        const viewport=body.getBoundingClientRect();
        return box.top>=viewport.top-2 && box.bottom<=viewport.bottom+2;
      }),
      diagnosticsVisible:!!document.querySelector('#lab-offline-diagnostics')
        .getBoundingClientRect().height,
      hiddenRecovery:getComputedStyle(document.querySelector('#lab-vault-recover')).display==='none'
    };
  });
  assert(menuLayout.menuOpen&&menuLayout.backVisible&&menuLayout.otherGroupsHidden,
    'Expanded File category did not focus: '+JSON.stringify(menuLayout));
  assert(menuLayout.buttonsVisible&&menuLayout.diagnosticsVisible&&menuLayout.hiddenRecovery,
    'Storage controls still hidden or clipped: '+JSON.stringify(menuLayout));
  const noFetchBefore=requests.length;
  await page.locator('#lab-offline-diagnostics').click();
  await page.waitForFunction(()=>
    document.querySelector('#lab-offline-report')?.textContent?.includes('Service worker:'),
    null,{timeout:10000});
  assert(await page.locator('#file-menu').evaluate(el=>el.open),
    'Offline diagnostic dismissed the File menu');
  assert(await page.locator('#lab-offline-report').isVisible(),
    'Offline diagnostic did not remain visible inline');
  assert.equal(requests.length,noFetchBefore,
    'Offline readiness diagnostic unexpectedly requested network resources');
  await page.locator('#file-menu-back').click();
  await page.waitForFunction(()=>!document.querySelector('#file-menu')?.classList.contains('file-section-focused'));
  assert(await page.locator('#file-menu .file-submenu').filter({
    has:page.locator('summary:text-is("EDITOR")')
  }).isVisible(),'Back control did not restore File sections');
  await page.locator('#file-menu > summary').click();


  // The compact engine status supports sideways swiping plus a full
  // readable dialog, rather than permanently hiding execution details.
  const longStatus='EVALUATED L1–758 • execution succeeded • composition saved';
  await page.locator('#engine-status').evaluate((el,text)=>{el.textContent=text},longStatus);
  await page.locator('#engine-status-open').click();
  assert(await page.locator('#engine-status-dialog').isVisible(),
    'The full engine status dialog did not open');
  assert.equal(await page.locator('#engine-status-full').textContent(),longStatus);
  await page.locator('#engine-status-close').click();

  // Resize the editor and Console with the same pointer path as an iPhone
  // touch gesture, then check the persisted proportion after a reload.
  await page.locator('#inspector-console').click();
  const grip=page.locator('#workspace-divider');
  assert(await grip.isVisible(),'Console divider is not visible');
  const before=await page.locator('.console-shell').boundingBox();
  const box=await grip.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2-65,{steps:5});
  await page.mouse.up();
  const after=await page.locator('.console-shell').boundingBox();
  assert(after.height>before.height+25,
    'Dragging divider up did not enlarge Console: '+JSON.stringify({before,after}));
  const storedRatio=await page.evaluate(()=>
    Number(localStorage.getItem('supercollision-console-pane-ratio-v1')));
  assert(storedRatio>.46,'Dragged pane ratio not persisted: '+storedRatio);

  // Inject enough test text to simulate a long-running composition and
  // verify that scrolling upward pauses follow until the user resumes.
  await page.locator('#console').evaluate(el=>{
    el.textContent=Array.from({length:200},(_,i)=>'output '+i).join('\n');
  });
  await page.evaluate(()=>window.SCConsoleOnShow?.());
  await page.waitForTimeout(120);
  await page.locator('#console-panel').evaluate(el=>{
    el.dispatchEvent(new Event('pointerdown',{bubbles:true}));
    el.scrollTop=0;
    el.dispatchEvent(new Event('scroll'));
  });
  assert(await page.locator('#console-follow').isVisible(),
    'Scrolling back did not expose Latest output control');
  await page.locator('#console-follow').click();
  assert(await page.locator('#console-follow').isHidden(),
    'Latest output did not resume console following');
  const followPosition=await page.locator('#console-panel').evaluate(el=>({
    distance:el.scrollHeight-el.scrollTop-el.clientHeight
  }));
  assert(followPosition.distance<=20,
    'Latest output did not scroll to bottom: '+JSON.stringify(followPosition));
  await page.reload({waitUntil:'load'});
  await page.locator('#inspector-console').click();
  const afterReload=await page.locator('.console-shell').boundingBox();
  assert(Math.abs(afterReload.height-after.height)<20,
    'Console split did not survive page reload: '+JSON.stringify({after,afterReload}));
  // All lower workbench sections share the same adjustable divider,
  // but must keep separate persistent proportions.
  const paneCases=[
    ['perform','#inspector-perform','#perform-panel','supercollision-mix-pane-ratio-v1'],
    ['learn','#inspector-learn','#learning-host','supercollision-learn-pane-ratio-v1'],
    ['design','#inspector-design','#sound-host','supercollision-generate-pane-ratio-v1']
  ];
  const paneHeights={};
  for(const [name,tab,panel,key] of paneCases){
    await page.locator(tab).click();
    assert(await grip.isVisible(),'Resizer missing in '+name);
    const beforePanel=await page.locator(panel).boundingBox();
    assert(beforePanel?.height>60,name+' lower panel is not visible');
    const handle=await grip.boundingBox();
    await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);
    await page.mouse.down();
    await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2-48,{steps:5});
    await page.mouse.up();
    const afterPanel=await page.locator(panel).boundingBox();
    assert(afterPanel.height>beforePanel.height+19,
      name+' pane failed to enlarge: '+JSON.stringify({beforePanel,afterPanel}));
    paneHeights[name]=afterPanel.height;
    assert(await page.evaluate(k=>Number(localStorage.getItem(k))>0,key),
      name+' divider preference not stored');
  }
  await page.locator('#inspector-code').click();
  assert(await grip.isHidden(),'Resizer must stay hidden in full Code view');

  // The floating Live monitor gets a VERTICAL grip, not an expanding width.
  // Its list should be scrollable instead of being truncated by More/Less.
  const liveGrip=page.locator('#live-panel-resizer');
  assert(await liveGrip.isVisible(),'Live panel resize grip missing');
  assert.equal(await page.locator('#live-panel-expand').count(),0,
    'Old More/Less button still exists');
  const beforeLive=await page.locator('#live-panel').boundingBox();
  const liveHandle=await liveGrip.boundingBox();
  await page.mouse.move(liveHandle.x+liveHandle.width/2,liveHandle.y+liveHandle.height/2);
  await page.mouse.down();
  await page.mouse.move(liveHandle.x+liveHandle.width/2,liveHandle.y+liveHandle.height/2-75,{steps:5});
  await page.mouse.up();
  const afterLive=await page.locator('#live-panel').boundingBox();
  assert(afterLive.height>beforeLive.height+30,
    'Live activity panel failed to grow upward: '+JSON.stringify({beforeLive,afterLive}));
  assert(Math.abs(afterLive.width-beforeLive.width)<2,
    'Live resize unexpectedly widened overlay and obscured code');
  const savedLive=await page.evaluate(()=>
    Number(localStorage.getItem('supercollision-live-monitor-ratio-v1')));
  assert(savedLive>.10,'Live panel height preference not saved');

  await page.reload({waitUntil:'load'});
  const restoredLive=await page.locator('#live-panel').boundingBox();
  assert(Math.abs(restoredLive.height-afterLive.height)<18,
    'Live resize did not persist: '+JSON.stringify({afterLive,restoredLive}));
  for(const [name,tab,panel] of paneCases){
    await page.locator(tab).click();
    const restored=await page.locator(panel).boundingBox();
    assert(Math.abs(restored.height-paneHeights[name])<20,
      name+' pane size did not persist across reload: '+restored.height+' vs '+paneHeights[name]);
  }
  await page.locator('#inspector-code').click();

  // Phone-sized Mix: explanatory controls, accessible full-width level
  // adjustment, truthful amplitude display, intentional rewind-only Follow,
  // and freezing the display when STOP ends performance observation.
  await page.locator('#inspector-perform').click();
  await page.locator('#perform-help').click();
  assert(await page.locator('.perform-help-dialog').isVisible(),
    'Mix help does not explain its buttons');
  assert((await page.locator('.perform-help-dialog').textContent()).includes('not measured loudness'),
    'Note level legend must not imply real audio waveform measurement');
  await page.locator('#perform-help-close').click();
  await page.evaluate(async()=>{
    const {encodeOsc}=await import('./performance-engine.mjs');
    const timeline=window.SCTimeline, journal=timeline.journal;
    const source=String.raw`SynthDef(\uxMeter, { |out=0, freq=240, amp=0.16, cutoff=900|
      Out.ar(out, SinOsc.ar(freq, 0, amp) ! 2);
    }).add;`;
    timeline.evaluation(journal.composition||'Default',source,source,1);
    journal.zero=performance.now()-65000;
    journal.outgoing(encodeOsc('/s_new',['uxMeter',90119,0,1,'freq',240,'amp',0.16]));
    journal.incoming(encodeOsc('/n_go',[90119,1,-1,-1,0]));
    timeline.render();
  });
  await page.waitForSelector('.perform-lane[data-name="uxMeter"]');
  const lane=page.locator('.perform-lane[data-name="uxMeter"]');
  assert((await lane.boundingBox()).height<70,'Mix lane is still excessively tall');
  assert.equal(await lane.locator('.perform-mute').textContent(),'MUTE');
  assert.equal(await lane.locator('.perform-solo').textContent(),'SOLO');
  assert(await lane.locator('.perform-event-level').count()>0,
    'Notes do not show nominal code amplitude');
  const noteLevel=await lane.locator('.perform-event').first().evaluate(
    el=>el.style.getPropertyValue('--note-level'));
  assert.equal(noteLevel,'40%','Declared amplitude is not represented correctly');
  await lane.locator('.perform-event').first().click();
  assert(await page.locator('.perform-note-dialog').isVisible(),
    'Tapping an event should reveal its actual known parameters');
  assert.equal(await page.locator('#perform-note-frequency').textContent(),'240 Hz');
  assert.equal(await page.locator('#perform-note-amplitude').textContent(),'0.16');
  assert((await page.locator('.perform-note-dialog').textContent()).includes('not a measured waveform'),
    'Note details must identify that coded amplitude is not captured audio');
  await page.locator('#perform-note-close').click();
  await lane.locator('.perform-level').click();
  assert(await page.locator('dialog:has(#perform-dialog-gain)').isVisible(),
    'Wide gain and parameter dialog did not open');
  assert((await page.locator('#perform-dialog-gain').boundingBox()).width>160,
    'The volume slider is still too narrow to adjust by touch');
  await page.locator('#perform-dialog-minus').click();
  assert.equal(await page.locator('#perform-dialog-gain-value').textContent(),'95%',
    'Precise five-percent volume adjustment failed');
  assert.equal(await page.locator('#perform-dialog-param-name').inputValue(),'out',
    'Sound controls should expose named synth parameters');
  await page.locator('#perform-dialog-close').click();
  await page.waitForTimeout(100);
  assert.equal(await lane.locator('.perform-level').textContent(),'95%');
  assert.equal(await page.locator('#perform-follow').getAttribute('aria-pressed'),'true');
  const verticalStayedFollowing=await page.locator('#perform-scroller').evaluate(sc=>{
    const e=(type,x,y)=>sc.dispatchEvent(new PointerEvent(type,{
      bubbles:true,pointerId:7,isPrimary:true,clientX:x,clientY:y
    }));
    e('pointerdown',200,180);e('pointermove',198,60);
    sc.scrollTop=40;sc.dispatchEvent(new Event('scroll'));
    e('pointerup',198,60);
    return document.querySelector('#perform-follow').getAttribute('aria-pressed');
  });
  assert.equal(verticalStayedFollowing,'true','Vertical scrolling disabled timeline Follow');
  await page.locator('#perform-scroller').evaluate(sc=>{
    const right=Math.max(0,sc.scrollWidth-sc.clientWidth);
    sc.scrollLeft=right;
    const e=(type,x,y)=>sc.dispatchEvent(new PointerEvent(type,{
      bubbles:true,pointerId:8,isPrimary:true,clientX:x,clientY:y
    }));
    e('pointerdown',300,180);
    sc.scrollLeft=right-300;
    e('pointermove',90,170);
    sc.dispatchEvent(new Event('scroll'));
    e('pointerup',90,170);
  });
  assert.equal(await page.locator('#perform-follow').getAttribute('aria-pressed'),'false',
    'Intentional rewind over 15 seconds did not pause Follow');
  await page.locator('#perform-follow').click();
  assert.equal(await page.locator('#perform-follow').getAttribute('aria-pressed'),'true',
    'Tap FOLLOW did not resume live timeline');
  await page.evaluate(async()=>{
    const {encodeOsc}=await import('./performance-engine.mjs');
    const j=window.SCTimeline.journal;
    j.incoming(encodeOsc('/n_end',[90119,1,-1,-1,0]));
    j.now=()=>performance.now()+11000;
    window.SCTimeline.render();
  });
  await page.waitForFunction(()=>
    document.querySelector('.perform-lane[data-name="uxMeter"]')?.classList.contains('perform-idle'),
    null,{timeout:3000});
  await page.waitForTimeout(380); // Allow the intentional 280ms idle-height transition.
  assert((await lane.boundingBox()).height<38,
    'A long-resting instrument row failed to shrink');
  const frozen=await page.evaluate(()=>{
    const j=window.SCTimeline.journal;
    j.stop();return j.timelineNow();
  });
  await page.waitForTimeout(130);
  assert.equal(await page.evaluate(()=>window.SCTimeline.journal.timelineNow()),frozen,
    'STOP did not freeze the timeline clock');
  await page.waitForFunction(()=>
    document.querySelector('#perform-summary')?.textContent?.includes('STOPPED'));
  await page.locator('#inspector-code').click();

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
    ()=>/^(Offline files installed|Offline download failed)/.test(document.querySelector('#lab-offline-status')?.textContent||''),
    null,{timeout:120000});
  const installState=await page.locator('#lab-offline-status').textContent();
  assert(installState.startsWith('Offline files installed'), 'Offline installation not verified: '+installState);
  const saved=await page.evaluate(async()=>({
    cacheNames:await caches.keys(),
    registration:Boolean((await navigator.serviceWorker.getRegistration())?.active),
    isolated:crossOriginIsolated
  }));
  assert(saved.registration,'Service worker not installed');
  assert(saved.isolated,'Cross-origin isolation missing');
  assert(saved.cacheNames.some(x=>x.startsWith('supercollision-lab-pack-')),
    'No completed offline pack');
  const cachedHtml=await page.evaluate(async()=>{
    const reg=await navigator.serviceWorker.getRegistration();
    const meta=await caches.open('supercollision-lab-offline-meta');
    const ptr=await (await meta.match(new URL('./__lab_offline_pointer__',reg.scope).href)).json();
    const pack=await caches.open(ptr.name);
    const html=await pack.match(new URL('./index.html',reg.scope).href);
    return {exists:!!html,redirected:html?.redirected,
      isolated:html?.headers.get('cross-origin-embedder-policy'),
      opener:html?.headers.get('cross-origin-opener-policy')};
  });
  assert(cachedHtml.exists&&!cachedHtml.redirected&&
      cachedHtml.isolated==='require-corp'&&cachedHtml.opener==='same-origin',
    'Offline HTML must be nonredirected with isolation headers: '+JSON.stringify(cachedHtml));
  // Reproduce an older already-installed pack whose HTML retained a
  // redirect chain. A service-worker-only update must repair this on read;
  // no user-visible 8 MB reinstallation is required.
  const oldPackRedirect=await page.evaluate(async()=>{
    const reg=await navigator.serviceWorker.getRegistration();
    const meta=await caches.open('supercollision-lab-offline-meta');
    const ptr=await (await meta.match(new URL('./__lab_offline_pointer__',reg.scope).href)).json();
    const pack=await caches.open(ptr.name);
    const url=new URL('./index.html',reg.scope).href;
    const fixture=await caches.open('lab-qa-redirect-fixture');
    const legacy=await fixture.match(url);
    if (!legacy) throw Error('Redirect fixture was lost during reload');
    await pack.put(url,legacy.clone());
    await caches.delete('lab-qa-redirect-fixture');
    return (await pack.match(url)).redirected;
  });
  assert(oldPackRedirect,'Did not create legacy redirected cache fixture');


  // Installing a package must not freeze the phone's small frontend scripts.
  // On Wi-Fi/online, updated menu logic should come from the server. Large
  // engine binaries and language catalog remain cache-first/opt-in.
  const beforeRefresh=interfaceNetworkHits;
  const shellResult=await page.evaluate(async()=>{
    const response=await fetch('./lab-offline.mjs');
    return {ok:response.ok,bytes:(await response.text()).length};
  });
  assert(shellResult.ok && shellResult.bytes>1000,'Small shell script unavailable');
  assert(interfaceNetworkHits>beforeRefresh,
    'Offline worker served a stale script instead of refreshing small frontend assets');

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
  await page.locator('#engine').evaluate(el=>{
    el.addEventListener('click',event=>{window.__labPowerTrusted=event.isTrusted},{once:true});
  });
  await page.locator('#engine').click();
  assert.equal(await page.evaluate(()=>window.__labPowerTrusted),true,
    'Offline POWER was replayed synthetically, losing the real user gesture');
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
  // Earlier tests stopped here, even though the real iPhone could become
  // permanently stuck at STARTING AUDIO SERVER with RUN disabled.
  await page.waitForFunction(()=>{
    const status=document.querySelector('#engine-status')?.textContent||'';
    return /AUDIO SERVER READY|AUDIO START STALLED|AUDIO START DELAYED|Audio server failed/.test(status);
  },null,{timeout:70000});
  const fullBoot=await page.evaluate(()=>({
    status:document.querySelector('#engine-status')?.textContent,
    runEnabled:!document.querySelector('#evaluate')?.disabled,
    consoleTail:(document.querySelector('#console')?.textContent||'').slice(-1200)
  }));
  assert(fullBoot.status.includes('AUDIO SERVER READY')&&fullBoot.runEnabled,
    'Offline engine reached language but not runnable audio: '+JSON.stringify(fullBoot));
  console.log('Offline SuperCollider RUN enabled after audio boot');

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

  // Home Screen applications have separate website data from Safari.
  // Simulate an isolated install with a fresh persistent browser profile and
  // standalone display mode, and confirm nothing large is downloaded until
  // the user chooses the explicit Home Screen setup action.
  const homeProfile=await mkdtemp(path.join(os.tmpdir(),'supercollision-home-screen-'));
  let homeContext;
  try {
    homeContext=await chromium.launchPersistentContext(homeProfile,browserOptions);
    await homeContext.addInitScript(()=>{
      Object.defineProperty(navigator,'standalone',{configurable:true,value:true});
    });
    const home=homeContext.pages()[0]||await homeContext.newPage();
    const homeRequests=[];
    home.on('request',request=>homeRequests.push(new URL(request.url()).pathname));
    home.on('dialog',dialog=>dialog.accept());
    await home.goto(origin,{waitUntil:'load'});
    await home.waitForSelector('#lab-home-screen-setup:not([hidden])',{timeout:12000});
    assert(await home.locator('#lab-home-screen-storage').evaluate(el=>
      !el.hidden && el.textContent.includes('separately from Safari')),
      'Standalone copy missing separate-storage notice');
    assert.equal(homeRequests.some(url=>url.startsWith('/runtime/')),false,
      'Standalone first launch downloaded large audio assets without consent');
    assert.equal(homeRequests.includes('/language-catalog.json'),false,
      'Standalone first launch downloaded optional catalog');
    const homeInitial=await home.evaluate(async()=>({
      packNames:(await caches.keys()).filter(name=>name.startsWith('supercollision-lab-pack-')),
      registration:!!(await navigator.serviceWorker.getRegistration())
    }));
    assert.equal(homeInitial.packNames.length,0,
      'Standalone was unexpectedly sharing Safari offline CacheStorage');
    await home.locator('#lab-home-setup-now').click();
    await home.waitForFunction(()=>document.querySelector('#lab-home-screen-setup')?.hidden===true &&
      document.querySelector('#lab-offline-status')?.textContent?.startsWith('Offline files installed'),
      null,{timeout:120000});
    assert.equal(await home.evaluate(async()=>(
      (await caches.keys()).filter(name=>name.startsWith('supercollision-lab-pack-')).length
    )),1,'Standalone pack did not save into its own storage');
    await homeContext.setOffline(true);
    await home.reload({waitUntil:'domcontentloaded',timeout:20000});
    assert(await home.locator('#code').isVisible(),
      'Standalone offline reload failed after explicit setup');

    await homeContext.close();
    homeContext=null;
    homeContext=await chromium.launchPersistentContext(homeProfile,browserOptions);
    await homeContext.addInitScript(()=>{
      Object.defineProperty(navigator,'standalone',{configurable:true,value:true});
    });
    await homeContext.setOffline(true);
    const reopened=homeContext.pages()[0]||await homeContext.newPage();
    await reopened.goto(origin,{waitUntil:'domcontentloaded',timeout:20000});
    assert(await reopened.locator('#code').isVisible(),
      'Standalone cold offline restart failed after setup');
    await reopened.waitForFunction(()=>document.querySelector('#lab-offline-status')?.textContent?.includes('Offline copy installed'),
      null,{timeout:10000});
    await reopened.locator('#engine').evaluate(el=>{
      el.addEventListener('click',event=>{window.__homePowerTrusted=event.isTrusted},{once:true});
    });
    await reopened.locator('#engine').click();
    assert.equal(await reopened.evaluate(()=>window.__homePowerTrusted),true,
      'Cold Home Screen POWER lost its original trusted user tap');
    await reopened.waitForFunction(()=>{
      const label=document.querySelector('#engine-status')?.textContent||'';
      return /AUDIO SERVER READY|AUDIO START STALLED|AUDIO START DELAYED|Audio server failed/.test(label);
    },null,{timeout:70000});
    const coldHomeBoot=await reopened.evaluate(()=>({
      status:document.querySelector('#engine-status')?.textContent,
      runEnabled:!document.querySelector('#evaluate')?.disabled,
      consoleTail:(document.querySelector('#console')?.textContent||'').slice(-800)
    }));
    assert(coldHomeBoot.status.includes('AUDIO SERVER READY')&&coldHomeBoot.runEnabled,
      'Standalone first cold offline POWER failed: '+JSON.stringify(coldHomeBoot));
    console.log('Isolated Home Screen-style cold offline audio RUN enabled');
  }finally{
    if(homeContext)await homeContext.close();
    await rm(homeProfile,{recursive:true,force:true});
  }
  console.log('Lab offline browser smoke test passed');
}finally{
  if(context)await context.close();
  await rm(profileDir,{recursive:true,force:true});
  await new Promise(resolve=>server.close(resolve));
}
