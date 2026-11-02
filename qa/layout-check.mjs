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

        // Synthetic two-touch gestures exercise the same editor listeners as a mobile pinch.
        const zoomAfterPinch = await page.evaluate(() => {
          const el=document.getElementById('code');
          const b=el.getBoundingClientRect(),cx=b.left+b.width/2,cy=b.top+b.height/2;
          const touch=(id,x,y)=>new Touch({identifier:id,target:el,clientX:x,clientY:y,
            screenX:x,screenY:y,pageX:x,pageY:y});
          function emit(type,spread){
            const pts=[touch(1,cx-spread,cy),touch(2,cx+spread,cy)];
            const touches=type==='touchend'?[]:pts;
            el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,
              touches,targetTouches:touches,changedTouches:pts}));
          }
          emit('touchstart',90);
          emit('touchmove',55);
          emit('touchend',55);
          const l=document.querySelector('#line-inner .line');
          return {font:parseFloat(getComputedStyle(el).fontSize),
            codeLine:getComputedStyle(el).lineHeight,
            gutterLine:getComputedStyle(l).lineHeight,
            highlightFont:getComputedStyle(document.getElementById('highlight-layer')).fontSize,
            codeFont:getComputedStyle(el).fontSize,
            indicatorHidden:document.getElementById('code-zoom-indicator').hidden,
            count:document.querySelectorAll('#line-inner .line').length,
            saved:localStorage.getItem('supercollision-editor-font-px-v1')};
        });
        assert(zoomAfterPinch.font>=8&&zoomAfterPinch.font<=10,
          'Pinch did not reduce font: '+zoomAfterPinch.font);
        assert(zoomAfterPinch.codeLine===zoomAfterPinch.gutterLine,
          'Zoom broke line number alignment');
        assert(zoomAfterPinch.codeFont===zoomAfterPinch.highlightFont,
          'Syntax overlay font differs from editable text');
        assert(zoomAfterPinch.indicatorHidden,'Zoom indicator stuck visible');
        assert(zoomAfterPinch.count===200,'Zoom broke line number count');
        assert(Number(zoomAfterPinch.saved)===zoomAfterPinch.font,
          'Zoom was not saved to localStorage');
        await page.reload();
        const persisted=await page.evaluate(()=>parseFloat(getComputedStyle(document.getElementById('code')).fontSize));
        assert(Math.abs(persisted-zoomAfterPinch.font)<.01,'Zoom not restored on reload');
        const fontBounds=await page.evaluate(()=>{
          const el=document.getElementById('code');
          const b=el.getBoundingClientRect(),cx=b.left+b.width/2,cy=b.top+b.height/2;
          const touch=(id,x,y)=>new Touch({identifier:id,target:el,clientX:x,clientY:y,
            screenX:x,screenY:y,pageX:x,pageY:y});
          const gesture=(a,b)=>{
            function emit(type,spread){
              const points=[touch(1,cx-spread,cy),touch(2,cx+spread,cy)];
              el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,
                touches:type==='touchend'?[]:points,targetTouches:type==='touchend'?[]:points,changedTouches:points}));
            }
            emit('touchstart',a);emit('touchmove',b);emit('touchend',b);
          };
          gesture(30,150);
          const upper=parseFloat(getComputedStyle(el).fontSize);
          gesture(145,8);
          const lower=parseFloat(getComputedStyle(el).fontSize);
          return {upper,lower};
        });
        assert(fontBounds.upper===14,'Pinch exceeded normal maximum text size: '+fontBounds.upper);
        assert(fontBounds.lower===6,'Pinch failed to reach minimum text size: '+fontBounds.lower);
        await page.screenshot({path:path.join(root,'qa','screenshots','moog-pinch-small.png')});
        await page.locator('.menu>summary').click();
        await page.locator('#code-size-reset').click();
        const resetFont=await page.evaluate(()=>parseFloat(getComputedStyle(document.getElementById('code')).fontSize));
        assert(resetFont===14,'FILE menu reset did not restore 100% text size');
        await page.locator('.menu>summary').click();

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
else console.log('Passed: 8 themes x 3 phone widths, line-number sync, pinch-zoom bounds, persistence, reset and console expansion.');
