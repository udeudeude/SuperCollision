/* Unified Sounds library. Works with recordings, imports, online sources and SC source code. */
import {allSounds,saveSound,deleteSound} from './sounds-store.mjs';
import {readableLicense} from './sounds-licenses.mjs';
const $=id=>document.getElementById(id);
const search=$('sounds-search'),filter=$('sounds-filter'),view=$('sounds-managed-list');
const code=$('sounds-source'),title=$('sounds-source-name'),notice=$('sounds-tools-status');
const saveButton=$('sounds-save-source'),cancelButton=$('sounds-cancel-edit');
let pending=0,editing=null,objectUrls=[];
const say=message=>{notice.textContent=message};
function node(tag,text){const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element}
function action(text,fn){const b=node('button',text);b.type='button';b.addEventListener('click',fn);return b}
function safeUrl(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:null}catch{return null}}
function filename(item){
 const ext=(item.mime||item.blob?.type||'').toLowerCase();
 const suffix=ext.includes('wav')?'.wav':ext.includes('mp4')?'.m4a':ext.includes('mpeg')?'.mp3':ext.includes('ogg')?'.ogg':ext.includes('flac')?'.flac':'.webm';
 const name=(item.name||'sound').replace(/[\\/:*?"<>|]/g,'_').slice(0,120);
 return /\.(wav|m4a|mp3|ogg|flac|webm|opus|aiff)$/i.test(name)?name:name+suffix;
}
function resetEdit(){
 editing=null;saveButton.textContent='Save to library';cancelButton.hidden=true;
 title.value='';code.value='';
}
async function refresh(){
 const version=++pending;
 let items;try{items=await allSounds()}catch(error){say('Library unavailable: '+error.message);return}
 if(version!==pending)return;
 const audioIds=new Set(items.filter(item=>item.blob instanceof Blob).map(item=>item.id));
 for(const url of objectUrls)URL.revokeObjectURL(url);objectUrls=[];
 const query=search.value.trim().toLowerCase(),kind=filter.value;
 items=items.filter(item=>{
  const haystack=[item.name,item.code,item.source,item.origin?.creator,item.origin?.license].filter(Boolean).join(' ').toLowerCase();
  return (!query||haystack.includes(query))&&(kind==='all'||(kind==='favorite'?!!item.favorite:item.source===kind));
 }).sort((a,b)=>Number(b.created||0)-Number(a.created||0));
 view.replaceChildren();
 const count=node('p',items.length+' matching sound'+(items.length===1?'':'s'));
 count.className='muted';view.append(count);
 if(!items.length)return;
 for(const item of items){
  const row=node('article');row.className='managed-item';
  row.append(node('strong',item.name||'Untitled'));
  const date=new Date(item.created||0),dateText=Number.isNaN(+date)?'Unknown date':date.toLocaleString();
  const meta=node('small',(item.source||'unknown')+' · '+dateText);
  row.append(meta);
  if(item.origin){
   const origin=item.origin;
   row.append(node('small','Source: '+(origin.creator||origin.provider||'Unknown')+' · '+readableLicense(origin.license)+(origin.variant?' · '+origin.variant:'')));
   const link=safeUrl(origin.url);
   if(link){const a=node('a','Source page');a.href=link;a.target='_blank';a.rel='noopener noreferrer';row.append(a)}
   const creatorLink=safeUrl(origin.creatorUrl);
   if(creatorLink){row.append(' · ');const a=node('a','Creator profile');a.href=creatorLink;a.target='_blank';a.rel='noopener noreferrer';row.append(a)}
   const licenseLink=safeUrl(origin.licenseUrl);
   if(licenseLink){row.append(' · ');const a=node('a','License');a.href=licenseLink;a.target='_blank';a.rel='noopener noreferrer';row.append(a)}
  }
  if(item.preset?.soundId){
   row.append(node('small',audioIds.has(item.preset.soundId)?'Native SuperCollider sample preset · source audio available':'Sample preset · ORIGINAL AUDIO MISSING. Restore the source recording from a backup.'));
  }
  if(item.code){
   const codePreview=node('pre',item.code);codePreview.className='saved-code';row.append(codePreview);
  }else if(item.blob instanceof Blob){
   const audio=node('audio');audio.controls=true;audio.preload='none';
   const url=URL.createObjectURL(item.blob);objectUrls.push(url);audio.src=url;row.append(audio);
  }else{
   row.append(node('p','This library item has neither audio nor source code.'));
  }
  const actions=node('div');actions.className='actions';
  actions.append(action(item.favorite?'★ Favorite':'☆ Favorite',async()=>{
   try{await saveSound({...item,favorite:!item.favorite})}catch(error){say('Could not update favorite: '+error.message)}
  }));
  actions.append(action('Rename',async()=>{
   const newName=prompt('Sound name',item.name||'');
   if(newName===null)return;
   if(!newName.trim()){say('The sound name cannot be empty.');return}
   try{await saveSound({...item,name:newName.trim().slice(0,120)})}catch(error){say('Rename failed: '+error.message)}
  }));
  if(item.preset?.soundId){
   const lab=node('a','Open preset in Sample Lab');
   lab.href='./sounds-lab.html?preset='+encodeURIComponent(item.id);
   actions.append(lab);
  }
  if(item.code){
   if(!item.preset)actions.append(action('Edit source',()=>{
    editing=item.id;title.value=item.name;code.value=item.code;
    saveButton.textContent='Save changes';cancelButton.hidden=false;
    document.querySelector('#sounds-tabs [data-view="create"]').click();
    code.focus();
   }));
   actions.append(action('Export .scd',()=>{
    const blob=new Blob([item.code],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob);
    const a=node('a');a.href=url;
    a.download=(item.name||'instrument').replace(/[\\/:*?"<>|]/g,'_').slice(0,110).replace(/\.scd$/i,'')+'.scd';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
   }));
   actions.append(action('Copy code',async()=>{
    try{await navigator.clipboard.writeText(item.code);say('SuperCollider code copied.')}
    catch{say('Clipboard permission denied. Select and copy the displayed source instead.')}
   }));
  }else if(item.blob instanceof Blob){
   actions.append(action('Export audio',()=>{
    const url=URL.createObjectURL(item.blob),anchor=node('a');
    anchor.href=url;anchor.download=filename(item);anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
   }));
  }
  if(item.origin){
   actions.append(action('Copy attribution',async()=>{
    const origin=item.origin;
    const text=origin.attribution||[item.name,'by '+(origin.creator||'Unknown creator'),
     readableLicense(origin.license),origin.url||'',origin.licenseUrl||''].filter(Boolean).join(' · ');
    try{await navigator.clipboard.writeText(text);say('Attribution copied. Verify the license terms before distributing.')}
    catch{say('Could not copy attribution automatically. Source information is shown above.')}
   }));
  }
  actions.append(action('Delete',async()=>{
   if(!confirm('Delete '+(item.name||'this sound')+' from this device? This cannot be undone.'))return;
   try{await deleteSound(item.id);say('Deleted '+item.name+'.')}catch(error){say('Delete failed: '+error.message)}
  }));
  row.append(actions);view.append(row);
 }
}
saveButton.addEventListener('click',async()=>{
 const name=title.value.trim().slice(0,120),source=code.value.trim();
 if(!name||!source){say('Provide a name and SuperCollider source.');return}
 if(source.length>150000){say('Source code exceeds the 150,000-character limit.');return}
 try{
  const existing=editing?(await allSounds()).find(x=>x.id===editing):null;
  const entry=existing?{...existing,name,code:source}:{id:crypto.randomUUID(),name,source:'written',created:Date.now(),code:source,favorite:false};
  await saveSound(entry);resetEdit();say('SuperCollider source saved to the library. It was not executed.');
 }catch(error){say('Could not save source: '+error.message)}
});
cancelButton.addEventListener('click',resetEdit);
search.addEventListener('input',refresh);filter.addEventListener('change',refresh);
document.addEventListener('sounds-library-changed',refresh);
window.addEventListener('pagehide',()=>{for(const url of objectUrls)URL.revokeObjectURL(url);objectUrls=[]});
refresh();
