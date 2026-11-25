/* SuperCollision Sounds: directly editable visual instrument surfaces.
 * Only the SuperCollider source produces audio. These canvases render parameter
 * models and change the existing code-generating controls. */
export function filterMagnitude(frequency, cutoff, reciprocalQ) {
 const ratio=frequency/cutoff;
 return 1/Math.sqrt((1-ratio*ratio)**2+(reciprocalQ*ratio)**2);
}
export function echoTaps(mix, count=6) {
 const feedback=Math.pow(0.001,0.18/1.4);
 return Array.from({length:count},(_,index)=>mix*Math.pow(feedback,index));
}
export function waveformSample(type,phase,duty=0.5) {
 const p=((phase%1)+1)%1;
 if(type===0)return Math.sin(p*2*Math.PI);
 if(type===1)return 1-4*Math.abs(p-0.5);
 if(type===2)return p*2-1;
 return p<duty?1:-1;
}
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
let ink='#e2b96e',dim='#728574',grid='#39483e',paper='#101a14';
function applyDesignPalette(){
 const style=getComputedStyle(document.body);
 const token=(name,fallback)=>style.getPropertyValue(name).trim()||fallback;
 ink=token('--sc-graph-ink',ink);
 dim=token('--sc-graph-dim',dim);
 grid=token('--sc-graph-grid',grid);
 paper=token('--sc-editor',paper);
}
function drawGrid(ctx,w,h,cols=4,rows=2){
 ctx.strokeStyle=grid;ctx.lineWidth=0.7;ctx.beginPath();
 for(let x=1;x<cols;x++){const px=x*w/cols;ctx.moveTo(px,0);ctx.lineTo(px,h)}
 for(let y=1;y<rows;y++){const py=y*h/rows;ctx.moveTo(0,py);ctx.lineTo(w,py)}
 ctx.stroke();
}
function trace(ctx,points,color=ink,width=1.8){
 if(!points.length)return;
 ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';
 ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();
}
function dot(ctx,x,y,color=ink,r=4){
 ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle=paper;ctx.lineWidth=1;ctx.stroke();
}
function quantize(value,control){
 const v=clamp(value,control.min,control.max);
 const step=control.step||0.01;
 return Number((Math.round((v-control.min)/step)*step+control.min).toFixed(4));
}
export function installToneVisuals({container,inputs,controls,isLocked,onSelect=()=>{},onBegin=()=>{},onCommit=()=>{}}) {
 const controlByKey=new Map(controls.map(c=>[c.key,c]));
 const hiddenBin=document.createElement('div');hiddenBin.id='bench-visual-inputs';hiddenBin.hidden=true;
 container.append(hiddenBin);
 const visualKeys=['frequency','waveform','pulseWidth','cutoff','resonance','attack','release','vibratoHz','vibratoDepth','echoMix','detune'];
 for(const key of visualKeys){
  const field=inputs.get(key)?.closest('.demo-param');
  if(field){field.hidden=true;hiddenBin.append(field)}
 }
 const value=key=>Number(inputs.get(key).value);
 function changeValues(next){
  if(isLocked())return null;
  const changed=[];
  for(const [key,raw]of Object.entries(next)){
   const control=controlByKey.get(key);
   if(!control||!Number.isFinite(raw))continue;
   const v=control.values?Math.round(clamp(raw,0,control.values.length-1)):quantize(raw,control);
   if(v!==value(key)){inputs.get(key).value=String(v);changed.push(key)}
  }
  if(changed.length)inputs.get(changed[0]).dispatchEvent(new Event('input',{bubbles:true}));
  return changed[0]??null;
 }
 function finish(key){
  if(key&&!isLocked())inputs.get(key).dispatchEvent(new Event('change',{bubbles:true}));
 }
 const cards=[],cardForKey=new Map();
 let editingCard=null,linkedCard=null;
 function card(name,subtitle,wide=false,keys=[]){
  const section=document.createElement('section');section.className='bench-visual '+(wide?'bench-visual-wide':'');
  const heading=document.createElement('div');heading.className='bench-visual-head';
  const label=document.createElement('strong');label.textContent=name;
  const reading=document.createElement('span');reading.className='bench-visual-reading';
  const adjust=document.createElement('button');
  adjust.type='button';adjust.className='bench-visual-adjust';
  adjust.textContent='Adjust';adjust.setAttribute('aria-pressed','false');
  adjust.setAttribute('aria-label','Enable editing of '+name.toLowerCase()+'; otherwise swipe to scroll');
  adjust.addEventListener('click',()=>{
   editingCard=editingCard===section?null:section;
   if(keys.length){selectControl(keys[0]);onSelect(keys[0],false)}
   render();
  });
  heading.append(label,reading,adjust);
  const hint=document.createElement('div');hint.className='bench-visual-hint';hint.textContent=subtitle;
  section.append(heading,hint);container.insertBefore(section,hiddenBin);
  for(const key of keys)cardForKey.set(key,section);
  section.addEventListener('click',event=>{
   if(event.target.closest('button'))return;
   if(keys.length){selectControl(keys[0]);onSelect(keys[0],true)}
  });
  cards.push(section);return {section,reading,adjust};
 }
 function surface(parent,cssClass=''){
  const canvas=document.createElement('canvas');canvas.className='bench-visual-canvas '+cssClass;
  canvas.tabIndex=0;canvas.style.touchAction='pan-y';parent.append(canvas);return canvas;
 }
 const drawings=[];
 function drawable(canvas,paint){
  function render(){
   const rect=canvas.getBoundingClientRect();
   const w=Math.round(rect.width),h=Math.round(rect.height);
   if(!w||!h)return;
   const scale=Math.min(window.devicePixelRatio||1,2);
   canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
   const ctx=canvas.getContext('2d');if(!ctx)return;
   ctx.setTransform(scale,0,0,scale,0,0);ctx.fillStyle=paper;ctx.fillRect(0,0,w,h);
   paint(ctx,w,h);
  }
  drawings.push(render);
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(render).observe(canvas);
  return render;
 }
 function pointerSurface(canvas,transform,keyGuide,section,primaryKey){
  let active=false,primary=null,last=null,which=null;
  canvas.setAttribute('role','group');canvas.setAttribute('aria-label',keyGuide);
  const point=e=>{
   const rect=canvas.getBoundingClientRect();
   return {x:clamp((e.clientX-rect.left)/Math.max(1,rect.width),0,1),
    y:clamp((e.clientY-rect.top)/Math.max(1,rect.height),0,1)};
  };
  canvas.addEventListener('pointerdown',e=>{
   selectControl(primaryKey);onSelect(primaryKey,true);
   if(isLocked()||editingCard!==section)return;
   if(e.pointerType==='mouse'&&e.button!==0)return;
   onBegin();
   active=true;which=null;last=null;
   canvas.setPointerCapture(e.pointerId);
   const p=point(e);primary=transform.start?.(p)??null;
   last=changeValues(transform.update(p,primary));
   e.preventDefault();
  });
  canvas.addEventListener('pointermove',e=>{
   if(!active||!canvas.hasPointerCapture(e.pointerId))return;
   const change=changeValues(transform.update(point(e),primary));
   if(change)last=change;
  });
  canvas.addEventListener('pointerup',e=>{
   if(!active)return;active=false;finish(last);onCommit();last=null;
   if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointercancel',()=>{if(active)onCommit();active=false;last=null});
  canvas.addEventListener('keydown',e=>{
   if(isLocked()||editingCard!==section||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
   const change=transform.keyboard?.(e.key);
   if(change){e.preventDefault();onBegin();const key=changeValues(change);finish(key);onCommit()}
  });
 }
 // Waveform choice: four actual oscillator transfer shapes, not decorative icons.
 const osc=card('OSCILLATOR','Tap a waveform. Use Adjust to reshape PULSE.',true,['waveform','pulseWidth']);
 const oscRow=document.createElement('div');oscRow.className='bench-wave-options';osc.section.append(oscRow);
 const waveNames=['SINE','TRIANGLE','SAW','PULSE'];
 for(let index=0;index<4;index++){
  const button=document.createElement('button');button.type='button';button.className='bench-wave-choice';
  button.setAttribute('aria-label',waveNames[index]+' oscillator'+(index===3?', drag for pulse width':''));
  button.setAttribute('aria-pressed','false');
  const sketch=document.createElement('canvas');sketch.className='bench-wave-plot';sketch.style.touchAction='pan-y';
  const title=document.createElement('span');title.textContent=waveNames[index];
  button.append(sketch,title);oscRow.append(button);
  drawable(sketch,(ctx,w,h)=>{
   const left=5,right=w-5,mid=h/2,amp=(h-12)*0.37,points=[];
   for(let x=0;x<=w-10;x++){const phase=x/Math.max(1,w-10)*2;points.push([x+5,mid-waveformSample(index,phase,value('pulseWidth'))*amp])}
   trace(ctx,points,index===value('waveform')?ink:dim,1.7);
   if(index===3){const x=5+(w-10)*value('pulseWidth')/2;ctx.fillStyle=ink;ctx.fillRect(x-1,2,2,h-4)}
  });
  button.addEventListener('click',()=>{
   selectControl('waveform');onSelect('waveform',true);
   if(isLocked())return;
   onBegin();const key=changeValues({waveform:index});finish(key);onCommit();
  });
  if(index===3){
   let dragging=false,lastKey=null;
   sketch.addEventListener('pointerdown',e=>{
    selectControl('pulseWidth');onSelect('pulseWidth',true);
    if(isLocked()||editingCard!==osc.section)return;
    onBegin();dragging=true;
    lastKey=changeValues({waveform:3,pulseWidth:clamp((e.offsetX-5)/Math.max(1,sketch.clientWidth-10)*2,0.05,0.95)});
    sketch.setPointerCapture(e.pointerId);e.preventDefault();
   });
   sketch.addEventListener('pointermove',e=>{
    if(!dragging)return;
    const r=sketch.getBoundingClientRect(),x=clamp((e.clientX-r.left-5)/Math.max(1,r.width-10)*2,0.05,0.95);
    const key=changeValues({waveform:3,pulseWidth:x});if(key)lastKey=key;
   });
   sketch.addEventListener('pointerup',e=>{if(!dragging)return;dragging=false;finish(lastKey);onCommit();lastKey=null;if(sketch.hasPointerCapture(e.pointerId))sketch.releasePointerCapture(e.pointerId)});
   sketch.addEventListener('pointercancel',()=>{if(dragging)onCommit();dragging=false;lastKey=null});
  }
  const drawButton=()=>{const selected=index===value('waveform');button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',String(selected))};
  drawings.push(drawButton);
 }
 // Frequency response: horizontal cutoff, vertical reciprocal-Q (smaller = stronger resonance).
 const filter=card('FILTER','Tap Adjust, then drag for cutoff and resonance.',false,['cutoff','resonance']);
 const filterCanvas=surface(filter.section);
 filterCanvas.setAttribute('aria-label','Filter response. Drag horizontally to change cutoff and vertically to change resonance.');
 drawable(filterCanvas,(ctx,w,h)=>{
  drawGrid(ctx,w,h);const margin=8,innerW=w-2*margin,innerH=h-17;
  const points=[];
  for(let i=0;i<=w;i++){
   const freq=80*Math.pow(150,i/Math.max(1,w));
   const magnitude=filterMagnitude(freq,value('cutoff'),value('resonance'));
   const db=20*Math.log10(Math.max(0.0001,magnitude));
   const y=margin+innerH*(1-clamp((db+35)/53,0,1));
   points.push([i,y]);
  }
  trace(ctx,points);
  const x=margin+innerW*Math.log(value('cutoff')/80)/Math.log(150);
  const y=margin+innerH*clamp(1-(value('resonance')-0.05)/0.9,0,1);
  ctx.setLineDash([2,3]);trace(ctx,[[x,0],[x,h]],dim,1);ctx.setLineDash([]);
  dot(ctx,x,clamp(y,6,h-7));
 });
 pointerSurface(filterCanvas,{
  update:p=>({cutoff:80*Math.pow(150,p.x),resonance:0.05+0.9*(1-p.y)}),
  keyboard:key=>key==='ArrowLeft'?{cutoff:value('cutoff')/1.07}:key==='ArrowRight'?{cutoff:value('cutoff')*1.07}:key==='ArrowUp'?{resonance:value('resonance')-0.025}:{resonance:value('resonance')+0.025}
 },'Filter: left/right cutoff, up/down resonance',filter.section,'cutoff');
 // Percussive envelope: editable attack peak and release tail, two independent time-compressed segments.
 const env=card('ENVELOPE','Tap Adjust, then drag attack or release.',false,['attack','release']);
 const envCanvas=surface(env.section);
 envCanvas.setAttribute('aria-label','Envelope with two draggable handles, one for attack and one for release.');
 const attackX=()=>0.06+0.37*Math.sqrt(value('attack')/2);
 const releaseX=()=>0.57+0.39*Math.sqrt(value('release')/5);
 drawable(envCanvas,(ctx,w,h)=>{
  drawGrid(ctx,w,h);
  const x1=attackX()*w,x2=releaseX()*w,low=h-9,high=11;
  const pts=[[8,low]];
  for(let i=1;i<=24;i++){const t=i/24;pts.push([8+(x1-8)*t,low-(low-high)*Math.sin(t*Math.PI/2)])}
  for(let i=1;i<=48;i++){const t=i/48;pts.push([x1+(x2-x1)*t,high+(low-high)*(1-Math.pow(1-t,2.25))])}
  trace(ctx,pts);dot(ctx,x1,high);dot(ctx,x2,low);
  ctx.fillStyle=dim;ctx.font='9px monospace';ctx.fillText('A',x1+4,high+12);ctx.fillText('R',x2-12,low-8);
 });
 pointerSurface(envCanvas,{
  start:p=>Math.abs(p.x-attackX())<Math.abs(p.x-releaseX())?'attack':'release',
  update:(p,handle)=>handle==='attack'
   ?{attack:2*Math.pow(clamp((p.x-0.06)/0.37,0,1),2)}
   :{release:5*Math.pow(clamp((p.x-0.57)/0.39,0,1),2)},
  keyboard:key=>key==='ArrowLeft'?{attack:value('attack')-0.02}:key==='ArrowRight'?{attack:value('attack')+0.02}:key==='ArrowUp'?{release:value('release')+0.05}:{release:value('release')-0.05}
 },'Envelope: left/right attack, up/down release',env.section,'attack');
 // Pitch modulation: waveform cycles encode Hertz; its height encodes semitone depth.
 const vib=card('VIBRATO','Tap Adjust, then drag rate and depth.',false,['vibratoHz','vibratoDepth']);
 const vibCanvas=surface(vib.section);
 vibCanvas.setAttribute('aria-label','Vibrato trace. Drag right to increase rate and up to increase depth.');
 drawable(vibCanvas,(ctx,w,h)=>{
  drawGrid(ctx,w,h);
  const rate=value('vibratoHz'),depth=value('vibratoDepth'),m=h/2;
  trace(ctx,[[0,m],[w,m]],dim,0.8);
  const pts=[];for(let i=0;i<=w;i++){
   pts.push([i,m-Math.sin(i/w*rate*Math.PI)*depth*(h-14)*0.43]);
  }
  trace(ctx,pts);
  dot(ctx,Math.max(6,Math.min(w-6,rate/12*w)),h-8-depth*(h-17),ink,3);
 });
 pointerSurface(vibCanvas,{
  update:p=>({vibratoHz:12*p.x,vibratoDepth:1-p.y}),
  keyboard:key=>key==='ArrowLeft'?{vibratoHz:value('vibratoHz')-0.2}:key==='ArrowRight'?{vibratoHz:value('vibratoHz')+0.2}:key==='ArrowUp'?{vibratoDepth:value('vibratoDepth')+0.05}:{vibratoDepth:value('vibratoDepth')-0.05}
 },'Vibrato: left/right rate, up/down depth',vib.section,'vibratoHz');
 // Comb echo: replicas have a fixed 180ms delay and 1.4s -60dB decay.
 const echo=card('ECHO','Tap Adjust, then drag for echo level.',false,['echoMix']);
 const echoCanvas=surface(echo.section);
 echoCanvas.setAttribute('aria-label','Echo repetitions. Drag vertically to change echo level.');
 drawable(echoCanvas,(ctx,w,h)=>{
  drawGrid(ctx,w,h);
  const taps=echoTaps(value('echoMix')),margin=10,base=h-10,unit=(w-20)/7;
  const columns=[1,...taps];
  columns.forEach((amplitude,i)=>{
   const x=margin+unit*i+unit*0.18,width=unit*0.6;
   const height=clamp(amplitude*(h-18),0,h-18);
   ctx.fillStyle=i===0?dim:ink;ctx.fillRect(x,base-height,width,Math.max(height,1));
   if(i>0&&height<2){ctx.strokeStyle=dim;ctx.strokeRect(x,base-(h-18)*0.4,width,(h-18)*0.4)}
  });
 });
 pointerSurface(echoCanvas,{
  update:p=>({echoMix:(1-p.y)*0.65}),
  keyboard:key=>key==='ArrowUp'?{echoMix:value('echoMix')+0.025}:key==='ArrowDown'?{echoMix:value('echoMix')-0.025}:null
 },'Echo wet level, arrow up/down to change',echo.section,'echoMix');
 // Cents ruler: detuning only moves pitch, it never pretends to add a second oscillator.
 const detune=card('DETUNE','Tap Adjust, then drag ±25 cents.',false,['detune']);
 const detCanvas=surface(detune.section,'bench-detune-canvas');
 detCanvas.setAttribute('aria-label','Detuning ruler from minus 25 to plus 25 cents.');
 drawable(detCanvas,(ctx,w,h)=>{
  drawGrid(ctx,w,h,10,1);
  const mid=w/2,y=h/2;
  trace(ctx,[[7,y],[w-7,y]],dim,1);
  ctx.fillStyle=dim;ctx.font='9px monospace';ctx.fillText('-25',8,h-5);ctx.fillText('0',mid-3,h-5);ctx.fillText('+25',w-27,h-5);
  const x=7+(w-14)*(value('detune')+25)/50;
  trace(ctx,[[x,5],[x,h-15]],ink,1.3);dot(ctx,x,h/2,ink,3.5);
 });
 pointerSurface(detCanvas,{
  update:p=>({detune:-25+50*p.x}),
  keyboard:key=>key==='ArrowLeft'?{detune:value('detune')-0.5}:key==='ArrowRight'?{detune:value('detune')+0.5}:null
 },'Detune: left/right in cents',detune.section,'detune');
 // Zoom changes the view, not the tone. The current pitch anchors a new
 // frequency window, and the visible limits determine drag resolution.
 const pitch=card('PITCH','Tap Adjust to change pitch. The ♫ drawer lists named notes.',true,['frequency']);
 const pitchControl=document.createElement('div');pitchControl.className='bench-pitch-zoom';
 const zoomOut=document.createElement('button');zoomOut.type='button';zoomOut.textContent='−';
 zoomOut.setAttribute('aria-label','Zoom out on the pitch ruler');
 const zoomIn=document.createElement('button');zoomIn.type='button';zoomIn.textContent='+';
 zoomIn.setAttribute('aria-label','Zoom in on the pitch ruler');
 const zoomRange=document.createElement('output');zoomRange.id='bench-pitch-zoom-range';
 zoomRange.setAttribute('aria-live','off');
 pitchControl.append(zoomOut,zoomRange,zoomIn);
 pitch.section.append(pitchControl);
 const pitchCanvas=surface(pitch.section,'bench-pitch-canvas');
 const maxSpan=Math.log2(8000/25);
 const zoomSteps=[maxSpan,4,2,1,0.5];
 let zoomIndex=0,zoomCenter=Math.log2(440);
 function pitchWindow(){
  const span=zoomSteps[zoomIndex],minimum=Math.log2(25),maximum=Math.log2(8000);
  const low=clamp(zoomCenter-span/2,minimum,maximum-span);
  return {low,span,first:2**low,last:2**(low+span)};
 }
 const frequencyX=hz=>{
  const window=pitchWindow();
  return (Math.log2(hz)-window.low)/window.span;
 };
 function adjustPitchZoom(direction){
  const next=clamp(zoomIndex+direction,0,zoomSteps.length-1);
  if(next===zoomIndex)return;
  zoomCenter=Math.log2(value('frequency'));
  zoomIndex=next;render();
 }
 zoomOut.addEventListener('click',()=>adjustPitchZoom(-1));
 zoomIn.addEventListener('click',()=>adjustPitchZoom(1));
 pitchCanvas.setAttribute('aria-label','Zoomable logarithmic frequency ruler. Tap Adjust before dragging.');
 drawable(pitchCanvas,(ctx,w,h)=>{
  const window=pitchWindow();
  ctx.fillStyle=paper;ctx.fillRect(0,0,w,h);
  const mid=h/2;trace(ctx,[[7,mid],[w-7,mid]],dim,1);
  ctx.font='9px monospace';
  for(let octave=-1;octave<10;octave++){
   const hz=55*Math.pow(2,octave),fraction=frequencyX(hz),x=7+(w-14)*fraction;
   if(fraction<0||fraction>1||x<9||x>w-11)continue;
   ctx.strokeStyle=grid;ctx.beginPath();ctx.moveTo(x,4);ctx.lineTo(x,h-10);ctx.stroke();
   ctx.fillStyle=dim;ctx.fillText('A'+(octave+1),Math.max(4,x-7),h-3);
  }
  const x=7+(w-14)*clamp(frequencyX(value('frequency')),0,1);
  trace(ctx,[[x,5],[x,h-12]],ink,1.7);dot(ctx,x,mid,ink,4);
 });
 pointerSurface(pitchCanvas,{
  update:p=>{
   const window=pitchWindow();
   return {frequency:2**(window.low+window.span*p.x)};
  },
  keyboard:key=>key==='ArrowLeft'?{frequency:value('frequency')/Math.pow(2,1/12)}:key==='ArrowRight'?{frequency:value('frequency')*Math.pow(2,1/12)}:null
 },'Pitch by octave, left or right arrows to move one semitone',pitch.section,'frequency');
 // Level stays an ordinary fader: it is a good direct amplitude control.
 for(const key of ['amplitude']){
  const field=inputs.get(key)?.closest('.demo-param');
  if(field){field.classList.add('bench-compact-control');container.insertBefore(field,hiddenBin)}
 }
 function selectControl(key,{reveal=false}={}){
  const section=cardForKey.get(key)||inputs.get(key)?.closest('.bench-compact-control');
  if(!section)return false;
  linkedCard=section;
  for(const card of cards)card.classList.toggle('is-linked',card===linkedCard);
  if(section.classList.contains('bench-compact-control'))section.classList.add('is-linked');
  if(reveal){
   const sectionRect=section.getBoundingClientRect(),parentRect=container.getBoundingClientRect();
   const safeTop=parentRect.top+12,safeBottom=parentRect.bottom-12;
   const delta=sectionRect.height>safeBottom-safeTop?sectionRect.top-safeTop:
    sectionRect.top<safeTop?sectionRect.top-safeTop:
    sectionRect.bottom>safeBottom?sectionRect.bottom-safeBottom:0;
   if(Math.abs(delta)>1)container.scrollBy({top:delta,behavior:'auto'});
  }
  return true;
 }
 function render(){
  applyDesignPalette();
  for(const item of cards){
   const adjusting=editingCard===item;
   item.classList.toggle('is-adjusting',adjusting);
   const button=item.querySelector('.bench-visual-adjust');
   button.setAttribute('aria-pressed',String(adjusting));
   button.textContent=adjusting?'Done':'Adjust';
   for(const canvas of item.querySelectorAll('canvas'))canvas.style.touchAction=adjusting?'none':'pan-y';
  }
  let window=pitchWindow();
  if(value('frequency')<window.first||value('frequency')>window.last){
   zoomCenter=Math.log2(value('frequency'));
   window=pitchWindow();
  }
  zoomRange.textContent=Math.round(window.first)+'–'+Math.round(window.last)+' Hz';
  zoomIn.disabled=zoomIndex>=zoomSteps.length-1;
  zoomOut.disabled=zoomIndex===0;
  const locked=Boolean(isLocked());container.classList.toggle('bench-visuals-locked',locked);
  const output={
   OSCILLATOR:waveformNames(),FILTER:Math.round(value('cutoff'))+' Hz · RQ '+value('resonance').toFixed(2),
   ENVELOPE:value('attack').toFixed(2)+'s / '+value('release').toFixed(2)+'s',
   VIBRATO:value('vibratoHz').toFixed(1)+' Hz / '+value('vibratoDepth').toFixed(2)+' st',
   ECHO:Math.round(value('echoMix')*100)+'% WET',
   DETUNE:value('detune').toFixed(1)+' ¢',
   PITCH:value('frequency').toFixed(2)+' Hz'
  };
  for(const c of [osc,filter,env,vib,echo,detune,pitch])c.reading.textContent=output[c.section.querySelector('strong').textContent];
  for(const draw of drawings)draw();
 }
 function waveformNames(){return ['SINE','TRIANGLE','SAW','PULSE'][value('waveform')]+(value('waveform')===3?' · PW '+Math.round(value('pulseWidth')*100)+'%':'')}
 const resize=()=>render();
 window.addEventListener('resize',resize,{passive:true});
 window.addEventListener('bench-view-changed',resize);
 window.addEventListener('sc-surface-design-change',resize);
 return {render,cards,selectControl};
}
