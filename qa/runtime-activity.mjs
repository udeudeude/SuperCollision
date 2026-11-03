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
 const example=[
 '(',
 's.waitForBoot {',
 '    SynthDef(\\qaDrone, {|freq=110|',
 '        Out.ar(0, SinOsc.ar(freq, 0, 0.1) ! 2);',
 '    }).add;',
 '    s.sync;',
 '    ~qadrone=Synth(\\qaDrone);',
 '};',
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
 if(!observed){await page.screenshot({path:'qa/screenshots/runtime-live-activity-failed.png'});
 throw Error('No confirmed live highlight after real SuperCollider playback. See runtime console snapshots.');}
 }catch(e){error=e;console.error('FAIL:',e.stack||e)}
 finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
if(error)process.exitCode=1;
