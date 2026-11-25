/* Sounds Instrument Bench: categorized sound acquisition and actual local collection.
 * Browser capture is delegated to the existing production recording/import module.
 * No imported SuperCollider code is executed automatically.
 */
import {allSounds,saveSound,deleteSound} from './sounds-store.mjs';
import {createRemoteTools} from './sounds-bench-remote.mjs?v=2.8.1';
import {createOriginalPreview} from './sounds-original-preview.mjs?v=0.6.0';
const $=id=>document.getElementById(id);
const create=(tag,cls,text)=>{
 const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;
};
function action(text,fn,cls=''){
 const b=create('button',cls,text);b.type='button';b.addEventListener('click',fn);return b;
}
function view(name){window.dispatchEvent(new CustomEvent('bench-open-view',{detail:{view:name}}))}
function size(n){return n<1024?n+' B':n<1048576?(n/1024).toFixed(n<10240?1:0)+' KB':(n/1048576).toFixed(1)+' MB'}
const sources=[
 {name:'SCLOrkSynths',url:'https://github.com/SCLOrkHub/SCLOrkSynths',detail:'Over 100 categorized instruments and pattern demos. Repository GPL-3.0; verify each original author.'},
 {name:'SynthDefPool',url:'https://github.com/supercollider-quarks/SynthDefPool',detail:'Community SynthDefs. Check the applicable licenses and dependencies.'},
 {name:'Quarks directory',url:'https://github.com/supercollider-quarks/quarks',detail:'SuperCollider extensions and packages. Many require capabilities not available in this browser.'}
];
function setup(){
 const pane=$('bench-library-workspace'),overlay=$('bench-acquire-overlay');if(!pane||!overlay)return;
 pane.innerHTML="<div class=\"acquire-topline\">\n <strong id=\"acquire-heading\">ACQUIRE / SOUNDS</strong>\n \n</div>\n<div id=\"acquire-collection\" class=\"acquire-page\" hidden>\n <div class=\"acquire-searchbar\">\n  <input id=\"acquire-search\" type=\"search\" placeholder=\"Find sounds or creators\" aria-label=\"Search library\">\n  <select id=\"acquire-filter\" aria-label=\"Filter saved sounds\">\n   <option value=\"all\">ALL SOUNDS</option><option value=\"favorite\">FAVORITES</option><option value=\"instrument\">INSTRUMENTS</option><option value=\"sample\">SAMPLES</option><option value=\"hybrid\">HYBRIDS</option>\n  </select>\n </div>\n <div id=\"acquire-list\" aria-live=\"polite\"></div>\n <p class=\"acquire-footnote\">Saved on this device. Back up important sounds before clearing browser data.</p>\n <details class=\"bench-library-backup\" id=\"bench-library-backup\">\n <summary>BACK UP / RESTORE LIBRARY</summary>\n <div class=\"bench-library-backup-actions\">\n  <button id=\"sounds-backup-export\" type=\"button\">EXPORT ALL SOUNDS</button>\n  <label for=\"sounds-backup-import\">RESTORE BACKUP<input id=\"sounds-backup-import\" type=\"file\" accept=\".scsounds,application/octet-stream\"></label>\n </div>\n <p class=\"acquire-footnote\">Backups include original sound files and instrument code. Existing items are not overwritten during restoration.</p>\n <p id=\"sounds-backup-status\" role=\"status\" aria-live=\"polite\"></p>\n</details>\n</div>\n<div id=\"acquire-overview\" class=\"acquire-page\" hidden>\n <section class=\"acquire-category\" aria-labelledby=\"acquire-instruments-title\">\n  <h2 id=\"acquire-instruments-title\">01 / INSTRUMENTS &amp; CODE</h2>\n  <div class=\"acquire-choices\">\n   <button type=\"button\" data-action=\"write\"><strong>CREATE</strong><small>Write or shape a SuperCollider instrument</small></button>\n   <button type=\"button\" data-action=\"generate\"><strong>GENERATE</strong><small>Describe a sound to generate code</small></button>\n   <button type=\"button\" data-action=\"discover-code\"><strong>DISCOVER</strong><small>Find community SuperCollider instruments</small></button>\n   <button type=\"button\" data-action=\"import-code\"><strong>IMPORT</strong><small>Open a .scd file or paste source</small></button>\n  </div>\n </section>\n <section class=\"acquire-category\" aria-labelledby=\"acquire-samples-title\">\n  <h2 id=\"acquire-samples-title\">02 / RECORDINGS &amp; SAMPLES</h2>\n  <div class=\"acquire-choices\">\n   <button type=\"button\" data-action=\"record\"><strong>RECORD</strong><small>Capture microphone or other audio input</small></button>\n   <button type=\"button\" data-action=\"discover-audio\"><strong>DISCOVER</strong><small>Find licensed online audio recordings</small></button>\n   <button type=\"button\" data-action=\"import\"><strong>IMPORT</strong><small>Add existing audio files</small></button>\n  </div>\n </section>\n</div>\n<div id=\"acquire-record\" class=\"acquire-page acquire-detail\" hidden>\n <div class=\"acquire-detail-head\"><button type=\"button\" class=\"acquire-back\">‹ ACQUIRE</button><strong>RECORD AUDIO</strong></div>\n <label for=\"name\">NAME</label><input id=\"name\" type=\"text\" maxlength=\"120\" placeholder=\"New recording\">\n <label class=\"acquire-check\" for=\"mic-ready\"><input id=\"mic-ready\" type=\"checkbox\"> ENABLE MICROPHONE</label>\n <button id=\"start\" type=\"button\" disabled aria-pressed=\"false\">● HOLD TO RECORD</button>\n <progress id=\"level\" value=\"0\" max=\"1\" aria-label=\"Microphone input level\"></progress>\n <p id=\"status\" role=\"status\" aria-live=\"polite\">Tap Record to start. Tap Stop to save.</p>\n</div>\n<div id=\"acquire-import\" class=\"acquire-page acquire-detail\" hidden>\n <div class=\"acquire-detail-head\"><button type=\"button\" class=\"acquire-back\">‹ ACQUIRE</button><strong>IMPORT AUDIO</strong></div>\n <label for=\"import\">CHOOSE AUDIO FILES</label>\n <input id=\"import\" type=\"file\" accept=\"audio/*,.wav,.flac,.aiff,.ogg,.m4a,.mp3\" multiple>\n <p id=\"acquire-import-status\" role=\"status\" aria-live=\"polite\">Select one or more files. Originals are preserved.</p>\n</div>\n<div id=\"acquire-code\" class=\"acquire-page acquire-detail\" hidden>\n <div class=\"acquire-detail-head\"><button type=\"button\" class=\"acquire-back\">‹ ACQUIRE</button><strong>SUPERCOLLIDER INSTRUMENTS</strong></div>\n <div id=\"acquire-community-sources\">\n  <div class=\"acquire-subhead\">COMMUNITY COLLECTIONS</div>\n  <div id=\"acquire-community-links\"></div>\n  <p class=\"acquire-footnote\">Verify the license, original author, and required Quarks. Public code is not necessarily licensed for reuse or compatible with browser SuperCollider.</p>\n </div>\n <form id=\"acquire-code-form\">\n  <div class=\"acquire-subhead\">IMPORT SOURCE FOR REVIEW</div>\n  <div class=\"acquire-two-inputs\">\n   <label>INSTRUMENT NAME<input id=\"acquire-code-name\" type=\"text\" maxlength=\"120\" placeholder=\"Discovered instrument\" required></label>\n   <label>OPEN .SCD / .TXT<input id=\"acquire-code-file\" type=\"file\" accept=\".scd,.txt,text/plain\"></label>\n  </div>\n  <label>SUPERCOLLIDER CODE<textarea id=\"acquire-code-source\" spellcheck=\"false\" autocorrect=\"off\" autocapitalize=\"off\" placeholder=\"Paste SynthDef or playable SuperCollider code\" required></textarea></label>\n  <div class=\"acquire-two-inputs\">\n   <label>CREATOR / AUTHOR<input id=\"acquire-code-author\" type=\"text\" maxlength=\"160\" placeholder=\"As credited at source\"></label>\n   <label>LICENSE<input id=\"acquire-code-license\" type=\"text\" maxlength=\"160\" placeholder=\"Verify at source\"></label>\n  </div>\n  <label>SOURCE LINK<input id=\"acquire-code-url\" type=\"url\" maxlength=\"800\" placeholder=\"https://...\"></label>\n  <button type=\"submit\">SAVE AND OPEN CODE</button>\n  <p id=\"acquire-code-status\" role=\"status\" aria-live=\"polite\">Imported code is not executed until you explicitly play it.</p>\n </form>\n</div>";
 const libraryDock=$('bench-bottom-library');
 const searchbar=pane.querySelector('.acquire-searchbar');
 if(libraryDock&&searchbar)libraryDock.append(searchbar);
 function openAudio(id){
  closeOverlay();view('sample');
  window.dispatchEvent(new CustomEvent('bench-select-sample',{detail:{id}}));
 }
 async function openNewestAudio(){
  try{
   const items=(await allSounds()).filter(item=>item.blob instanceof Blob);
   items.sort((a,b)=>Number(b.created||0)-Number(a.created||0));
   if(items.length)openAudio(items[0].id);
   else {closeOverlay();view('sample')}
  }catch{closeOverlay();view('sample')}
 }
 const remote=createRemoteTools({
  onUseCode({name,code}){
   const payload={name,code};
   window.dispatchEvent(new CustomEvent('bench-open-source',{detail:payload}));
   if(payload.opened){closeOverlay();view('play')}
   else $('sounds-generate-status').textContent='Current unsaved instrument edits were preserved. Review them before replacing the code.';
  },
  onOpenSamples(){void openNewestAudio()},
  onOpenSample(id){openAudio(id)}
 });
 const pages={collection:$('acquire-collection'),acquire:$('acquire-overview'),
  record:$('acquire-record'),import:$('acquire-import'),code:$('acquire-code'),
  generate:remote.generate,discover:remote.discover,librivox:remote.librivox};
 // Genuine microphone monitor: the recorder's existing analyser drives this
 // waveform, level and elapsed time. Silence remains silence, not decoration.
 const recordMonitor=create('div','bench-record-monitor');
 recordMonitor.id='bench-record-monitor';
 const monitorHead=create('div','bench-record-monitor-head');
 const monitorTitle=create('strong','','MICROPHONE INPUT');
 const meterText=create('output','','MIC OFF');
 meterText.id='bench-record-level-text';
 meterText.setAttribute('aria-label','Live microphone input level');
 const timerText=create('output','','0:00');
 timerText.id='bench-record-timer';
 timerText.setAttribute('aria-label','Elapsed recording time');
 monitorHead.append(monitorTitle,meterText,timerText);
 const wave=create('canvas','bench-record-wave');
 wave.id='bench-record-wave';
 wave.height=90;
 wave.setAttribute('role','img');
 wave.setAttribute('aria-label','Live microphone waveform, derived from microphone input');
 const monitorHint=create('p','bench-record-hint','Input level appears while recording.');
 const meter=$('level');
 recordMonitor.append(monitorHead,wave,meter,monitorHint);
 pages.record.querySelector('#status')?.before(recordMonitor);
 const overlayKeys=['acquire','record','import','code','generate','discover','librivox'];
 // The saved collection remains in Library. Creation and import tools are
 // temporarily shown over the instrument workspace that invoked them.
 for(const key of overlayKeys)overlay.append(pages[key]);
 const footer=create('div');footer.id='bench-acquire-footer';overlay.append(footer);
 const footerPanels={};
 for(const name of ['record','import','code','generate','discover','librivox']){
  const panel=create('div','bench-tool-footer-actions');
  panel.dataset.forTool=name;panel.hidden=true;footer.append(panel);
  footerPanels[name]=panel;
 }
 $('bench-acquire-back').remove();
 const micLabel=pages.record.querySelector('label[for="mic-ready"]');
 if(micLabel){micLabel.hidden=true;footerPanels.record.append(micLabel)}
 footerPanels.record.append($('start'));
 const importLabel=pages.import.querySelector('label[for="import"]');
 if(importLabel)footerPanels.import.append(importLabel);
 footerPanels.import.append($('import'));
 const codeSubmit=$('acquire-code-form')?.querySelector('button[type="submit"]');
 if(codeSubmit){codeSubmit.setAttribute('form','acquire-code-form');footerPanels.code.append(codeSubmit)}
 const generateButton=$('sounds-ai-generate');
 if(generateButton)footerPanels.generate.append(generateButton);
 const discoverySearch=pages.discover.querySelector('.bench-discover-search');
 if(discoverySearch){
  $('discover-query').setAttribute('form','discover-form');
  discoverySearch.querySelector('button[type="submit"]')?.setAttribute('form','discover-form');
  footerPanels.discover.append(discoverySearch);
 }
 const audioCompletion={};
 for(const kind of ['record','import']){
  const bar=create('div','bench-acquire-complete');bar.hidden=true;
  const message=create('span','','SAVED TO LIBRARY');
  const next=action('USE IN SAMPLES',()=>{
   const entry=audioCompletion[kind];
   entry?.audition.pause();
   if(entry?.id)openAudio(entry.id);
  },'bench-remote-primary');
  const audition=createOriginalPreview({label:'LISTEN TO YOUR SAVED ORIGINAL'});
  bar.append(message,next);
  pages[kind].append(audition.root);
  footerPanels[kind].append(audition.audio,bar);
  audioCompletion[kind]={bar,message,audition,id:null};
 }
 let active='collection',token=0,lastTrigger=null,triggerWorkspace=null;
 const backgroundPanels=['lab-setup','bench-sample-workspace','bench-library-workspace','bench-bottom-dock'];
 const setBackgroundInert=value=>{
  for(const id of backgroundPanels){const el=$(id);if(el)el.inert=value}
  // Keep the persistent workspace tabs usable while an acquisition tool is open.
 };
 function microphoneOff(){
  const ready=$('mic-ready');
  if(ready.checked){ready.checked=false;ready.dispatchEvent(new Event('change',{bubbles:true}))}
 }
 function closeOverlay({restoreFocus=true}={}){
  const wasVisible=!overlay.hidden;
  if(active==='record')microphoneOff();
  audioCompletion.record.audition.pause();
  audioCompletion.import.audition.pause();
  if(active==='discover')remote.stopDiscover();
  if(active==='librivox')remote.stopLibriVox();
  overlay.hidden=true;active='collection';
  for(const key of overlayKeys)pages[key].hidden=true;
  setBackgroundInert(false);
  if(wasVisible&&restoreFocus&&lastTrigger?.isConnected&&triggerWorkspace===location.hash)
   try{lastTrigger.focus({preventScroll:true})}catch{}
  lastTrigger=null;triggerWorkspace=null;
 }
 function show(name){
  if(name==='collection'){
   closeOverlay({restoreFocus:false});pages.collection.hidden=false;
   $('acquire-heading').textContent='YOUR SOUNDS';
   void refresh();return;
  }
  if(overlay.hidden){lastTrigger=document.activeElement;triggerWorkspace=location.hash}
  if(active==='record'&&name!=='record')microphoneOff();
  if(active==='discover'&&name!=='discover')remote.stopDiscover();
  if(active==='librivox'&&name!=='librivox')remote.stopLibriVox();
  if(audioCompletion[name])audioCompletion[name].bar.hidden=true;
  active=name;
  for(const key of overlayKeys){
   pages[key].hidden=key!==name;
   if(key===name)pages[key].scrollTop=0;
  }
  for(const [key,controls] of Object.entries(footerPanels))controls.hidden=key!==name;
  const labels={acquire:'SOUND METHODS',record:'RECORD AUDIO',import:'IMPORT AUDIO',code:'IMPORT INSTRUMENT',generate:'GENERATE INSTRUMENT',discover:'DISCOVER RECORDINGS',librivox:'LIBRIVOX SAMPLER'};
  $('bench-acquire-title').textContent=labels[name]||'SOUND METHODS';

  overlay.hidden=false;
  setBackgroundInert(true);

  if(name==='generate'||name==='discover'||name==='librivox')void remote.activate(name);
 }

 window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!overlay.hidden){event.preventDefault();closeOverlay()}});
 overlay.querySelectorAll('.acquire-back').forEach(b=>b.addEventListener('click',()=>closeOverlay()));
 const controls={
  write:()=>{closeOverlay();view('play')},generate:()=>show('generate'),record:()=>show('record'),import:()=>show('import'),
  'discover-audio':()=>show('discover'),librivox:()=>show('librivox'),
  'discover-code':()=>{show('code');$('acquire-community-sources').hidden=false;$('bench-acquire-title').textContent='DISCOVER INSTRUMENTS'},
  'import-code':()=>{show('code');$('acquire-community-sources').hidden=true}
 };
 overlay.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',controls[b.dataset.action]));
 for(const entry of sources){
  const row=create('div','acquire-provider');
  const a=create('a','',entry.name);a.href=entry.url;a.target='_blank';a.rel='noopener noreferrer';
  row.append(a,create('small','',entry.detail));$('acquire-community-links').append(row);
 }
 const file=$('acquire-code-file'),name=$('acquire-code-name'),source=$('acquire-code-source'),notice=$('acquire-code-status');
 file.addEventListener('change',async()=>{
  const selected=file.files?.[0];if(!selected)return;
  if(selected.size>250000){notice.textContent='Code file too large (maximum 250 KB).';return}
  try{
   const content=await selected.text();
   if(content.includes('\0'))throw Error('Not a plain-text SuperCollider file');
   source.value=content;
   if(!name.value)name.value=selected.name.replace(/\.(scd|txt)$/i,'').slice(0,120);
   notice.textContent='Source loaded for review. Nothing has been executed.';
  }catch(error){notice.textContent='Could not read source: '+error.message}
 });
 $('acquire-code-form').addEventListener('submit',async event=>{
  event.preventDefault();const title=name.value.trim().slice(0,120),code=source.value.trim();
  if(!title||!code){notice.textContent='Name and code are required.';return}
  if(code.length>150000){notice.textContent='Source exceeds the 150,000-character limit.';return}
  const rawUrl=$('acquire-code-url').value.trim();let url='';
  if(rawUrl){
   try{const u=new URL(rawUrl);if(u.protocol!=='https:')throw Error();url=u.href}
   catch{notice.textContent='Use a valid HTTPS source link.';return}
  }
  const item={id:crypto.randomUUID(),name:title,source:'written',created:Date.now(),favorite:false,code,
   origin:{provider:'Community SuperCollider source',creator:$('acquire-code-author').value.trim().slice(0,160)||'Unspecified',license:$('acquire-code-license').value.trim().slice(0,160)||'Unverified',url}};
  const submit=event.currentTarget.querySelector('[type=submit]');submit.disabled=true;
  try{
   await saveSound(item);
   notice.textContent='Saved; opening editable source. Nothing has been executed.';
   const handoff={name:item.name,code:item.code};window.dispatchEvent(new CustomEvent('bench-open-source',{detail:handoff}));
   if(handoff.opened)view('play');else notice.textContent='Saved to Library. Existing unsaved Play/Code edits were kept.';
  }catch(error){notice.textContent='Could not save: '+error.message}
  finally{submit.disabled=false}
 });
 // A sample instrument combines a source recording with SuperCollider playback settings.
 // Classify it as a hybrid instead of appearing in both ordinary categories.
 const kindOf=item=>(item.preset?.soundId||(item.code&&item.blob instanceof Blob))?'hybrid'
  :item.blob instanceof Blob?'sample'
  :item.code?'instrument':'other';
 const search=$('acquire-search'),filter=$('acquire-filter'),list=$('acquire-list');
 async function refresh(){
  const id=++token;let items;
  try{items=await allSounds()}catch(error){list.textContent='Library unavailable: '+error.message;return}
  if(id!==token)return;
  const text=search.value.toLowerCase().trim(),kind=filter.value;
  const matching=items.filter(item=>{
   if(kind==='favorite'){if(!item.favorite)return false}else if(kind!=='all'&&kindOf(item)!==kind)return false;
   return [item.name,item.source,item.origin?.creator,item.origin?.license].filter(Boolean).join(' ').toLowerCase().includes(text);
  }).sort((a,b)=>Number(b.created||0)-Number(a.created||0));
  list.replaceChildren();
  if(!matching.length){
   list.append(create('p','acquire-empty',items.length?'No matching sounds.':'Your library is empty. Use Instruments & Code or Recordings & Samples to make or find one.'));
   return;
  }
  for(const item of matching){
   const row=create('article','acquire-entry');
   const meta=create('div','acquire-entry-meta');
   const type=kindOf(item)==='hybrid'?'SAMPLE INSTRUMENT':item.blob instanceof Blob?
    (item.source==='recorded'?'RECORDING':'AUDIO')+' · '+size(item.blob.size):
    item.source==='generated'?'GENERATED INSTRUMENT':'SUPERCOLLIDER INSTRUMENT';
   meta.append(create('strong','',item.name||'Untitled'),
    create('small','',type+(item.origin?.creator?' · '+item.origin.creator:'')));
   const controls=create('div','acquire-entry-actions');
   const open=action('OPEN',()=>{
    if(item.preset?.soundId){location.href='./sounds-bench-preview.html?preset='+encodeURIComponent(item.id)+'#sample';return}
    if(item.code){
     const handoff={name:item.name,code:item.code,bench:item.bench};
     window.dispatchEvent(new CustomEvent('bench-open-source',{detail:handoff}));
     if(handoff.opened)view('play');
     return;
    }
    if(item.blob instanceof Blob)openAudio(item.id);
   },'acquire-open');
   if(!item.code&&!(item.blob instanceof Blob)&&!item.preset)open.disabled=true;
   const favorite=action(item.favorite?'★':'☆',async()=>{
    favorite.disabled=true;
    try{await saveSound({...item,favorite:!item.favorite})}
    catch(error){list.prepend(create('p','acquire-empty','Could not update favorite: '+error.message));favorite.disabled=false}
   },'acquire-favorite');
   favorite.setAttribute('aria-pressed',String(Boolean(item.favorite)));
   favorite.setAttribute('aria-label',(item.favorite?'Remove':'Add')+' favorite: '+item.name);
   const menu=create('div','acquire-entry-menu');menu.hidden=true;
   const editor=create('div','acquire-rename');editor.hidden=true;
   const nameInput=create('input');nameInput.type='text';nameInput.value=item.name;nameInput.maxLength=120;
   nameInput.setAttribute('aria-label','New name for '+item.name);
   const confirmRename=action('SAVE NAME',async()=>{
    const name=nameInput.value.trim();
    if(!name){nameInput.focus();return}
    confirmRename.disabled=true;
    try{await saveSound({...item,name:name.slice(0,120)})}
    catch(error){confirmRename.disabled=false;list.prepend(create('p','acquire-empty','Rename failed: '+error.message))}
   });
   const cancelRename=action('CANCEL',()=>{editor.hidden=true;menu.hidden=false});
   editor.append(nameInput,confirmRename,cancelRename);
   const rename=action('RENAME',()=>{menu.hidden=true;editor.hidden=false;nameInput.focus();nameInput.select()});
   const remove=action('DELETE',async()=>{
    if(!confirm('Delete "'+item.name+'" from this device? This cannot be undone.'))return;
    remove.disabled=true;
    try{await deleteSound(item.id)}
    catch(error){remove.disabled=false;list.prepend(create('p','acquire-empty','Delete failed: '+error.message))}
   });
   menu.append(rename,remove);
   if(item.origin?.license)menu.append(create('span','acquire-license','License: '+item.origin.license));
   const more=action('⋯',()=>{
    const show=menu.hidden&&editor.hidden;
    menu.hidden=!show;editor.hidden=true;
    more.setAttribute('aria-expanded',String(show));
   },'acquire-more');
   more.setAttribute('aria-label','More options for '+item.name);
   more.setAttribute('aria-expanded','false');
   controls.append(open,favorite,more);
   row.append(meta,controls,menu,editor);list.append(row);
  }
 }
 search.addEventListener('input',()=>void refresh());
 filter.addEventListener('change',()=>void refresh());
 document.addEventListener('sounds-library-changed',()=>{void refresh()});
 // Use the exact ID emitted by a successful recorder/import save. A generic
 // library change (renaming or favoriting) must never claim that audio was saved.
 document.addEventListener('sounds-audio-saved',event=>{
  const {id,source}=event.detail||{};
  const kind=source==='recorded'?'record':source==='imported'?'import':null;
  if(!kind||typeof id!=='string')return;
  void allSounds().then(items=>{
   const item=items.find(entry=>entry.id===id&&entry.blob instanceof Blob);
   if(!item)return;
   const finish=audioCompletion[kind];
   finish.id=id;
   finish.message.textContent=(kind==='record'?'RECORDING':'AUDIO FILE')+' SAVED · '+item.name;
   finish.audition.setItem(item);
   finish.bar.hidden=false;
   if(kind==='import')$('acquire-import-status').textContent='Audio saved. Listen to the original before creating an instrument.';
  }).catch(error=>{
   if(kind==='import')$('acquire-import-status').textContent='Saved, but playback is unavailable: '+error.message;
  });
 });
 window.addEventListener('bench-library-open',()=>view('details'));
 window.addEventListener('bench-view-changed',event=>{
  if(event.detail.view==='details')show('collection');
  else closeOverlay();
 });
 window.addEventListener('bench-acquire-action',event=>{
  const name=event.detail?.action;
  if(Object.hasOwn(controls,name))controls[name]();
 });
 // First render is always a working instrument. The Library is prepared but hidden.
 show('collection');
 // Bind the existing production microphone and audio-import module to its original
 // element IDs. This keeps native recording/storage behavior unchanged.
 import('./sounds-backup-ui.mjs?v=1').catch(error=>{
  $('sounds-backup-status').textContent='Backup tools unavailable: '+error.message;
 });
 import('./sounds-library.mjs?v=2.8.1').catch(error=>{
  $('status').textContent='Audio recorder unavailable: '+error.message;
  $('acquire-import-status').textContent='Import unavailable: '+error.message;
 });
}
// The bench shell is created in a DOMContentLoaded listener on the host page.
// A deferred module may run while readyState is 'interactive', before that shell exists.
if(document.readyState!=='complete')document.addEventListener('DOMContentLoaded',setup,{once:true});
else setup();
