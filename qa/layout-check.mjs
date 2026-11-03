/* Browser-layout checks, independent of the heavy WebAssembly audio engine. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8'};
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
        const title=document.querySelector('header h1'),tabButtons=[...document.querySelectorAll('.inspector-modes button')];
        return {header:rect('header'),files:rect('.projectbar'),editor:rect('.editor-frame'),transport:rect('.toolbar'),console:rect('.console-bar'),controls,vector,viewport:innerHeight,scrollY,selected,
          fullTitle:title.scrollWidth<=title.clientWidth+1,
          tabsFit:tabButtons.every(el=>{const b=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();return b.width>=24&&el.scrollWidth<=el.clientWidth+1&&b.left>=p.left-1&&b.right<=p.right+1;})}
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
      assert(r.fullTitle,theme+' SuperCollision heading is truncated at '+width);
      const inset=await page.evaluate(()=>{
        const panel=document.querySelector('#live-panel').getBoundingClientRect();
        const editor=document.querySelector('.editor-frame').getBoundingClientRect();
        return {panel:panel.toJSON(),editor:editor.toJSON(),
          outsideConsole:!document.querySelector('.console-bar #activity-status'),
          status:document.querySelector('#live-panel #activity-status')!==null};
      });
      assert(inset.outsideConsole&&inset.status,theme+' live activity is not in editor inset');
      assert(inset.panel.width>=110&&inset.panel.right<=inset.editor.right+1&&
        inset.panel.bottom<=inset.editor.bottom+1&&inset.panel.left>=inset.editor.left,
        theme+' live inset overflows editor at '+width);

      assert(r.tabsFit,theme+' inspector tabs clipped at '+width);
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
        await page.locator('#file-menu > summary').click();
        await page.locator('#file-menu .file-submenu > summary').filter({hasText:'EDITOR'}).click();
        await page.locator('#code-size-reset').click();
        const resetFont=await page.evaluate(()=>parseFloat(getComputedStyle(document.getElementById('code')).fontSize));
        assert(resetFont===14,'FILE menu reset did not restore 100% text size');
        assert(!(await page.locator('#file-menu').evaluate(el=>el.open)),'FILE menu should close after reset command');

        // Browser integration: visible highlights must be driven by actual OSC events,
        // never merely by pressing RUN or by static editor text.
        const activitySource=[
          'SynthDef(\\bell, { |freq=440|',
          '    Out.ar(0, SinOsc.ar(freq) * 0.1);',
          '}).add;',
          'Synth(\\bell);'
        ].join('\n');
        await page.locator('#code').fill(activitySource);
        const observerReady=await page.evaluate(()=>!!window.SCActivity);
        assert(observerReady,'OSC live-activity module did not initialize in browser');
        const beforeActivity=await page.evaluate((text)=>{
          const mon=window.SCActivity,editor=document.getElementById('code');
          editor.scrollTop=0;editor.dispatchEvent(new Event('scroll'));
          mon.evaluation('Default',text,text,1);
          const enc=new TextEncoder();
          const str=x=>{const a=[...enc.encode(x),0];while(a.length%4)a.push(0);return a};
          const i32=x=>{const b=new ArrayBuffer(4);new DataView(b).setInt32(0,x,false);return [...new Uint8Array(b)]};
          const osc=(path,types,args)=>{
            const out=[...str(path),...str(','+types)];
            for(let i=0;i<types.length;i++)out.push(...(types[i]==='s'?str(args[i]):i32(args[i])));
            return Uint8Array.from(out);
          };
          window.__oscQA=osc;
          return mon.tracker.visible().confirmed;
        },activitySource);
        assert(beforeActivity===0,'Activity should start inactive before audio server notifications');
        await page.evaluate(()=>window.SCActivity.outgoing(window.__oscQA('/s_new','siii',['bell',1001,0,1])));
        await page.waitForTimeout(65);
        const requested=await page.evaluate(()=>({
          blue:document.querySelectorAll('#activity-overlay .live-source-trigger').length,
          amber:document.querySelectorAll('#activity-overlay .live-source-active').length,
          status:document.getElementById('activity-status').textContent
        }));
        assert(requested.blue>0&&requested.amber===0,'Synth request should flash blue but not amber before confirmation: '+JSON.stringify(requested));
        await page.evaluate(()=>window.SCActivity.incoming(window.__oscQA('/n_go','iiiii',[1001,1,-1,-1,0])));
        await page.waitForTimeout(65);
        const confirmed=await page.evaluate(()=>({
          amber:document.querySelectorAll('#activity-overlay .live-source-active').length,
          gutter:document.querySelectorAll('#line-inner .live-active').length,
          count:window.SCActivity.tracker.visible().confirmed
        }));
        assert(confirmed.amber>=2&&confirmed.gutter>=2&&confirmed.count===1,
          'Server /n_go must illuminate UGen lines and gutter: '+JSON.stringify(confirmed));
        const chip=await page.evaluate(()=>{
          const r=document.querySelector('#live-instruments .live-instrument-row');
          return {name:r?.querySelector('.live-instrument-name')?.textContent,
            count:r?.querySelector('.live-instrument-count')?.textContent,
            total:r?.querySelector('.live-instrument-total')?.textContent,
            duration:r?.querySelector('.live-instrument-duration')?.textContent};
        });
        assert(chip.name==='bell'&&chip.count==='●1'&&chip.total==='/1'&&chip.duration.endsWith('s'),
          'Per-instrument live chip missing data: '+JSON.stringify(chip));
        const color=await page.evaluate(()=>({
          instrument:document.querySelector('.live-instrument-row')?.style.getPropertyValue('--voice-color'),
          active:document.querySelector('.live-source-active')?.style.getPropertyValue('--voice-color'),
          hueCount:[getComputedStyle(document.documentElement).getPropertyValue('--voice-0'),
            getComputedStyle(document.documentElement).getPropertyValue('--voice-1')].filter(Boolean).length
        }));
        assert(color.instrument===color.active&&color.hueCount===2,
          'Instrument source and inset colors disagree: '+JSON.stringify(color));
        await page.screenshot({path:path.join(root,'qa','screenshots','live-sound-activity.png')});
        await page.evaluate(()=>window.SCActivity.incoming(window.__oscQA('/n_end','iiiii',[1001,1,-1,-1,0])));
        await page.waitForTimeout(70);
        const ended=await page.evaluate(()=>({
          amber:document.querySelectorAll('#activity-overlay .live-source-active').length,
          count:window.SCActivity.tracker.visible().confirmed
        }));
        assert(ended.amber===0&&ended.count===0,'Server /n_end must clear active sound highlight');

        // Strict compatibility: even a Routine must be submitted verbatim.
        const exactRoutine=await page.evaluate(()=>{
          const piece='Routine({\\n  1.wait;\\n}).play(SystemClock);';
          return {returned:window.SCActivity.evaluation('Default',piece,piece,1),
            original:piece,routines:window.SCActivity.tracker.visible().routines.length};
        });
        assert(exactRoutine.returned===exactRoutine.original,
          'Living Code must not insert execution instructions');
        assert(exactRoutine.routines===0,
          'Do not invent exact Routine location without an independent execution trace');

        assert((await page.locator('#run-region').innerText()).trim()==='SELECTED','Selected transport button label incorrect');
        assert(await page.locator('#evaluate svg.transport-icon').count()===1,'RUN does not use a vector icon');
        assert(await page.locator('#record-stop svg.transport-icon').count()===1,'SAVE does not use a distinct vector icon');
        assert(!(await page.locator('#evaluate').innerText()).includes('▶'),'RUN still contains emoji-prone glyph');
        const names=await page.locator('.inspector-modes button').allTextContents();
        assert(names.join('|')==='CODE|CONSOLE|AUDIO|PERFORM','Direct inspector tabs absent');
        const codeBefore=await page.evaluate(()=>({
          audio:getComputedStyle(document.getElementById('audio-panel')).display,
          pressed:document.getElementById('inspector-code').getAttribute('aria-pressed')
        }));
        assert(codeBefore.audio==='none'&&codeBefore.pressed==='true','CODE view has unexpected diagnostics');
        await page.locator('#inspector-console').click();
        await page.waitForTimeout(100);
        const shrink=await page.evaluate(()=>({
          height:document.querySelector('.editor-frame').getBoundingClientRect().height,
          open:document.getElementById('console-panel').open,
          audio:getComputedStyle(document.getElementById('audio-panel')).display,
          pressed:document.getElementById('inspector-console').getAttribute('aria-pressed')
        }));
        assert(shrink.open&&shrink.height<initialHeight-60&&shrink.audio==='none'&&shrink.pressed==='true',
          'CONSOLE view must show console and shrink editor only');
        await page.locator('#inspector-audio').click();
        await page.waitForTimeout(90);
        const audio=await page.evaluate(()=>({
          editor:document.querySelector('.editor-frame').getBoundingClientRect().height,
          panel:getComputedStyle(document.getElementById('audio-panel')).display,
          panelHeight:document.getElementById('audio-panel').getBoundingClientRect().height,
          console:document.getElementById('console-panel').open,
          title:document.querySelector('#audio-panel h2').textContent.trim(),
          pressed:document.getElementById('inspector-audio').getAttribute('aria-pressed')
        }));
        assert(audio.editor>=105&&audio.panel!=='none'&&audio.panelHeight>=120&&!audio.console&&
          audio.title==='AUDIO TEST'&&audio.pressed==='true',
          'AUDIO view must show only the audio test while maintaining the editor');
        await page.locator('#inspector-code').click();
        await page.waitForTimeout(80);
        const restored=await page.evaluate(()=>({
          height:document.querySelector('.editor-frame').getBoundingClientRect().height,
          audio:getComputedStyle(document.getElementById('audio-panel')).display,
          console:document.getElementById('console-panel').open
        }));
        assert(restored.height>=initialHeight-35&&restored.audio==='none'&&!restored.console,
          'CODE view should restore editor and hide lower panels');

        // LIVE is an observation switch, never a source transformation.
        assert(await page.locator('#live-code-toggle').count()===0,'Redundant FILE tracking switch remains');
        await page.locator('#live-panel-toggle').click();
        await page.waitForTimeout(85);
        const off=await page.evaluate(()=>{
          const mon=window.SCActivity,perf=window.SCTimeline;
          const text='Routine({\\n  1.wait;\\n}).play(SystemClock);';
          return {enabled:mon.enabled,observing:perf.journal.enabled,
            collapsed:document.getElementById('live-panel').classList.contains('live-collapsed'),
            unchanged:mon.evaluation('Default',text,text,1)===text,
            status:document.querySelector('#activity-status').textContent};
        });
        assert(!off.enabled&&!off.observing&&off.collapsed&&off.unchanged&&off.status==='OFF',
          'Collapsed LIVE must stop observation without changing source: '+JSON.stringify(off));
        await page.locator('#live-panel-toggle').click();
        await page.waitForTimeout(75);
        const on=await page.evaluate(()=>{
          const mon=window.SCActivity,perf=window.SCTimeline;
          const text='Routine({\\n  1.wait;\\n}).play(SystemClock);';
          return {enabled:mon.enabled,observing:perf.journal.enabled,
            unchanged:mon.evaluation('Default',text,text,1)===text};
        });
        assert(on.enabled&&on.observing&&on.unchanged,'Expanded LIVE must restore observation but not instrumentation');
        await page.locator('#inspector-perform').click();
        await page.waitForTimeout(100);
        const performance=await page.evaluate(()=>{
          const p=document.getElementById('perform-panel');
          return {height:p.getBoundingClientRect().height,
            visible:getComputedStyle(p).display,
            tab:document.getElementById('inspector-perform').getAttribute('aria-pressed'),
            rows:!!document.getElementById('perform-rows'),
            original:window.SCTimeline.journal.events.length};
        });
        assert(performance.height>=120&&performance.visible!=='none'&&performance.tab==='true'&&performance.rows,
          'PERFORM inspector must expose separate timeline and mixer: '+JSON.stringify(performance));
        await page.locator('#inspector-code').click();

        // FILE: common commands + five exclusive touch-friendly sections.
        const menus=await page.locator('#file-menu .file-submenu > summary').allTextContents();
        assert(menus.map(x=>x.trim()).join('|')==='IMPORT / EXPORT|EXAMPLES|EDITOR|STORAGE|TOOLS',
          'FILE submenus unexpected: '+menus.join('|'));
        assert(await page.locator('#file-menu .menu-items > button').count()===4,
          'New, Rename, Delete and Undo should remain direct FILE actions');
        await page.locator('#file-menu > summary').click();
        await page.locator('#file-menu .file-submenu > summary').filter({hasText:'IMPORT / EXPORT'}).click();
        const openBefore=await page.evaluate(()=>[...document.querySelectorAll('#file-menu .file-submenu')].filter(el=>el.open).length);
        assert(openBefore===1,'FILE must open just one submenu');
        await page.locator('#file-menu .file-submenu > summary').filter({hasText:'STORAGE'}).click();
        const nested=await page.evaluate(()=>{
          const groups=[...document.querySelectorAll('#file-menu .file-submenu')];
          const file=document.querySelector('#file-menu').getBoundingClientRect();
          const popup=document.querySelector('#file-menu-items').getBoundingClientRect();
          return {open:groups.filter(el=>el.open).map(el=>el.querySelector('summary').textContent.trim()),
            popupWidth:popup.width,popupRight:popup.right,visible:popup.height>0,
            fileOpen:document.querySelector('#file-menu').open};
        });
        assert(nested.fileOpen&&nested.visible&&nested.open.join('')==='STORAGE'&&
          nested.popupWidth<=width+2&&nested.popupRight<=width+2,
          'FILE submenu overflow or accordion failure: '+JSON.stringify(nested));
        await page.locator('#file-menu > summary').click();
        assert(!(await page.locator('#file-menu').evaluate(el=>el.open)),'FILE summary must dismiss drawer');

      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
if(failures)process.exitCode=1;
else console.log('Passed: 8 themes x 3 phone widths, FILE accordion, LIVE collapse/on-off, unclipped menus, zoom, OSC tracing, and responsive panels.');
