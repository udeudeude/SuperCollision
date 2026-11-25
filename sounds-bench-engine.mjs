/* Isolated native SuperCollider buffer laboratory.
 * This page boots its own sclang/scsynth; main editor remains untouched. */
import {allSounds,saveSound} from './sounds-store.mjs';
import {NativeBufferTransport,oscMessage} from './sounds-buffer.mjs';
import {createOriginalPreview} from './sounds-original-preview.mjs?v=0.6.0';
import {readPcmWaveForNativeBuffer} from './sounds-pcm-ingest.mjs';
import {REGION_DEFINITIONS,regionPlayCommand,regionLiveSource,stopRegionCommand,sampleInstrumentSource,validateRegion,DEMO_MARKER} from './sounds-sampler.mjs';
import {waveformPeaks,waveformDragRegion} from './sounds-waveform.mjs';
import {demoSynthSource,toneControls,toneDefaults,normalizeToneSettings,tuningOptions,notesForTuning} from './sounds-bench-tone.mjs';
import {installToneVisuals} from './sounds-bench-visuals.mjs?v=2.8.1';
import {linkedControlAtCursor,controlTextRange} from './sounds-bench-links.mjs?v=2.8.1';
const $=id=>document.getElementById(id);
const status=$('lab-status'),log=$('lab-log'),sound=$('lab-sound'),engine=$('lab-engine');
const load=$('lab-load'),play=$('lab-play'),stop=$('lab-stop'),cancel=$('lab-cancel'),progress=$('lab-progress');
const details=$('lab-details');
// Read-only local audition of the original, independent of SuperCollider.
const originalPreview=createOriginalPreview();
const sourceSection=document.getElementById('lab-recording');
sourceSection.append(originalPreview.root);
function mountOriginalPlayback(){
 const dock=document.getElementById('bench-original-dock-slot');
 if(dock&&!dock.contains(originalPreview.audio))dock.append(originalPreview.audio);
}
window.addEventListener('bench-layout-ready',mountOriginalPlayback);
mountOriginalPlayback();
function updateOriginalPreview(){
 const item=entries.find(entry=>entry.id===sound.value);
 originalPreview.setItem(item||null);
}
window.addEventListener('bench-view-changed',event=>{
 if(event.detail?.view!=='sample')originalPreview.pause();
});
const regionStart=$('lab-start'),regionFinish=$('lab-finish'),regionRate=$('lab-rate'),regionAmp=$('lab-amp'),regionLoop=$('lab-loop'),regionSummary=$('lab-region-summary');
const demoCode=$('lab-demo-code'),demoPitch=$('lab-demo-pitch'),demoLevel=$('lab-demo-level'),demoReset=$('lab-demo-reset');
const demoBay=$('lab-demo-code-bay'),demoControls=$('lab-demo-controls'),demoSyncLabel=$('lab-demo-sync-label');
const toneName=$('lab-tone-name'),toneSave=$('lab-tone-save'),toneSaveStatus=$('lab-tone-save-status'),toneLibraryLink=$('lab-tone-library-link');
let pendingToneId=new URL(location.href).searchParams.get('tone');
let demoGenerated='',demoDirty=false,hasPlayedTone=false,currentTuning='western';
const noteButtons=[];
const audioPhase=$('lab-audio-phase'),audioPhaseLabel=$('lab-audio-phase-label'),noteHint=$('lab-note-hint');
let lastPlayedLabel='tone';
function setAudioPhase(phase,label){audioPhase.dataset.phase=phase;audioPhaseLabel.textContent=label}
const toneInputs=new Map([['frequency',demoPitch],['amplitude',demoLevel]]);
demoPitch.min='25';demoPitch.max='8000';demoPitch.step='0.01';
const codeContainer=document.createElement('div');
codeContainer.id='bench-code-stack';
demoCode.before(codeContainer);codeContainer.append(demoCode);
const highlightWindow=document.createElement('div');
highlightWindow.id='bench-code-overlay';highlightWindow.setAttribute('aria-hidden','true');
const highlightText=document.createElement('pre');
highlightText.id='bench-code-highlight';highlightWindow.append(highlightText);
codeContainer.prepend(highlightWindow);
const highlightStatus=document.createElement('span');
highlightStatus.id='bench-change-status';highlightStatus.setAttribute('aria-live','polite');
demoBay.querySelector('.demo-code-head').append(highlightStatus);
function syncHighlightMetrics(){
 const computed=getComputedStyle(demoCode);
 for(const property of ['fontSize','fontFamily','fontWeight','lineHeight','letterSpacing','tabSize'])highlightText.style[property]=computed[property];
}
new MutationObserver(syncHighlightMetrics).observe(demoCode,{attributes:true,attributeFilter:['style','class']});
function syncHighlightScroll(){highlightText.style.transform='translate('+(-demoCode.scrollLeft)+'px,'+(-demoCode.scrollTop)+'px)'}
demoCode.addEventListener('scroll',syncHighlightScroll,{passive:true});
function escapeText(value){return String(value).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function highlightChangedLine(previous,next){
 if(previous===next)return escapeText(next);
 let start=0;
 while(start<previous.length&&start<next.length&&previous[start]===next[start])start++;
 let endOld=previous.length,endNew=next.length;
 while(endOld>start&&endNew>start&&previous[endOld-1]===next[endNew-1]){endOld--;endNew--;}
 return escapeText(next.slice(0,start))+'<mark>'+escapeText(next.slice(start,endNew))+'</mark>'+escapeText(next.slice(endNew));
}
// Keep the highlighted edit visible in the editor itself. Measure the rendered
// highlight, not a guessed line number: fonts, zoom and iPhone layout can vary.
let codeRevealFrame=0,linkedControl=null;
function revealChangedCode(){
 const mark=highlightText.querySelector('mark');
 if(!mark)return;
 const editorBounds=demoCode.getBoundingClientRect();
 const markBounds=mark.getBoundingClientRect();
 if(!editorBounds.height||!markBounds.height)return;
 const verticalMargin=Math.min(16,editorBounds.height*0.18);
 const horizontalMargin=Math.min(16,editorBounds.width*0.07);
 const visibleTop=editorBounds.top+verticalMargin;
 const visibleBottom=editorBounds.bottom-verticalMargin;
 const visibleLeft=editorBounds.left+horizontalMargin;
 const visibleRight=editorBounds.right-horizontalMargin;
 let deltaY=0,deltaX=0;
 if(markBounds.top<visibleTop||markBounds.bottom>visibleBottom){
  deltaY=(markBounds.top+markBounds.bottom-editorBounds.top-editorBounds.bottom)/2;
 }
 if(markBounds.left<visibleLeft||markBounds.right>visibleRight){
  deltaX=(markBounds.left+markBounds.right-editorBounds.left-editorBounds.right)/2;
 }
 if(deltaY||deltaX){
  demoCode.scrollTop=Math.max(0,Math.min(demoCode.scrollHeight-demoCode.clientHeight,demoCode.scrollTop+deltaY));
  demoCode.scrollLeft=Math.max(0,Math.min(demoCode.scrollWidth-demoCode.clientWidth,demoCode.scrollLeft+deltaX));
  syncHighlightScroll();
 }
}
function renderCodeOverlay(previous=demoCode.value,changedLabel=''){
 const lines=demoCode.value.split('\n'),before=previous.split('\n');
 const changed=Boolean(changedLabel&&previous!==demoCode.value);
 const linked=linkedControl?controlTextRange(demoCode.value,linkedControl):null;
 let lineOffset=0;
 highlightText.innerHTML=lines.map((line,i)=>{
  const differs=changed&&line!==before[i];
  const start=lineOffset;lineOffset+=line.length+1;
  if(differs)return highlightChangedLine(before[i]??'',line);
  if(linked&&linked.start>=start&&linked.end<=start+line.length){
   const a=linked.start-start,b=linked.end-start;
   return escapeText(line.slice(0,a))+'<mark class="bench-code-link">'+
    escapeText(line.slice(a,b))+'</mark>'+escapeText(line.slice(b));
  }
  return escapeText(line);
 }).join('\n');
 highlightStatus.textContent=changed?'CHANGED · '+changedLabel:
  linkedControl?'LINKED · '+(toneFields?.[linkedControl]?.name||linkedControl):'';
 syncHighlightMetrics();
 syncHighlightScroll();
 // Wait until the textarea has its new scroll dimensions and the rendered
 // highlight has its final geometry. Coalesce rapid touch-drag updates.
 if(codeRevealFrame)cancelAnimationFrame(codeRevealFrame);
 codeRevealFrame=0;
 if((changed||linked)&&highlightText.querySelector('mark')){
  codeRevealFrame=requestAnimationFrame(()=>{
   codeRevealFrame=0;
   revealChangedCode();
  });
 }
}

function readToneSettings(){
 const record={};for(const [key,input]of toneInputs)record[key]=Number(input.value);
 return normalizeToneSettings(record);
}
function setToneSettings(settings){
 const normalized=normalizeToneSettings(settings);
 for(const [key,input]of toneInputs)input.value=String(normalized[key]);
}
function toneDisplay(key,value){
 if(key==='frequency')return Number(value).toFixed(2)+' Hz';
 if(key==='amplitude'||key==='echoMix')return Math.round(Number(value)*100)+'%';
 if(key==='waveform')return toneControls.find(x=>x.key===key).values[Number(value)];
 if(key==='cutoff')return Math.round(Number(value))+' Hz';
 if(key==='detune')return Number(value).toFixed(1)+' ¢';
 if(key==='attack'||key==='release')return Number(value).toFixed(2)+' s';
 if(key==='vibratoHz')return Number(value).toFixed(1)+' Hz';
 if(key==='vibratoDepth')return Number(value).toFixed(2)+' st';
 return Number(value).toFixed(2);
}
const toneFields=Object.fromEntries(toneControls.map(t=>[t.key,t]));
// Each pointer gesture creates one history entry, not a flood of snapshots.
const undoHistory=[],redoHistory=[],historyLimit=60;
let gestureBefore=null,lastEditorText=demoCode.value;
const controlBar=demoReset.parentElement;
const undoButton=document.createElement('button');undoButton.type='button';
undoButton.id='bench-tone-undo';undoButton.textContent='↶ Undo';undoButton.disabled=true;
undoButton.setAttribute('aria-label','Undo the last instrument change');
const redoButton=document.createElement('button');redoButton.type='button';
redoButton.id='bench-tone-redo';redoButton.textContent='↷ Redo';redoButton.disabled=true;
redoButton.setAttribute('aria-label','Redo the last undone instrument change');
controlBar.append(undoButton,redoButton);
function toneSnapshot(){
 const settings={};
 for(const [key,input] of toneInputs)settings[key]=Number(input.value);
 return {settings,code:demoCode.value};
}
function historyChanged(a,b){
 return a.code!==b.code||Object.keys(a.settings).some(key=>a.settings[key]!==b.settings[key]);
}
function historyState(){
 undoButton.disabled=!undoHistory.length;
 redoButton.disabled=!redoHistory.length;
}
function recordUndo(before){
 if(!before||!historyChanged(before,toneSnapshot()))return;
 undoHistory.push(before);
 if(undoHistory.length>historyLimit)undoHistory.shift();
 redoHistory.length=0;
 historyState();
}
function beginGesture(){if(!gestureBefore)gestureBefore=toneSnapshot()}
function commitGesture(){
 const before=gestureBefore;gestureBefore=null;recordUndo(before);
}
function restoreTone(snapshot){
 setToneSettings(snapshot.settings);
 demoCode.value=snapshot.code;
 demoGenerated=demoSynthSource(readToneSettings());
 demoDirty=demoCode.value!==demoGenerated;
 lastEditorText=demoCode.value;
 linkedControl=null;
 updateDemoCode(false);
}
undoButton.addEventListener('click',()=>{
 commitGesture();
 if(!undoHistory.length)return;
 const current=toneSnapshot(),previous=undoHistory.pop();
 redoHistory.push(current);restoreTone(previous);historyState();
 announce('Undid instrument change.');
});
redoButton.addEventListener('click',()=>{
 commitGesture();
 if(!redoHistory.length)return;
 const current=toneSnapshot(),next=redoHistory.pop();
 undoHistory.push(current);restoreTone(next);historyState();
 announce('Redid instrument change.');
});
function selectCodeControl(key){
 if(!toneFields[key])return;
 linkedControl=key;
 renderCodeOverlay(demoCode.value,'');
}
function focusControlFromCode(){
 const key=linkedControlAtCursor(demoCode.value,demoCode.selectionStart);
 if(!key)return;
 selectCodeControl(key);
 toneVisuals?.selectControl(key,{reveal:true});
}
demoCode.addEventListener('click',focusControlFromCode);
demoCode.addEventListener('keyup',event=>{
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))
  focusControlFromCode();
});

