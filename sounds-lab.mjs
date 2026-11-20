/* Isolated native SuperCollider buffer laboratory.
 * This page boots its own sclang/scsynth; main editor remains untouched. */
import {allSounds} from './sounds-store.mjs';
import {NativeBufferTransport} from './sounds-buffer.mjs';
import {REGION_DEFINITIONS,regionPlayCommand,stopRegionCommand} from './sounds-sampler.mjs';
const $=id=>document.getElementById(id);
const status=$('lab-status'),log=$('lab-log'),sound=$('lab-sound'),engine=$('lab-engine');
const load=$('lab-load'),play=$('lab-play'),stop=$('lab-stop'),cancel=$('lab-cancel'),progress=$('lab-progress');
const details=$('lab-details');
const regionStart=$('lab-start'),regionFinish=$('lab-finish'),regionRate=$('lab-rate'),regionAmp=$('lab-amp'),regionLoop=$('lab-loop'),regionSummary=$('lab-region-summary');
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
}
function updateRegionControls(changed){
 let start=Number(regionStart.value),finish=Number(regionFinish.value);
 if(changed==='start'&&start>=finish){finish=Math.min(100,start+1);regionFinish.value=finish}
 if(changed==='finish'&&finish<=start){start=Math.max(0,finish-1);regionStart.value=start}
 const seconds=current?current.frames/current.sampleRate:0;
 regionSummary.textContent='Region: '+start+'% to '+finish+'%'+(seconds?' ('+(seconds*start/100).toFixed(2)+'–'+(seconds*finish/100).toFixed(2)+' s)':'')+' · '+Number(regionRate.value).toFixed(2)+'× · Volume '+Math.round(Number(regionAmp.value)*100)+'% · '+(regionLoop.checked?'Loop':'One shot');
}
for(const [input,dimension] of [[regionStart,'start'],[regionFinish,'finish'],[regionRate,'rate'],[regionAmp,'amp'],[regionLoop,'loop']]){
 input.addEventListener('input',()=>updateRegionControls(dimension));
 input.addEventListener('change',()=>updateRegionControls(dimension));
}
updateRegionControls();
async function listSounds(){
 try{
  const previousId=sound.value;
  entries=(await allSounds()).filter(item=>item.blob instanceof Blob).sort((a,b)=>Number(b.created||0)-Number(a.created||0));
  sound.replaceChildren(new Option('Choose a recorded or imported sound…',''));
  for(const item of entries)sound.add(new Option((item.name||'Untitled')+' · '+((item.blob.size/1024/1024).toFixed(1))+' MB',item.id));
  if(entries.some(item=>item.id===previousId))sound.value=previousId;
  if(currentItemId&&!entries.some(item=>item.id===currentItemId)){current=null;currentItemId=null;progress.value=0}
  if(!entries.length)announce('No saved audio yet. Record, import or Discover a sound first.');
 }catch(error){announce('Local sound library unavailable: '+error.message)}
 refreshControls();
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
 if(synth&&serverReady){try{const context=outputContext();if(typeof context?.resume!=='function')throw Error('Native SuperCollider audio context unavailable; reload and retry.');await context.resume();announce('SuperCollider audio unlocked ('+context.state+').')}catch(error){announce('Audio unlock failed: '+error.message)}return}
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
   if(text.includes(DEFS)){definitionsReady=true;engine.textContent='Unlock audio';announce('SuperCollider ready. Select a sound and transfer it into a native buffer.');refreshControls()}
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
 if(current&&lang){try{lang.runCode(stopRegionCommand)}catch{}}
 current=null;currentItemId=null;progress.value=0;regionStart.value=0;regionFinish.value=100;updateRegionControls();
 const item=entries.find(item=>item.id===sound.value);
 details.textContent=item?('Source: '+item.source+' · '+(item.origin?.creator||'local recording')+' · '+(item.origin?.license||'personal or unknown license')):'';
 refreshControls();
});
load.addEventListener('click',async()=>{
 const item=entries.find(entry=>entry.id===sound.value);
 if(!item||!serverReady||!definitionsReady||controller)return;
 controller=new AbortController();current=null;currentItemId=null;progress.value=0;refreshControls();
 try{
  if(item.blob.size>50*1024*1024)throw Error('Choose an audio file under 50 MB for this laboratory.');
  const context=outputContext(),sampleRate=outputSampleRate();
  if(typeof context?.resume==='function')await context.resume();
  const Decoder=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  if(!Decoder)throw Error('This browser cannot decode audio for native SuperCollider buffers.');
  // Decode only; never startRendering or connect an independent sound player.
  const decoder=new Decoder(2,1,sampleRate);
  print('Decoding into native server output rate '+sampleRate+' Hz; original remains unchanged.');
  announce('Decoding original audio for SuperCollider ingestion…');
  const decoded=await decoder.decodeAudioData(await item.blob.arrayBuffer());
  if(controller.signal.aborted)throw Error('Transfer cancelled');
  if(decoded.sampleRate!==sampleRate)
   throw Error('Decoded sample rate differs from SuperCollider output; refusing pitch-altering transfer.');
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
  allocated=true;currentItemId=item.id;updateRegionControls();
  announce('Verified by native SuperCollider sample readback: '+current.frames+' frames, '+current.channels+' channel(s), '+current.sampleRate+' Hz. Ready for PlayBuf.');
 }catch(error){current=null;currentItemId=null;announce('Sample transfer failed: '+error.message)}
 finally{controller=null;refreshControls()}
});
cancel.addEventListener('click',()=>{controller?.abort();announce('Cancelling sample transfer and releasing the incomplete buffer…')});
play.addEventListener('click',async()=>{
 if(!current||!definitionsReady)return;
 try{
  const context=outputContext();if(typeof context?.resume==='function')await context.resume();
  const params={bufferId:BUFFER,channels:current.channels,start:Number(regionStart.value)/100,finish:Number(regionFinish.value)/100,rate:Number(regionRate.value),amp:Number(regionAmp.value),loop:regionLoop.checked};
  const code=regionPlayCommand(params);
  lang.runCode(code);
  announce('Playing through native SuperCollider '+(params.loop?'loop':'one shot')+' · '+Math.round(params.start*100)+'–'+Math.round(params.finish*100)+'% · '+params.rate+'×.');
 }catch(error){announce('Playback failed: '+error.message)}
});
stop.addEventListener('click',()=>{
 try{lang.runCode(stopRegionCommand);announce('Stopped Sounds laboratory playback.')}
 catch(error){announce('Could not stop native SuperCollider playback: '+error.message)}
});
document.addEventListener('sounds-library-changed',listSounds);
window.addEventListener('pagehide',()=>{controller?.abort();if(lang&&serverReady){try{lang.runCode(stopRegionCommand)}catch{}}if(synth&&allocated){try{transport.release(BUFFER)}catch{}}});
listSounds();
