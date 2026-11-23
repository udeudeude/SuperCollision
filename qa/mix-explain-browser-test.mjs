/* Exercise the actual Mix panel and source navigation, not a synthetic mock. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
  const rel=new URL(req.url,'http://localhost').pathname;
  const filename=path.resolve(root,'.'+(rel==='/'?'/index.html':rel));
  if(!filename.startsWith(root+path.sep)){res.writeHead(403).end();return}
  try{
    const data=await readFile(filename);
    res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream'}).end(data);
  }catch{res.writeHead(404).end('Not found')}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port+'/';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const code=[
  '(',
  'SynthDef(\\teach, {|freq=440, amp=0.12|',
  '  var sig = LPF.ar(SinOsc.ar(freq, 0, amp), 900);',
  '  Out.ar(0, sig ! 2);',
  '}).add;',
  'Synth(\\teach, [\\freq, 330, \\amp, 0.16]);',
  ')'
].join('\n');
try{
  for(const width of [320,390,430]){
    const context=await browser.newContext({viewport:{width,height:844},
      isMobile:true,hasTouch:true});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(origin+'?design=moog',{waitUntil:'load'});
    await page.waitForFunction(()=>window.SCTimeline&&window.setSuperCollisionView);
    await page.evaluate(async source=>{
      const {encodeOsc}=await import('./performance-engine.mjs');
      const editor=document.querySelector('#code');
      editor.value=source;editor.dispatchEvent(new Event('input',{bubbles:true}));
      window.SCTimeline.evaluation('Default',source,source,1);
      window.SCTimeline.outgoing(encodeOsc('/s_new',['teach',1599,0,1,'freq',330,'amp',0.16]));
      window.SCTimeline.incoming(encodeOsc('/n_go',[1599,1,-1,-1,0]));
      window.setSuperCollisionView('perform');
    },code);
    await page.waitForFunction(()=>document.querySelectorAll('.perform-explain-node').length>=3);
    const values=await page.evaluate(()=>{
      const panel=document.querySelector('#perform-panel');
      const rect=el=>el.getBoundingClientRect().toJSON();
      const graph=document.querySelector('#perform-explain-graph');
      const header=panel.querySelector('.perform-header'),explain=panel.querySelector('.perform-explain');
      const scroller=panel.querySelector('.perform-scroller');
      return {names:[...graph.querySelectorAll('button')].map(b=>b.querySelector('.perform-node-title')?.textContent),
        heading:explain.querySelector('strong')?.textContent,
        server:explain.querySelector('.perform-explain-reality')?.textContent,
        waveAria:explain.querySelector('svg')?.getAttribute('aria-label'),
        header:rect(header),explain:rect(explain),timeline:rect(scroller),
        codeVisible:document.querySelector('#code').getBoundingClientRect().height>50,
        adjustParent:explain.querySelector('#perform-explain-adjust')!==null};
    });
    assert.deepEqual(values.names,['LPF','SinOsc','Out'],
      'Incorrect sound-construction components at '+width+'px');
    assert.match(values.server,/1 confirmed active/);
    assert.match(values.server,/330 Hz/);
    assert.match(values.waveAria,/schematic only, not measured output/);
    assert.ok(values.timeline.height>=50,'Time evidence must remain visible at '+width+'px: '+JSON.stringify(values));
    assert.ok(values.explain.bottom<=values.timeline.top+2,'Explorer overlaps timeline at '+width+'px');
    assert.ok(values.codeVisible&&values.adjustParent,'Code and optional controls missing');
    await page.locator('.perform-explain-node').filter({hasText:'SinOsc'}).click();
    const selection=await page.evaluate(()=>{
      const editor=document.querySelector('#code');
      return {selected:editor.value.slice(editor.selectionStart,editor.selectionEnd),
        cue:!document.querySelector('.mix-code-spotlight').hidden,
        view:document.body.classList.contains('view-perform'),
        line:document.querySelectorAll('#line-inner .mix-code-line').length};
    });
    assert.equal(selection.selected,'SinOsc.ar(freq, 0, amp)');
    assert.equal(selection.view,true,'Tapping a component should not dismiss Mix');
    assert.ok(selection.cue&&selection.line===1,'Corresponding Code line not visually marked');

    await page.locator('#perform-axis-ticks').click({position:{x:20,y:10},force:true});
    await page.waitForFunction(()=>document.querySelector('#perform-follow').getAttribute('aria-pressed')==='false');
    assert.equal(await page.locator('.perform-inspect-marker').isVisible(),true,
      'Time inspection must display a marker without stopping audio');
    assert.equal(await page.evaluate(()=>window.SCTimeline.journal.active('teach').length),1,
      'Timeline inspection must not mutate playing nodes');

    await page.locator('#perform-follow').click();
    await page.waitForFunction(()=>document.querySelector('#perform-follow').getAttribute('aria-pressed')==='true');
    await page.locator('#perform-explain-adjust').click();
    assert.equal(await page.locator('#perform-detail').isVisible(),true,
      'Optional mixer controls must remain available');
    await page.locator('#perform-dialog-close').click();
    assert.equal(await page.locator('#perform-detail').isVisible(),false);
    assert.equal(await page.locator('#perform-explain-graph').isVisible(),true,
      'Returning from controls must preserve the explanatory graph');

    await page.locator('#perform-explain-code').click();
    assert.equal(await page.evaluate(()=>document.body.classList.contains('view-perform')),false);
    assert.equal(await page.evaluate(()=>document.querySelector('#code').value),code,
      'Inspecting sound must not rewrite user code');
    assert.equal(errors.length,0,'Unexpected browser errors at '+width+'px: '+errors.join(' | '));
    await context.close();
  }
  console.log('Mix browser: source graph, confirmed server events, honest waveform legend, code mapping, timeline inspection, optional controls and responsive layout passed.');
} finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