for(const control of toneControls){
 if(toneInputs.has(control.key))continue;
 const field=document.createElement('div');field.className='demo-param';
 const label=document.createElement('label');label.htmlFor='bench-param-'+control.key;
 const name=document.createElement('span');name.textContent=control.name;
 const output=document.createElement('output');output.id='bench-output-'+control.key;
 label.append(name,output);field.append(label);
 let input;
 if(control.values){
  input=document.createElement('select');
  for(let i=0;i<control.values.length;i++)input.add(new Option(control.values[i],String(i)));
 }else{
  input=document.createElement('input');input.type='range';input.min=String(control.min);
  input.max=String(control.max);input.step=String(control.step);
 }
 input.id=label.htmlFor;input.value=String(toneDefaults[control.key]);
 field.append(input);demoControls.append(field);toneInputs.set(control.key,input);
}
let toneVisuals=null;
function updateDemoCode(force=false,changedKey=''){
 const previous=demoCode.value;
 demoGenerated=demoSynthSource(readToneSettings());
 for(const [key,input]of toneInputs){
  const output=key==='frequency' ? $('lab-demo-pitch-value') :
   key==='amplitude' ? $('lab-demo-level-value') : $('bench-output-'+key);
  output.textContent=toneDisplay(key,input.value);
 }
 if(force||!demoDirty||demoCode.value===demoGenerated){
  demoCode.value=demoGenerated;demoDirty=false;
 }
 demoBay.dataset.sync=demoControls.dataset.sync=demoDirty?'modified':'matched';
 for(const input of toneInputs.values())input.disabled=demoDirty;
 noteHint.textContent=demoDirty?'Edited code: controls paused':'Tap ♫ for named pitches and tunings.';
 demoSyncLabel.textContent=demoDirty?'CUSTOM CODE · CONTROLS OFF':'CONTROLS MATCH CODE';
 demoReset.textContent=demoDirty?'Restore from controls':'Reset code from controls';
 renderCodeOverlay(previous,changedKey&&toneFields[changedKey]?.name||'');
 lastEditorText=demoCode.value;
 toneVisuals?.render();
}
demoCode.addEventListener('input',()=>{
 const before=toneSnapshot();before.code=lastEditorText;
 recordUndo(before);
 demoDirty=demoCode.value!==demoGenerated;
 updateDemoCode(false,'');
 renderCodeOverlay(demoCode.value,'');
});
for(const [key,input] of toneInputs){
 input.addEventListener('input',()=>{if(!demoDirty)updateDemoCode(false,key)});
 input.addEventListener('change',()=>{
  if(!demoDirty&&hasPlayedTone&&serverReady&&definitionsReady)void playVisibleTone(toneFields[key].name.toLowerCase());
 });
}
demoReset.addEventListener('click',()=>{
 if(demoDirty&&!confirm('Replace your custom SuperCollider code with the instrument controls?'))return;
 const before=toneSnapshot();updateDemoCode(true);recordUndo(before);
});
function buildNoteDrawer(){
 const shell=document.createElement('div');shell.id='bench-notes-shell';shell.className='bench-notes-closed';
 const toggle=document.createElement('button');toggle.type='button';toggle.id='bench-notes-toggle';
 toggle.textContent='♫';toggle.setAttribute('aria-label','Open musical notes and frequencies');
 toggle.setAttribute('title','Musical notes and frequencies');
 toggle.setAttribute('aria-expanded','false');
 toggle.setAttribute('aria-controls','bench-notes-drawer');
 const drawer=document.createElement('aside');drawer.id='bench-notes-drawer';
 drawer.setAttribute('aria-label','Frequency and tuning browser');
 drawer.setAttribute('aria-hidden','true');drawer.inert=true;
 const heading=document.createElement('div');heading.id='bench-notes-heading';
 const title=document.createElement('strong');title.textContent='FREQUENCIES';
 heading.append(title);
 const tuneLabel=document.createElement('label');tuneLabel.textContent='TUNING / PITCH SYSTEM';
 const select=document.createElement('select');select.id='bench-tuning';
 for(const t of tuningOptions)select.add(new Option(t.label,t.value));
 tuneLabel.append(select);
 const info=document.createElement('p');info.id='bench-tuning-note';
 const list=document.createElement('div');list.id='bench-frequency-list';list.setAttribute('role','group');list.setAttribute('aria-label','Select a musical frequency');
 drawer.append(heading,tuneLabel,info,list);
 shell.append(toggle,drawer);document.body.append(shell);
 // The first view may already be Sample or Library before this module loads.
 shell.hidden=location.hash.slice(1)!=='play';
 const panelWidth=()=>drawer.getBoundingClientRect().width||210;
 let open=false,drag=null,suppressClickUntil=0;
 function position(){
  const rect=demoBay.getBoundingClientRect();
  // The handle is aligned with the code bay, not the centre of the screen.
  const top=Math.max(48,Math.round(rect.top+4));
  shell.style.top=top+'px';
  // Keep the drawer a manageable height; its notes scroll internally.
  shell.style.height=Math.max(125,Math.min(440,window.innerHeight-top-12))+'px';
 }
 function show(next){
  open=Boolean(next);
  shell.style.transition='';shell.style.transform='';
  shell.classList.toggle('bench-notes-open',open);
  shell.classList.toggle('bench-notes-closed',!open);
  toggle.setAttribute('aria-expanded',String(open));
  toggle.setAttribute('aria-label',(open?'Close':'Open')+' musical notes and frequencies');
  drawer.setAttribute('aria-hidden',String(!open));drawer.inert=!open;
  if(open){position();render()}
 }
 toggle.addEventListener('click',()=>{
  if(performance.now()<suppressClickUntil)return;
  show(!open);
 });
 toggle.addEventListener('pointerdown',event=>{
  if(event.pointerType==='mouse'&&event.button!==0)return;
  drag={id:event.pointerId,x:event.clientX,startOpen:open,moved:false};
  try{toggle.setPointerCapture(event.pointerId)}catch{}
 });
 toggle.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.id)return;
  const distance=event.clientX-drag.x;
  if(!drag.moved&&Math.abs(distance)<7)return;
  drag.moved=true;
  event.preventDefault();
  const width=panelWidth();
  const displaced=Math.max(0,Math.min(width,(drag.startOpen?0:width)+distance));
  shell.style.transition='none';
  shell.style.transform='translateX('+displaced+'px)';
 });
 toggle.addEventListener('pointerup',event=>{
  if(!drag||event.pointerId!==drag.id)return;
  const last=drag;drag=null;
  if(last.moved){
   // Left pulls open; right pushes closed. The same handle always works.
   const delta=event.clientX-last.x;
   suppressClickUntil=performance.now()+450;
   if(Math.abs(delta)>25)show(delta<0);
   else show(last.startOpen);
  }
  try{if(toggle.hasPointerCapture(event.pointerId))toggle.releasePointerCapture(event.pointerId)}catch{}
 });
 toggle.addEventListener('pointercancel',()=>{
  if(drag){const wasOpen=drag.startOpen;drag=null;show(wasOpen)}
 });
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&open)show(false)});
 window.addEventListener('bench-view-changed',event=>{
  const visible=event.detail.view==='play';
  if(!visible)show(false);
  shell.hidden=!visible;
  if(visible)requestAnimationFrame(position);
 });
 window.addEventListener('resize',position,{passive:true});
 window.visualViewport?.addEventListener('resize',position,{passive:true});
 requestAnimationFrame(position);
 function render(){
  currentTuning=select.value;
  const option=tuningOptions.find(t=>t.value===currentTuning);info.textContent=option.info;
  try{localStorage.setItem('supercollision-sounds-tuning-v1',currentTuning)}catch{}
  const notes=notesForTuning(currentTuning);
  const fragment=document.createDocumentFragment();
  for(const note of notes){
   const button=document.createElement('button');button.type='button';button.className='bench-frequency-item';
   const name=document.createElement('span');name.textContent=note.label;
   const hz=document.createElement('span');hz.textContent=note.frequency.toFixed(2)+' Hz';
   if(note.detail){const caption=document.createElement('small');caption.textContent=note.detail;name.append(caption)}
   button.append(name,hz);
   if(Math.abs(Number(demoPitch.value)-note.frequency)<0.015)button.classList.add('selected');
   button.addEventListener('click',()=>{
    if(demoDirty){announce('Code has been edited. Use Restore from controls before choosing a note.');return;}
    beginGesture();demoPitch.value=String(note.frequency);updateDemoCode(false,'frequency');commitGesture();
    show(false);
    if(serverReady&&definitionsReady)void playVisibleTone(note.label);
    else announce(note.label+' selected at '+note.frequency.toFixed(2)+' Hz. Start SuperCollider to play it.');
   });
   fragment.append(button);
  }
  list.replaceChildren(fragment);
 }
 try{const saved=localStorage.getItem('supercollision-sounds-tuning-v1');if(tuningOptions.some(t=>t.value===saved))select.value=saved}catch{}
 select.addEventListener('change',render);render();
 window.benchSetTuning=tuning=>{if(tuningOptions.some(t=>t.value===tuning)){select.value=tuning;render()}};
}
buildNoteDrawer();
toneVisuals=installToneVisuals({
 container:demoControls,inputs:toneInputs,controls:toneControls,isLocked:()=>demoDirty,
 onSelect:key=>selectCodeControl(key),onBegin:beginGesture,onCommit:commitGesture
});
updateDemoCode();
window.addEventListener('bench-open-source',event=>{
 const item=event.detail||{},code=item.code,name=item.name;
 if(typeof code!=='string'||!code.trim()||code.length>150000)return;
 if(demoDirty&&demoCode.value!==code&&!confirm('Replace unsaved edits in Play/Code? The current custom code will not be saved automatically.'))return;
 const previous=demoCode.value,before=toneSnapshot();
 try{
  if(item.bench?.kind==='tone'){
   const settings={frequency:item.bench.frequency,amplitude:item.bench.amplitude,...(item.bench.toneSettings||{})};
   setToneSettings(settings);updateDemoCode(true);
   if(item.bench.tuning)window.benchSetTuning?.(item.bench.tuning);
  }
  demoCode.value=code;
  demoDirty=demoCode.value!==demoGenerated;
  updateDemoCode();
  if(typeof name==='string')toneName.value=name.slice(0,120);
  renderCodeOverlay(previous,'OPENED SOURCE');
  recordUndo(before);
  event.detail.opened=true;
  toneSaveStatus.textContent='Editable source opened from Library. It has not been executed.';
  announce('Loaded '+(name||'instrument')+' for review without playing it.');
 }catch(error){announce('Could not open source: '+error.message)}
});
toneSave.addEventListener('click',async()=>{
 const name=toneName.value.trim().slice(0,120),source=demoCode.value;
 if(!name){toneSaveStatus.textContent='Enter a name to save this instrument.';toneName.focus();return}
 if(!source.trim()){toneSaveStatus.textContent='There is no SuperCollider code to save.';return}
 if(source.length>150000){toneSaveStatus.textContent='SuperCollider code exceeds the 150,000-character library limit.';return}
 toneSave.disabled=true;toneLibraryLink.hidden=true;toneSaveStatus.textContent='Saving instrument locally…';
 try{
  await saveSound({
   id:crypto.randomUUID(),name,source:'written',created:Date.now(),favorite:false,code:source,
   bench:{kind:'tone',frequency:Number(demoPitch.value),amplitude:Number(demoLevel.value),toneSettings:readToneSettings(),tuning:currentTuning}
  });
  toneSaveStatus.textContent='Saved '+name+' to your Sounds Library. Original and edited code are preserved exactly.';
  toneLibraryLink.hidden=false;
 }catch(error){toneSaveStatus.textContent='Could not save instrument: '+error.message}
 finally{toneSave.disabled=false}
});
const waveformCanvas=$('lab-waveform');
const sourceView=$('lab-live-source'),copySource=$('lab-copy-source');
const resetSource=$('lab-reset-source'),sourceState=$('lab-source-state');
const sourceBay=$('lab-source-bay'),syncLabel=$('lab-sync-label'),regionControls=$('lab-region-controls');
const applyControl=$('lab-apply-control'),keepCode=$('lab-keep-code');
let sourceDirty=false,pendingControl=false,generatedSource='';
function syncMode(mode,label){
 sourceBay.dataset.sync=mode;regionControls.dataset.sync=mode;syncLabel.textContent=label;
}
function syncPresetActions(){
 const disabled=!current||!currentItemId||!!controller||sourceDirty;
 savePreset.disabled=exportPreset.disabled=disabled;
 const title=sourceDirty?'Custom live code is not included in structured presets. Copy your code or reset to matching controls before saving.':'';
 savePreset.title=exportPreset.title=title;
}
function updateSourceBay(force=false){
 if(!current||!currentItemId){
  sourceView.value='Select and transfer a recording to reveal executable SuperCollider source.';
  sourceView.readOnly=true;copySource.disabled=true;resetSource.disabled=true;
  sourceDirty=false;pendingControl=false;generatedSource='';
  applyControl.hidden=true;keepCode.hidden=true;
  syncMode('unavailable','NO SOURCE');
  sourceState.textContent='Load a sample to edit its synthesis code.';
  syncPresetActions();return;
 }
 try{
  generatedSource=regionLiveSource(regionSettings());
  if(force||!sourceDirty||sourceView.value===generatedSource){
   if(sourceView.value!==generatedSource)sourceView.value=generatedSource;
   sourceDirty=false;pendingControl=false;
   applyControl.hidden=true;keepCode.hidden=true;
   syncMode('matched','CONTROLS MATCH CODE');
   sourceState.textContent='The complete native SynthDef and Play command match the controls. Tap the code to edit.';
  }else if(pendingControl){
   syncMode('pending','CODE OVERRIDE · CONTROL CHANGE PENDING');
   applyControl.hidden=false;keepCode.hidden=false;
   sourceState.textContent='Manual edits are preserved. Apply the control change to regenerate the code, or keep your edits.';
  }else{
   syncMode('modified','CODE OVERRIDE · CONTROLS NOT SYNCHRONIZED');
   sourceState.textContent='Edited code runs on Play; dimmed controls are not synchronized. Copy your custom code before resetting. Saving preset and desktop export require matching controls.';
  }
  sourceView.readOnly=false;copySource.disabled=false;resetSource.disabled=false;
 }catch(error){sourceState.textContent='Native source unavailable: '+error.message;sourceView.readOnly=true;copySource.disabled=true}
 syncPresetActions();
}
sourceView.addEventListener('input',()=>{
 if(sourceView.readOnly)return;
 sourceDirty=sourceView.value!==generatedSource;
 pendingControl=false;applyControl.hidden=true;keepCode.hidden=true;
 updateSourceBay();
});
resetSource.addEventListener('click',()=>{
 if(sourceDirty&&!confirm('Replace your edited SuperCollider code with the current graphical control settings?'))return;
 updateSourceBay(true);
});
applyControl.addEventListener('click',()=>updateSourceBay(true));
keepCode.addEventListener('click',()=>{
 pendingControl=false;applyControl.hidden=true;keepCode.hidden=true;updateSourceBay();
});
copySource?.addEventListener('click',async()=>{
 if(copySource.disabled)return;
 try{await navigator.clipboard.writeText(sourceView.value);copySource.textContent='Copied';setTimeout(()=>copySource.textContent='Copy',1300)}
 catch{sourceState.textContent='Clipboard unavailable. Select the code to copy.'}
});

