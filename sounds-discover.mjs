/* Sounds / Discover. Online search only; explicit, size-limited, permission-aware downloads.
 * No service-worker or main-page changes. Audio is stored unchanged. */
import {readableLicense,meetsLicenseFilters,openverseLicenseFilter} from './sounds-licenses.mjs';
import {saveSound} from './sounds-store.mjs';
import {freesoundLicenseFilter,openverseSourceFilter,durationSeconds,importedAudioMime} from './sounds-discover-core.mjs';
const $=id=>document.getElementById(id);
const form=$('discover-form'),results=$('discover-results'),status=$('discover-status');
const source=$('discover-source'),query=$('discover-query'),licenseControls={
 commercial:$('discover-commercial'),modification:$('discover-modification'),
 noAttribution:$('discover-no-attribution'),cc0Only:$('discover-cc0')
};
const keyBox=$('discover-key-box'),key=$('discover-key'),more=$('discover-next'),previous=$('discover-previous');
const allowUnverified=$('discover-allow-unverified');
const MAX_BYTES=50*1024*1024, PAGE_SIZE=20;
let page=1,pageCount=0,controller=null,busy=false;
const filters=()=>Object.fromEntries(Object.entries(licenseControls).map(([name,node])=>[name,!!node.checked]));
function say(message){status.textContent=message}
function element(tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);return n}
function action(label,fn){const n=element('button',label);n.type='button';n.addEventListener('click',fn);return n}
function httpsUrl(value){
 try{const u=new URL(value);return u.protocol==='https:'?u.href:null}catch{return null}
}
function syncSource(){keyBox.hidden=source.value!=='freesound';$('discover-source-description').textContent=source.value==='freesound'?'Freesound requires your personal application key. Saved files are preview quality.':'Openverse requires no account. Wikimedia results are drawn from its Commons collection.'}
function invalidateSearch(message){
 controller?.abort();controller=null;busy=false;page=1;pageCount=0;
 results.replaceChildren();more.disabled=true;previous.disabled=true;say(message);
}
source.addEventListener('change',()=>{invalidateSearch('Collection changed. Search again to see matching sounds.');syncSource()});
for(const control of Object.values(licenseControls)){
 control.addEventListener('change',()=>invalidateSearch('License filters changed. Search again to see matching sounds.'));
}
query.addEventListener('input',()=>{if(pageCount||busy)invalidateSearch('Search terms changed. Search again to see matching sounds.')});
syncSource();
function providerMetadata(sound,provider){
 if(provider==='freesound'){
  const preview=httpsUrl(sound.previews?.['preview-hq-mp3']||sound.previews?.['preview-lq-mp3']);
  return {id:String(sound.id||''),name:sound.name||'Untitled Freesound audio',
   creator:sound.username||'Creator not specified',license:sound.license||'',licenseUrl:null,
   pageUrl:httpsUrl('https://freesound.org/people/'+encodeURIComponent(sound.username||'')+'/sounds/'+sound.id+'/'),
   audioUrl:preview,variant:'compressed preview',provider:'Freesound',source:'freesound',
   duration:durationSeconds(sound.duration,'freesound'),filesize:null,attribution:null,licenseVersion:null};
 }
 return {id:String(sound.id||''),name:sound.title||'Untitled Openverse audio',
  creator:sound.creator||'Creator not specified',license:sound.license||'',licenseVersion:sound.license_version||null,licenseUrl:httpsUrl(sound.license_url),
  pageUrl:httpsUrl(sound.foreign_landing_url)||httpsUrl(sound.url),
  audioUrl:httpsUrl(sound.url),variant:'source audio',provider:sound.source||'Openverse',
  source:'openverse',duration:durationSeconds(sound.duration,'openverse'),filesize:Number(sound.filesize)||null,
  attribution:typeof sound.attribution==='string'?sound.attribution:null};
}
async function searchSounds(nextPage=1){
 const term=query.value.trim().slice(0,200),from=source.value,selected=filters();
 if(!term){say('Enter a search term.');return}
 if(from==='freesound'&&!key.value.trim()){say('Enter a personal Freesound application key. It is not saved.');return}
 if(!navigator.onLine){say('Discover requires an internet connection. Your saved library works offline.');return}
 if(controller)controller.abort();
 controller=new AbortController();const signal=controller.signal;
 busy=true;results.replaceChildren();more.disabled=true;previous.disabled=true;say('Searching '+(from==='freesound'?'Freesound':'Openverse')+'…');
 try{
  let url,options={signal,cache:'no-store'};
  if(from==='freesound'){
   const params=new URLSearchParams({query:term,page:String(nextPage),page_size:String(PAGE_SIZE),
    fields:'id,name,username,license,url,previews,duration'});
   const serverLicenseFilter=freesoundLicenseFilter(selected);
   if(serverLicenseFilter)params.set('filter',serverLicenseFilter);
   url='https://freesound.org/apiv2/search/?'+params;
   options.headers={Authorization:'Token '+key.value.trim()};
  }else{
   const params=new URLSearchParams({q:term,page:String(nextPage),page_size:String(PAGE_SIZE)});
   const licenses=openverseLicenseFilter(selected);
   if(licenses)params.set('license',licenses);
   if(openverseSourceFilter(from))params.set('source',openverseSourceFilter(from));
   url='https://api.openverse.org/v1/audio/?'+params;
  }
  const response=await fetch(url,options);
  if(!response.ok)throw Error('Search returned '+response.status+(response.status===429?' (rate limit)':''));
  const body=await response.json();
  if(signal.aborted)return;
  const matches=(Array.isArray(body.results)?body.results:[]).map(sound=>providerMetadata(sound,from)).filter(item=>meetsLicenseFilters(item.license,selected));
  page=nextPage;
  pageCount=from==='freesound'?(body.next?Math.max(page+1,Math.ceil((body.count||0)/PAGE_SIZE)):page):Number(body.page_count)||page;
  for(const item of matches)renderResult(item);
  if(!matches.length)results.append(element('p','No sounds on this results page satisfy your license filters. Try a different search or page.'));
  say('Showing '+matches.length+' license-matching sounds · page '+page+(pageCount>page?' of '+pageCount:'')+'. Check licensing at the original source before publication.');
  previous.disabled=page===1;more.disabled=page>=pageCount;
 }catch(error){if(!signal.aborted)say('Search unavailable: '+error.message+'. Your existing sounds remain accessible.')}
 finally{if(!signal.aborted)busy=false}
}
function downloadAllowed(){
 const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
 const verifiedWifi=connection?.type==='wifi'&&!connection?.saveData;
 return verifiedWifi||allowUnverified.checked;
}
async function downloadLimited(url,knownSize){
 if(knownSize>MAX_BYTES)throw Error('This file exceeds the 50 MB per-download limit.');
 const response=await fetch(url,{cache:'no-store',credentials:'omit'});
 if(!response.ok)throw Error('Download returned '+response.status);
 const type=importedAudioMime(response.headers.get('content-type'),url);
 const size=Number(response.headers.get('content-length')||0);
 if(size>MAX_BYTES){await response.body?.cancel();throw Error('File exceeds 50 MB.')}
 if(!response.body?.getReader)throw Error('Your browser cannot verify download size safely. Download from the source and Import instead.');
 const reader=response.body.getReader(),parts=[];let count=0;
 try{
  while(true){
   const part=await reader.read();if(part.done)break;
   count+=part.value.byteLength;if(count>MAX_BYTES)throw Error('File exceeded 50 MB, so download stopped.');
   parts.push(part.value);
  }
 }catch(error){await reader.cancel().catch(()=>{});throw error}
 if(!count)throw Error('The downloaded file was empty.');
 return new Blob(parts,{type});
}
async function addToLibrary(item,button){
 if(!item.audioUrl){say('This result has no direct audio URL. Follow the source link, then import the file.');return}
 if(!downloadAllowed()){
  say('Download paused: Wi-Fi cannot be verified. To proceed, enable the explicit network override below. No file was downloaded.');allowUnverified.focus();return;
 }
 const label=button.textContent;
 button.disabled=true;button.textContent='Saving…';say('Downloading selected '+item.variant+'…');
 try{
  const blob=await downloadLimited(item.audioUrl,item.filesize);
  await saveSound({id:crypto.randomUUID(),name:item.name.slice(0,120),source:item.source,
   created:Date.now(),mime:blob.type,blob,favorite:false,
   origin:{provider:item.provider,id:item.id,url:item.pageUrl,creator:item.creator,
    license:item.license||'Unspecified',licenseVersion:item.licenseVersion||null,licenseUrl:item.licenseUrl,
    attribution:item.attribution||null,retrievedAt:new Date().toISOString(),variant:item.variant}});
  say('Saved '+item.name+' locally. Original license and creator information retained.');
 }catch(error){say('Could not save audio: '+error.message+'. Open its source page and import the downloaded file instead.')}
 finally{button.disabled=false;button.textContent=label}
}
function renderResult(item){
 const card=element('article');card.className='discovered-sound';
 const name=element('strong',item.name);
 const meta=element('small',item.creator+' · '+(item.duration?Math.round(item.duration)+' s · ':'')+item.provider+' · '+readableLicense(item.license));
 card.append(name,meta);
 if(item.audioUrl){
  const audio=element('audio');audio.controls=true;audio.preload='none';audio.crossOrigin='anonymous';audio.src=item.audioUrl;audio.setAttribute('aria-label','Preview '+item.name);card.append(audio);
 }
 const actions=element('div');actions.className='actions';
 if(item.audioUrl){
  const save=action(item.variant==='source audio'?'Save original audio':'Save compressed preview',()=>addToLibrary(item,save));
  actions.append(save);
 }
 if(item.pageUrl){const a=element('a','View source');a.href=item.pageUrl;a.target='_blank';a.rel='noopener noreferrer';actions.append(a)}
 if(item.licenseUrl){const a=element('a','License terms');a.href=item.licenseUrl;a.target='_blank';a.rel='noopener noreferrer';actions.append(a)}
 card.append(actions);results.append(card);
}
document.addEventListener('sounds-view-changed',event=>{
 if(event.detail?.view==='discover')return;
 if(busy){controller?.abort();controller=null;busy=false;more.disabled=true;previous.disabled=true;say('Search stopped when you left Discover. Search again to continue.')}
 for(const audio of results.querySelectorAll('audio'))audio.pause();
});
window.addEventListener('pagehide',()=>controller?.abort());
form.addEventListener('submit',event=>{event.preventDefault();searchSounds(1)});
more.addEventListener('click',()=>{if(!busy&&page<pageCount)searchSounds(page+1)});
previous.addEventListener('click',()=>{if(!busy&&page>1)searchSounds(page-1)});
