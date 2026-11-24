/* Sounds-only microphone capture and local import.
 * All samples are stored unchanged; SuperCollider alone will edit/process them. */
import {saveSound} from './sounds-store.mjs';
const $=id=>document.getElementById(id);
const status=$('status'),hold=$('start'),ready=$('mic-ready'),level=$('level'),importer=$('import');
let stream=null,recorder=null,meter=null,meterTimer=null,audioContext=null;
let micRequest=0,activePointer=null,keyboardDown=false,stopping=false;
const monitor=$('bench-record-monitor'),wave=$('bench-record-wave');
const monitorLevel=$('bench-record-level-text'),recordTime=$('bench-record-timer');
const monitorHint=monitor?.querySelector('.bench-record-hint');
let recordingStart=null,recordingDuration=0;
const formatTime=seconds=>Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0');
function updateTime(){
 const elapsed=recordingStart===null?recordingDuration:
  (performance.now()-recordingStart)/1000;
 if(recordTime)recordTime.textContent=formatTime(Math.max(0,elapsed));
}
function setMonitorHint(message){if(monitorHint)monitorHint.textContent=message}
function drawMic(data){
 if(!wave)return;
 const width=Math.max(1,Math.floor(wave.getBoundingClientRect().width||320));
 const ratio=Math.min(2,window.devicePixelRatio||1),height=90;
 const W=Math.round(width*ratio),H=Math.round(height*ratio);
 if(wave.width!==W||wave.height!==H){wave.width=W;wave.height=H}
 const g=wave.getContext('2d');if(!g)return;
 g.setTransform(ratio,0,0,ratio,0,0);
 const style=getComputedStyle(wave);
 const background=style.getPropertyValue('--sc-editor').trim()||'#172019';
 const grid=style.getPropertyValue('--sc-graph-grid').trim()||'#516050';
 const ink=style.getPropertyValue('--sc-graph-ink').trim()||'#e2c17d';
 g.fillStyle=background;g.fillRect(0,0,width,height);
 g.strokeStyle=grid;g.lineWidth=1;g.beginPath();
 g.moveTo(0,height/2);g.lineTo(width,height/2);g.stroke();
 if(!data?.length)return;
 g.strokeStyle=ink;g.lineWidth=1.4;g.beginPath();
 for(let x=0;x<width;x++){
  const n=data[Math.min(data.length-1,Math.floor(x/width*data.length))];
  const y=height/2-(n-128)/128*(height*.45);
  if(x===0)g.moveTo(x,y);else g.lineTo(x,y);
 }
 g.stroke();
}
function say(message){status.textContent=message}
function recordingStyle(on){
 document.body.classList.toggle('is-recording',on);
 hold.setAttribute('aria-pressed',String(on));
 hold.textContent=on?'● RECORDING · RELEASE TO SAVE':'● HOLD TO RECORD';
 if(on){
  recordingStart=performance.now();recordingDuration=0;
  setMonitorHint('Recording the incoming signal. Release the button to save.');
 }else{
  if(recordingStart!==null)recordingDuration=(performance.now()-recordingStart)/1000;
  recordingStart=null;
 }
 updateTime();
}
async function stopMeter(){
 if(meterTimer!==null){clearInterval(meterTimer);meterTimer=null}
 level.value=0;meter=null;
 if(monitorLevel)monitorLevel.textContent='MIC OFF';
 drawMic(null);
 if(audioContext){const context=audioContext;audioContext=null;await context.close().catch(()=>{})}
}
function closeMic(){
 micRequest++;
 if(stream){for(const track of stream.getTracks())track.stop();stream=null}
 stopMeter();
 ready.checked=false;hold.disabled=true;
}
function activateMeter(){
 try{
  audioContext=new AudioContext();
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
    const db=rms>0?Math.round(20*Math.log10(rms)):-60;
    monitorLevel.textContent='INPUT '+(db<=-60?'−60 OR LESS':String(db).replace('-', '−'))+' dB';
   }
   drawMic(data);updateTime();
  },120);
 }catch{stopMeter()}
}
ready.addEventListener('change',async()=>{
 if(!ready.checked){if(recorder&&recorder.state==='recording')stopRecording();closeMic();setMonitorHint('Enable microphone to see the live input.');say('Microphone off.');return}
 const token=++micRequest;
 if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){
  ready.checked=false;say('Microphone recording is unavailable in this browser.');return
 }
 hold.disabled=true;say('Requesting microphone permission…');
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
  setMonitorHint('The waveform represents microphone input. Hold Record below to capture.');
  say('Microphone ready. Hold Record to capture; release to save.');
 }catch(error){if(token===micRequest){ready.checked=false;hold.disabled=true;say('Microphone unavailable: '+error.message)}}
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
   try{
    if(!blob.size)throw Error('Recording is empty');
    const name=$('name').value.trim().slice(0,120)||'Recording '+new Date().toLocaleString();
    const item={id:crypto.randomUUID(),name,source:'recorded',created:Date.now(),
     mime:blob.type,blob,favorite:false};
    await saveSound(item);
    // The user owns the original and can audition it before any synthesis.
    // Release the microphone so playback cannot feed into the live input.
    closeMic();
    setMonitorHint('Recording saved. Play the unchanged original below before making an instrument.');
    document.dispatchEvent(new CustomEvent('sounds-audio-saved',
     {detail:{id:item.id,name:item.name,source:item.source}}));
    say('Saved recording locally ('+(blob.size/1024).toFixed(0)+' KB). Listen to the original below.');
   }catch(error){
    setMonitorHint('Recording captured but not saved locally. Export it below.');
    say('Save failed: '+error.message+'. Export this recording before closing the page.');
    if(blob.size){
     const url=URL.createObjectURL(blob),a=document.createElement('a');
     a.href=url;a.download='unsaved-recording.'+(blob.type.includes('mp4')?'m4a':'webm');
     a.textContent='Export unsaved recording';status.append(' ',a);
     a.addEventListener('click',()=>setTimeout(()=>URL.revokeObjectURL(url),30000),{once:true});
    }
   }finally{
    if(recorder===current)recorder=null;
    stopping=false;recordingStyle(false);hold.disabled=!stream;
   }
  };
  current.start(250);
  recordingStyle(true);
  say('Recording. Release to save.');
 }catch(error){recorder=null;recordingStyle(false);say('Could not begin recording: '+error.message)}
}
function stopRecording(){
 const current=recorder;
 if(!current||current.state!=='recording'||stopping)return;
 stopping=true;hold.disabled=true;recordingStyle(false);say('Saving recording…');
 try{current.stop()}catch(error){stopping=false;hold.disabled=!stream;say('Could not stop recording: '+error.message)}
}
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
importer.addEventListener('change',async event=>{
 const files=[...event.target.files];importer.disabled=true;
 let imported=0;
 for(const file of files){
  try{
   if(!file.type.startsWith('audio/')&&!/\.(wav|mp3|m4a|aac|aiff|flac|ogg|opus)$/i.test(file.name))throw Error('Unrecognized audio format');
   const item={id:crypto.randomUUID(),name:file.name.slice(0,120),source:'imported',
    created:Date.now(),mime:file.type||'application/octet-stream',blob:file,favorite:false};
   await saveSound(item);
   document.dispatchEvent(new CustomEvent('sounds-audio-saved',
    {detail:{id:item.id,name:item.name,source:item.source}}));
   imported++;
  }catch(error){say('Failed to import '+file.name+': '+error.message)}
 }
 importer.value='';importer.disabled=false;
 if(imported)say('Imported '+imported+' audio file'+(imported===1?'':'s')+' into the library.');
});
window.addEventListener('pagehide',()=>{if(recorder?.state==='recording')stopRecording();closeMic()});
