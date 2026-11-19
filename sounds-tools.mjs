/* Sounds-only standalone library tools. Does not modify the main editor. */
const DB='supercollision-sounds-v1', STORE='sounds';
const root=document.getElementById('sounds-tools');
const search=document.getElementById('sounds-search');
const filter=document.getElementById('sounds-filter');
const code=document.getElementById('sounds-source');
const title=document.getElementById('sounds-source-name');
const notice=document.getElementById('sounds-tools-status');
const view=document.getElementById('sounds-managed-list');
function db(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function operate(mode,action){const database=await db();try{return await new Promise((resolve,reject)=>{const tx=database.transaction(STORE,mode),store=tx.objectStore(STORE);let value;tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);action(store,x=>value=x)})}finally{database.close()}}
const all=()=>operate('readonly',(store,done)=>{const req=store.getAll();req.onsuccess=()=>done(req.result)});
const put=item=>operate('readwrite',store=>store.put(item));
function button(label,action){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',action);return b}
function message(value){notice.textContent=value}
async function refresh(){
 let items;try{items=await all()}catch(error){message('Library unavailable: '+error.message);return}
 const q=search.value.trim().toLowerCase(),f=filter.value;
 items=items.filter(item=>(!q||(item.name||'').toLowerCase().includes(q)||(item.code||'').toLowerCase().includes(q))&&(f==='all'||(f==='favorite'?item.favorite:item.source===f))).sort((a,b)=>b.created-a.created);
 view.replaceChildren();
 if(!items.length){const p=document.createElement('p');p.className='muted';p.textContent='No matching sounds.';view.append(p);return}
 for(const item of items){
  const row=document.createElement('article');row.className='managed-item';
  const heading=document.createElement('strong');heading.textContent=item.name||'Untitled';
  const meta=document.createElement('small');meta.textContent=(item.source||'unknown')+' · '+new Date(item.created).toLocaleString();
  const actions=document.createElement('div');actions.className='actions';
  actions.append(button(item.favorite?'★ Favorite':'☆ Favorite',async()=>{item.favorite=!item.favorite;await put(item);refresh()}));
  actions.append(button('Rename',async()=>{const name=prompt('Sound name',item.name||'');if(name===null)return;if(!name.trim()){message('Name cannot be empty.');return}item.name=name.trim().slice(0,120);await put(item);refresh()}));
  if(item.code){const pre=document.createElement('pre');pre.className='saved-code';pre.textContent=item.code;row.append(heading,meta,pre);actions.append(button('Copy code',()=>navigator.clipboard.writeText(item.code).then(()=>message('Code copied.')).catch(()=>message('Clipboard unavailable. Select the code manually.'))));}
  else{row.append(heading,meta);if(item.blob){const audio=document.createElement('audio');audio.controls=true;audio.preload='none';const url=URL.createObjectURL(item.blob);audio.src=url;row.append(audio);actions.append(button('Export',()=>{const a=document.createElement('a');a.href=url;a.download=(item.name||'sound').replace(/[\\/:*?"<>|]/g,'_')+(item.mime?.includes('mp4')?'.m4a':item.mime?.includes('wav')?'.wav':'.webm');a.click()}))}}
  row.append(actions);view.append(row)
 }
}
document.getElementById('sounds-save-source').addEventListener('click',async()=>{
 const name=title.value.trim(),source=code.value.trim();
 if(!name||!source){message('Provide both a name and SuperCollider code.');return}
 if(source.length>150000){message('Code is too large for this library entry.');return}
 try{await put({id:crypto.randomUUID(),name:name.slice(0,120),code:source,source:'written',created:Date.now(),favorite:false});code.value='';message('Saved SuperCollider source without executing it.');refresh()}catch(error){message('Save failed: '+error.message)}
});
search.addEventListener('input',refresh);filter.addEventListener('change',refresh);
document.getElementById('import').addEventListener('change',()=>setTimeout(refresh,350));
const originalStatus=document.getElementById('status');
new MutationObserver(()=>{if(/Saved recording locally|Imported /.test(originalStatus.textContent))refresh()}).observe(originalStatus,{childList:true,subtree:true,characterData:true});
refresh();
