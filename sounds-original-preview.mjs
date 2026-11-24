/* A local original-sound audition with honest, interactive waveform.
 * Audio is played only by the browser's native media element after a user
 * action; decoding generates a read-only visual and never changes the source.
 * The player can be moved into a reachable dock without moving its waveform.
 */
export function createOriginalPreview({label='ORIGINAL RECORDING'}={}){
 const root=document.createElement('section');
 root.className='bench-original-preview';root.hidden=true;
 const head=document.createElement('div');head.className='bench-original-head';
 const title=document.createElement('strong');title.textContent=label;
 const subtitle=document.createElement('small');subtitle.textContent='Listen before changing the sound.';
 head.append(title,subtitle);
 const canvas=document.createElement('canvas');
 canvas.className='bench-original-waveform';canvas.hidden=true;
 canvas.tabIndex=0;canvas.setAttribute('role','slider');
 canvas.setAttribute('aria-label','Original recording waveform, scrub to choose playback position');
 canvas.setAttribute('aria-valuemin','0');canvas.setAttribute('aria-valuemax','100');
 canvas.setAttribute('aria-valuenow','0');canvas.setAttribute('aria-valuetext','Beginning');
 const audio=document.createElement('audio');
 audio.controls=true;audio.preload='metadata';audio.playsInline=true;audio.hidden=true;
 audio.setAttribute('aria-label','Listen to original saved audio');
 const message=document.createElement('p');message.className='bench-original-message';
 message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 root.append(head,canvas,audio,message);
 let objectUrl=null,activeId=null,decodeEpoch=0,peaks=null,dragging=false;
 const time=t=>{
  if(!Number.isFinite(t)||t<0)return '0:00';
  const seconds=Math.floor(t);
  return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
 };
 const duration=()=>Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:0;
 const context=()=>canvas.getContext('2d');
 function draw(){
  if(!peaks||canvas.hidden||root.hidden)return;
  const width=Math.max(1,Math.round(canvas.getBoundingClientRect().width||300));
  const height=86,ratio=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.round(width*ratio);canvas.height=height*ratio;
  const g=context();if(!g)return;
  g.scale(ratio,ratio);
  const style=getComputedStyle(root);
  const ink=style.getPropertyValue('--sc-graph-ink').trim()||'#e6c084';
  const faint=style.getPropertyValue('--sc-graph-grid').trim()||'#66645a';
  const surface=style.getPropertyValue('--sc-editor').trim()||'#1a211c';
  const selected=style.getPropertyValue('--sc-selected').trim()||'#d2af6a';
  g.fillStyle=surface;g.fillRect(0,0,width,height);
  g.strokeStyle=faint;g.lineWidth=1;
  for(let k=1;k<=3;k++){let y=height*k/4;g.beginPath();g.moveTo(0,y);g.lineTo(width,y);g.stroke()}
  g.strokeStyle=ink;g.lineWidth=Math.max(1,width/peaks.length*.78);
  for(let x=0;x<width;x++){
   const n=Math.min(peaks.length-1,Math.floor(x/width*peaks.length));
   const [lo,hi]=peaks[n];
   g.beginPath();g.moveTo(x,Math.max(0,height*(1-hi)/2));g.lineTo(x,Math.min(height,height*(1-lo)/2));g.stroke();
  }
  const f=duration()?Math.max(0,Math.min(1,audio.currentTime/duration())):0;
  g.strokeStyle=selected;g.lineWidth=2;
  const px=Math.min(width-1,Math.round(width*f));
  g.beginPath();g.moveTo(px,0);g.lineTo(px,height);g.stroke();
  canvas.setAttribute('aria-valuenow',String(Math.round(f*100)));
  canvas.setAttribute('aria-valuetext',time(audio.currentTime)+' of '+time(duration()));
 }
 function seekFraction(f){
  if(!duration())return;
  audio.currentTime=Math.max(0,Math.min(duration(),f*duration()));
  draw();
 }
 function pointerSeek(event){
  const rect=canvas.getBoundingClientRect();
  if(rect.width>0)seekFraction((event.clientX-rect.left)/rect.width);
 }
 canvas.addEventListener('pointerdown',event=>{
  if(!duration()||canvas.hidden)return;
  dragging=true;canvas.setPointerCapture?.(event.pointerId);
  pointerSeek(event);event.preventDefault();
 });
 canvas.addEventListener('pointermove',event=>{if(dragging)pointerSeek(event)});
 const endDrag=()=>{dragging=false};
 canvas.addEventListener('pointerup',endDrag);
 canvas.addEventListener('pointercancel',endDrag);
 canvas.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||!duration())return;
  event.preventDefault();
  if(event.key==='Home')seekFraction(0);
  else if(event.key==='End')seekFraction(1);
  else seekFraction((audio.currentTime+(event.key==='ArrowRight'?1:-1)*Math.max(.25,duration()*.01))/duration());
 });
 audio.addEventListener('timeupdate',draw);
 audio.addEventListener('seeked',draw);
 audio.addEventListener('loadedmetadata',()=>{
  if(!activeId)return;
  message.textContent='Original length '+time(duration())+'. You can listen or scrub the waveform.';
  draw();
 });
 audio.addEventListener('error',()=>{
  if(activeId)message.textContent='This audio format cannot be played by the browser. The saved file is unchanged.';
 });
 function pause(){if(!audio.paused)audio.pause()}
 function clear(){
  decodeEpoch++;dragging=false;pause();
  if(objectUrl){
   audio.removeAttribute('src');audio.load();
   URL.revokeObjectURL(objectUrl);objectUrl=null;
  }
  peaks=null;activeId=null;canvas.hidden=true;audio.hidden=true;root.hidden=true;message.textContent='';
 }
 async function analyze(item,epoch){
  if(item.blob.size>12*1024*1024)return;
  const AudioCtor=window.AudioContext||window.webkitAudioContext;
  if(!AudioCtor||typeof item.blob.arrayBuffer!=='function')return;
  let ctx;
  try{
   ctx=new AudioCtor();
   const buffer=await item.blob.arrayBuffer();
   if(epoch!==decodeEpoch)return;
   const audioBuffer=await ctx.decodeAudioData(buffer);
   if(epoch!==decodeEpoch)return;
   const bins=480,channels=Math.min(audioBuffer.numberOfChannels,2),count=audioBuffer.length;
   if(!channels||!count)return;
   const data=Array.from({length:channels},(_,i)=>audioBuffer.getChannelData(i));
   const out=[];
   for(let i=0;i<bins;i++){
    const start=Math.floor(i*count/bins),stop=Math.max(start+1,Math.floor((i+1)*count/bins));
    const step=Math.max(1,Math.floor((stop-start)/250));
    let lo=0,hi=0;
    for(let j=start;j<Math.min(stop,count);j+=step)
     for(const ch of data){const v=ch[j];if(v<lo)lo=v;if(v>hi)hi=v}
    out.push([lo,hi]);
   }
   peaks=out;canvas.hidden=false;draw();
  }catch{
   // A native player still works when the browser can't decode for drawing.
   if(epoch===decodeEpoch){canvas.hidden=true;message.textContent='Play the saved original below. Waveform unavailable for this format.'}
  }finally{try{await ctx?.close()}catch{}}
 }
 function setItem(item){
  if(!item?.id||!(item.blob instanceof Blob)){clear();return}
  if(activeId===item.id)return;
  clear();activeId=item.id;objectUrl=URL.createObjectURL(item.blob);
  audio.src=objectUrl;audio.hidden=false;root.hidden=false;
  subtitle.textContent=(item.source==='recorded'?'Microphone recording':
   item.source==='imported'?'Imported recording':
   item.source==='librivox'?'LibriVox sample':'Saved original audio')+' · unchanged';
  message.textContent='Play the original below, or scrub the waveform when available.';
  void analyze(item,decodeEpoch);
 }
 const resize=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>draw()):null;
 resize?.observe(canvas);
 window.addEventListener('sc-surface-design-change',draw);
 return {root,audio,canvas,setItem,pause,clear,draw,get activeId(){return activeId}};
}
