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
  const SCALE=16,LANE_HEIGHT=61,LEFT=162;
  let follow=true,frame=0,timer=null,lastNodesKey='',lastRows=new Map(),userDragging=false;
  const journal=new PerformanceJournal({now:()=>performance.now(),onChange:schedule,send:bytes=>{
    if(sendOsc(bytes))return;
    // Revert performance controls if the server is no longer available.
  }});
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
    title.textContent=r.name;title.title='Jump to instrument definition';
    title.addEventListener('click',()=>jumpTo(journal.defs.get(r.name)?.site));
    const info=document.createElement('span');info.className='perform-voices';
    const actions=document.createElement('div');actions.className='perform-actions';
    const mute=button('M','Mute by setting the exposed amp control to zero',()=>{
      journal.mute(r.name,!journal.stateFor(r.name).muted);schedule();
    });
    mute.className='perform-mute';
    const solo=button('S','Solo instruments with controllable amp',()=>{
      journal.solo(r.name,!journal.stateFor(r.name).solo);schedule();
    });
    solo.className='perform-solo';
    const gain=document.createElement('input');gain.type='range';gain.min='0';gain.max='2';
    gain.step='.05';gain.className='perform-gain';gain.title='Amplitude multiplier, 1 = original';
    gain.setAttribute('aria-label','Amplitude '+r.name);
    gain.addEventListener('input',()=>{
      journal.gain(r.name,Number(gain.value));
      gain.title='Amplitude '+r.name+': '+Math.round(Number(gain.value)*100)+'% of original';
      schedule();
    });
    actions.append(mute,solo,gain);
    const params=document.createElement('details');params.className='perform-params';
    const paramSummary=document.createElement('summary');paramSummary.textContent='PARAMETERS';
    const controlRow=document.createElement('div');controlRow.className='perform-param-fields';
    const paramSelect=document.createElement('select');paramSelect.setAttribute('aria-label','Parameter '+r.name);
    const paramSlider=document.createElement('input');paramSlider.type='range';paramSlider.step='any';paramSlider.setAttribute('aria-label','Parameter value '+r.name);
    const value=document.createElement('output');value.className='perform-param-value';
    const paramDefs=Object.entries(r.params).filter(([k,v])=>k!=='amp'&&typeof v==='number'&&Number.isFinite(v));
    for(const [key] of paramDefs){const option=document.createElement('option');option.value=key;option.textContent=key;paramSelect.append(option)}
    const rangeFor=(key)=>{
      const original=r.params[key],current=journal.stateFor(r.name).controls[key]??original;
      const isPan=/pan/i.test(key),isFreq=/freq|cutoff|hz/i.test(key);
      const low=isPan?-1:isFreq?Math.max(1,Math.min(original/8,30)):Math.min(0,original);
      const high=isPan?1:isFreq?Math.max(original*4,1000):original>0?Math.max(1,original*3):Math.max(1,Math.abs(original)*3);
      paramSlider.min=String(low);paramSlider.max=String(high);paramSlider.step=String(isFreq?1:Math.max((high-low)/120,.001));
      paramSlider.value=String(Math.max(low,Math.min(high,current)));
      value.value=Number(paramSlider.value).toFixed(isFreq?0:2);
    };
    paramSelect.addEventListener('change',()=>rangeFor(paramSelect.value));
    paramSlider.addEventListener('input',()=>{
      const n=Number(paramSlider.value);
      journal.parameter(r.name,paramSelect.value,n);
      value.value=n.toFixed(/freq|cutoff|hz/i.test(paramSelect.value)?0:2);
    });
    controlRow.append(paramSelect,paramSlider,value);
    params.append(paramSummary,controlRow);
    if(!paramDefs.length)params.hidden=true;else rangeFor(paramSelect.value);
    controls.append(title,info,actions,params);
    const track=document.createElement('div');track.className='perform-track';
    lane.append(controls,track);
    rowsEl.append(lane);
    return {lane,controls,info,mute,solo,gain,track,params,parameterControl:paramSelect};
  };
  function updateLanes(rows){
    const names=new Set(rows.map(r=>r.name));
    for(const [name,dom] of lastRows){
      if(!names.has(name)){dom.lane.remove();lastRows.delete(name)}
    }
    for(const row of rows){
      let dom=lastRows.get(row.name);
      if(!dom){dom=createLane(row);lastRows.set(row.name,dom)}
      dom.info.textContent=row.active?
        row.active+' playing · '+row.count+' total':
        'Resting · '+row.count+' total';
      dom.lane.classList.toggle('perform-resting',row.active===0);
      dom.mute.disabled=!row.compatible;
      dom.mute.setAttribute('aria-pressed',String(row.muted));
      dom.mute.classList.toggle('selected',row.muted);
      dom.solo.disabled=!row.compatible||!journal.safeSolo();
      dom.solo.setAttribute('aria-pressed',String(row.solo));
      dom.solo.classList.toggle('selected',row.solo);
      dom.gain.disabled=!row.compatible;
      if(!userDragging&&document.activeElement!==dom.gain)dom.gain.value=String(row.gain);
      dom.gain.title=row.compatible?'Amplitude '+Math.round(row.gain*100)+'% of original':'No exposed numeric amp control in this SynthDef';
      const n=Object.entries(row.params).filter(([k,v])=>k!=='amp'&&Number.isFinite(v)).length;
      dom.params.hidden=n===0;
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
    if(document.hidden)return;
    const allRows=journal.getInstrumentRows();
    const rows=showAll?allRows:allRows.filter(row=>row.active>0);
    const t=journal.now();
    updateLanes(rows);
    const timespan=Math.max(32,Math.ceil((t-journal.zero)/1000)+6);
    const graphWidth=Math.min(24000,Math.max(500,Math.ceil(timespan*SCALE)));
    rowsEl.style.setProperty('--track-width',graphWidth+'px');
    const tickEl=panel.querySelector('#perform-axis-ticks');
    const ticks=[];
    for(let seconds=0;seconds<=timespan&&seconds<1500;seconds+=10){
      const tick=document.createElement('span');tick.className='perform-axis-tick';
      tick.style.left=seconds*SCALE+'px';tick.textContent=formatTime(seconds);ticks.push(tick);
    }
    tickEl.style.width=graphWidth+'px';
    tickEl.replaceChildren(...ticks);
    let number=0;
    const events=journal.eventsForCurrent();
    for(const row of rows){
      const dom=lastRows.get(row.name),bars=[];
      for(const e of events){
        if(e.name!==row.name)continue;
        number++;
        const start=(e.start-journal.zero)/1000;
        const stop=((e.end??t)-journal.zero)/1000;
        const bar=document.createElement('button');bar.type='button';
        bar.className='perform-event'+(e.end===null?' perform-running':'');
        bar.style.left=Math.max(0,start*SCALE)+'px';
        bar.style.width=Math.max(3,(stop-start)*SCALE)+'px';
        bar.style.setProperty('--voice-color','var(--voice-'+row.slot+')');
        const when=formatTime(start),duration=(Math.max(0,stop-start)).toFixed(2);
        const hz=Number.isFinite(e.params?.freq)?' · '+Math.round(e.params.freq)+' Hz':'';
        bar.title=row.name+' · '+when+' · '+duration+' s'+hz;
        bar.setAttribute('aria-label',bar.title);
        bar.addEventListener('click',()=>jumpTo(e.site));
        bars.push(bar);
      }
      dom.track.replaceChildren(...bars);
    }
    summary.textContent=rows.length+(showAll?' instruments':' playing')+
      ' · '+number+' events · '+formatTime((t-journal.zero)/1000);
    if(follow){
      scroller.scrollLeft=Math.max(0,scroller.scrollWidth-scroller.clientWidth);
    }
    clearTimeout(timer);
    if(panel.offsetParent!==null&&journal.enabled)timer=setTimeout(schedule,350);
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
  followBtn.addEventListener('click',()=>{follow=!follow;followBtn.setAttribute('aria-pressed',String(follow));followBtn.textContent=follow?'FOLLOW ●':'FOLLOW ○';schedule()});
  resetBtn.addEventListener('click',()=>{journal.reset();schedule()});
  scroller.addEventListener('pointerdown',()=>{userDragging=true},{passive:true});
  window.addEventListener('pointerup',()=>{userDragging=false},{passive:true});
  scroller.addEventListener('scroll',()=>{if(userDragging&&follow){follow=false;followBtn.setAttribute('aria-pressed','false');followBtn.textContent='FOLLOW ○'}},{passive:true});
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
