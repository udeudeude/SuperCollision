/* Phone-sized error repair checks, including a simulated on-screen keyboard.
 * No SuperCollider server or saved user composition is modified.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8'};
const server=createServer(async(req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
 try{const data=await readFile(file);res.writeHead(200,{
   'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(data)}
 catch{res.writeHead(404).end('Not found')}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});
const source=[
 '(',
 'SynthDef(\\gardenMarimba, { |out=0|',
 ' var env = EnvGen.kr(',
 '   Env.perc(0.003, 0.48, 1, -5),levelScale: nil',
 '   doneAction: 2',
 ' );',
 ' Out.ar(out, SinOsc.ar(440, 0, 0.1) * env);',
 '}).add;',
 ')'
].join('\n');
const error="ERROR: Nil does not understand the message 'doneAction'.\nfile://interpreted_text:4:13";
try{
 for(const width of [320,390,430]){
   const context=await browser.newContext({
     viewport:{width,height:780},isMobile:true,hasTouch:true,deviceScaleFactor:2,
     acceptDownloads:true
   });
   const page=await context.newPage();
   await page.goto('http://127.0.0.1:'+server.address().port+'/?design=moog',
     {waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>!!window.SCRepair&&!!window.SCLanguageTools,
     {timeout:10000});
   await page.locator('#code').fill(source);
   const savedCursor=await page.locator('#code').evaluate(editor=>{
     // SinOsc is in the verified offline catalog even when the full class
     // documentation has not been generated on the testing server.
     const pos=editor.value.indexOf('SinOsc.ar(')+'SinOsc.ar('.length;
     editor.focus();editor.setSelectionRange(pos,pos);
     editor.dispatchEvent(new Event('click'));
     return pos;
   });
   await page.waitForFunction(()=>!document.querySelector('#completion-tray').hidden,
     null,{timeout:3500});
   await page.locator('#inspector-console').click();
   await page.evaluate(async output=>{
     const {explainConsoleError}=await import('/error-guide.mjs?v=2');
     window.SCRepair.offer(explainConsoleError(output,document.querySelector('#code').value));
   },error);
   assert.equal(await page.locator('#repair-open-button').isVisible(),true,
     'An actionable error must offer a visible FIX ERROR entry point');
   await page.locator('#repair-open-button').tap();
   await page.setViewportSize({width,height:480});
   await page.waitForTimeout(100);
   const ui=await page.evaluate(()=>{
     const r=x=>document.querySelector(x).getBoundingClientRect();
     return {
       focused:document.activeElement.id,
       cursor:document.querySelector('#code').selectionStart,
       repair:document.body.classList.contains('repair-open'),
       completionHidden:document.querySelector('#completion-tray').hidden,
       liveHidden:getComputedStyle(document.querySelector('#live-panel')).display==='none',
       consoleHidden:!document.querySelector('#console-panel').open,
       panelBottom:r('#repair-panel').bottom,
       editorTop:r('.editor-frame').top,
       editorHeight:r('.editor-frame').height,
       codeBottom:r('.editor-frame').bottom,
       tabsBottom:r('.console-bar').bottom,
       viewport:visualViewport?.height||innerHeight
     };
   });
   assert.equal(ui.focused,'code','Opening repair must focus code for typing');
   assert.equal(ui.cursor,savedCursor,
     'Opening repair must preserve caret position, not jump to an arbitrary line');
   assert(ui.repair&&ui.completionHidden&&ui.liveHidden&&ui.consoleHidden,
     'Error repair must replace arguments and other panels: '+JSON.stringify(ui));
   assert(ui.panelBottom<=ui.editorTop+2&&ui.editorHeight>=105&&
     ui.codeBottom<=ui.viewport+2&&ui.tabsBottom<=ui.viewport+2,
     'Instructions, editing area, and controls must fit above the keyboard: '+JSON.stringify(ui));
   assert.match(await page.locator('#repair-before').innerText(),/levelScale: nil/);
   assert.match(await page.locator('#repair-after').innerText(),
     /EnvGen\.kr\(Env\.perc\(0\.003, 0\.48, 1, -5\), doneAction: 2\)/);
   assert.equal(await page.locator('#repair-apply').isEnabled(),true);
   assert.equal(await page.locator('#completion-tray').isHidden(),true);
   // Moving the cursor while reading instructions must not dismiss them.
   const editingCaret=await page.locator('#code').evaluate(editor=>{
     const pos=editor.value.indexOf('var env');
     editor.setSelectionRange(pos,pos);return pos;
   });
   await page.locator('#repair-apply').tap();
   const amended=await page.locator('#code').inputValue();
   assert.equal(amended,
     source.replace(/EnvGen\.kr\([\s\S]*?doneAction:\s*2\s*\)/,
       'EnvGen.kr(Env.perc(0.003, 0.48, 1, -5), doneAction: 2)'),
     'Apply must change only the matched broken expression');
   assert.equal(await page.locator('#code').evaluate(el=>el.selectionStart),editingCaret,
     'Applying a fix elsewhere must preserve cursor position');
   assert.equal(await page.locator('#code').evaluate(el=>document.activeElement===el),true,
     'Applying a fix must retain keyboard focus');
   assert.match(await page.locator('#repair-feedback').innerText(),/Correction applied/);
   assert.equal(await page.locator('#repair-undo').isVisible(),true);
   await page.locator('#repair-undo').tap();
   assert.equal(await page.locator('#code').inputValue(),source,'Undo restores exact source');
   assert.equal(await page.locator('#code').evaluate(el=>el.selectionStart),editingCaret,
     'Undo must preserve the current cursor');
   await page.locator('#repair-location').tap();
   assert.equal(await page.locator('#code').evaluate(el=>el.selectionStart),
     source.indexOf('EnvGen.kr'),
     'GO TO ERROR deliberately moves the cursor to the offending expression');
   assert.equal(await page.locator('#code').evaluate(el=>document.activeElement===el),true);
   await page.locator('#repair-close').tap();
   assert.equal(await page.locator('#repair-panel').isHidden(),true);
   await page.locator('#code').fill(source.replace('levelScale: nil','levelScale: 0'));
   await page.locator('#repair-open-button').tap();
   assert.equal(await page.locator('#repair-apply').isDisabled(),true,
     'A stale correction must never overwrite code already changed by the user');
   assert.match(await page.locator('#repair-feedback').innerText(),/changed or removed/);
   await page.locator('#inspector-console').tap();
   assert.equal(await page.locator('#repair-panel').isHidden(),true,
     'Leaving CODE must dismiss repair rather than cover the new panel');
   await context.close();
   console.log('Repair editing, cursor, keyboard-sized viewport and safe apply passed at '+width+'px');
 }
}finally{
 await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
