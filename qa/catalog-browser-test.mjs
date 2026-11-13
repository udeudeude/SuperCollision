/* Functional code-completion and language-browser tests at iPhone widths. */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html;charset=utf-8','.mjs':'text/javascript;charset=utf-8',
 '.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json'};
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const target=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return}
 try{
   const content=await readFile(target);
   res.writeHead(200,{'Content-Type':types[path.extname(target)]||'text/plain'});
   res.end(content);
 }catch{
   if(!res.headersSent)res.writeHead(404);
   res.end('Not found');
 }
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const browser=await chromium.launch({headless:true});
try{
 for(const width of [320,390,430]){
   const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
   const page=await context.newPage();
   await page.goto('http://127.0.0.1:'+server.address().port+'/?design=moog',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>!!window.SCLanguageTools,{timeout:8000});
   assert.equal((await page.evaluate(()=>window.SCLanguageTools.catalog.classes.length))>=50,true);
   await page.locator('#code').fill('Sin');
   await page.waitForFunction(()=>document.querySelector('#completion-tray')?.hidden===false,{timeout:5000});
   const suggestions=await page.locator('.completion-choice strong').allTextContents();
   assert.ok(suggestions.includes('SinOsc'),width+': missing frequency oscillator completion');
   const rect=await page.evaluate(()=>{
     const e=document.querySelector('.editor-frame').getBoundingClientRect();
     const t=document.querySelector('#completion-tray').getBoundingClientRect();
     return {editorTop:e.top,trayBottom:t.bottom,trayRight:t.right,viewport:innerWidth,
       projectBarVisible:getComputedStyle(document.querySelector('.projectbar')).display!=='none'};
   });
   assert.ok(rect.trayBottom<=rect.editorTop+1&&rect.trayRight<=width+2&&!rect.projectBarVisible,
     width+': keyboard-safe argument guide must replace the top composition bar '+JSON.stringify(rect));
   await page.locator('.completion-choice').filter({has:page.locator('strong:text-is("SinOsc")')}).click();
   assert.equal(await page.locator('#code').inputValue(),'SinOsc.ar(freq: 440, mul: 0.1)');

   await page.locator('#code').fill('SinOsc.ar(');
   await page.waitForFunction(()=>document.querySelectorAll('.completion-slot').length===4);
   assert.match(await page.locator('#completion-tray').innerText(),/freq = 440/);
   assert.match(await page.locator('#completion-tray').innerText(),/ARGUMENTS/);
   assert.match(await page.locator('.completion-field-detail').innerText(),/FIELD 1 OF 4/);
   assert.match(await page.locator('#completion-tray').innerText(),/No required fields missing/);
   await page.locator('.completion-insert').click();
   assert.equal(await page.locator('#code').inputValue(),'SinOsc.ar(freq: 440, mul: 0.1)');

   await page.locator('#code').fill('Out.ar(');
   await page.waitForFunction(()=>document.querySelectorAll('.completion-slot').length===2);
   assert.match(await page.locator('#completion-tray').innerText(),/2 required fields missing/);
   await page.locator('.completion-slot').filter({hasText:'bus'}).click();
   assert.equal(await page.locator('#code').inputValue(),'Out.ar(bus: nil');
   assert.equal(await page.locator('#code').evaluate(el=>el.value.slice(el.selectionStart,el.selectionEnd)),'nil');

   const beforeBrowse=await page.locator('#code').inputValue();
   await page.locator('#file-menu > summary').click();
   await page.locator('#file-menu .file-submenu > summary').filter({hasText:'EDITOR'}).click();
   await page.locator('#catalog-open').click();
   assert.equal(await page.locator('.language-browser').isVisible(),true);
   assert.equal(await page.locator('#inspector-learn').getAttribute('aria-pressed'),'true');
   await page.locator('.catalog-search').fill('sine-wave');
   await page.waitForFunction(()=>document.querySelectorAll('.catalog-entry').length>=1);
   await page.locator('.catalog-search').fill('SinOsc');
   await page.locator('.catalog-sort').selectOption('alphabetical');
   await page.locator('.catalog-entry').filter({has:page.locator('strong:text-is("SinOsc")')}).click();
   assert.match(await page.locator('.catalog-detail').innerText(),/Sinusoidal oscillator/);
   assert.match(await page.locator('.catalog-detail').innerText(),/freq/);
   const link=await page.locator('.catalog-detail a').getAttribute('href');
   assert.match(link,/doc.sccode.org\/Classes\/SinOsc.html/);
   await page.locator('.catalog-detail-actions button').click();
   assert.notEqual(await page.locator('#code').inputValue(),beforeBrowse);
   assert.equal(await page.locator('#inspector-code').getAttribute('aria-pressed'),'true');

   // Learning OFF is not a reason to withhold ordinary productivity completion.
   await page.locator('#learning-mode').evaluate(el=>{
     el.value='off';el.dispatchEvent(new Event('change',{bubbles:true}));
   });
   await page.locator('#code').fill('Syn');
   await page.waitForFunction(()=>document.querySelector('#completion-tray')?.hidden===false);
   assert.ok((await page.locator('.completion-choice strong').allTextContents()).includes('Synth'));
   await page.locator('#file-menu > summary').click();
   await page.locator('#file-menu .file-submenu > summary').filter({hasText:'EDITOR'}).click();
   await page.locator('#completion-toggle').click();
   assert.equal(await page.locator('#completion-tray').isHidden(),true);
   assert.equal(await page.evaluate(()=>window.SCLanguageTools.enabled),false);
   await context.close();
   console.log('Completion and browse passed at '+width+'px');
 }
}finally{
 await browser.close();
 await new Promise(ok=>server.close(ok));
}
