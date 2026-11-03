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
        await page.locator('.menu>summary').click();
        await page.locator('#code-size-reset').click();
        const resetFont=await page.evaluate(()=>parseFloat(getComputedStyle(document.getElementById('code')).fontSize));
        assert(resetFont===14,'FILE menu reset did not restore 100% text size');
        await page.locator('.menu>summary').click();

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

        // Mimic the language post channel without fabricating an OSC start:
        // the module must produce actual executable Routine checkpoints.
        const tracePlan=await page.evaluate(()=>{
          const piece=[
            '(',
            '~routine=Routine({',
            '  var x=1;',
            '  2.do {',
            '    Synth(\\bell);',
            '    0.5.wait;',
            '  };',
            '}).play(SystemClock);',
            ')'
          ].join('\n');
          const ed=document.getElementById('code');
          ed.value=piece;ed.dispatchEvent(new Event('input',{bubbles:true}));
          const instrumented=window.SCActivity.evaluation('Default',piece,piece,1);
          const markers=instrumented.match(/__SCLIVE__[A-Za-z0-9]+:\d+:\d+:(?:step|wait):(?:\d+(?:\.\d+)?|x)__/g)||[];
          const wait=instrumented.match(/__SCLIVE__([A-Za-z0-9]+):(\d+):(\d+):wait:/);
          if(wait)window.SCActivity.consumePrint('__SCLIVE__'+wait[1]+':'+wait[2]+':'+wait[3]+':wait:0.5:1__\n');
          return {markers:markers.length+(wait?1:0),sourcePreserved:ed.value===piece};
        });
        await page.waitForTimeout(100);
        const routineUi=await page.evaluate(()=>({
          text:document.getElementById('live-routines').textContent,
          lines:document.querySelectorAll('#activity-overlay .live-source-wait').length,
          state:document.querySelector('.live-routine-state')?.textContent||'',
          progress:document.querySelector('.live-routine-row')?.style.getPropertyValue('--wait-progress')||''
        }));
        assert(tracePlan.markers>=2&&tracePlan.sourcePreserved,'Routine trace instrumentation changed visible code');
        assert(routineUi.text.includes('WAIT')&&routineUi.lines>0&&routineUi.progress.endsWith('%'),
          'Routine countdown checkpoint not visible within editor: '+JSON.stringify(routineUi));
        const initialSeconds=parseFloat(routineUi.state.replace('WAIT',''));
        await page.waitForTimeout(240);
        const later=await page.evaluate(()=>document.querySelector('.live-routine-state')?.textContent||'');
        const laterSeconds=parseFloat(later.replace('WAIT',''));
        assert(Number.isFinite(initialSeconds)&&Number.isFinite(laterSeconds)&&laterSeconds<initialSeconds,
          'WAIT countdown did not decrease: '+routineUi.state+' to '+later);


        assert((await page.locator('#run-region').innerText()).trim()==='SELECTED','Selected transport button label incorrect');
        assert(await page.locator('#evaluate svg.transport-icon').count()===1,'RUN does not use a vector icon');
        assert(await page.locator('#record-stop svg.transport-icon').count()===1,'SAVE does not use a distinct vector icon');
        assert(!(await page.locator('#evaluate').innerText()).includes('▶'),'RUN still contains emoji-prone glyph');
        const names=await page.locator('.inspector-modes button').allTextContents();
        assert(names.join('|')==='CODE|CONSOLE|AUDIO','Direct inspector tabs absent');
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
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
if(failures)process.exitCode=1;
else console.log('Passed: 8 themes x 3 phone widths, fixed inspector tabs, vector transport icons, pinch zoom, OSC highlighting and responsive panels.');