const presetName=$('lab-preset-name'),savePreset=$('lab-save-preset'),exportPreset=$('lab-export-preset');
let pendingPresetId=new URL(location.href).searchParams.get('preset');
let pendingSoundId=new URL(location.href).searchParams.get('sound');
let queuedPresetLoadId=null,linkedPreset=null;
let waveform=null,waveformAnchor=null;
const BUFFER=700;
const READY='__SC_SOUNDS_LAB_READY__',FAILED='__SC_SOUNDS_LAB_FAILED__',DEFS='__SC_SOUNDS_LAB_DEFS__',RATE='__SC_SOUNDS_LAB_RATE__:';
const DEFINITION_SOURCE=REGION_DEFINITIONS;
let lang=null,synth=null,transport=null,languageReady=false,serverReady=false,definitionsReady=false;
let bootRequested=false,booting=false,bootTimeout=null,definitionTimeout=null,installingDefinitions=false,current=null,currentItemId=null,controller=null,entries=[],allocated=false;
let requestedSampleId=null;
let synthBootPending=false,synthBootCompleted=false,serverSampleRate=null,nativeAudioContext=null;
function sampleActivity(message,loading,kind=loading?'loading':'info'){
 window.dispatchEvent(new CustomEvent('bench-sample-activity',{detail:{message,loading,kind}}));
}
function announce(t){status.textContent=t;if(requestedSampleId&&(/failed|unavailable|requires|error|timed out|blocked/i).test(t)){requestedSampleId=null;sampleActivity(t,false,'error');}const hint=$('lab-setup-hint');if(hint&&(/failed|unavailable|requires|error|timed out/i).test(t))hint.textContent='If this persists, open Technical details and troubleshooting at the bottom of the page.'}
function print(t){log.textContent=(log.textContent+String(t)+'\n').slice(-10000);log.scrollTop=log.scrollHeight}
/* The compiled scsynth getter can return a numerical handle instead of the
 * actual Web Audio context. Observe its own context constructor, never create
 * an alternative playback engine. Restrict the hook to this isolated page. */
