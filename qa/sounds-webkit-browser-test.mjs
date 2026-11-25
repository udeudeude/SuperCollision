/* WebKit phone acceptance: captures original local audio, releases mic, preserves
 * playing controls and navigation geometry. This is NOT physical iPhone testing. */
import assert from 'node:assert/strict';
import {webkit} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';

const root=resolve(process.cwd(),'source');
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css'};
const server=createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost'),file=resolve(root,'.'+u.pathname);
 if(!file.startsWith(root+sep)){res.writeHead(403).end();return}
 try{res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file))}
 catch{res.writeHead(404).end('Not found')}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await webkit.launch({headless:true});
try{
 for(const [width,height] of [[320,720],[390,844],[430,932],[896,414]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  await context.addInitScript(()=>{
   window.__micQA={requests:0,stops:0,captures:0};
   const track={stop(){window.__micQA.stops++},addEventListener(){}};
   Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{
    getUserMedia:async()=>{window.__micQA.requests++;return {getTracks:()=>[track],getAudioTracks:()=>[track]}}
   }});
   function tone(){
    const rate=8000,frames=4000,bytes=new ArrayBuffer(44+frames*2),view=new DataView(bytes);
    function label(at,s){for(let j=0;j<s.length;j++)view.setUint8(at+j,s.charCodeAt(j))}
    label(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);
    label(8,'WAVE');label(12,'fmt ');view.setUint32(16,16,true);
    view.setUint16(20,1,true);view.setUint16(22,1,true);
    view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);
    view.setUint16(32,2,true);view.setUint16(34,16,true);
    label(36,'data');view.setUint32(40,frames*2,true);
    for(let n=0;n<frames;n++)view.setInt16(44+n*2,Math.sin(n*2*Math.PI*440/rate)*9000,true);
    return new Blob([bytes],{type:'audio/wav'});
   }
   window.MediaRecorder=class{
    static isTypeSupported(){return false}
    constructor(){this.state='inactive';this.mimeType='audio/wav'}
    start(){this.state='recording';window.__micQA.captures++}
    stop(){
     this.state='inactive';
     this.ondataavailable?.({data:tone()});
     queueMicrotask(()=>this.onstop?.());
    }
   };
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/sounds.html');
  const storageProbe=await page.evaluate(async()=>{
   const {saveSound,deleteSound}=await import('/sounds-store.mjs');
   const output={};
   for(const [type,extra] of [
    ['code',{source:'written',code:'SynthDef(\\qa,{}).add;'}],
    ['blob',{source:'imported',mime:'audio/wav',blob:new Blob(['RIFFdemoWAVE'],{type:'audio/wav'})}]
   ]){
    const id='qa-webkit-'+type;
    try{await saveSound({id,name:'WebKit probe',created:1,favorite:false,...extra});
     output[type]='ok';await deleteSound(id)}
    catch(error){output[type]=error.name+': '+error.message}
   }
   return output;
  });
  console.log('WebKit IndexedDB probe '+width+'x'+height+': '+JSON.stringify(storageProbe));
  const dimensions=await page.evaluate(()=>{
   const dock=document.querySelector('#sounds-tabs').getBoundingClientRect();
   const buttons=[...document.querySelectorAll('#sounds-tabs button')].map(x=>x.getBoundingClientRect());
   return {scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,
    bottom:dock.bottom,buttonBounds:buttons.map(x=>({left:x.left,right:x.right,height:x.height}))};
  });
  assert.ok(dimensions.scrollWidth<=width+1,'horizontal overflow: '+JSON.stringify(dimensions));
  if(width<=640){
   assert.ok(Math.abs(dimensions.bottom-height)<3,'navigation not in thumb reach: '+JSON.stringify(dimensions));
   assert.ok(dimensions.buttonBounds.every(x=>x.left>=-1&&x.right<=width+1&&x.height>=40));
  }
  await page.getByRole('tab',{name:'Record'}).click();
  await page.locator('#mic-ready').check();
  await page.waitForFunction(()=>!document.querySelector('#start').disabled);
  await page.locator('#start').dispatchEvent('pointerdown',{pointerId:2,button:0,isPrimary:true});
  assert.equal(await page.locator('body').evaluate(x=>x.classList.contains('is-recording')),true);
  await page.locator('#start').dispatchEvent('pointerup',{pointerId:2,button:0,isPrimary:true});
  try{
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Saved recording locally'),
    null,{timeout:12000});
  }catch(error){
   const snapshot=await page.evaluate(()=>({
    status:document.querySelector('#status')?.textContent,
    recording:document.body.classList.contains('is-recording'),
    micReady:document.querySelector('#mic-ready')?.checked,
    buttonDisabled:document.querySelector('#start')?.disabled,
    auditionVisible:!document.querySelector('#record-audition')?.hidden,
    audioSource:document.querySelector('#record-audio')?.getAttribute('src'),
    state:window.__micQA,
    supported:!!window.indexedDB,
    secure:window.isSecureContext
   }));
   throw new Error('WebKit recording did not save: '+JSON.stringify(snapshot)+'; '+error.message);
  }
  assert.equal(await page.locator('#record-audition').isVisible(),true,'original must remain in Record to audition');
  const audition=await page.locator('#record-audio').evaluate(async audio=>{
   const response=await fetch(audio.src),bytes=new Uint8Array(await response.arrayBuffer());
   return {src:audio.src,type:response.headers.get('content-type'),magic:String.fromCharCode(...bytes.slice(0,4)),canPlay:audio.canPlayType('audio/wav')};
  });
  assert.ok(audition.src.startsWith('blob:'),'original must be locally playable');
  assert.equal(audition.magic,'RIFF','audition must point to captured original WAV bytes');
  assert.ok(audition.canPlay,'WebKit must support the captured format');
  assert.equal(await page.locator('#mic-ready').isChecked(),false,'recording must close microphone');
  assert.deepEqual(await page.evaluate(()=>window.__micQA),{requests:1,stops:1,captures:1});
  await page.getByRole('tab',{name:'Library'}).click();
  const row=page.locator('.managed-item:has(audio)').first();
  await row.waitFor();
  const preserved=await row.locator('audio').evaluate(element=>{window.__libraryPlayerQA=element;return element.src});
  await row.getByRole('button',{name:'☆ Favorite'}).click();
  await row.getByRole('button',{name:'★ Favorite'}).waitFor();
  assert.equal(await row.locator('audio').evaluate(element=>element===window.__libraryPlayerQA),true,
   'favorite changes cannot restart an audition');
  assert.equal(await row.locator('audio').getAttribute('src'),preserved);
  await page.goto(origin+'/librivox-explorer.html');
  assert.equal(await page.locator('#chapter-audio').getAttribute('src'),null,'LibriVox must not load streamed audio before consent');
  assert.ok(await page.locator('#filter-author').isVisible());
  assert.ok(await page.locator('#filter-reader').isVisible());
  const scan=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(scan.scroll<=scan.width+1,'LibriVox horizontal overflow: '+JSON.stringify(scan));
  assert.deepEqual(errors,[],'WebKit console errors: '+errors.join('; '));
  await context.close();
  console.log('WebKit phone workflow passed '+width+'x'+height);
 }
}finally{await browser.close();await new Promise(done=>server.close(done))}
