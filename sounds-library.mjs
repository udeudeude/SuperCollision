/* Sounds-only microphone capture and local import.
 * All samples are stored unchanged; SuperCollider alone will edit/process them. */
import {saveSound} from './sounds-store.mjs';
const $=id=>document.getElementById(id);
const status=$('status'),hold=$('start'),ready=$('mic-ready'),level=$('level'),importer=$('import');
// Instrument Bench requests permission directly from Record; legacy recorder remains gated.
if(document.getElementById('bench-acquire-overlay')){hold.disabled=false;hold.textContent='● RECORD'}
const importStatus=$('import-status'),importFailures=$('import-failures');
const wave=$('record-wave'),monitorLevel=$('record-level-text'),recordTime=$('record-timer');
const auditionArea=$('record-audition'),auditionAudio=$('record-audio'),auditionName=$('record-audition-name');
let auditionUrl=null,recordingStart=null,recordingDuration=0;
const formatTime=seconds=>Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0');
function updateTime(){
 const elapsed=recordingStart===null?recordingDuration:(performance.now()-recordingStart)/1000;
 if(recordTime)recordTime.textContent=formatTime(Math.max(0,elapsed));
}
function drawMic(data){
 if(!wave)return;
 const width=Math.max(1,Math.floor(wave.getBoundingClientRect().width||320));
 const ratio=Math.min(2,window.devicePixelRatio||1),height=72;
 if(wave.width!==Math.round(width*ratio)||wave.height!==Math.round(height*ratio)){
  wave.width=Math.round(width*ratio);wave.height=Math.round(height*ratio);
 }
 const g=wave.getContext('2d');if(!g)return;
 g.setTransform(ratio,0,0,ratio,0,0);
 const style=getComputedStyle(wave);
 g.fillStyle=style.getPropertyValue('--sc-editor').trim()||'#19221b';
 g.fillRect(0,0,width,height);
 g.strokeStyle='#68736a';g.beginPath();g.moveTo(0,height/2);g.lineTo(width,height/2);g.stroke();
 if(!data?.length)return;
 g.strokeStyle='#e2c17d';g.lineWidth=1.4;g.beginPath();
 for(let x=0;x<width;x++){
  const n=data[Math.min(data.length-1,Math.floor(x/width*data.length))];
  const y=height/2-(n-128)/128*(height*.45);
  if(x===0)g.moveTo(x,y);else g.lineTo(x,y);
 }
 g.stroke();
}
function auditionOriginal(blob,name){
 if(auditionUrl){auditionAudio.pause();auditionAudio.removeAttribute('src');URL.revokeObjectURL(auditionUrl)}
 auditionUrl=URL.createObjectURL(blob);
 auditionAudio.src=auditionUrl;auditionAudio.load();
 auditionName.textContent=name;auditionArea.hidden=false;
}
let stream=null,recorder=null,meter=null,meterTimer=null,audioContext=null;
let micRequest=0,activePointer=null,keyboardDown=false,stopping=false;
function say(message){status.textContent=message}
function recordingStyle(on){
 document.body.classList.toggle('is-recording',on);hold.setAttribute('aria-pressed',String(on));
 hold.textContent=on?(document.getElementById('bench-acquire-overlay')?'■ STOP & SAVE':'● RECORDING · RELEASE TO SAVE'):(document.getElementById('bench-acquire-overlay')?'● RECORD':'● HOLD TO RECORD');
 if(on){recordingStart=performance.now();recordingDuration=0}
 else{if(recordingStart!==null)recordingDuration=(performance.now()-recordingStart)/1000;recordingStart=null}
 updateTime();
}
async function stopMeter(){
 if(meterTimer!==null){clearInterval(meterTimer);meterTimer=null}
 level.value=0;meter=null;
 if(monitorLevel)monitorLevel.textContent='MIC OFF';drawMic(null);
 if(audioContext){const context=audioContext;audioContext=null;await context.close().catch(()=>{})}
}
function closeMic(){
 micRequest++;
 if(stream){for(const track of stream.getTracks())track.stop();stream=null}
 stopMeter();
 ready.checked=false;hold.disabled=!Boolean(document.getElementById('bench-acquire-overlay'));
}
function activateMeter(){
 try{
  const Context=window.AudioContext||window.webkitAudioContext;
  if(!Context)throw Error('Audio monitoring is unavailable');
  audioContext=new Context();
  const analyser=audioContext.createAnalyser();
  analyser.fftSize=1024;
  const source=audioContext.createMediaStreamSource(stream);
  source.connect(analyser);
  const data=new Uint8Array(analyser.fftSize);
  meter=analyser;
  meterTimer=setInterval(()=>{
   if(!meter)return;meter.getByteTimeDomainData(data);let sum=0;
   for(const n of data)sum+=((n-128)/128)**2;
   const rms=Math.sqrt(sum/data.length);
   level.value=Math.min(1,rms*4);
   if(monitorLevel){
    const decibels=rms>0?Math.max(-60,Math.round(20*Math.log10(rms))):-60;
    monitorLevel.textContent='INPUT '+(decibels<=-60?'−60 OR LESS':String(decibels).replace('-', '−'))+' dB';
   }
   drawMic(data);updateTime();
  },120);
 }catch{
  void stopMeter().then(()=>{if(stream&&ready.checked&&monitorLevel)monitorLevel.textContent='LIVE MONITOR UNAVAILABLE'});
 }
}
ready.addEventListener('change',async()=>{
 if(!ready.checked){if(recorder&&recorder.state==='recording')stopRecording();closeMic();say('Microphone off.');return}
 const token=++micRequest;
 if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){
  ready.checked=false;say('Microphone recording is unavailable in this browser.');return
 }
 hold.disabled=!Boolean(document.getElementById('bench-acquire-overlay'));say('Requesting microphone permission…');
 try{
  const acquired=await navigator.mediaDevices.getUserMedia({audio:{
   echoCancellation:false,noiseSuppression:false,autoGainControl:false
  }});
  if(token!==micRequest||!ready.checked){acquired.getTracks().forEach(t=>t.stop());return}
  stream=acquired;
  stream.getAudioTracks().forEach(track=>track.addEventListener('ended',()=>{
   if(recorder?.state==='recording')stopRecording();closeMic();say('Microphone disconnected.');
  },{once:true}));
  hold.disabled=false;activateMeter();
  say('Microphone ready. Hold Record to capture; release to save.');
 }catch(error){if(token===micRequest){ready.checked=false;hold.disabled=!Boolean(document.getElementById('bench-acquire-overlay'));say('Microphone unavailable: '+error.message)}}
});
function startRecording(){
 if(!stream||hold.disabled||recorder||stopping)return;
 try{
  const type=['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));
  const current=new MediaRecorder(stream,type?{mimeType:type}:undefined),chunks=[];
  recorder=current;
  current.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
  current.onerror=e=>{say('Recorder error: '+(e.error?.message||'unknown'));if(current.state==='recording')current.stop()};
  current.onstop=async()=>{
   const blob=new Blob(chunks,{type:current.mimeType||chunks[0]?.type||'audio/mp4'});
   if(blob.size)auditionOriginal(blob,$('name').value.trim().slice(0,120)||'Last recording');
   try{
    if(!blob.size)throw Error('Recording is empty');
    const name=$('name').value.trim().slice(0,120)||'Recording '+new Date().toLocaleString();
    await saveSound({id:crypto.randomUUID(),name,source:'recorded',created:Date.now(),
     mime:blob.type,blob,favorite:false});
    // Release live input before replaying the unchanged recording.
    closeMic();
    say('Saved recording locally ('+(blob.size/1024).toFixed(0)+' KB). Play the original below.');
   }catch(error){
    say('Save failed: '+error.message+'. Export this recording before closing the page.');
    if(blob.size){
     const url=URL.createObjectURL(blob),a=document.createElement('a');
     a.href=url;a.download='unsaved-recording.'+(blob.type.includes('mp4')?'m4a':'webm');
     a.textContent='Export unsaved recording';status.append(' ',a);
     a.addEventListener('click',()=>setTimeout(()=>URL.revokeObjectURL(url),30000),{once:true});
    }
   }finally{
    if(recorder===current)recorder=null;
    stopping=false;recordingStyle(false);hold.disabled=!stream&&!document.getElementById('bench-acquire-overlay');
   }
  };
  auditionAudio?.pause();
  current.start(250);
  recordingStyle(true);
  say('Recording. Release to save.');
 }catch(error){recorder=null;recordingStyle(false);say('Could not begin recording: '+error.message)}
}
function stopRecording(){
 const current=recorder;
 if(!current||current.state!=='recording'||stopping)return;
 stopping=true;hold.disabled=true;recordingStyle(false);say('Saving recording…');
 try{current.stop()}catch(error){stopping=false;hold.disabled=!stream&&!document.getElementById('bench-acquire-overlay');say('Could not stop recording: '+error.message)}
}
// One direct Record control: permission is requested on the first press.
// A second press stops and saves. The recording is never uploaded.
let pendingRecord=false;
if(document.getElementById('bench-acquire-overlay'))hold.addEventListener('click',async()=>{
 if(recorder?.state==='recording'){stopRecording();return}
 if(pendingRecord||stopping)return;
 if(!stream){
  pendingRecord=true;
  ready.checked=true;
  ready.dispatchEvent(new Event('change',{bubbles:true}));
  // Wait for the permission request to settle without creating another request.
  const token=micRequest;
  try{
   await new Promise((resolve,reject)=>{
    const deadline=Date.now()+30000;
    const poll=()=>{
     if(stream||!ready.checked||micRequest!==token||Date.now()>deadline){resolve();return}
     setTimeout(poll,80);
    };poll();
   });
   if(stream)startRecording();
  }finally{pendingRecord=false}
  return;
 }
 startRecording();
});
else {
 hold.addEventListener('pointerdown',event=>{
  if(!event.isPrimary||event.button!==0||hold.disabled)return;
  event.preventDefault();activePointer=event.pointerId;
  try{hold.setPointerCapture(event.pointerId)}catch{}
  startRecording();
 });
 function releasePointer(event){
  if(activePointer!==event.pointerId)return;
  activePointer=null;stopRecording();
 }
 hold.addEventListener('pointerup',releasePointer);
 hold.addEventListener('pointercancel',releasePointer);
 hold.addEventListener('lostpointercapture',releasePointer);
 hold.addEventListener('keydown',event=>{
  if(event.code!=='Space'&&event.code!=='Enter')return;
  if(event.repeat||keyboardDown)return;
  event.preventDefault();keyboardDown=true;startRecording();
 });
 hold.addEventListener('keyup',event=>{
  if(event.code!=='Space'&&event.code!=='Enter')return;
  event.preventDefault();keyboardDown=false;stopRecording();
 });
 hold.addEventListener('blur',()=>{if(keyboardDown){keyboardDown=false;stopRecording()}});
}
importer.addEventListener('change',async event=>{
 const files=[...event.target.files];
 if(!files.length)return;
 importer.disabled=true;
 let imported=0;
 const failures=[];
 importFailures.replaceChildren();
 importFailures.hidden=true;
 try{
  for(const [index,file] of files.entries()){
   importStatus.textContent='Importing '+(index+1)+' of '+files.length+': '+file.name;
   try{
    if(!file.type.startsWith('audio/')&&!/\.(wav|mp3|m4a|aac|aiff|flac|ogg|opus)$/i.test(file.name))throw Error('Unrecognized audio format');
    await saveSound({id:crypto.randomUUID(),name:file.name.slice(0,120),source:'imported',
     created:Date.now(),mime:file.type||'application/octet-stream',blob:file,favorite:false});
    imported++;
   }catch(error){
    failures.push({name:file.name,reason:error?.message||String(error)});
   }
  }
 }finally{
  importer.value='';
  importer.disabled=false;
 }
 if(failures.length){
  importStatus.textContent='Imported '+imported+' of '+files.length+' files. '+failures.length+
   ' failed; see the files not imported below.';
  for(const failure of failures){
   const row=document.createElement('li');
   row.textContent=failure.name+': '+failure.reason;
   importFailures.append(row);
  }
  importFailures.hidden=false;
 }else{
  importStatus.textContent='Imported '+imported+' audio file'+(imported===1?'':'s')+' into the library.';
 }
});
/* Leaving Record must never leave a live microphone behind a different
 * workspace. Stop capture before stopping tracks so MediaRecorder can flush
 * its final data; a pending permission response is invalidated by closeMic. */
document.addEventListener('sounds-view-changed',event=>{
 if(event.detail?.view==='record'||(!ready.checked&&!stream&&!recorder))return;
 const wasRecording=recorder?.state==='recording';
 if(wasRecording)stopRecording();
 activePointer=null;keyboardDown=false;
 closeMic();
 say(wasRecording?
  'Recording ended when you left Record. Saving locally…':
  'Microphone off. Return to Record to enable it again.');
});
window.addEventListener('pagehide',()=>{
 if(recorder?.state==='recording')stopRecording();
 closeMic();if(auditionUrl){auditionAudio.pause();URL.revokeObjectURL(auditionUrl);auditionUrl=null}
});
