/* Independent acceptance against the real public Cloudflare site.
 * Source and compiled-site checkouts are read-only; no deployment or API key is used.
 */
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const origin=(process.env.SITE_ORIGIN||'https://supercollision.pages.dev').replace(/\/$/,'');
if(origin!=='https://supercollision.pages.dev')throw Error('Production audit may only inspect the canonical public site');
const source=resolve('source'),site=resolve('site');
const manifest=JSON.parse(await readFile(join(site,'lab-offline-assets.json'),'utf8'));
assert.equal(manifest.format,'supercollision-offline-v1');
assert.match(manifest.version,/^[a-f0-9]{40}$/);
const indexed=new Map(manifest.files.map(item=>[item.path,item.bytes]));
const names=(await readdir(source)).filter(name=>
  name==='index.html'||name==='sounds.html'||name==='sounds-lab.html'||
  name==='sound-surfaces-design.css'||name==='sound-surfaces-theme.mjs'||
  /^sounds-.*\.mjs$/.test(name)||
  /^librivox-.*\.(html|css|mjs)$/.test(name)&&name!=='librivox-test.html');
names.push('lab-offline-assets.json','runtime/sclang/sclang.wasm','runtime/scsynth/scsynth.wasm');
for(const file of names){
  const bytes=await readFile(join(site,file));
  if(file!=='lab-offline-assets.json')assert.equal(indexed.get('/'+file),bytes.length,'Offline index missing '+file);
  if(file!=='lab-offline-assets.json'&&!file.startsWith('runtime/')){
    assert.deepEqual(bytes,await readFile(join(source,file)),'Compiled site differs from source: '+file);
  }
}
const expected=new Map(await Promise.all(names.map(async file=>[file,await readFile(join(site,file))])));
const digest=data=>createHash('sha256').update(data).digest('hex').slice(0,16);
async function checkOne(file){
  const url=origin+'/'+file+'?public-audit='+manifest.version.slice(0,12);
  const response=await fetch(url,{cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error(file+' HTTP '+response.status);
  const data=Buffer.from(await response.arrayBuffer()),reference=expected.get(file);
  if(!data.equals(reference))throw Error(file+' differs: hosted '+digest(data)+' vs compiled '+digest(reference));
  return data.length;
}
let failures=[];
for(let attempt=1;attempt<=12;attempt++){
  failures=[];
  for(const file of names){
    try{await checkOne(file)}catch(error){failures.push(error.message)}
  }
  if(!failures.length)break;
  console.log('Public site mismatch attempt '+attempt+': '+failures.slice(0,6).join(' | '));
  if(attempt<12)await new Promise(resolve=>setTimeout(resolve,5000));
}
assert.deepEqual(failures,[],'Public production file mismatches');
console.log('PUBLIC BYTE AUDIT PASS: '+names.length+' deployed files, two genuine audio engines, '+manifest.files.length+' indexed offline resources; compiled source '+manifest.version);

const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  await context.addInitScript(()=>{
    window.__publicMic={requests:0,stops:0,recordings:0};
    const track={stop(){window.__publicMic.stops++},addEventListener(){}};
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{
      getUserMedia:async()=>{window.__publicMic.requests++;return {getTracks:()=>[track],getAudioTracks:()=>[track]}}
    }});
    function wav(){
      const frames=2000,rate=8000,bytes=new ArrayBuffer(44+frames*2),v=new DataView(bytes);
      const mark=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i))};
      mark(0,'RIFF');v.setUint32(4,bytes.byteLength-8,true);
      mark(8,'WAVE');mark(12,'fmt ');v.setUint32(16,16,true);
      v.setUint16(20,1,true);v.setUint16(22,1,true);
      v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);
      v.setUint16(32,2,true);v.setUint16(34,16,true);
      mark(36,'data');v.setUint32(40,frames*2,true);
      for(let i=0;i<frames;i++)v.setInt16(44+i*2,Math.sin(i*2*Math.PI*440/rate)*8000,true);
      return new Blob([bytes],{type:'audio/wav'});
    }
    window.MediaRecorder=class{
      static isTypeSupported(){return false}
      constructor(){this.state='inactive';this.mimeType='audio/wav'}
      start(){this.state='recording';window.__publicMic.recordings++}
      stop(){this.state='inactive';this.ondataavailable?.({data:wav()});queueMicrotask(()=>this.onstop?.())}
    };
  });
  const page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.url().includes('librivox.org/')&&request.resourceType()==='media')requests.push(request.url())});
  const navigation=await page.goto(origin+'/index.html?design=moog',{waitUntil:'domcontentloaded'});
  assert.equal(navigation.status(),200);
  assert.equal(await page.evaluate(()=>crossOriginIsolated),true,'Live Code missing cross-origin isolation required by native engine');
  await page.waitForFunction(()=>typeof document.querySelector('#engine')?.onclick==='function',null,{timeout:20000});
  let startupConfirmations=0;
  page.on('dialog',dialog=>{
    if(dialog.type()==='confirm'&&dialog.message().includes('Starting SuperCollider without a verified offline copy')){
      startupConfirmations++;
      void dialog.accept();
    }else{errors.push('Unexpected dialog: '+dialog.message());void dialog.dismiss()}
  });
  await page.locator('#engine').click();
  await page.waitForFunction(()=>!document.querySelector('#evaluate').disabled,null,{timeout:90000});
  assert.ok(startupConfirmations>0,'Production engine must require explicit optional download approval');
  // POWER boots the engine. RUN, separately, evaluates the starter oscillator.
  // Waiting for a note before pressing RUN is a false failure on this instrument.
  const starter=await page.locator('#code').inputValue();
  assert.ok(starter.includes('SinOsc.ar'),'The production starter oscillator is missing');
  await page.locator('#evaluate').click();
  await page.waitForFunction(()=>
    /-> Synth\('temp__/.test(document.querySelector('#console')?.textContent||''),
    null,{timeout:20000});
  const bridge=await page.evaluate(()=>window.SCOscBridge?.diagnostics());
  assert.ok(bridge?.outgoingCount>0&&bridge?.incomingCount>0,
    'Real sound engine did not exchange OSC messages');
  assert.equal(await page.locator('#code').inputValue(),starter,
    'RUN changed the original composition');
  console.log('LIVE CODE ENGINE PASS: actual downloaded native engine booted, RUN created a synth, OSC traveled both directions');
  await page.locator('#panic').click();
  await page.locator('#code').fill('// Actual production navigation preserves this unsaved composition');
  await page.locator('#sounds-open').click();
  try{
    await page.waitForURL('**/sounds.html#library',{waitUntil:'domcontentloaded',timeout:20000});
  }catch(error){
    const detail=await page.evaluate(()=>({
      href:location.href,title:document.title,ready:document.readyState,
      currentPane:document.querySelector('#sounds-tabs')?.outerHTML?.slice(0,300),
      console:document.querySelector('#console')?.textContent?.slice(-500),
      button:document.querySelector('#sounds-open')?.outerHTML?.slice(0,300)
    })).catch(e=>({error:e.message}));
    throw Error('Live Code-to-Sounds navigation failed: '+JSON.stringify({
      lastUrl:page.url(),page:detail,errors,original:error.message}));
  }
  assert.equal(await page.locator('#sc-surface-design').inputValue(),'moog');
  const narrow=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,bottom:document.querySelector('#sounds-tabs').getBoundingClientRect().bottom}));
  assert.ok(narrow.scroll<=narrow.width+1&&Math.abs(narrow.bottom-844)<4,'Production Sounds mobile navigation: '+JSON.stringify(narrow));
  await page.getByRole('tab',{name:'Record'}).click();
  await page.locator('#mic-ready').check();
  await page.waitForFunction(()=>!document.querySelector('#start').disabled);
  await page.locator('#start').dispatchEvent('pointerdown',{pointerId:12,button:0,isPrimary:true});
  await page.locator('#start').dispatchEvent('pointerup',{pointerId:12,button:0,isPrimary:true});
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Saved recording locally'),null,{timeout:15000});
  assert.equal(await page.locator('#record-audition').isVisible(),true);
  const original=await page.locator('#record-audio').evaluate(async el=>{
    const r=await fetch(el.src),bytes=new Uint8Array(await r.arrayBuffer());
    return {magic:String.fromCharCode(...bytes.slice(0,4)),canPlay:el.canPlayType('audio/wav'),size:bytes.length};
  });
  assert.equal(original.magic,'RIFF');
  assert.ok(original.canPlay&&original.size>2048);
  assert.deepEqual(await page.evaluate(()=>window.__publicMic),{requests:1,stops:1,recordings:1});
  await page.getByRole('tab',{name:'Library'}).click();
  await page.locator('.managed-item:has(audio)').first().waitFor();
  await page.reload({waitUntil:'domcontentloaded'});
  const saved=page.locator('.managed-item:has(audio)').first();
  await saved.waitFor();
  assert.equal(await saved.locator('audio').evaluate(async el=>{
    const bytes=new Uint8Array(await (await fetch(el.src)).arrayBuffer());
    return String.fromCharCode(...bytes.slice(0,4));
  }),'RIFF','Saved production recording cannot be auditioned after reload');
  console.log('LIVE RECORDING PASS: microphone released, original audition playable, saved audio persists and reopens');
  await page.locator('#sc-surface-design').selectOption('bauhaus');
  await page.getByRole('tab',{name:'Discover'}).click();
  await page.getByRole('link',{name:'Explore LibriVox recordings'}).click();
  await page.waitForURL('**/librivox-explorer.html',{timeout:15000});
  assert.equal(await page.locator('#sc-surface-design').inputValue(),'bauhaus');
  assert.equal(await page.locator('#chapter-audio').getAttribute('src'),null,'LibriVox began downloading audio without permission');
  assert.ok(await page.locator('#filter-author').isVisible()&&await page.locator('#filter-reader').isVisible());
  assert.deepEqual(requests,[],'LibriVox streamed media without user action');
  await page.getByRole('link',{name:'Back to Sounds'}).click();
  await page.waitForURL('**/sounds.html#discover',{timeout:15000});
  assert.equal(await page.locator('#sc-surface-design').inputValue(),'bauhaus');
  await page.getByRole('link',{name:'Return to Code'}).click();
  await page.waitForURL('**/index.html',{timeout:15000});
  assert.equal(await page.locator('#code').inputValue(),'// Actual production navigation preserves this unsaved composition');
  assert.equal(await page.evaluate(()=>document.body.dataset.theme),'bauhaus');
  assert.deepEqual(errors,[],'Public production JavaScript errors');
  console.log('PUBLIC BROWSER PASS: live Code -> Sounds -> Record -> saved Library -> LibriVox -> Sounds -> Code, correct theme, unsaved edits and consent');
  await context.close();
}finally{await browser.close()}