function observeNativeAudioContext(){
 const name=window.AudioContext?'AudioContext':window.webkitAudioContext?'webkitAudioContext':null;
 if(!name)return;
 const Original=window[name];
 try{
  window[name]=new Proxy(Original,{construct(target,args){
   const context=Reflect.construct(target,args);
   nativeAudioContext=context;
   try{window[name]=Original}catch{}
   return context;
  }});
 }catch(error){print('Native context observation unavailable: '+error.message)}
}
function outputContext(){
 const candidate=synth?.getAudioContext?.();
 return typeof candidate?.resume==='function'?candidate:nativeAudioContext;
}
function outputSampleRate(){
 const sampleRate=outputContext()?.sampleRate||serverSampleRate;
 if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000)
  throw Error('Native SuperCollider output sample rate is unavailable; cannot safely decode audio.');
 if(serverSampleRate&&Math.abs(sampleRate-serverSampleRate)>1)
  throw Error('Native SuperCollider server and audio output sample rates differ.');
 return Math.round(sampleRate);
}
function refreshControls(){
 const hint=$('lab-setup-hint');
 if(hint){hint.textContent=!serverReady?'First startup loads native SuperCollider. After it starts, tap Play tone to hear the code above.':!definitionsReady?'SuperCollider is preparing its instruments…':'Play tone runs the visible SuperCollider source. To work with a recording, select one below.';}
 if(!serverReady&&!booting&&!lang)engine.textContent='Start SuperCollider';
 engine.disabled=booting||bootRequested||installingDefinitions||Boolean(lang&&!languageReady);
 if(!serverReady&&lang&&languageReady&&!bootRequested)engine.textContent='Retry server startup';
 if(serverReady&&definitionsReady)engine.textContent='Play tone';
 if(noteHint)noteHint.textContent=demoDirty?'Edited code: controls paused':'Open NOTES to choose frequencies';
 sound.disabled=!!controller;
 load.disabled=!serverReady||!definitionsReady||!sound.value||!!controller;
 play.disabled=!current||!definitionsReady||!!controller;
 stop.disabled=!serverReady;
 const toneStop=$('lab-tone-stop');if(toneStop)toneStop.disabled=!lang||!serverReady;
 cancel.disabled=!controller;
 progress.hidden=!controller;
 updateSourceBay();
}

