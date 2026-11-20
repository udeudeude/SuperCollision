/* Browser smoke against the ACTUAL compiled SuperCollider WebAssembly modules.
 * Read-only compiled runtime comes from pages-build; Sounds source is the PR head.
 * This tests interpreter boot, server buffer readback, region-controlled PlayBuf and BufRd/Phasor requests.
 * It is not a physical speaker or iPhone audio-output test. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';

const source=resolve(process.cwd(),'source'),site=resolve(process.cwd(),'site');
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.wasm':'application/wasm','.data':'application/octet-stream','.css':'text/css'};
const server=createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const runtime=pathname.startsWith('/runtime/');
 const root=runtime?site:source;
 const path=resolve(root,'.'+pathname);
 if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return}
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');
 res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
 res.setHeader('Cross-Origin-Resource-Policy','same-origin');
 try{const bytes=await readFile(path);res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(bytes)}
 catch{res.writeHead(404);res.end('File unavailable')}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required'],...(process.env.SOUNDS_BROWSER_CHANNEL?{channel:process.env.SOUNDS_BROWSER_CHANNEL}:{})});
const page=await browser.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('Failed to load resource'))errors.push('console: '+m.text())});
page.on('response',response=>{if(response.status()>=400&&!response.url().endsWith('/favicon.ico'))errors.push('HTTP '+response.status()+' '+response.url())});
try{
 await page.goto(base+'/sounds-lab.html');
 assert.equal(await page.evaluate(()=>crossOriginIsolated),true,'real native runtime requires cross-origin isolation');
 await page.evaluate(async()=>{
  const frames=4800,rate=48000,buffer=new ArrayBuffer(44+frames*2),v=new DataView(buffer);
  const str=(offset,text)=>{for(let j=0;j<text.length;j++)v.setUint8(offset+j,text.charCodeAt(j))};
  str(0,'RIFF');v.setUint32(4,36+frames*2,true);str(8,'WAVE');str(12,'fmt ');
  v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);
  str(36,'data');v.setUint32(40,frames*2,true);
  for(let frame=0;frame<frames;frame++)v.setInt16(44+frame*2,Math.round(0.35*32767*Math.sin(2*Math.PI*440*frame/rate)),true);
  const db=await new Promise((resolve,reject)=>{
   const r=indexedDB.open('supercollision-sounds-v1',1);
   r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('sounds'))r.result.createObjectStore('sounds',{keyPath:'id'})};
   r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)
  });
  await new Promise((resolve,reject)=>{
   const tx=db.transaction('sounds','readwrite');
   tx.objectStore('sounds').put({id:'native-smoke',name:'Native smoke test',source:'imported',created:Date.now(),blob:new Blob([buffer],{type:'audio/wav'})});
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)
  });
  db.close();
 });
 await page.reload();
 await page.locator('#lab-sound option[value="native-smoke"]').waitFor({state:'attached'});
 await page.locator('#lab-sound').selectOption('native-smoke');
 await page.locator('#lab-engine').click();
 await page.getByText('SuperCollider ready.',{exact:false}).waitFor({timeout:120000});
 await page.locator('#lab-load').click();
 await page.waitForFunction(()=>{
   const status=document.querySelector('#lab-status')?.textContent||'';
   return status.startsWith('Verified by native SuperCollider sample readback:')||status.startsWith('Sample transfer failed:');
  },null,{timeout:90000});
 assert.match(await page.locator('#lab-status').textContent(),/^Verified by native SuperCollider sample readback:/);
 assert.equal(await page.locator('#lab-play').isEnabled(),true);
 assert.ok(await page.locator('#lab-waveform').evaluate(canvas=>{
  const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
  for(let i=0;i<data.length;i+=4)if(data[i]===229&&data[i+1]===188&&data[i+2]===113)return true;
  return false;
 }), 'decoded audio should yield visible native-sample waveform');
 await page.locator('#lab-waveform').scrollIntoViewIfNeeded();
 const bounds=await page.locator('#lab-waveform').boundingBox();
 await page.mouse.move(bounds.x+bounds.width*0.2,bounds.y+bounds.height/2);
 await page.mouse.down();
 await page.mouse.move(bounds.x+bounds.width*0.8,bounds.y+bounds.height/2,{steps:6});
 await page.mouse.up();
 assert.match(await page.locator('#lab-region-summary').textContent(),/Region: 20% to 80%/);
 assert.equal(await page.locator('#lab-start').inputValue(),'20');
 await page.locator('#lab-start').evaluate(input=>{input.value='20';input.dispatchEvent(new Event('input',{bubbles:true}))});
 await page.locator('#lab-finish').evaluate(input=>{input.value='80';input.dispatchEvent(new Event('input',{bubbles:true}))});
 await page.locator('#lab-rate').evaluate(input=>{input.value='0.75';input.dispatchEvent(new Event('input',{bubbles:true}))});
 await page.locator('#lab-play').click();
 await page.getByText('Playing through native SuperCollider one shot',{exact:false}).waitFor();
 await page.locator('#lab-loop').check();
 await page.locator('#lab-play').click();
 await page.getByText('Playing through native SuperCollider loop',{exact:false}).waitFor();
 await page.locator('#lab-stop').click();
 await page.getByText('Stopped Sounds laboratory playback.',{exact:false}).waitFor();
 assert.equal(errors.length,0,'No page errors: '+errors.join('; '));
 console.log('Native engine smoke passed: real sclang/scsynth boot, sample readback, native PlayBuf region and BufRd loop requests and Stop.');
} catch(error){
 console.error('Native runtime smoke failed:',error.message);
 console.error('Status:',await page.locator('#lab-status').textContent().catch(()=>'<unavailable>'));
 console.error('Server diagnostics:',(await page.locator('#lab-log').textContent().catch(()=>''))?.slice(-10000));
 console.error('Browser errors:',errors.slice(-10));
 process.exitCode=1;
}finally{
 await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
