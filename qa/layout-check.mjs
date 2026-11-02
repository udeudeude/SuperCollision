/* Browser-layout checks, independent of the heavy WebAssembly audio engine. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const server = createServer(async (req,res)=>{
  const name = new URL(req.url,'http://localhost').pathname;
  const requested = path.resolve(root,'.'+(name==='/'?'/index.html':name));
  if(!requested.startsWith(root+path.sep)){res.writeHead(403).end();return}
  try {const body=await readFile(requested);res.writeHead(200,{'Content-Type':mime[path.extname(requested)]||'application/octet-stream'}).end(body)}
  catch {res.writeHead(404).end('Not found')}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const browser=await chromium.launch({headless:true});
const studies=['bauhaus','blackmountain','moog','makenoise','score','scope','patch','terminal'];
await mkdir(path.join(root,'qa','screenshots'),{recursive:true});
let failures=0;
function assert(ok,msg){if(!ok){failures++;console.error('FAIL:',msg)}}
try {
  for(const width of [320,390,430]) {
    const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
    const page=await context.newPage();
    for(const theme of studies) {
      await page.goto('http://127.0.0.1:'+port+'/?design='+theme,{waitUntil:'load'});
      await page.waitForTimeout(150);
      const r=await page.evaluate(()=>{
        const rect=q=>{const e=document.querySelector(q);const b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom,height:b.height,width:b.width,left:b.left}};
        const controls=[...document.querySelectorAll('.toolbar button')].map(el=>{const b=el.getBoundingClientRect();return {top:b.top,height:b.height,width:b.width}});
        const selected=document.body.dataset.theme;
        const vector=getComputedStyle(document.querySelector('.art-'+selected)).display;
        return {header:rect('header'),files:rect('.projectbar'),editor:rect('.editor-frame'),transport:rect('.toolbar'),console:rect('.console-bar'),controls,vector,viewport:innerHeight,scrollY,selected}
      });
      assert(r.header.top<=r.files.top+2,theme+' header above files at '+width);
      assert(r.files.bottom<=r.editor.top+4,theme+' files above editor at '+width);
      assert(r.editor.bottom<=r.transport.top+4,theme+' editor above transport at '+width);
      assert(r.transport.bottom<=r.console.top+4,theme+' controls above console at '+width);
      assert(r.console.bottom<=r.viewport+4,theme+' console off-screen at '+width);
      assert(r.editor.height>=180,theme+' editor too short at '+width+': '+r.editor.height);
      assert(r.controls.length===6,theme+' transport lacks six buttons');
      assert(r.controls.every(x=>Math.abs(x.top-r.controls[0].top)<3&&x.height<=44&&x.width>=20),theme+' transport wrapped or oversized at '+width);
      assert(r.selected===theme&&r.vector!=='none',theme+' artwork not selected');
      if(width===390)await page.screenshot({path:path.join(root,'qa','screenshots',theme+'.png')});

      if(theme==='moog' && width===390) {
        const initialHeight=r.editor.height;
        const source=Array.from({length:200},(_,i)=>'// '+String(i+1).padStart(3,'0')+'    SinOsc.ar(110,0,0.1);').join('\n');
        await page.locator('#code').fill(source);
        await page.waitForTimeout(120);
        let lines=await page.locator('#line-inner .line').count();
        assert(lines===200,'gutter line count not 200: '+lines);
        await page.evaluate(()=>{
          const el=document.getElementById('code');
          el.scrollTop=el.scrollHeight/2;
          el.dispatchEvent(new Event('scroll'));
        });
        await page.waitForTimeout(90);
        const scroll=await page.evaluate(()=>{
          const e=document.getElementById('code');
          const inner=document.getElementById('line-inner');
          return {offset:e.scrollTop,translate:inner.style.transform,
                  codeLineHeight:getComputedStyle(e).lineHeight,
                  gutterLineHeight:getComputedStyle(inner.querySelector('.line')).lineHeight,
                  compact:document.body.classList.contains('compact'),
                  wrap:e.getAttribute('wrap')}
        });
        assert(scroll.translate.includes(String(-scroll.offset)+'px'), 'gutter not tracking editor scroll');
        assert(scroll.codeLineHeight===scroll.gutterLineHeight,'gutter line height differs from editor');
        assert(scroll.compact,'header did not compact when code scrolled');
        assert(scroll.wrap==='off','code wraps and loses line number alignment');
        await page.locator('#inspect-toggle').click();
        await page.waitForTimeout(100);
        const shrink=await page.evaluate(()=>({height:document.querySelector('.editor-frame').getBoundingClientRect().height,open:document.getElementById('console-panel').open}));
        assert(shrink.open&&shrink.height<initialHeight-60,'console reveal failed to shrink editor');
        await page.locator('#inspect-toggle').click();
        const diag=await page.evaluate(()=>({open:document.querySelector('main > details.utility').open,inspect:document.body.classList.contains('inspect-2')}));
        assert(diag.open&&diag.inspect,'diagnostic reveal failed');
        await page.locator('#inspect-toggle').click();
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
if(failures)process.exitCode=1;
else console.log('Passed: 8 themes x 3 phone widths, line-number sync and console expansion.');