function renderWaveform(){
 const canvas=waveformCanvas;
 if(!canvas)return;
 const width=Math.max(1,Math.round(canvas.clientWidth||320)),height=116;
 const ratio=Math.min(2,window.devicePixelRatio||1);
 canvas.width=Math.round(width*ratio);
 canvas.height=Math.round(height*ratio);
 const ctx=canvas.getContext('2d');
 if(!ctx)return;
 ctx.scale(ratio,ratio);
 ctx.fillStyle='#141b16';ctx.fillRect(0,0,width,height);
 if(!waveform){
  ctx.fillStyle='#b7b9ad';ctx.font='12px system-ui';
  ctx.fillText('Transfer a saved sound to see its waveform',12,56);
  return;
 }
 const start=Number(regionStart.value)/100,finish=Number(regionFinish.value)/100;
 ctx.fillStyle='rgba(216,174,91,0.14)';
 ctx.fillRect(width*start,0,width*(finish-start),height);
 const middle=height/2,scale=height*0.45;
 for(let x=0;x<width;x++){
  const [low,high]=waveform[Math.min(waveform.length-1,Math.floor(x*waveform.length/width))];
  ctx.fillStyle=x/width>=start&&x/width<=finish?'#e5bc71':'#78897d';
  const top=middle-high*scale,bottom=middle-low*scale;
  ctx.fillRect(x,top,1,Math.max(1,bottom-top));
 }
 for(const edge of [start,finish]){
  ctx.fillStyle='#ffe4a1';ctx.fillRect(Math.min(width-2,width*edge),0,2,height);
 }
}
function waveformPoint(event){
 const box=waveformCanvas.getBoundingClientRect();
 return Math.max(0,Math.min(1,(event.clientX-box.left)/Math.max(1,box.width)));
}
waveformCanvas.addEventListener('pointerdown',event=>{
 if(!waveform||!current||event.button!==0)return;
 waveformAnchor=waveformPoint(event);
 waveformCanvas.setPointerCapture(event.pointerId);
});
waveformCanvas.addEventListener('pointermove',event=>{
 if(waveformAnchor===null||!waveform)return;
 const point=waveformPoint(event);
 if(Math.abs(point-waveformAnchor)<0.01)return;
 const region=waveformDragRegion(waveformAnchor,point);
 regionStart.value=region.start;regionFinish.value=region.finish;
 updateRegionControls('waveform');
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])
 waveformCanvas.addEventListener(type,()=>{waveformAnchor=null});
