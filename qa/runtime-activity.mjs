/* Genuine SuperCollider WASM browser smoke test.
 * Runs against pages-build including the official WebAssembly modules.
 * No simulated OSC packets are injected.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import {readFile,stat,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','site');
const type={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.mjs':'text/javascript;charset=utf-8','.wasm':'application/wasm','.css':'text/css;charset=utf-8','.data':'application/octet-stream'};
const server=createServer(async(req,res)=>{
 const uri=new URL(req.url,'http://127.0.0.1');
 const target=path.resolve(root,'.'+(uri.pathname==='/'?'/index.html':uri.pathname));
 if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return}
 try{
  const st=await stat(target);if(!st.isFile())throw Error('Not a file');
  const content=await readFile(target);
  res.writeHead(200,{'Content-Type':type[path.extname(target)]||'application/octet-stream',
    'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'});
  res.end(content);
 }catch{res.writeHead(404).end('Not found '+uri.pathname)}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required','--enable-features=SharedArrayBuffer']});
await mkdir('qa/screenshots',{recursive:true});
let error=null;
try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2});
 page.on('pageerror',e=>console.log('PAGE ERROR:',e.message));
 page.on('console',m=>{if(['error','warning'].includes(m.type()))console.log('BROWSER:',m.type(),m.text().slice(0,500))});
 console.log('Open test site');
 await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(2000);
 const ready=await page.evaluate(()=>({isolated:crossOriginIsolated,module:!!window.SCActivity,version:document.querySelector('header small')?.textContent,worker:!!navigator.serviceWorker}));
 console.log('READY:',ready);
 if(!ready.isolated||!ready.module)throw Error('App not cross-origin isolated or missing activity module');
 await page.locator('#engine').click();
 try{
 await page.waitForFunction(()=>!document.querySelector('#evaluate').disabled,{timeout:115000});
 }catch(e){console.log('POWER LOG:',await page.locator('#console').innerText());throw e}
 console.log('LANGUAGE READY');
 await page.evaluate(()=>{
   const mon=window.SCActivity,prev=mon.outgoing;
   window.__qaUnknown=[];
   mon.outgoing=raw=>{
     const data=raw instanceof Uint8Array?raw:new Uint8Array(raw);
     const priorUnknown=mon.tracker.unknownPacketTypes;
     if(data.length>7&&data.length<200000&&String.fromCharCode(...data.slice(0,Math.min(64,data.length))).includes('/d_recv')){
       window.__qaLastDRecv=new Uint8Array(data);
     }
     const result=prev(raw);
     if(mon.tracker.unknownPacketTypes>priorUnknown)window.__qaUnknown.push({length:data.length,head:Array.from(data.slice(0,120))});
     return result;
   };
 });
 await page.locator('#code').fill('s.boot;');
 await page.locator('#evaluate').click();
 await page.waitForTimeout(3500);
 console.log('BEFORE DEMO:',(await page.locator('#console').innerText()).slice(-1600));
 const example=[
 '(',
 's.waitForBoot({',
 '    Routine({',
 '        SynthDef(\\qaDrone, {|freq=110|',
 '            Out.ar(0, SinOsc.ar(freq, 0, 0.1) ! 2);',
 '        }).add;',
 '        s.sync;',
 '        ~qadrone=Synth(\\qaDrone);',
 '    }).play(SystemClock);',
 '}, clock: SystemClock);',
 ')'
 ].join('\n');
 await page.locator('#code').fill(example);
 await page.locator('#evaluate').click();
 let observed=false;
 for(let i=0;i<15;i++){
  await page.waitForTimeout(1000);
  const info=await page.evaluate(()=>({
   state:document.querySelector('#engine-status')?.textContent,
   activity:window.SCActivity?.tracker?.visible(),
   raw:{requests:window.SCActivity?.tracker?.requestCount,go:window.SCActivity?.tracker?.confirmedCount},
   gutter:document.querySelectorAll('#line-inner .live-active').length,
   highlights:document.querySelectorAll('#activity-overlay .live-source-active').length,
   console:document.querySelector('#console')?.textContent.slice(-3500)
  }));
  console.log('T+'+(i+1),JSON.stringify(info).slice(0,4200));
  if(info.activity?.confirmed>0&&info.highlights>0){console.log('PASS: real synth node confirmed and highlighted');await page.screenshot({path:'qa/screenshots/runtime-live-activity.png'});observed=true;break}
 }
 if(!observed){
  console.log('Routine did not schedule; verifying a real named SynthDef and source-linked Synth directly.');
  const def="SynthDef(\\qaDrone, { Out.ar(0, SinOsc.ar(110, 0, 0.1) ! 2); }).add;";
  await page.locator('#code').fill(def);
  await page.locator('#evaluate').click();
  await page.waitForTimeout(1500);
  const namedSource=def+"\nSynth(\\qaDrone);";
  await page.locator('#code').fill(namedSource);
  await page.evaluate(()=>{
    const e=document.getElementById('code');
    e.setSelectionRange(e.value.lastIndexOf('\n')+1,e.value.length);
  });
  await page.locator('#run-region').click();
  await page.waitForTimeout(2000);
  const linked=await page.evaluate(()=>({
    visible:window.SCActivity.tracker.visible(),
    gutter:document.querySelectorAll('#line-inner .live-active').length,
    display:document.querySelectorAll('#activity-overlay .live-source-active').length,
    diagnostic:window.SCActivity.diagnostics(),
    unknownPackets:window.__qaUnknown,
    console:document.getElementById('console').textContent.slice(-1200)
  }));
  console.log('REAL NAMED SYNTH:',JSON.stringify(linked));
  const recvInspect=await page.evaluate(()=>{
    const b=window.__qaLastDRecv;
    if(!b)return {missing:true};
    const as=(str)=>[...new TextEncoder().encode(str)];
    const hits=(value)=>{const seq=as(value),out=[];for(let i=0;i+seq.length<=b.length;i++){if(seq.every((v,j)=>b[i+j]===v))out.push(i)}return out};
    const pointers=hits('/s_new');
    const four=Array.from(b.slice(0,80));
    return {total:b.length,sNewAt:pointers,headBytes:four,sNewContexts:pointers.map(i=>Array.from(b.slice(Math.max(0,i-16),i+80)))};
  });
  console.log('D_RECV COMPLETION BYTE DIAGNOSTIC:',JSON.stringify(recvInspect));
  if(linked.visible.confirmed>0&&linked.display>0){
    console.log('PASS: actual WebAssembly OSC node highlights a source-linked SynthDef');
    observed=true;
    await page.screenshot({path:'qa/screenshots/runtime-live-activity.png'});
  }
 }
 if(!observed){
  console.log('Initial Routine did not yield a node; sending direct OSC synth request to isolate the bridge from the scheduling test');
  await page.locator('#code').fill("s.sendMsg('/s_new', 'default', s.nextNodeID, 0, 1);");
  await page.locator('#evaluate').click();
  await page.waitForTimeout(1500);
  const diagnostic=await page.evaluate(()=>window.SCActivity?.diagnostics());
  console.log('RAW OSC DIAGNOSTIC:',diagnostic);
  await page.screenshot({path:'qa/screenshots/runtime-live-activity-failed.png'});
 throw Error('No confirmed live highlight after real SuperCollider playback. See runtime console snapshots.');}

 const routinePiece=[
   '(',
   '~qaLivingRoutine = Routine({',
   '    3.do {',
   '        Synth(\\qaDrone);',
   '        0.7.wait;',
   '    };',
   '}).play(SystemClock);',
   ')'
 ].join('\n');
 await page.locator('#code').fill(routinePiece);
 await page.locator('#evaluate').click();
 let checkpoints=[];
 try{
   await page.waitForFunction(()=>window.SCActivity?.tracker?.visible()?.routines?.some(x=>x.steps>=2),{timeout:15000});
   checkpoints=await page.evaluate(()=>window.SCActivity.tracker.visible().routines);
   console.log('REAL ROUTINE CHECKPOINTS:',JSON.stringify(checkpoints));
   const ui=await page.evaluate(()=>({
     panel:document.getElementById('live-panel').getBoundingClientRect().toJSON(),
     rows:document.querySelector('#live-routines').textContent,
     counter:document.querySelector('#activity-status').textContent,
     console:document.querySelector('#console').textContent.slice(-1000)
   }));
   console.log('LIVE INSET:',JSON.stringify(ui));
   if(!ui.rows.includes('R')||!ui.panel.width)throw Error('Routine indicator missing from editor inset');
   await page.screenshot({path:'qa/screenshots/runtime-routine-progress.png'});
 }catch(e){
   console.log('ROUTINE TRACE FAILURE:',JSON.stringify(await page.evaluate(()=>({
     visible:window.SCActivity.tracker.visible(),
     program:document.querySelector('#code').value,
     diagnostic:window.SCActivity.diagnostics(),
     console:document.getElementById('console').textContent.slice(-2300)
   }))));
   throw e;
 }
 }catch(e){error=e;console.error('FAIL:',e.stack||e)}
 finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
if(error)process.exitCode=1;
