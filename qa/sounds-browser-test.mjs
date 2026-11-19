/* Browser regression for the Sounds-only workspace, without the SuperCollider runtime. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve(process.cwd(),'source');
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css'};
const server=createServer(async(req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return}
 try{const file=await readFile(path);res.setHeader('content-type',mime[extname(path)]||'application/octet-stream');res.end(file)}
 catch{res.writeHead(404);res.end('Not Found')}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.SOUNDS_BROWSER_CHANNEL?{channel:process.env.SOUNDS_BROWSER_CHANNEL}:{})});
const context=await browser.newContext({viewport:{width:390,height:844}});
const page=await context.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
 const track={stop(){},addEventListener(){}};
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]})}});
 window.MediaRecorder=class{
  static isTypeSupported(){return true}
  constructor(){this.state='inactive';this.mimeType='audio/webm'}
  start(){this.state='recording'}
  stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['demo'],{type:'audio/webm'})});queueMicrotask(()=>this.onstop?.())}
 };
});
const resultBody={result_count:5,page_count:1,results:[
 {id:'one',title:'Allowed BY',creator:'Maker One',license:'by',source:'wikimedia',url:'https://audio.example.test/by.wav',foreign_landing_url:'https://example.test/by',duration:4},
 {id:'two',title:'Free CC0',creator:'Maker Two',license:'cc0',source:'wikimedia',url:'https://audio.example.test/cc0.wav',foreign_landing_url:'https://example.test/cc0',duration:3},
 {id:'three',title:'NonCommercial',creator:'Maker Three',license:'by-nc',source:'wikimedia',url:'https://audio.example.test/nc.wav'},
 {id:'four',title:'NoDerivatives',creator:'Maker Four',license:'by-nd',source:'wikimedia',url:'https://audio.example.test/nd.wav'},
 {id:'five',title:'Unknown',creator:'Maker Five',license:'not a license',source:'wikimedia',url:'https://audio.example.test/unknown.wav'}
]};
let downloadCount=0,queryCount=0;
await page.route('https://api.openverse.org/v1/audio/**',async route=>{queryCount++;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(resultBody)})});
await page.route('https://audio.example.test/**',async route=>{downloadCount++;await route.fulfill({status:200,contentType:'audio/wav',headers:{'access-control-allow-origin':'*'},body:Buffer.from('RIFFdemo')})});
try{
 await page.goto(base+'/sounds.html');
 assert.equal(await page.locator('#sounds-tabs button').count(),6);
 assert.equal(await page.locator('#sounds-library').isVisible(),true);
 await page.getByRole('tab',{name:'Create'}).click();
 await page.locator('#sounds-source-name').fill('Example instrument');
 await page.locator('#sounds-source').fill('SynthDef(\\tone,{Out.ar(0,SinOsc.ar(220)*0.1)}).add;');
 await page.locator('#sounds-save-source').click();
 await page.getByRole('tab',{name:'Library'}).click();
 await page.getByText('Example instrument').first().waitFor();
 assert.equal(await page.locator('.managed-item').count(),1,'code item should not crash old audio renderer');
 await page.getByRole('button',{name:'★ Favorite'}).count().then(n=>assert.equal(n,0));
 await page.getByRole('button',{name:'☆ Favorite'}).click();
 await page.getByRole('button',{name:'★ Favorite'}).waitFor();
 await page.locator('#sounds-filter').selectOption('favorite');
 assert.equal(await page.locator('.managed-item').count(),1);
 await page.locator('#sounds-filter').selectOption('all');
 await page.getByRole('tab',{name:'Record'}).click();
 await page.locator('#mic-ready').check();
 await page.getByText('Microphone ready.',{exact:false}).waitFor();
 await page.locator('#start').dispatchEvent('pointerdown',{pointerId:1,button:0,isPrimary:true});
 assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('is-recording')),true);
 await page.locator('#start').dispatchEvent('pointerup',{pointerId:1,button:0,isPrimary:true});
 await page.getByText('Saved recording locally',{exact:false}).waitFor();
 await page.getByRole('tab',{name:'Library'}).click();
 await page.getByText('Recording',{exact:false}).first().waitFor();
 assert.equal(await page.locator('.managed-item').count(),2);
 await page.getByRole('tab',{name:'Discover'}).click();
 await page.locator('#discover-query').fill('bells');
 await page.getByRole('button',{name:'Search sounds'}).click();
 await page.getByText('Allowed BY').waitFor();
 assert.equal(await page.locator('.discovered-sound').count(),2,'default filters must exclude NC/ND/unknown');
 const button=page.getByRole('button',{name:'Save original audio'}).first();
 await button.click();
 assert.equal(downloadCount,0,'network override must be opt-in');
 await page.locator('#discover-allow-unverified').check();
 await button.click();
 await page.getByText('Saved Allowed BY locally.',{exact:false}).waitFor();
 assert.equal(downloadCount,1);
 await page.locator('#discover-cc0').check();
 await page.getByRole('button',{name:'Search sounds'}).click();
 assert.equal(await page.locator('.discovered-sound').count(),1,'CC0 preset must be enforced');
 await page.getByRole('tab',{name:'Library'}).click();
 assert.equal(await page.locator('.managed-item').count(),3);
 assert.equal(await page.getByText('Creative Commons BY',{exact:false}).count()>0,true,'license must be retained');
 await page.reload();
 await page.locator('.managed-item').first().waitFor();
 assert.equal(await page.locator('.managed-item').count(),3,'IndexedDB should persist across reload');
 assert.equal(queryCount>=2,true);
 assert.deepEqual(errors,[],'No unhandled page errors allowed');
 console.log('Sounds browser regression passed: library, source, recording, discovery, license filters and persistence');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