window.addEventListener('resize',renderWaveform);
function updateRegionControls(changed){
 let start=Number(regionStart.value),finish=Number(regionFinish.value);
 if(changed==='start'&&finish-start<0.99999){finish=Math.min(100,Number((start+1).toFixed(1)));regionFinish.value=finish}
 if(changed==='finish'&&finish-start<0.99999){start=Math.max(0,Number((finish-1).toFixed(1)));regionStart.value=start}
 const seconds=current?current.frames/current.sampleRate:0;
 regionSummary.textContent='Region: '+start+'% to '+finish+'%'+(seconds?' ('+(seconds*start/100).toFixed(2)+'–'+(seconds*finish/100).toFixed(2)+' s)':'')+' · '+Number(regionRate.value).toFixed(2)+'× · Volume '+Math.round(Number(regionAmp.value)*100)+'% · '+(regionLoop.checked?'Loop':'One shot');
 renderWaveform();
 if(changed&&sourceDirty)pendingControl=true;
 updateSourceBay(Boolean(changed)&&!sourceDirty);
}
for(const [input,dimension] of [[regionStart,'start'],[regionFinish,'finish'],[regionRate,'rate'],[regionAmp,'amp'],[regionLoop,'loop']]){
 input.addEventListener('input',()=>updateRegionControls(dimension));
 input.addEventListener('change',()=>updateRegionControls(dimension));
}
updateRegionControls();
function showSoundDetails(){
 const item=entries.find(entry=>entry.id===sound.value);
 details.textContent=item?('Source: '+item.source+' · '+(item.origin?.creator||'local recording')+' · '+(item.origin?.license||'personal or unknown license')):'';
}
function regionSettings(){
 if(!current||!currentItemId||!entries.some(item=>item.id===currentItemId))
  throw Error('Load and verify the original audio in SuperCollider first.');
 return validateRegion({bufferId:BUFFER,channels:current.channels,start:Number(regionStart.value)/100,
  finish:Number(regionFinish.value)/100,rate:Number(regionRate.value),amp:Number(regionAmp.value),loop:regionLoop.checked,
  sourceSampleRate:current.sampleRate});
}
function originalSound(){
 const item=entries.find(entry=>entry.id===currentItemId);
 if(!item)throw Error('Original audio no longer exists in the library.');
 return item;
}
function exportedSource(settings,item){
 return sampleInstrumentSource(settings,{name:item.name,origin:item.origin});
}
function maybeLoadLinkedPreset(){
 if(!queuedPresetLoadId||!serverReady||!definitionsReady||controller||current)return;
 if(sound.value!==queuedPresetLoadId){queuedPresetLoadId=null;linkedPreset=null;return}
 if(outputContext()?.state!=='running'){
  announce('Preset selected. Tap Unlock audio, then the linked original will transfer to SuperCollider.');
  return;
 }
 queuedPresetLoadId=null;
 announce('Transferring the preset’s linked original into native SuperCollider…');
 load.click();
}
window.addEventListener('bench-select-sample',event=>{
 const id=event.detail?.id;
 if(typeof id==='string'&&id.length<250){
  pendingSoundId=id;
  void listSounds();
 }
});
async function listSounds(){
 try{
  const previousId=sound.value;
  const catalog=await allSounds();
  if(pendingToneId){
   const requested=pendingToneId;pendingToneId=null;
   const item=catalog.find(entry=>entry.id===requested&&entry.bench?.kind==='tone'&&typeof entry.code==='string');
   if(item){
    try{
     const frequency=item.bench.frequency,amplitude=item.bench.amplitude;
     // Validate saved settings before touching the controls. Never automatically execute saved code.
     demoSynthSource({frequency,amplitude,...(item.bench.toneSettings||{})});
     setToneSettings({frequency,amplitude,...(item.bench.toneSettings||{})});
     if(item.bench.tuning)window.benchSetTuning?.(item.bench.tuning);
     updateDemoCode(true);
     demoCode.value=item.code;demoDirty=demoCode.value!==demoGenerated;updateDemoCode();
     toneName.value=item.name;
     toneSaveStatus.textContent='Opened from Library. Edit, play or save a new variation.';
     announce('Loaded '+item.name+' into the synthesizer without playing it.');
    }catch(error){announce('Saved instrument is invalid: '+error.message)}
   }else announce('Saved synthesizer instrument not found in this library.');
  }

  entries=catalog.filter(item=>item.blob instanceof Blob).sort((a,b)=>Number(b.created||0)-Number(a.created||0));
  sound.replaceChildren(new Option('Choose a recorded or imported sound…',''));
  for(const item of entries){
   const bytes=item.blob.size,size=bytes<1024?bytes+' B':bytes<1048576?(bytes/1024).toFixed(1)+' KB':(bytes/1048576).toFixed(1)+' MB';
   sound.add(new Option((item.name||'Untitled')+' · '+size,item.id));
  }
  if(pendingSoundId){
   const id=pendingSoundId;pendingSoundId=null;
   if(!pendingPresetId&&entries.some(item=>item.id===id)){
    sound.value=id;
    sound.dispatchEvent(new Event('change',{bubbles:true}));
    const selected=entries.find(entry=>entry.id===id);
    const origin=selected?.source==='recorded'?'Your microphone recording':
     selected?.source==='imported'?'Imported recording':
     selected?.source==='librivox'?'LibriVox recording':'Saved original audio';
    sampleActivity(origin+' selected. Listen to the original, then tap MAKE INSTRUMENT.',false);
   }else if(!entries.some(item=>item.id===id))announce('The selected audio sample is not in the local Sounds library.');
  }else if(entries.some(item=>item.id===previousId))sound.value=previousId;
  updateOriginalPreview();
  if(currentItemId&&!entries.some(item=>item.id===currentItemId)){current=null;currentItemId=null;waveform=null;renderWaveform();progress.value=0}
  if(pendingPresetId){
   const preset=catalog.find(item=>item.id===pendingPresetId&&item.source==='preset'&&item.preset);
   pendingPresetId=null;
   const target=preset&&entries.find(item=>item.id===preset.preset.soundId);
   if(target){
    try{
     const p=preset.preset;
     const settings=validateRegion({bufferId:BUFFER,channels:p.channels,start:p.start,finish:p.finish,
      rate:p.rate,amp:p.amp,loop:p.loop});
     sound.value=target.id;
     regionStart.value=String(Number((settings.start*100).toFixed(1)));
     regionFinish.value=String(Number((settings.finish*100).toFixed(1)));
     regionRate.value=settings.rate;
     regionAmp.value=settings.amp;
     regionLoop.checked=settings.loop;
     presetName.value=(preset.name||'').slice(0,120);
     linkedPreset={soundId:target.id,channels:settings.channels};
     queuedPresetLoadId=target.id;
     updateRegionControls();
     announce('Preset selected: '+preset.name+'. Start SuperCollider; its original will transfer after audio unlock.');
    }catch(error){
     sound.value='';linkedPreset=null;queuedPresetLoadId=null;
     announce('Preset invalid: '+error.message+'. No source was selected.');
    }
   }else{
    sound.value='';linkedPreset=null;queuedPresetLoadId=null;
    announce('Preset unavailable: its original audio may have been deleted. No substitute recording was chosen.');
   }
  }
  if(linkedPreset&&!entries.some(item=>item.id===linkedPreset.soundId)){
   queuedPresetLoadId=null;linkedPreset=null;
   announce('Preset source has been removed. Native sample playback is unavailable.');
  }
  showSoundDetails();
  if(!entries.length)details.textContent='No recordings yet. Play the built-in tone above, or return to Sounds to record, import or discover audio.';
 }catch(error){announce('Local sound library unavailable: '+error.message)}
 refreshControls();
 maybeLoadLinkedPreset();
}
function requestServer(){
 if(!lang||!languageReady||bootRequested||serverReady)return;
 bootRequested=true;engine.disabled=true;engine.textContent='Starting audio…';setAudioPhase('starting','STARTING NATIVE AUDIO ENGINE');announce('Starting the SuperCollider audio server…');
 bootTimeout=setTimeout(()=>{if(!serverReady){bootRequested=false;engine.textContent='Retry server startup';print('Startup timed out; native synthesis boot: '+(synthBootPending?'pending':synthBootCompleted?'complete':'not begun')+'; context: '+(synth?.getAudioContext?.()?.state||'unavailable'));announce('Native server startup timed out. Tap Retry to try again.');setAudioPhase('error','ENGINE STARTUP TIMED OUT');refreshControls();engine.disabled=false;}},50000);
 try{lang.runCode('s.waitForBoot({ "'+READY+'".postln; }, onFailure: { "'+FAILED+'".postln; }, clock: SystemClock);')}
 catch(error){bootRequested=false;clearTimeout(bootTimeout);announce('Server request failed: '+error.message);setAudioPhase('error','SERVER STARTUP FAILED');engine.disabled=false}
}
function installDefinitions(){
 if(installingDefinitions||definitionsReady)return;
 installingDefinitions=true;engine.disabled=true;engine.textContent='Preparing instruments…';
 setAudioPhase('starting','PREPARING NATIVE INSTRUMENTS');
 announce('SuperCollider started. Preparing its native instruments…');
 definitionTimeout=setTimeout(()=>{
  if(!definitionsReady){
   installingDefinitions=false;setAudioPhase('error','INSTRUMENT SETUP TIMED OUT');
   announce('SuperCollider started, but instrument setup stalled. Tap Retry instruments.');
   engine.textContent='Retry instruments';refreshControls();
  }
 },25000);
 try{lang.runCode('("'+RATE+'" ++ s.sampleRate).postln;');lang.runCode(DEFINITION_SOURCE)}
 catch(error){
  clearTimeout(definitionTimeout);installingDefinitions=false;
  setAudioPhase('error','INSTRUMENT SETUP FAILED');
  announce('Could not prepare SuperCollider instruments: '+error.message);
  engine.textContent='Retry instruments';refreshControls();
 }
}
async function playVisibleTone(label='tone'){
 try{
  if(!synth||!serverReady||!definitionsReady)throw Error('SuperCollider is still starting. Wait for the green READY lamp.');
  const context=outputContext();
  if(typeof context?.resume!=='function')throw Error('Native SuperCollider audio output is unavailable. Open Technical details below.');
  await context.resume();
  if(context.state!=='running')throw Error('Audio output is '+context.state+'. Check your browser audio permissions.');
  print('SuperCollider audio unlocked ('+context.state+').');
  const code=demoCode.value.trim();
  if(!code)throw Error('The visible SuperCollider code is empty.');
  lastPlayedLabel=demoDirty?'edited code':label;
  lang.runCode(code);
  hasPlayedTone=true;
  setAudioPhase('ready','RUNNING '+lastPlayedLabel.toUpperCase());
  announce('Sent '+lastPlayedLabel+' to native SuperCollider. If silent, check your phone volume.');
  maybeLoadLinkedPreset();
 }catch(error){
  setAudioPhase('error','PLAYBACK NEEDS ATTENTION');
  announce('Could not play '+label+': '+error.message);
  print('Tone playback: '+error.message);
 }
}
function loadRequestedSample(){
 if(!requestedSampleId||!serverReady||!definitionsReady||controller)return false;
 const id=requestedSampleId;
 if(!sound.value||sound.value!==id){requestedSampleId=null;return false;}
 if(!entries.some(item=>item.id===id)){
  requestedSampleId=null;
  sampleActivity('That recording is no longer available. Choose another.',false);
  return false;
 }
 requestedSampleId=null;
 sampleActivity('Loading selected recording into SuperCollider…',true);
 load.click();
 return true;
}
window.addEventListener('bench-make-instrument',()=>{
 if(!sound.value){
  sound.focus();
  sampleActivity('Choose a recording, then tap MAKE INSTRUMENT.',false);
  return;
 }
 if(current&&currentItemId===sound.value){
  sampleActivity('Sample instrument ready. Shape the waveform and play it below.',false);
  return;
 }
 if(controller){sampleActivity('The recording is already being loaded.',true);return;}
 originalPreview.pause();
 requestedSampleId=sound.value;
 if(loadRequestedSample())return;
 sampleActivity('Starting SuperCollider. The selected recording will load when its engine is ready.',true);
 if(!engine.disabled)engine.click();
});
// Stop code, routines and scheduled native synth events, as on the main Code
// page. The local original-audio player is paused without touching its file.
window.addEventListener('bench-stop-all-audio',()=>{
 originalPreview.pause();
 if(!lang||!serverReady){
  announce('SuperCollider is not running. Original audio playback is paused.');
  return;
 }
 const errors=[];
 try{lang.runCode('CmdPeriod.run;')}catch(error){errors.push('language: '+error.message)}
 if(synth){
  try{synth.sendOsc(oscMessage('/clearSched'))}catch(error){errors.push('schedule: '+error.message)}
  try{synth.sendOsc(oscMessage('/g_freeAll',[{type:'i',value:0}]))}
  catch(error){errors.push('nodes: '+error.message)}
 }
 if(errors.length){
  setAudioPhase('error','STOP NEEDS ATTENTION');
  announce('Stop requested, but '+errors.join('; '));
 }else{
  setAudioPhase('ready','STOPPED · ENGINE READY');
  announce('Stopped native SuperCollider playback. The engine remains ready.');
 }
});
engine.addEventListener('click',async()=>{
 if(synth&&serverReady){if(!definitionsReady){installDefinitions();return}await playVisibleTone('tone');return}
 if(lang){if(languageReady&&!bootRequested){requestServer();return}announce('SuperCollider initialization is already in progress.');return}
 if(booting){announce('SuperCollider initialization is already in progress.');return}
 if(!crossOriginIsolated){setAudioPhase('error','AUDIO ENGINE BLOCKED');announce('This page lacks the isolation headers needed for native SuperCollider. Open Technical details below.');return}
 booting=true;engine.disabled=true;engine.textContent='Loading audio…';setAudioPhase('starting','LOADING SUPERCOLLIDER');announce('Loading native SuperCollider language and synthesis modules…');
 try{
  observeNativeAudioContext();
  const base=new URL('./runtime/',location.href);
  const [{default:ScLang},{default:ScSynth}]=await Promise.all([
   import('./runtime/sclang/sclang.js'),import('./runtime/scsynth/scsynth.js')
  ]);
  lang=await ScLang({locateFile:p=>new URL(p,new URL('sclang/',base)).href});
  synth=await ScSynth({locateFile:p=>new URL(p,new URL('scsynth/',base)).href});
  transport=new NativeBufferTransport(packet=>synth.sendOsc(packet));
  lang.printCallback=t=>{
   const text=String(t);
   if(text.includes('Welcome to SuperCollider')&&!languageReady){
    languageReady=true;setTimeout(requestServer,1000);
   }
   if(text.includes(READY)&&!serverReady){
    clearTimeout(bootTimeout);serverReady=true;bootRequested=false;installDefinitions();
   }
   const sampleRateMatch=text.match(/__SC_SOUNDS_LAB_RATE__:(\d+(?:\.\d+)?)/);
   if(sampleRateMatch){serverSampleRate=Number(sampleRateMatch[1]);print('Native SuperCollider server sample rate: '+serverSampleRate+' Hz.');}
   if(text.includes(DEFS)){clearTimeout(definitionTimeout);installingDefinitions=false;definitionsReady=true;engine.textContent='Play tone';setAudioPhase('ready','READY · PLAY TONE OR CHOOSE FREQUENCY');announce('SuperCollider ready. Play tone or open the frequency browser.');refreshControls();maybeLoadLinkedPreset();loadRequestedSample()}
   if(text.includes(DEMO_MARKER)&&!controller){setAudioPhase('played','SUPERCOLLIDER EXECUTED '+lastPlayedLabel.toUpperCase());announce('Native SuperCollider executed '+lastPlayedLabel+'. If silent, check phone volume and audio route.');}
   if(/ERROR:\s|FAILURE IN SERVER/.test(text)){setAudioPhase('error','SUPERCOLLIDER REPORTED AN ERROR');announce('SuperCollider reported an error. Open Technical details below for the message.');}
   if(text.includes(FAILED)){clearTimeout(bootTimeout);bootRequested=false;engine.textContent='Retry server startup';setAudioPhase('error','ENGINE STARTUP FAILED');announce('SuperCollider server failed to start. Tap Retry to try again.');refreshControls()}
   const cleaned=text.replaceAll(READY,'').replaceAll(FAILED,'').replaceAll(DEFS,'').trim();
   if(cleaned)print(cleaned);
  };
  synth.onStdout=print;
  lang.onOsc=bytes=>synth.sendOsc(bytes);
  synth.onOscReply=bytes=>{transport.receive(bytes);lang.sendOsc(bytes)};
  window.bootServer=options=>{
   if(!options?.numOutputBusChannels||synthBootPending||synthBootCompleted)return;
   synthBootPending=true;
   setTimeout(async()=>{
    try{await synth.boot(options);synthBootCompleted=true;print('SuperCollider synthesis engine initialized.')}
    catch(error){bootRequested=false;engine.textContent='Retry server startup';announce('Native server boot failed: '+error.message)}
    finally{synthBootPending=false}
   },100);
  };
  lang.bootInterpreter();
  announce('SuperCollider language started. Waiting for its server.');
 }catch(error){setAudioPhase('error','ENGINE STARTUP FAILED');announce('SuperCollider startup failed: '+error.message);print(error.stack||error.message)}
 finally{booting=false;engine.disabled=false;refreshControls()}
});
sound.addEventListener('change',()=>{
 requestedSampleId=null;
 if(sourceDirty&&!confirm('Switch recordings and discard the edited SuperCollider code?')){
  sound.value=currentItemId||'';return;
 }
 queuedPresetLoadId=null;linkedPreset=null;
 updateOriginalPreview();
 if(current&&lang){try{lang.runCode(stopRegionCommand)}catch{}}
 current=null;currentItemId=null;waveform=null;progress.value=0;regionStart.value=0;regionFinish.value=100;updateRegionControls();
 showSoundDetails();
 refreshControls();
});
load.addEventListener('click',async()=>{
 const item=entries.find(entry=>entry.id===sound.value);
 if(!item||!serverReady||!definitionsReady||controller)return;
 if(sourceDirty&&!confirm('Retransferring audio will replace your edited SuperCollider code. Continue?'))return;
 controller=new AbortController();current=null;currentItemId=null;waveform=null;renderWaveform();progress.value=0;refreshControls();
 sampleActivity('Decoding and transferring recording into SuperCollider…',true);
 try{
  if(item.blob.size>50*1024*1024)throw Error('Choose an audio file under 50 MB for this laboratory.');
  const context=outputContext(),sampleRate=outputSampleRate();
  if(typeof context?.resume==='function')await context.resume();
  // A ready language does not guarantee its native sample-buffer command
  // path is responsive. Verify that path before decoding and allocation.
  try{
   sampleActivity('Checking SuperCollider sample-buffer response…',true);
   await transport.sync({signal:controller.signal,timeoutMs:5000});
  }catch(error){
   print('Native sample-server preflight: '+error.message);
   if(controller.signal.aborted)throw Error('Transfer cancelled');
   throw Error('SuperCollider did not respond to the sample-buffer check. Your recording is saved and playable above. Restart Sounds before trying again.');
  }
  // Uncompressed PCM WAVE can be unpacked exactly into native sample values,
  // avoiding decodeAudioData freezes observed after compiled scsynth startup.
  // This is container ingestion only: no browser synthesis, editing or effects.
  const sourceBytes=await item.blob.arrayBuffer();
  let decoded=readPcmWaveForNativeBuffer(sourceBytes);
  if(decoded){
   print('Reading PCM WAVE sample values for native SuperCollider; no resampling or processing.');
   announce('Reading original WAVE samples for native transfer…');
  }else{
   // Other formats use the SuperCollider-owned output context for ingestion.
   // No separate playback or effects engine is introduced.
   if(typeof context?.decodeAudioData!=='function')
    throw Error('Native SuperCollider output cannot decode this file. Import compatible audio instead.');
   print('Decoding via native output context at '+sampleRate+' Hz; original remains unchanged.');
   announce('Decoding original audio for SuperCollider ingestion…');
   let decodeTimer,abortDecoder;
   decoded=await Promise.race([
    context.decodeAudioData(sourceBytes),
    new Promise((_,reject)=>{
     abortDecoder=()=>reject(Error('Transfer cancelled'));
     controller.signal.addEventListener('abort',abortDecoder,{once:true});
     decodeTimer=setTimeout(()=>reject(Error('Audio decoding timed out. Retry or import another format.')),30000);
    })
   ]).finally(()=>{
    clearTimeout(decodeTimer);
    controller.signal.removeEventListener('abort',abortDecoder);
   });
  }
  if(controller.signal.aborted)throw Error('Transfer cancelled');
  // /b_alloc adopts the native server rate. Pass original file rate to
  // SuperCollider's player, which corrects timing at playback without resampling.
  if(decoded.sampleRate!==sampleRate)
   print('Source rate '+decoded.sampleRate+' Hz; native output '+sampleRate+
    ' Hz. SuperCollider will compensate playback speed without resampling.');
  if(linkedPreset?.soundId===item.id&&decoded.numberOfChannels!==linkedPreset.channels)
    throw Error('Original audio no longer matches the preset channel layout; refusing to substitute another instrument.');
   announce('Transferring samples to SuperCollider…');
  // A separate Sounds-only engine owns this buffer. Never alter the main editor's server.
  if(allocated){
   lang.runCode('~scSoundsLabPlayer.tryPerform(\\free); ~scSoundsLabPlayer = nil;');
   transport.release(BUFFER);await transport.sync({signal:controller.signal});allocated=false;
  }
  print('Requesting native buffer upload: '+decoded.length+' frames, '+decoded.numberOfChannels+' channel(s), '+decoded.sampleRate+' Hz.');
  let lastPhase='',lastQuarter=-1;
  current=await transport.upload(BUFFER,decoded,{
    signal:controller.signal,
    onStage:stage=>{
      const quarter=Math.floor(4*stage.acknowledged/Math.max(1,stage.total));
      if(stage.phase!==lastPhase||(stage.phase==='transfer'&&quarter!==lastQuarter)){
        print('Native '+stage.phase+': '+stage.acknowledged+'/'+stage.total+
         ' samples acknowledged ('+stage.sent+' sent, '+stage.packets+
         ' packets, '+stage.elapsedMs+' ms).');
        lastPhase=stage.phase;lastQuarter=quarter;
      }
    },
    onProgress:ratio=>{
     progress.value=ratio;
     const percent=Math.round(100*ratio);
     announce('Transferring into native SuperCollider buffer: '+percent+'% acknowledged');
     sampleActivity('SuperCollider has acknowledged '+percent+'% of the recording.',true);
    }
  });
  allocated=true;currentItemId=item.id;sourceDirty=false;pendingControl=false;waveform=waveformPeaks(decoded,512);updateRegionControls();
  announce('Verified by native SuperCollider sample readback: '+current.frames+' frames, '+current.channels+' channel(s), '+current.sampleRate+' Hz source. Native playback preserves original timing. Ready for PlayBuf.');
  sampleActivity('Recording loaded. Shape and play the sample instrument.',false,'ready');
 }catch(error){
  current=null;currentItemId=null;waveform=null;renderWaveform();
  print('Sample transfer failed: '+error.message);
  print('Native diagnostics: server '+(serverReady?'ready':'not ready')+
   ', definitions '+(definitionsReady?'ready':'not ready')+
   ', output context '+(outputContext()?.state||'unavailable')+
   ', server sample rate '+(serverSampleRate||'unknown')+' Hz.');
  const cancelled=controller.signal.aborted;
  const message=cancelled?'Instrument creation cancelled. Your recording is unchanged.':
   /allocation failed|did not respond to \/sync/i.test(error.message)?
   'SuperCollider did not acknowledge its buffer. The original is safe and playable above. Restart Sounds before retrying.':
   error.message;
  announce('Sample transfer '+(cancelled?'cancelled':'failed')+': '+error.message);
  sampleActivity(message,false,cancelled?'info':'error');
 }
 finally{controller=null;refreshControls()}
});
cancel.addEventListener('click',()=>{requestedSampleId=null;controller?.abort();announce('Cancelling sample transfer and releasing the incomplete buffer…');sampleActivity('Cancelling sample transfer…',true)});
play.addEventListener('click',async()=>{
 if(!current||!definitionsReady)return;
 try{
  const context=outputContext();if(typeof context?.resume==='function')await context.resume();
  const params=regionSettings();
  const code=sourceView.value.trim();
  if(!code)throw Error('Playback code is empty.');
  lang.runCode(code);
  announce(sourceDirty?'Submitted edited SuperCollider synthesis code. Controls are not synchronized; check diagnostics for errors.':
   'Playing through native SuperCollider '+(params.loop?'loop':'one shot')+' · '+Math.round(params.start*100)+'–'+Math.round(params.finish*100)+'% · '+params.rate+'×.');
 }catch(error){announce('Playback failed: '+error.message)}
});
function downloadableFilename(name){
 return (String(name||'sample-instrument').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,110).replace(/\.scd$/i,'')||'sample-instrument')+'.scd';
}
exportPreset.addEventListener('click',()=>{
 try{
  const item=originalSound(),code=exportedSource(regionSettings(),item);
  const url=URL.createObjectURL(new Blob([code],{type:'text/plain;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.download=downloadableFilename(presetName.value.trim()||item.name+' instrument');
  anchor.href=url;document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  announce('Exported editable SuperCollider script. Export the original audio separately from Library; it is not embedded.');
 }catch(error){announce('Instrument export failed: '+error.message)}
});
savePreset.addEventListener('click',async()=>{
 if(savePreset.disabled)return;
 savePreset.disabled=true;
 try{
  const item=originalSound(),settings=regionSettings();
  const name=(presetName.value.trim()||item.name+' instrument').slice(0,120);
  const preset={soundId:item.id,channels:settings.channels,start:settings.start,finish:settings.finish,
   rate:settings.rate,amp:settings.amp,loop:settings.loop};
  await saveSound({id:crypto.randomUUID(),name,source:'preset',created:Date.now(),favorite:false,
   preset,code:exportedSource(settings,item),origin:item.origin?{...item.origin}:undefined});
  announce('Saved '+name+' to the Library as a preset referencing its original audio.');
 }catch(error){announce('Could not save sample instrument: '+error.message)}
 finally{refreshControls()}
});
stop.addEventListener('click',()=>{
 try{lang.runCode(stopRegionCommand);announce('Stopped Sounds laboratory playback.')}
 catch(error){announce('Could not stop native SuperCollider playback: '+error.message)}
});
document.addEventListener('sounds-library-changed',listSounds);
window.addEventListener('pagehide',event=>{
 originalPreview.clear();
 controller?.abort();
 if(lang&&serverReady){try{lang.runCode(stopRegionCommand)}catch{}}
 if(synth&&allocated){try{transport.release(BUFFER)}catch{}}
 // Release the native engine's own output device on a real page exit. Never
 // preserve a second live audio thread behind the next Sounds Lab instance.
 if(!event.persisted){
  try{const context=outputContext();if(context?.state!=='closed')context?.close?.().catch(()=>{})}catch{}
 }
});
listSounds();
