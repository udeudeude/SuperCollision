/* Browser contract for isolated SOUND panel: user-authenticated mock inference,
 * code preservation, explicit save, mobile geometry, revision and quota reporting.
 * No real user account or external model is called.
 */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html;charset=utf-8','.mjs':'text/javascript;charset=utf-8',
 '.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8',
 '.json':'application/json;charset=utf-8'};
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const target=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return}
 try{
   const content=await readFile(target);
   res.writeHead(200,{
     'Content-Type':types[path.extname(target)]||'text/plain',
     'Cross-Origin-Opener-Policy':'same-origin',
     'Cross-Origin-Embedder-Policy':'require-corp'
   });
   res.end(content);
 }catch{if(!res.headersSent)res.writeHead(404);res.end('Not found')}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const base='http://127.0.0.1:'+server.address().port+'/';
const browser=await chromium.launch({headless:true});
const FENCE=String.fromCharCode(96).repeat(3);
const generated='(\ns.waitForBoot({ SynthDef(\\testSound,{ Out.ar(0,SinOsc.ar(300,0,0.1)) }).play; });\n)';
const revised='(\ns.waitForBoot({ SynthDef(\\testSound,{ Out.ar(0,SinOsc.ar(220,0,0.1)) }).play; });\n)';
let requests=[];
try{
 for(const width of [320,390,430]){
   const ctx=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
   await ctx.addInitScript(()=>sessionStorage.setItem('supercollision-openrouter-session-key-v1','sk-or-fake-test-key-not-usable'));
   const page=await ctx.newPage();
   const startCount=requests.length;
   let mockMode='normal';
   await page.route('https://openrouter.ai/api/v1/chat/completions',async route=>{
     const req=route.request();
     if(req.method()==='OPTIONS'){
       await route.fulfill({status:204,headers:{
         'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST, OPTIONS'
       }});return;
     }
     const payload=req.postDataJSON();requests.push(payload);
     if(mockMode==='delayed')await new Promise(ok=>setTimeout(ok,900));
     const rawCode=mockMode==='unsafe'?
       '(\nFile.open("scratch", "w");\n{ SinOsc.ar(440) }.play;\n)':
       (requests.length%2?generated:revised);
     await route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},
       contentType:'application/json',
       body:JSON.stringify({model:'cohere/north-mini-code:free',
         choices:[{message:{content:FENCE+'supercollider\n'+rawCode+'\n'+FENCE+'\nSimple test sketch.'}}],
         usage:{prompt_tokens:1120,completion_tokens:500}})});
   });
   await page.route('https://openrouter.ai/api/v1/models?output_modalities=text',async route=>{
     await route.fulfill({status:200,contentType:'application/json',
       headers:{'access-control-allow-origin':'*'},
       body:JSON.stringify({data:[
         {id:'sample/working-code:free',name:'Working Coding Model',description:'Programming',
           context_length:64000,pricing:{prompt:'0',completion:'0'},
           architecture:{input_modalities:['text'],output_modalities:['text']}},
         {id:'sample/actually-paid:free',name:'Deceptive',
           context_length:64000,pricing:{prompt:'0.001',completion:'0'}},
         {id:'sample/paid',name:'Paid',context_length:64000,pricing:{prompt:'0',completion:'0'}}
       ]})});
   });
   await page.goto(base,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>!!window.SCSoundDesigner,{timeout:12000});
   assert.equal(await page.evaluate(()=>crossOriginIsolated),true,'Should emulate production COOP/COEP');
   const previous=await page.locator('#code').inputValue();
   await page.locator('#inspector-design').click();
   assert.equal(await page.locator('#inspector-design').getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('#sound-host').isVisible(),true);
   const geometry=await page.evaluate(()=>{
     const panel=document.querySelector('#sound-host').getBoundingClientRect();
     const editor=document.querySelector('.editor-frame').getBoundingClientRect();
     const tabs=[...document.querySelectorAll('.inspector-modes button')].map(x=>x.getBoundingClientRect());
     return {panelLeft:panel.left,panelRight:panel.right,panelTop:panel.top,
       editorBottom:editor.bottom,view:innerWidth,tabRight:tabs.at(-1).right,
       modesRight:document.querySelector('.inspector-modes').getBoundingClientRect().right};
   });
   assert.ok(geometry.panelTop>=geometry.editorBottom-1,'SOUND must be below editor '+JSON.stringify(geometry));
   assert.ok(geometry.panelRight<=width+2,'SOUND must fit phone '+JSON.stringify(geometry));
   assert.ok(geometry.tabRight<=geometry.modesRight+2,'SOUND tab must fit '+JSON.stringify(geometry));
   assert.ok((await page.locator('#sound-auth-status').innerText()).includes('connected'));
   assert.equal(requests.length,startCount,'No requests before explicit GENERATE');
   await page.locator('#sound-load-models').click();
   await page.waitForFunction(()=>document.querySelector('#sound-model')?.options.length===2);
   assert.ok((await page.locator('#sound-model option').allTextContents()).some(x=>x.includes('Working Coding Model')));
   assert.equal((await page.locator('#sound-model option').allTextContents()).some(x=>x.includes('Deceptive')),false);
   assert.equal(requests.length,startCount,'Loading free models must not spend a generation request');
   await page.locator('#sound-model').selectOption('sample/working-code:free');
   await page.locator('#sound-generate').click();
   await page.waitForFunction(()=>document.querySelector('#sound-result')?.hidden===false,{timeout:6000});
   assert.ok((await page.locator('#sound-code').innerText()).includes('SynthDef'));
   assert.equal(await page.locator('#code').inputValue(),previous,'generation must not rewrite composition');
   assert.equal(requests.at(-1).model,'sample/working-code:free','Only a catalog-verified free model may be selected');
   assert.equal(requests.at(-1).usage.include,true,'Request should report actual token usage');
   assert.equal(await page.locator('#sound-audition').isDisabled(),false,'Valid sketch should permit audition');
   assert.ok(!requests.at(-1).messages.at(-1).content.includes(previous),
     'Source must not be sent by default');

   await page.locator('#sound-revision').fill('Make the pitch lower');
   await page.locator('#sound-revise').click();
   await page.waitForFunction(()=>document.querySelector('#sound-code')?.textContent?.includes('220'));
   assert.ok(requests.at(-1).messages.at(-1).content.includes('Make the pitch lower'));
   assert.ok(requests.at(-1).messages.at(-1).content.includes('testSound'));
   assert.equal(await page.locator('#code').inputValue(),previous,'revision must not rewrite original source');

   await page.locator('#sound-save').click();
   assert.equal(await page.locator('#inspector-code').getAttribute('aria-pressed'),'true');
   assert.ok((await page.locator('#code').inputValue()).includes('220'));
   const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('supercollision-projects-v1')||'{}'));
   assert.ok(Object.values(stored).includes(previous),'original composition must remain saved');
   assert.ok(Object.values(stored).some(x=>x.includes('220')),'new composition should be saved');

   await page.locator('#inspector-design').click();
   const beforeVersions=requests.length;
   assert.equal(await page.evaluate(()=>window.SCSoundDesigner.versionCount),2);
   await page.locator('#sound-prev').click();
   assert.ok((await page.locator('#sound-code').innerText()).includes('300'));
   await page.locator('#sound-next').click();
   assert.ok((await page.locator('#sound-code').innerText()).includes('220'));
   assert.equal(requests.length,beforeVersions,'Browsing previous versions must use no quota');
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.SCSoundDesigner?.versionCount===2);
   await page.locator('#inspector-design').click();
   assert.ok((await page.locator('#sound-code').innerText()).includes('220'),
     'Latest generated draft should survive reload without spending quota');
   assert.equal(requests.length,beforeVersions,'Restoring session drafts must use no quota');

   await page.locator('#console').evaluate(el=>{
     el.textContent='Boot successful\nERROR: Message SinOsc not understood\nstack trace';
   });
   await page.locator('#sound-use-error').click();
   assert.match(await page.locator('#sound-revision').inputValue(),/ERROR: Message SinOsc not understood/);
   assert.equal(requests.length,beforeVersions,'Preparing a repair message must not send it');

   // A model can hallucinate unsafe side effects. Keep code copyable/saveable,
   // but refuse audition if static preflight detects restricted operations.
   await page.locator('#inspector-design').click();
   mockMode='unsafe';
   await page.locator('#sound-generate').click();
   await page.waitForFunction(()=>document.querySelector('#sound-review')?.textContent?.includes('AUDITION BLOCKED'));
   assert.equal(await page.locator('#sound-audition').isDisabled(),true);
   const unsafeResult=await page.locator('#sound-code').innerText();
   assert.ok(unsafeResult.includes('File.open'));
   assert.ok((await page.locator('#code').inputValue()).includes('220'));

   // A cancelled request should neither overwrite the last result nor
   // consume more than the request already sent.
   mockMode='delayed';
   await page.locator('#sound-generate').click();
   await page.locator('#sound-cancel').click();
   await page.waitForFunction(()=>!window.SCSoundDesigner.pending,{timeout:7000});
   assert.ok((await page.locator('#sound-code').innerText()).includes('File.open'));
   assert.match(await page.locator('#sound-status').innerText(),/cancelled or timed out/i);
   mockMode='normal';

   await page.locator('#inspector-design').click();

   await page.locator('#sound-provider').selectOption('puter');
   await page.route('https://js.puter.com/v2/', async route=>{
     const js="window.__putersigned=false;window.puter={auth:{isSignedIn:()=>window.__putersigned,signIn:()=>{window.__putersigned=true;return Promise.resolve({success:true})},getMonthlyUsage:()=>Promise.resolve({allowanceInfo:{remaining:50000000,monthUsageAllowance:100000000}})},ai:{chat:async(messages,options)=>{window.__puterCall={messages,options};return {message:{content:"+JSON.stringify(FENCE+'supercollider\n'+generated+'\n'+FENCE+'\nA sample sound.')+"},model:'gpt-5.4-nano'}}}};";
     await route.fulfill({status:200,contentType:'text/javascript',headers:{
       'cross-origin-resource-policy':'cross-origin','access-control-allow-origin':'*'},body:js});
   });
   await page.locator('#sound-puter-load').click();
   await page.waitForFunction(()=>!!window.puter?.ai?.chat);
   await page.locator('#sound-puter-signin').click();
   await page.waitForFunction(()=>document.querySelector('#sound-auth-status')?.textContent.includes('signed in'));
   await page.locator('#sound-puter-usage').click();
   await page.waitForFunction(()=>document.querySelector('.sound-allowance')?.textContent.includes('$0.50'));
   await page.locator('#sound-generate').click();
   await page.waitForFunction(()=>window.__puterCall?.options?.model==='gpt-5.4-nano');
   assert.ok((await page.locator('#sound-code').innerText()).includes('300'));
   assert.equal(await page.evaluate(()=>window.__puterCall.options.normalize),true);
   assert.equal(await page.evaluate(()=>window.__puterCall.options.fallback),false,'No automatic provider fallback');
   await ctx.close();
   console.log('Sound Designer browser flows passed '+width+' px');
 }
 // OAuth callback must remove its one-time code from location and use PKCE.
 const ctx=await browser.newContext();
 await ctx.addInitScript(()=>{
   sessionStorage.setItem('supercollision-openrouter-pkce-v1',JSON.stringify({
     verifier:'secret-only-in-session',state:'expected-state',timestamp:Date.now()
   }));
 });
 const page=await ctx.newPage();
 await page.route('https://openrouter.ai/api/v1/auth/keys',async route=>{
   assert.equal(route.request().postDataJSON().code_verifier,'secret-only-in-session');
   await route.fulfill({status:200,contentType:'application/json',
     headers:{'access-control-allow-origin':'*'},body:JSON.stringify({key:'sk-or-mocked-personal'})});
 });
 await page.goto(base+'?code=one-use-code&state=expected-state',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.SCSoundDesigner?.connected,{timeout:8000});
 assert.ok(!page.url().includes('one-use-code'),'one-time code must be removed from browser history');
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('supercollision-openrouter-session-key-v1')),'sk-or-mocked-personal');
 await ctx.close();
 console.log('OpenRouter OAuth key exchange and one-time code cleanup passed.');
}finally{
 await browser.close();
 await new Promise(ok=>server.close(ok));
}
