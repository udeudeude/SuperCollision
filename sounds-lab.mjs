/* Isolated native SuperCollider buffer laboratory.
 * This page boots its own sclang/scsynth; main editor remains untouched. */
import {allSounds,saveSound} from './sounds-store.mjs';
import {NativeBufferTransport} from './sounds-buffer.mjs';
import {REGION_DEFINITIONS,regionPlayCommand,stopRegionCommand,sampleInstrumentSource,validateRegion} from './sounds-sampler.mjs';
import {waveformPeaks,waveformDragRegion} from './sounds-waveform.mjs';
const $=id=>document.getElementById(id);
const status=$('lab-status'),log=$('lab-log'),sound=$('lab-sound'),engine=$('lab-engine');
const load=$('lab-load'),play=$('lab-play'),stop=$('lab-stop'),cancel=$('lab-cancel'),progress=$('lab-progress');
const details=$('lab-details');
const regionStart=$('lab-start'),regionFinish=$('lab-finish'),regionRate=$('lab-rate'),regionAmp=$('lab-amp'),regionLoop=$('lab-loop'),regionSummary=$('lab-region-summary');
const waveformCanvas=$('lab-waveform');
const presetName=$('lab-preset-name'),savePreset=$('lab-save-preset'),exportPreset=$('lab-export-preset');
let pendingPresetId=new URL(location.href).searchParams.get('preset');
let queuedPresetLoadId=null,linkedPreset=null;
let waveform=null,waveformAnchor=null;
const BUFFER=700;
const READY='__SC_SOUNDS_LAB_READY__',FAILED='__SC_SOUNDS_LAB_FAILED__',DEFS='__SC_SOUNDS_LAB_DEFS__',RATE='__SC_SOUNDS_LAB_RATE__:';
const DEFINITION_SOURCE=REGION_DEFINITIONS;
let lang=null,synth=null,transport=null,languageReady=false,serverReady=false,definitionsReady=false;
let bootRequested=false,booting=false,bootTimeout=null,current=null,currentItemId=null,controller=null,entries=[],allocated=false;
let synthBootPending=false,synthBootCompleted=false,serverSampleRate=null,nativeAudioContext=null;
function announce(t){status.textContent=t}
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
 sound.disabled=!!controller;
 load.disabled=!serverReady||!definitionsReady||!sound.value||!!controller;
 play.disabled=!current||!definitionsReady||!!controller;
 stop.disabled=!serverReady;
 cancel.disabled=!controller;
 savePreset.disabled=exportPreset.disabled=!current||!currentItemId||!!controller;
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
 updateRegionControls();
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
  finish:Number(regionFinish.value)/100,rate:Number(regionRate.value),amp:Number(regionAmp.value),loop:regionLoop.checked});
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
async function listSounds(){
 try{
  const previousId=sound.value;
  const catalog=await allSounds();
  entries=catalog.filter(item=>item.blob instanceof Blob).sort((a,b)=>Number(b.created||0)-Number(a.created||0));
  sound.replaceChildren(new Option('Choose a recorded or imported sound…',''));
  for(const item of entries)sound.add(new Option((item.name||'Untitled')+' · '+((item.blob.size/1024/1024).toFixed(1))+' MB',item.id));
  if(entries.some(item=>item.id===previousId))sound.value=previousId;
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
  if(!entries.length)announce('No saved audio yet. Record, import or Discover a sound first.');
 }catch(error){announce('Local sound library unavailable: '+error.message)}
 refreshControls();
 maybeLoadLinkedPreset();
}
function requestServer(){
 if(!lang||!languageReady||bootRequested||serverReady)return;
 bootRequested=true;announce('Starting the SuperCollider audio server…');
 bootTimeout=setTimeout(()=>{if(!serverReady){bootRequested=false;engine.textContent='Retry server startup';print('Startup timed out; native synthesis boot: '+(synthBootPending?'pending':synthBootCompleted?'complete':'not begun')+'; context: '+(synth?.getAudioContext?.()?.state||'unavailable'));announce('Native server startup timed out. Tap Retry to try again.')}},50000);
 try{lang.runCode('s.waitForBoot({ "'+READY+'".postln; }, onFailure: { "'+FAILED+'".postln; }, clock: SystemClock);')}
 catch(error){bootRequested=false;clearTimeout(bootTimeout);announce('Server request failed: '+error.message)}
}
function installDefinitions(){
 try{lang.runCode('("'+RATE+'" ++ s.sampleRate).postln;');lang.runCode(DEFINITION_SOURCE);announce('SuperCollider server ready. Installing native PlayBuf instruments…')}
 catch(error){announce('Could not create SuperCollider instruments: '+error.message)}
}
engine.addEventListener('click',async()=>{
 if(synth&&serverReady){
   try{
    const context=outputContext();
    if(typeof context?.resume!=='function')throw Error('Native SuperCollider audio context unavailable; reload and retry.');
    await context.resume();
    announce('SuperCollider audio unlocked ('+context.state+').');
    maybeLoadLinkedPreset();
   }catch(error){announce('Audio unlock failed: '+error.message)}
   return;
  }
 if(lang){if(languageReady&&!bootRequested){requestServer();return}announce('SuperCollider initialization is already in progress.');return}
 if(booting){announce('SuperCollider initialization is already in progress.');return}
 if(!crossOriginIsolated){announce('The standalone SuperCollider runtime requires a cross-origin-isolated secure page. Check the hosting headers.');return}
 booting=true;engine.disabled=true;announce('Loading native SuperCollider language and synthesis modules…');
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
   if(text.includes(DEFS)){definitionsReady=true;engine.textContent='Unlock audio';announce('SuperCollider ready. Select a sound and transfer it into a native buffer.');refreshControls();maybeLoadLinkedPreset()}
   if(text.includes(FAILED)){clearTimeout(bootTimeout);bootRequested=false;engine.textContent='Retry server startup';announce('SuperCollider server failed to start. Tap Retry to try again.')}
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
 }catch(error){announce('SuperCollider startup failed: '+error.message);print(error.stack||error.message)}
 finally{booting=false;engine.disabled=false;refreshControls()}
});
sound.addEventListener('change',()=>{
 queuedPresetLoadId=null;linkedPreset=null;
 if(current&&lang){try{lang.runCode(stopRegionCommand)}catch{}}
 current=null;currentItemId=null;waveform=null;progress.value=0;regionStart.value=0;regionFinish.value=100;updateRegionControls();
 showSoundDetails();
 refreshControls();
});
load.addEventListener('click',async()=>{
 const item=entries.find(entry=>entry.id===sound.value);
 if(!item||!serverReady||!definitionsReady||controller)return;
 controller=new AbortController();current=null;currentItemId=null;waveform=null;renderWaveform();progress.value=0;refreshControls();
 try{
  if(item.blob.size>50*1024*1024)throw Error('Choose an audio file under 50 MB for this laboratory.');
  const context=outputContext(),sampleRate=outputSampleRate();
  if(typeof context?.resume==='function')await context.resume();
  // Decode for native-buffer ingestion through the SuperCollider-owned output
  // AudioContext. A separate OfflineAudioContext can stall after server restart.
  // This does not create browser playback or a competing sound processor.
  if(typeof context?.decodeAudioData!=='function')
   throw Error('Native SuperCollider output cannot decode this file. Import compatible audio instead.');
  print('Decoding via native output context at '+sampleRate+' Hz; original remains unchanged.');
  announce('Decoding original audio for SuperCollider ingestion…');
  const sourceBytes=await item.blob.arrayBuffer();
  let decodeTimer,abortDecoder;
  const decoded=await Promise.race([
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
  if(controller.signal.aborted)throw Error('Transfer cancelled');
  if(decoded.sampleRate!==sampleRate)
   throw Error('Decoded sample rate differs from SuperCollider output; refusing pitch-altering transfer.');
  if(linkedPreset?.soundId===item.id&&decoded.numberOfChannels!==linkedPreset.channels)
    throw Error('Original audio no longer matches the preset channel layout; refusing to substitute another instrument.');
   announce('Transferring samples to SuperCollider…');
  // A separate Sounds-only engine owns this buffer. Never alter the main editor's server.
  if(allocated){
   lang.runCode('~scSoundsLabPlayer.tryPerform(\\free); ~scSoundsLabPlayer = nil;');
   transport.release(BUFFER);await transport.sync({signal:controller.signal});allocated=false;
  }
  current=await transport.upload(BUFFER,decoded,{
    signal:controller.signal,
    onProgress:ratio=>{progress.value=ratio;announce('Transferring into native SuperCollider buffer: '+Math.round(100*ratio)+'%')}
  });
  allocated=true;currentItemId=item.id;waveform=waveformPeaks(decoded,512);updateRegionControls();
  announce('Verified by native SuperCollider sample readback: '+current.frames+' frames, '+current.channels+' channel(s), '+current.sampleRate+' Hz. Ready for PlayBuf.');
 }catch(error){current=null;currentItemId=null;waveform=null;renderWaveform();announce('Sample transfer failed: '+error.message)}
 finally{controller=null;refreshControls()}
});
cancel.addEventListener('click',()=>{controller?.abort();announce('Cancelling sample transfer and releasing the incomplete buffer…')});
play.addEventListener('click',async()=>{
 if(!current||!definitionsReady)return;
 try{
  const context=outputContext();if(typeof context?.resume==='function')await context.resume();
  const params=regionSettings();
  const code=regionPlayCommand(params);
  lang.runCode(code);
  announce('Playing through native SuperCollider '+(params.loop?'loop':'one shot')+' · '+Math.round(params.start*100)+'–'+Math.round(params.finish*100)+'% · '+params.rate+'×.');
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
window.addEventListener('pagehide',()=>{controller?.abort();if(lang&&serverReady){try{lang.runCode(stopRegionCommand)}catch{}}if(synth&&allocated){try{transport.release(BUFFER)}catch{}}});
listSounds();
