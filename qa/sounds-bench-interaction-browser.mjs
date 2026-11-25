/* Phone-browser acceptance for reversible Instrument Bench gestures.
 * No optional compiled audio resources are fetched. */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve(process.cwd(),'source');
const types={'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.json':'application/json'};
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost'),path=resolve(root,'.'+url.pathname);
 if(!path.startsWith(root+sep)){res.writeHead(403).end();return}
 try{res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(await readFile(path))}
 catch{res.writeHead(404).end('Not Found')}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const host='http://127.0.0.1:'+server.address().port;
const usingWebKit=process.env.BENCH_BROWSER==='webkit';
const browser=await (usingWebKit?webkit:chromium).launch(
 usingWebKit?{headless:true}:{channel:'chrome',headless:true,args:['--no-sandbox']}
);
try{
 for(const width of [320,390,430]){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(host+'/sounds-bench-preview.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('.bench-visual').length===7,{timeout:12000});
  assert.equal(await page.locator('header small').textContent(),'v2.9');
  assert.equal(await page.locator('#lab-demo-code-bay').getAttribute('data-sync'),'matched');
  assert.equal(await page.locator('#bench-tone-undo').isDisabled(),true);
  assert.equal(await page.locator('#bench-tone-redo').isDisabled(),true);
  const hint=await page.locator('.bench-visual:has(strong:text-is("PITCH")) .bench-visual-hint').innerText();
  assert.ok(hint.includes('♫')&&!hint.includes('NOTES'));
  const frequency=await page.locator('#lab-demo-pitch').inputValue();
  const cutoff=await page.locator('#bench-param-cutoff').inputValue();
  const pitchCanvas=page.locator('.bench-pitch-canvas');
  assert.equal(await pitchCanvas.evaluate(el=>getComputedStyle(el).touchAction),'pan-y');
  // A scrolling finger is not an instruction to change synthesis parameters.
  await pitchCanvas.evaluate(canvas=>{
   const r=canvas.getBoundingClientRect();
   for(const type of ['pointerdown','pointermove','pointerup'])
    canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:3,pointerType:'touch',
      clientX:r.left+r.width*0.9,clientY:r.top+r.height*0.4}));
  });
  assert.equal(await page.locator('#lab-demo-pitch').inputValue(),frequency);
  const filter=page.locator('.bench-visual:has(strong:text-is("FILTER"))');
  const filterCanvas=filter.locator('canvas');
  await filterCanvas.evaluate(canvas=>{
   const r=canvas.getBoundingClientRect();
   for(const type of ['pointerdown','pointermove','pointerup'])
    canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:4,pointerType:'touch',
      clientX:r.left+r.width*0.8,clientY:r.top+r.height*0.3}));
  });
  assert.equal(await page.locator('#bench-param-cutoff').inputValue(),cutoff);
  assert.equal(await page.locator('#lab-demo-level').isDisabled(),true,
   'The Volume slider must be inert until explicitly armed');
  await page.locator('.bench-volume-adjust').click();
  assert.equal(await page.locator('#lab-demo-level').isEnabled(),true);
  await page.locator('.bench-volume-adjust').click();
  assert.equal(await page.locator('#lab-demo-level').isDisabled(),true);
  // Zoom modifies only the visible frequency range, never the sound or code.
  const codeBefore=await page.locator('#lab-demo-code').inputValue();
  await page.getByRole('button',{name:'Zoom in on the pitch ruler'}).click();
  assert.notEqual(await page.locator('#bench-pitch-zoom-range').textContent(),'25–8000 Hz');
  assert.equal(await page.locator('#lab-demo-pitch').inputValue(),frequency);
  assert.equal(await page.locator('#lab-demo-code').inputValue(),codeBefore);
  // Tap a source parameter, reveal the corresponding visual surface.
  await page.locator('#lab-demo-controls').evaluate(el=>el.scrollTop=el.scrollHeight);
  await page.locator('#lab-demo-code').evaluate(el=>{
   const at=el.value.lastIndexOf('\\freq, ')+3;
   el.setSelectionRange(at,at);
   el.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  });
  const pitchCard=page.locator('.bench-visual:has(strong:text-is("PITCH"))');
  assert.equal(await pitchCard.evaluate(el=>el.classList.contains('is-linked')),true);
  const shown=await pitchCard.evaluate(el=>{
   const a=el.getBoundingClientRect(),b=document.querySelector('#lab-demo-controls').getBoundingClientRect();
   return {top:a.top,bottom:a.bottom,viewTop:b.top,viewBottom:b.bottom};
  });
  assert.ok(shown.top>=shown.viewTop-3&&shown.bottom<=shown.viewBottom+3,
    'Code did not reveal pitch control: '+JSON.stringify(shown));
  assert.match(await page.locator('#bench-code-highlight').innerHTML(),/bench-code-link/);
  // Only an armed control is editable. A drag is one undoable operation.
  await filter.locator('.bench-visual-adjust').click();
  assert.equal(await filter.locator('.bench-visual-adjust').getAttribute('aria-pressed'),'true');
  const bounds=await filterCanvas.boundingBox();assert.ok(bounds);
  await page.mouse.move(bounds.x+bounds.width*0.3,bounds.y+bounds.height*0.4);
  await page.mouse.down();
  await page.mouse.move(bounds.x+bounds.width*0.7,bounds.y+bounds.height*0.6,{steps:7});
  await page.mouse.up();
  const after=await page.locator('#bench-param-cutoff').inputValue();
  assert.notEqual(after,cutoff,'Armed drag failed to change cutoff');
  assert.equal(await page.locator('#bench-tone-undo').isEnabled(),true);
  await page.locator('#bench-tone-undo').click();
  assert.equal(await page.locator('#bench-param-cutoff').inputValue(),cutoff,'Undo failed');
  await page.locator('#bench-tone-redo').click();
  assert.equal(await page.locator('#bench-param-cutoff').inputValue(),after,'Redo failed');
  await filter.locator('.bench-visual-adjust').click();
  assert.equal(await filterCanvas.evaluate(el=>getComputedStyle(el).touchAction),'pan-y');
  // Manual changes in editable code participate in the same undo history.
  const originalCode=await page.locator('#lab-demo-code').inputValue();
  await page.locator('#lab-demo-code').fill(originalCode.replace('\\freq, 440','\\freq, 523.25'));
  assert.equal(await page.locator('#lab-demo-code-bay').getAttribute('data-sync'),'modified');
  await page.locator('#bench-tone-undo').click();
  assert.equal(await page.locator('#lab-demo-code').inputValue(),originalCode,'Undo lost typed code');
  // Comparison snapshots must preserve exact source and participate in undo.
  await page.locator('#bench-compare-save-a').click();
  assert.equal(await page.locator('#bench-compare-hear-a').isEnabled(),true,'Save A must enable Hear A');
  const comparisonA=await page.locator('#lab-demo-code').inputValue();
  await page.locator('#lab-demo-code').fill(comparisonA+'\\n// comparison B');
  await page.locator('#bench-compare-save-b').click();
  await page.locator('#bench-compare-hear-a').evaluate(el=>{
   // Test restoration without starting the heavyweight audio engine.
   document.querySelector('#lab-engine').disabled=true;
   el.click();
  });
  assert.equal(await page.locator('#lab-demo-code').inputValue(),comparisonA,'Comparison A did not restore source: '+JSON.stringify({errors,status:await page.locator('#lab-status').textContent()}));
  await page.locator('#bench-tone-undo').click();
  assert.match(await page.locator('#lab-demo-code').inputValue(),/comparison B/,'Comparison switch not undoable');
  await page.locator('#bench-tone-redo').click();
  assert.equal(await page.locator('#lab-demo-code').inputValue(),comparisonA,'Comparison redo did not restore A');
  await page.locator('#bench-compare-hear-b').evaluate(el=>el.click());
  assert.match(await page.locator('#lab-demo-code').inputValue(),/comparison B/,'Comparison B did not restore source');
  const comparisonLayout=await page.locator('#bench-compare-bar').evaluate(el=>{
   const bounds=el.getBoundingClientRect();
   return {width:bounds.width,scroll:el.scrollWidth,viewport:innerWidth,
    buttons:[...el.querySelectorAll('button')].map(b=>{
     const r=b.getBoundingClientRect();return {left:r.left,right:r.right,height:r.height}
    })};
  });
  assert.ok(comparisonLayout.scroll<=comparisonLayout.width+2,'Comparison strip overflow: '+JSON.stringify(comparisonLayout));
  assert.ok(comparisonLayout.buttons.every(b=>b.left>=-1&&b.right<=width+1&&b.height>=32),
   'Comparison buttons clipped or too small: '+JSON.stringify(comparisonLayout));
  // Generated source handoff must not silently discard an existing instrument.
  await page.evaluate(()=>{document.querySelector('#lab-engine').disabled=true});
  const generated='({ SinOsc.ar(330,0,0.1) }.play;)';
  page.once('dialog',dialog=>dialog.accept());
  await page.evaluate(code=>window.dispatchEvent(new CustomEvent('bench-open-source',{detail:{name:'Glass bell',code,play:false}})),generated);
  assert.equal(await page.locator('#lab-demo-code').inputValue(),generated,'Generated source was not loaded');
  assert.equal(await page.locator('#lab-tone-name').inputValue(),'Glass bell');
  const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(size.scroll<=size.width+1,'Phone horizontal overflow: '+JSON.stringify(size));
  assert.deepEqual(errors,[],'Page exceptions at width '+width);
  await context.close();
  console.log('Phone '+width+'px: safe scroll, source links, pitch zoom, undo/redo and layout passed.');
 }
}finally{await browser.close();server.close()}
