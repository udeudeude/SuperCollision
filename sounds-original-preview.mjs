/* Read-only audition of a locally saved original recording.
 * Uses the browser's native audio element, not an alternative instrument
 * engine. No synthesis, processing, automatic playback, or network activity. */
export function createOriginalPreview({label='LISTEN TO ORIGINAL'}={}){
 const root=document.createElement('section');
 root.className='bench-original-preview';root.hidden=true;
 const head=document.createElement('div');head.className='bench-original-head';
 const title=document.createElement('strong');title.textContent=label;
 const subtitle=document.createElement('small');
 subtitle.textContent='Play the unchanged recording before making an instrument.';
 head.append(title,subtitle);
 const audio=document.createElement('audio');
 audio.controls=true;audio.preload='metadata';audio.playsInline=true;
 audio.setAttribute('aria-label','Play original saved audio recording');
 const message=document.createElement('p');message.className='bench-original-message';
 message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 root.append(head,audio,message);
 let objectUrl=null,activeId=null;
 function pause(){if(!audio.paused)audio.pause()}
 function clear(){
  pause();
  if(objectUrl){
   audio.removeAttribute('src');audio.load();
   URL.revokeObjectURL(objectUrl);objectUrl=null;
  }
  activeId=null;root.hidden=true;message.textContent='';
 }
 function setItem(item){
  if(!item?.id||!(item.blob instanceof Blob)){clear();return}
  if(activeId===item.id)return;
  clear();
  activeId=item.id;objectUrl=URL.createObjectURL(item.blob);
  audio.src=objectUrl;root.hidden=false;
  const origin=item.source==='recorded'?'Your microphone recording':
   item.source==='imported'?'Your imported audio':'Saved original audio';
  subtitle.textContent=origin+' · unchanged';
  message.textContent='Tap Play to hear the original recording. This does not start SuperCollider.';
 }
 audio.addEventListener('error',()=>{
  if(!activeId)return;
  message.textContent='This audio format cannot be played by the browser. The saved original is unchanged.';
 });
 audio.addEventListener('loadedmetadata',()=>{
  if(!activeId||!Number.isFinite(audio.duration))return;
  message.textContent='Original length: '+audio.duration.toFixed(1)+' seconds. Ready to listen.';
 });
 return {root,audio,setItem,pause,clear,get activeId(){return activeId}};
}
