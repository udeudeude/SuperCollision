/* Freesound discovery, isolated from SuperCollision's main editor. */
const $=id=>document.getElementById(id);
const form=$('discover-form'),results=$('discover-results'),status=$('discover-status');
const key=$('discover-key'),query=$('discover-query'),license=$('discover-license');
function say(message){status.textContent=message}
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('supercollision-sounds-v1',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('sounds'))r.result.createObjectStore('sounds',{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function save(item){const db=await openDB();try{await new Promise((resolve,reject)=>{const tx=db.transaction('sounds','readwrite');tx.objectStore('sounds').put(item);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}finally{db.close()}}
function el(tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n}
function action(text,fn){const b=el('button',text);b.type='button';b.onclick=fn;return b}
function safeLink(url){try{const u=new URL(url);return u.protocol==='https:'?u.href:null}catch{return null}}
form.addEventListener('submit',async event=>{
 event.preventDefault();const token=key.value.trim(),term=query.value.trim();
 if(!term){say('Enter a search term.');return}
 if(!token){say('Enter your personal Freesound application key. It is used only for this request and is not stored.');return}
 results.replaceChildren();say('Searching Freesound…');
 const params=new URLSearchParams({query:term,page_size:'15',fields:'id,name,username,license,url,previews,duration,description'});
 if(license.value!=='any')params.set('filter','license:'+license.value);
 try{
  const response=await fetch('https://freesound.org/apiv2/search/?'+params,{headers:{Authorization:'Token '+token},cache:'no-store'});
  if(!response.ok)throw Error('Freesound returned '+response.status);
  const data=await response.json();const sounds=Array.isArray(data.results)?data.results:[];
  say(sounds.length+' results. Preview online; explicitly save a selected preview to your local library.');
  for(const sound of sounds){
   const card=el('article');card.className='managed-item';
   const name=el('strong',sound.name||'Untitled'),meta=el('small',(sound.username||'Unknown creator')+' · '+(sound.duration||0).toFixed(1)+' s · '+(sound.license||'License unspecified'));
   card.append(name,meta);
   const preview=safeLink(sound.previews?.['preview-hq-mp3']||sound.previews?.['preview-lq-mp3']);
   if(preview){const audio=el('audio');audio.controls=true;audio.preload='none';audio.src=preview;audio.style.width='100%';card.append(audio)}
   const controls=el('div');controls.className='actions';
   const page=safeLink(sound.url);if(page){const a=el('a','View source / license');a.href=page;a.target='_blank';a.rel='noopener noreferrer';controls.append(a)}
   if(preview)controls.append(action('Save preview',async()=>{
    if(!confirm('Download this Freesound preview into the local library? Check the listed license and attribution requirements.'))return;
    try{
     say('Downloading selected preview…');
     const response=await fetch(preview);if(!response.ok)throw Error('Download returned '+response.status);
     const blob=await response.blob();if(!blob.size)throw Error('Empty preview');if(blob.size>50*1024*1024)throw Error('Preview exceeds 50 MB');
     await save({id:crypto.randomUUID(),name:sound.name||'Freesound sample',source:'freesound',created:Date.now(),mime:blob.type||'audio/mpeg',blob,origin:{provider:'Freesound',id:sound.id,url:page,creator:sound.username,license:sound.license,variant:'preview'}});
     say('Saved locally with creator, source and license metadata. Reload the library list to see it.');
    }catch(error){say('Could not save preview: '+error.message+'. Open Freesound to download manually, then Import audio.')}
   }));
   card.append(controls);results.append(card)
  }
 }catch(error){say('Search failed: '+error.message+'. Check your key, connection, and browser cross-origin restrictions.')}
});
