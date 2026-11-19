/* Optional performance surface. It reads OSC events and sends independent
 * user-requested /n_set control messages. Never modifies SuperCollider source.
 */
import {PerformanceJournal} from './performance-engine.mjs';
export function createPerformanceUI({panel,editor,getComposition,sendOsc,onChange=()=>{}}){
  const scroller=panel.querySelector('#perform-scroller');
  const rowsEl=panel.querySelector('#perform-rows');
  const followBtn=panel.querySelector('#perform-follow');
  const resetBtn=panel.querySelector('#perform-reset');
  const summary=panel.querySelector('#perform-summary');
  const filterBtn=panel.querySelector('#perform-show');
  let showAll=true;
  const SCALE=16,IDLE_AFTER_MS=9000,FOLLOW_BACK_SECONDS=15;
  let follow=true,frame=0,timer=null,lastRows=new Map();
  let horizontalIntentUntil=0,pointerStart=null,lastTickSpan=-1;
  const setFollow=(enabled)=>{
    follow=Boolean(enabled);
    followBtn.setAttribute('aria-pressed',String(follow));
    followBtn.textContent=follow?'FOLLOWING':'↪ LIVE';
    followBtn.title=follow?'Following the newest musical events':'Return to the live playhead';
    followBtn.setAttribute('aria-label',follow?'Following live playhead':'Return to live playhead');
    panel.classList.toggle('perform-follow-paused',!follow);
  };
  setFollow(true);
  const journal=new PerformanceJournal({now:()=>performance.now(),onChange:schedule,send:bytes=>{
    if(sendOsc(bytes))return;
    // Revert performance controls if the server is no longer available.
  }});
  // The amplitude bar uses the known SynthDef 'amp' value. It is NOT an
  // audio waveform, measured level, or peak meter.
  const ampHeight=amp=>{
    if(typeof amp!=='number'||!Number.isFinite(amp))return null;
    return Math.round(Math.min(100,Math.max(0,Math.sqrt(Math.abs(amp))*100)));
  };
  const mixDialog=document.createElement('section');
  mixDialog.className='perform-mix-dialog perform-detail';
  mixDialog.id='perform-detail';
  mixDialog.hidden=true;
  mixDialog.setAttribute('aria-label','Selected instrument controls');
  mixDialog.innerHTML=`<h2 id="perform-dialog-title">Instrument level</h2>
    <p id="perform-dialog-info"></p>
    <div class="perform-dialog-actions">
      <button type="button" id="perform-dialog-mute">Mute</button>
      <button type="button" id="perform-dialog-solo">Solo</button>
    </div>
    <div class="perform-dialog-gain-line">
      <label for="perform-dialog-gain">Level <output id="perform-dialog-gain-value">100%</output></label>
      <input id="perform-dialog-gain" type="range" min="0" max="2" step=".01" value="1">
    </div>
    <div class="perform-dialog-step-actions">
      <button type="button" id="perform-dialog-minus">−5%</button>
      <button type="button" id="perform-dialog-plus">+5%</button>
    </div>
    <button type="button" id="perform-dialog-neutral" title="Restore this instrument’s original level, mute, solo, and sound parameters" aria-label="Reset selected instrument to defaults">Reset</button>
    <section id="perform-dialog-parameters" hidden>
      <h3>Sound parameters</h3>
      <p>Adjust numeric settings exposed by the instrument code. These affect playing notes; they do not rewrite the composition.</p>
      <div class="perform-dialog-param-line">
        <select id="perform-dialog-param-name" aria-label="Sound parameter"></select>
        <output id="perform-dialog-param-value"></output>
      </div>
      <input id="perform-dialog-param-range" type="range" aria-label="Sound parameter value">
    </section>
    <button type="button" id="perform-dialog-parameters-toggle" aria-expanded="false">Sound</button>
    <button type="button" id="perform-dialog-close">Close</button>`;
  panel.querySelector('.perform-header').append(mixDialog);
  const gainControl=mixDialog.querySelector('#perform-dialog-gain');
  const gainOutput=mixDialog.querySelector('#perform-dialog-gain-value');
  const muteControl=mixDialog.querySelector('#perform-dialog-mute');
  const soloControl=mixDialog.querySelector('#perform-dialog-solo');
  const paramSection=mixDialog.querySelector('#perform-dialog-parameters');
  const paramSelect=mixDialog.querySelector('#perform-dialog-param-name');
  const paramRange=mixDialog.querySelector('#perform-dialog-param-range');
  const paramOutput=mixDialog.querySelector('#perform-dialog-param-value');
  let selectedInstrument=null;
  let showSoundParameters=false;
  const controlRange=(name,key)=>{
    const original=journal.defs.get(name)?.params?.[key],saved=journal.stateFor(name).controls[key];
    const current=saved??original;
    const isPan=/pan/i.test(key),isFreq=/freq|cutoff|hz/i.test(key);
    const lo=isPan?-1:isFreq?Math.max(1,Math.min(original/8,30)):Math.min(0,original);
    const hi=isPan?1:isFreq?Math.max(original*4,1000):original>0?Math.max(1,original*3):Math.max(1,Math.abs(original)*3);
    paramRange.min=String(lo);paramRange.max=String(hi);
    paramRange.step=String(isFreq?1:Math.max((hi-lo)/200,.001));
    paramRange.value=String(Math.max(lo,Math.min(hi,current)));
    paramOutput.textContent=Number(paramRange.value).toFixed(isFreq?0:2);
  };
  function updateDialog(){
    if(!selectedInstrument)return;
    const st=journal.stateFor(selectedInstrument);
    const compatible=journal.compatible(selectedInstrument);
    gainControl.disabled=!compatible;
    muteControl.disabled=!compatible;
    soloControl.disabled=!compatible||!journal.safeSolo();
    mixDialog.querySelector('#perform-dialog-neutral').disabled=false;
    for(const id of ['#perform-dialog-minus','#perform-dialog-plus'])
      mixDialog.querySelector(id).disabled=!compatible;
    gainControl.value=String(st.gain);
    gainOutput.textContent=Math.round(st.gain*100)+'%';
    muteControl.setAttribute('aria-pressed',String(st.muted));
    muteControl.textContent=st.muted?'Unmute':'Mute';
    soloControl.setAttribute('aria-pressed',String(st.solo));
    soloControl.textContent=st.solo?'Unsolo':'Solo';
  }
  const openMix=name=>{
    selectedInstrument=name;
    mixDialog.querySelector('#perform-dialog-title').textContent=name;
    mixDialog.querySelector('#perform-dialog-info').textContent=
      journal.compatible(name)?
        '100% preserves the original level. Mute silences this instrument; Solo silences other controllable instruments.':
        'This instrument does not expose a numeric amplitude control; sound parameters may still be adjustable.';
    const params=journal.defs.get(name)?.params||{};
    const keys=Object.keys(params).filter(k=>k!=='amp'&&!/^(out|bus|gate|doneaction|id|nodeid|group|bufnum|buffer)$/i.test(k)&&Number.isFinite(params[k]));
    const soundToggle=mixDialog.querySelector('#perform-dialog-parameters-toggle');
    soundToggle.hidden=!keys.length;
    showSoundParameters=false;
    paramSection.hidden=true;
    soundToggle.setAttribute('aria-expanded','false');
    paramSelect.replaceChildren(...keys.map(key=>{
      const opt=document.createElement('option');opt.value=key;opt.textContent=key;return opt;
    }));
    mixDialog.classList.remove('perform-sound-mode');
    if(keys.length)controlRange(name,keys[0]);
    updateDialog();
    mixDialog.hidden=false;
    panel.classList.add('perform-has-selection');
    for(const [key,dom] of lastRows)dom.lane.classList.toggle('perform-selected',key===name);
  };
  gainControl.addEventListener('input',()=>{
    if(!selectedInstrument)return;
    journal.gain(selectedInstrument,Number(gainControl.value));
    updateDialog();schedule();
  });
  for(const [id,direction] of [['#perform-dialog-minus',-1],['#perform-dialog-plus',1]]){
    mixDialog.querySelector(id).addEventListener('click',()=>{
      if(!selectedInstrument)return;
      const original=journal.stateFor(selectedInstrument).gain;
      journal.gain(selectedInstrument,Math.round((original+direction*.05)*100)/100);
      updateDialog();schedule();
    });
  }
  muteControl.addEventListener('click',()=>{
    if(!selectedInstrument)return;
    journal.mute(selectedInstrument,!journal.stateFor(selectedInstrument).muted);
    updateDialog();schedule();
  });
  soloControl.addEventListener('click',()=>{
    if(!selectedInstrument)return;
    journal.solo(selectedInstrument,!journal.stateFor(selectedInstrument).solo);
    updateDialog();schedule();
  });
  mixDialog.querySelector('#perform-dialog-neutral').addEventListener('click',()=>{
    if(selectedInstrument){journal.resetInstrument(selectedInstrument);if(paramSelect.value)controlRange(selectedInstrument,paramSelect.value)}
    updateDialog();schedule();
  });
  paramSelect.addEventListener('change',()=>{
    if(selectedInstrument)controlRange(selectedInstrument,paramSelect.value);
  });
  paramRange.addEventListener('input',()=>{
    if(!selectedInstrument)return;
    journal.parameter(selectedInstrument,paramSelect.value,Number(paramRange.value));
    paramOutput.textContent=Number(paramRange.value).toFixed(/freq|cutoff|hz/i.test(paramSelect.value)?0:2);
    schedule();
  });
  mixDialog.querySelector('#perform-dialog-parameters-toggle').addEventListener('click',()=>{
    showSoundParameters=!showSoundParameters;
    paramSection.hidden=!showSoundParameters;
    mixDialog.classList.toggle('perform-sound-mode',showSoundParameters);
    mixDialog.querySelector('#perform-dialog-parameters-toggle').setAttribute('aria-expanded',String(showSoundParameters));
  });
  mixDialog.querySelector('#perform-dialog-close').textContent='Back to Mix';
  mixDialog.querySelector('#perform-dialog-close').addEventListener('click',()=>{
    selectedInstrument=null;mixDialog.hidden=true;
    mixDialog.classList.remove('perform-sound-mode');
    panel.classList.remove('perform-has-selection');
    for(const dom of lastRows.values())dom.lane.classList.remove('perform-selected');
  });
  const helpDialog=document.createElement('dialog');helpDialog.className='perform-mix-dialog perform-help-dialog';
  helpDialog.innerHTML=`<h2>Using Mix</h2>
    <p><b>Mute</b> silences an instrument. <b>Solo</b> silences other instruments so you can hear this one. Both require numeric amplitude controls in the instrument code.</p>
    <p>Tap an instrument name to open its controls below the timeline. Adjust its level, Mute, Solo or sound parameters while the tracks remain visible.</p>
    <p><b>All / Active</b> shows either every instrument ever played in the current composition or only instruments currently sounding.</p>
    <p><b>↺ Levels</b> restores the original mixer volumes and clears Mute and Solo. It does not stop playback or undo sound-parameter edits.</p>
    <p><b>Following</b> keeps the newest events in view. Vertical scrolling leaves it on. Swipe backward over roughly 15 seconds of the timeline to pause following. Tap <b>↪ Live</b> to return.</p>
    <p>Each colored bar represents a synthesizer note. Its filled strip estimates the note’s declared amplitude from code, <b>not measured loudness or a waveform</b>. Tap a bar for its timing, frequency and code amplitude, plus a link to the instrument code.</p>
    <p>All rows remain compact. <b>Stop</b> freezes the musical timeline.</p>
    <button type="button" id="perform-help-close">Close</button>`;
  document.body.append(helpDialog);
  helpDialog.querySelector('#perform-help-close').addEventListener('click',()=>helpDialog.close());
  panel.querySelector('#perform-help')?.addEventListener('click',()=>{if(!helpDialog.open)helpDialog.showModal()});
  // A note detail dialog is deliberately distinct from a waveform viewer:
  // only parameters and event timings observed from the synth stream appear.
  const noteDialog=document.createElement('dialog');
  noteDialog.className='perform-mix-dialog perform-note-dialog';
  noteDialog.innerHTML=`<h2 id="perform-note-title">Note</h2>
    <dl>
      <dt>Started</dt><dd id="perform-note-start"></dd>
      <dt>Duration</dt><dd id="perform-note-duration"></dd>
      <dt>Frequency</dt><dd id="perform-note-frequency"></dd>
      <dt>Code amplitude</dt><dd id="perform-note-amplitude"></dd>
    </dl>
    <p>Amplitude is the value supplied in the code when this note began. It is not a measured waveform or sound-pressure level.</p>
    <div class="perform-dialog-step-actions">
      <button id="perform-note-code" type="button">Go to instrument code</button>
      <button id="perform-note-close" type="button">Close</button>
    </div>`;
  document.body.append(noteDialog);
  let noteSource=null;
  noteDialog.querySelector('#perform-note-code').addEventListener('click',()=>{
    noteDialog.close();
    jumpTo(noteSource);
  });
  noteDialog.querySelector('#perform-note-close').addEventListener('click',()=>noteDialog.close());
  const showNote=(name,event,stamp)=>{
    noteSource=event.site;
    noteDialog.querySelector('#perform-note-title').textContent=name;
    noteDialog.querySelector('#perform-note-start').textContent=
      formatTime((event.start-journal.zero)/1000);
    noteDialog.querySelector('#perform-note-duration').textContent=
      (event.end===null?'Playing · ':'Ended · ')+
      ((Math.max(0,(event.end??stamp)-event.start))/1000).toFixed(2)+' seconds';
    noteDialog.querySelector('#perform-note-frequency').textContent=
      Number.isFinite(event.params?.freq)?Math.round(event.params.freq)+' Hz':'Not available';
    noteDialog.querySelector('#perform-note-amplitude').textContent=
      Number.isFinite(event.params?.amp)?
        String(Number(event.params.amp.toPrecision(3))):'Not available';
    noteDialog.querySelector('#perform-note-code').disabled=!noteSource;
    if(!noteDialog.open)noteDialog.showModal();
  };
  const formatTime=seconds=>{
    if(seconds<0)seconds=0;
    return Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0');
  };
  const jumpTo=site=>{
    if(!site||site.composition!==getComposition())return;
    const lineHeight=parseFloat(getComputedStyle(editor).lineHeight)||21;
    editor.scrollTop=Math.max(0,(site.start-1)*lineHeight-editor.clientHeight*.32);
    editor.dispatchEvent(new Event('scroll'));
    editor.focus({preventScroll:true});
  };
  function button(label,title,onClick,disabled=false){
    const b=document.createElement('button');b.type='button';b.textContent=label;
    b.title=title;b.disabled=disabled;b.addEventListener('click',onClick);return b;
  }
  const createLane=(r)=>{
    const lane=document.createElement('div');lane.className='perform-lane';lane.dataset.name=r.name;
    lane.style.setProperty('--voice-color','var(--voice-'+r.slot+')');
    const controls=document.createElement('div');controls.className='perform-controls';
    const title=document.createElement('button');title.type='button';title.className='perform-name';
    title.textContent=r.name;title.title='Jump to instrument definition in code';

    const info=document.createElement('span');info.className='perform-voices';
    const actions=document.createElement('div');actions.className='perform-actions';
    const mute=button('MUTE','Mute '+r.name,()=>{
      journal.mute(r.name,!journal.stateFor(r.name).muted);schedule();
    });
    mute.className='perform-mute';
    mute.setAttribute('aria-label','Mute '+r.name);
    const solo=button('SOLO','Solo '+r.name,()=>{
      journal.solo(r.name,!journal.stateFor(r.name).solo);schedule();
    });
    solo.className='perform-solo';
    solo.setAttribute('aria-label','Solo '+r.name);
    const level=button('100%','Adjust instrument volume and sound parameters',()=>openMix(r.name));
    level.className='perform-level';
    level.setAttribute('aria-label','Adjust level and sound parameters for '+r.name);
    level.setAttribute('aria-haspopup','dialog');
    // Compact overview: select an instrument to reveal its controls.
    title.title='Select '+r.name+' to adjust its sound';
    title.setAttribute('aria-label','Select '+r.name+' controls');
    title.addEventListener('click',()=>openMix(r.name));
    actions.append(mute,solo,level);
    controls.append(title,info,actions);
    const track=document.createElement('div');track.className='perform-track';
    lane.append(controls,track);rowsEl.append(lane);
    return {lane,controls,info,mute,solo,level,track,bars:new Map()};
  };
  function updateLanes(rows){
    const names=new Set(rows.map(r=>r.name));
    if(selectedInstrument&&!names.has(selectedInstrument)){
      selectedInstrument=null;mixDialog.hidden=true;
      mixDialog.classList.remove('perform-sound-mode');
      panel.classList.remove('perform-has-selection');
    }
    for(const [name,dom] of lastRows){
      if(!names.has(name)){dom.lane.remove();lastRows.delete(name)}
    }
    for(const row of rows){
      let dom=lastRows.get(row.name);
      if(!dom){dom=createLane(row);lastRows.set(row.name,dom)}
      dom.info.textContent=row.active?
        row.active+' sounding · '+row.count+' total':
        'Resting · '+row.count+' total';
      dom.lane.classList.toggle('perform-resting',row.active===0);
      dom.lane.classList.toggle('perform-idle',row.active===0&&row.restingFor>=IDLE_AFTER_MS);
      dom.lane.classList.toggle('perform-muted',row.muted);
      dom.lane.classList.toggle('perform-selected',row.name===selectedInstrument);
      dom.mute.disabled=!row.compatible;
      dom.mute.setAttribute('aria-pressed',String(row.muted));
      dom.mute.classList.toggle('selected',row.muted);
      dom.solo.disabled=!row.compatible||!journal.safeSolo();
      dom.solo.setAttribute('aria-pressed',String(row.solo));
      dom.solo.classList.toggle('selected',row.solo);
      const tunable=Object.entries(row.params).some(([key,val])=>
        key!=='amp'&&Number.isFinite(val));
      dom.level.disabled=!row.compatible&&!tunable;
      dom.level.textContent=row.compatible?Math.round(row.gain*100)+'%':'TUNE';
      dom.level.title=row.compatible?
        'Open large level and sound controls for '+row.name:
        'Edit available sound parameters for '+row.name;
      if(!mixDialog.hidden&&selectedInstrument===row.name)updateDialog();
    }
    // Preserve the existing nodes and controls. Reorder only when the user
    // changes the filter or the underlying composition actually changes.
    const desired=rows.map(row=>lastRows.get(row.name).lane);
    const existing=[...rowsEl.children].filter(el=>el.classList.contains('perform-lane'));
    if(existing.length!==desired.length||existing.some((el,i)=>el!==desired[i]))
      rowsEl.replaceChildren(...desired);
    if(!rows.length){
      if(!rowsEl.querySelector('.perform-empty')){
        const empty=document.createElement('div');empty.className='perform-empty';
        empty.textContent='No synthesizer events observed';rowsEl.append(empty);
      }
    }else rowsEl.querySelector('.perform-empty')?.remove();
  }
  function draw(){
    frame=0;
    if(document.hidden||panel.offsetParent===null)return;
    const allRows=journal.getInstrumentRows();
    const rows=showAll?allRows:allRows.filter(row=>row.active>0);
    const t=journal.timelineNow();
    const stopped=journal.stoppedAt!==null;
    updateLanes(rows);
    rowsEl.style.setProperty('--perform-scroll-x',scroller.scrollLeft+'px');
    const timespan=Math.max(32,Math.ceil((t-journal.zero)/1000)+6);
    const graphWidth=Math.min(24000,Math.max(500,Math.ceil(timespan*SCALE)));
    rowsEl.style.setProperty('--track-width',graphWidth+'px');
    const tickEl=panel.querySelector('#perform-axis-ticks');
    if(timespan!==lastTickSpan){
      const ticks=[];
      for(let seconds=0;seconds<=timespan&&seconds<1500;seconds+=10){
        const tick=document.createElement('span');tick.className='perform-axis-tick';
        tick.style.left=seconds*SCALE+'px';tick.textContent=formatTime(seconds);
        ticks.push(tick);
      }
      tickEl.style.width=graphWidth+'px';
      tickEl.replaceChildren(...ticks);
      lastTickSpan=timespan;
    }
    const events=journal.eventsForCurrent(),byName=new Map();
    // Scan historical notes once, retaining only notes near the viewport.
    // A fixed octave reference avoids rescanning/repositioning every old
    // note whenever a new pitch arrives.
    const pitchBounds=new Map();
    const viewWidth=Math.max(250,scroller.clientWidth);
    const viewLeft=follow&&(!pointerStart||!pointerStart.horizontal)
      ?Math.max(0,graphWidth-scroller.clientWidth):scroller.scrollLeft;
    const minX=Math.max(0,viewLeft-viewWidth),maxX=viewLeft+viewWidth*2;
    for(const ev of events){
      const start=(ev.start-journal.zero)/1000*SCALE;
      const end=((ev.end??t)-journal.zero)/1000*SCALE;
      if(end<minX||start>maxX)continue;
      if(!byName.has(ev.name))byName.set(ev.name,[]);
      byName.get(ev.name).push(ev);
      const hz=ev.params?.freq;
      if(Number.isFinite(hz)&&hz>0){
        const p=Math.log2(hz),b=pitchBounds.get(ev.name)||{lo:p,hi:p};
        b.lo=Math.min(b.lo,p);b.hi=Math.max(b.hi,p);
        pitchBounds.set(ev.name,b);
      }
    }
    for(const row of rows){
      const dom=lastRows.get(row.name);
      const selected=byName.get(row.name)||[];
      const bars=[],used=new Set();
      for(const e of selected){
        used.add(e);
        const start=(e.start-journal.zero)/1000;
        const stop=((e.end??t)-journal.zero)/1000;
        const width=Math.max(3,(stop-start)*SCALE);
        let bar=dom.bars.get(e);
        if(!bar){
          bar=document.createElement('button');bar.type='button';
          bar.className='perform-event';
          const level=document.createElement('span');level.className='perform-event-level';
          level.setAttribute('aria-hidden','true');
          const caption=document.createElement('span');caption.className='perform-event-label';
          caption.setAttribute('aria-hidden','true');
          bar.append(level,caption);
          bar.addEventListener('click',()=>showNote(row.name,e,journal.timelineNow()));
          dom.bars.set(e,bar);
        }
        // Finished notes are immutable. Avoid rebuilding thousands of
        // historic bar styles and labels every 350ms during long pieces.
        const endSignature=String(e.end);
        const boundsKey=JSON.stringify(pitchBounds.get(row.name)||null);
        if(e.end===null||bar.dataset.renderedEnd!==endSignature||bar.dataset.pitchBounds!==boundsKey){
          bar.dataset.pitchBounds=boundsKey;
          bar.dataset.renderedEnd=endSignature;
          bar.classList.toggle('perform-running',e.end===null&&!stopped);
          bar.style.left=Math.max(0,start*SCALE)+'px';
          bar.style.width=width+'px';
          const pitchHz=e.params?.freq,bounds=pitchBounds.get(row.name);
          const pitch=Number.isFinite(pitchHz)&&pitchHz>0&&bounds?
            (Math.log2(pitchHz)-bounds.lo)/Math.max(1,bounds.hi-bounds.lo):.5;
          bar.style.top=(2+Math.round((1-pitch)*11))+'px';
          bar.classList.toggle('perform-pitch-known',Number.isFinite(pitchHz)&&pitchHz>0);
          bar.querySelector('.perform-event-label').textContent=width>=72 &&
            Number.isFinite(e.params?.freq)?Math.round(e.params.freq)+' Hz':'';
          bar.style.setProperty('--voice-color','var(--voice-'+row.slot+')');
          const level=ampHeight(e.params?.amp);
          bar.classList.toggle('perform-level-unknown',level===null);
          bar.style.setProperty('--note-level',level===null?'0%':level+'%');
          const when=formatTime(start),duration=(Math.max(0,stop-start)).toFixed(2);
          const hz=Number.isFinite(e.params?.freq)?' · '+Math.round(e.params.freq)+' Hz':'';
          const amp=Number.isFinite(e.params?.amp)?' · coded amplitude '+e.params.amp:
            ' · coded amplitude unknown';
          bar.title=row.name+' · '+when+' · '+duration+' seconds'+hz+amp;
          bar.setAttribute('aria-label',bar.title);
        }
        bars.push(bar);
      }
      for(const [ev,bar] of dom.bars)if(!used.has(ev)){
        bar.remove();dom.bars.delete(ev);
      }
      const existing=[...dom.track.children];
      if(existing.length!==bars.length||existing.some((el,i)=>el!==bars[i]))
        dom.track.replaceChildren(...bars);
    }
    summary.textContent=rows.length+' instruments · '+events.length+' notes'+
      (stopped?' · Stopped':'');
    panel.classList.toggle('perform-stopped',stopped);
    const right=Math.max(0,scroller.scrollWidth-scroller.clientWidth);
    if(follow&&(!pointerStart||!pointerStart.horizontal)){
      if(Math.abs(scroller.scrollLeft-right)>1)scroller.scrollLeft=right;
    }
    clearTimeout(timer);
    // Once STOP freezes the playhead, keep repainting only until the last
    // resting lane has smoothly compacted. This never advances note time.
    const pendingIdle=rows.some(row=>row.active===0&&row.restingFor<IDLE_AFTER_MS);
    if(panel.offsetParent!==null&&journal.enabled&&(!stopped||pendingIdle))
      timer=setTimeout(schedule,stopped?700:750);
  }
  function schedule(){
    if(frame)return;frame=requestAnimationFrame(draw);
  }
  filterBtn.addEventListener('click',()=>{
    showAll=!showAll;
    filterBtn.setAttribute('aria-pressed',String(showAll));
    filterBtn.textContent=showAll?'ALL':'ACTIVE';
    filterBtn.title=showAll?'Showing all played instruments in fixed positions':
      'Showing only instruments playing right now';
    schedule();
  });
  followBtn.addEventListener('click',()=>{
    // Returning to live is a direct, persistent choice, not a toggle.
    setFollow(true);
    pointerStart=null;
    scroller.scrollLeft=Math.max(0,scroller.scrollWidth-scroller.clientWidth);
    schedule();
  });
  resetBtn.addEventListener('click',()=>{journal.reset();schedule()});
  const checkManualRewind=()=>{
    if(!follow||performance.now()>horizontalIntentUntil)return;
    const right=Math.max(0,scroller.scrollWidth-scroller.clientWidth);
    if(right-scroller.scrollLeft>=FOLLOW_BACK_SECONDS*SCALE){
      setFollow(false);
      schedule();
    }
  };
  scroller.addEventListener('pointerdown',event=>{
    if(!event.isPrimary)return;
    pointerStart={id:event.pointerId,x:event.clientX,y:event.clientY,horizontal:false};
  },{passive:true});
  scroller.addEventListener('pointermove',event=>{
    if(!pointerStart||event.pointerId!==pointerStart.id)return;
    const dx=event.clientX-pointerStart.x,dy=event.clientY-pointerStart.y;
    if(Math.abs(dx)>18&&Math.abs(dx)>Math.abs(dy)*1.3){
      pointerStart.horizontal=true;
      horizontalIntentUntil=performance.now()+1300;
      checkManualRewind();
    }
  },{passive:true});
  const finishGesture=event=>{
    if(pointerStart&&event.pointerId===pointerStart.id){
      pointerStart=null;
      schedule();
    }
  };
  scroller.addEventListener('pointerup',finishGesture,{passive:true});
  scroller.addEventListener('pointercancel',finishGesture,{passive:true});
  scroller.addEventListener('wheel',event=>{
    if(Math.abs(event.deltaX)>20&&Math.abs(event.deltaX)>Math.abs(event.deltaY)){
      horizontalIntentUntil=performance.now()+700;
    }
  },{passive:true});
  scroller.addEventListener('scroll',()=>{
    rowsEl.style.setProperty('--perform-scroll-x',scroller.scrollLeft+'px');
    // Vertical scrolling and automatic follow movement do not pause live.
    checkManualRewind();
  },{passive:true});
  const api={
    journal,
    evaluation:(name,whole,submitted,start)=>journal.evaluation(name,whole,submitted,start),
    outgoing:raw=>journal.outgoing(raw),
    incoming:raw=>journal.incoming(raw),
    stop:()=>journal.stop(),
    observe:on=>journal.observe(on),
    document:(name,text)=>journal.setSource(name,text),
    reset:()=>journal.reset(),
    render:schedule,
    show:()=>schedule()
  };
  schedule();
  return api;
}
