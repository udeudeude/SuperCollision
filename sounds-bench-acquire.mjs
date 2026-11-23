/* Sounds Instrument Bench: categorized sound acquisition and actual local collection.
 * Browser capture is delegated to the existing production recording/import module.
 * No imported SuperCollider code is executed automatically.
 */
import {allSounds,saveSound} from './sounds-store.mjs';
const $=id=>document.getElementById(id);
const create=(tag,cls,text)=>{
 const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;
};
function action(text,fn,cls=''){
 const b=create('button',cls,text);b.type='button';b.addEventListener('click',fn);return b;
}
function view(name){window.dispatchEvent(new CustomEvent('bench-open-view',{detail:{view:name}}))}
function legacy(name){location.href='./sounds.html#'+name}
function size(n){return n<1024?n+' B':n<1048576?(n/1024).toFixed(n<10240?1:0)+' KB':(n/1048576).toFixed(1)+' MB'}
const sources=[
 {name:'SCLOrkSynths',url:'https://github.com/SCLOrkHub/SCLOrkSynths',detail:'Over 100 categorized instruments and pattern demos. Repository GPL-3.0; verify each original author.'},
 {name:'SynthDefPool',url:'https://github.com/supercollider-quarks/SynthDefPool',detail:'Community SynthDefs. Check the applicable licenses and dependencies.'},
 {name:'Quarks directory',url:'https://github.com/supercollider-quarks/quarks',detail:'SuperCollider extensions and packages. Many require capabilities not available in this browser.'}
];
function setup(){
 const pane=$('bench-library-workspace'),overlay=$('bench-acquire-overlay');if(!pane||!overlay)return;
 pane.innerHTML="<div class=\"acquire-topline\">\n <strong id=\"acquire-heading\">ACQUIRE / SOUNDS</strong>\n \n</div>\n<div id=\"acquire-collection\" class=\"acquire-page\" hidden>\n <div class=\"acquire-searchbar\">\n  <input id=\"acquire-search\" type=\"search\" placeholder=\"Find sounds or creators\" aria-label=\"Search library\">\n  <select id=\"acquire-filter\" aria-label=\"Filter saved sounds\">\n   <option value=\"all\">ALL SOUNDS</option><option value=\"instrument\">INSTRUMENTS</option><option value=\"sample\">SAMPLES</option><option value=\"hybrid\">HYBRIDS</option>\n  </select>\n </div>\n <div id=\"acquire-list\" aria-live=\"polite\"></div>\n <p class=\"acquire-footnote\">Saved on this device. Back up important sounds before clearing browser data.</p>\n <a class=\"acquire-utility-link\" href=\"./sounds.html#library\">BACKUP / RESTORE / MANAGE</a>\n</div>\n<div id=\"acquire-overview\" class=\"acquire-page\" hidden>\n <section class=\"acquire-category\" aria-labelledby=\"acquire-instruments-title\">\n  <h2 id=\"acquire-instruments-title\">01 / INSTRUMENTS &amp; CODE</h2>\n  <div class=\"acquire-choices\">\n   <button type=\"button\" data-action=\"write\"><strong>CREATE</strong><small>Write or shape a SuperCollider instrument</small></button>\n   <button type=\"button\" data-action=\"generate\"><strong>GENERATE</strong><small>Describe a sound to generate code</small></button>\n   <button type=\"button\" data-action=\"discover-code\"><strong>DISCOVER</strong><small>Find community SuperCollider instruments</small></button>\n   <button type=\"button\" data-action=\"import-code\"><strong>IMPORT</strong><small>Open a .scd file or paste source</small></button>\n  </div>\n </section>\n <section class=\"acquire-category\" aria-labelledby=\"acquire-samples-title\">\n  <h2 id=\"acquire-samples-title\">02 / RECORDINGS &amp; SAMPLES</h2>\n  <div class=\"acquire-choices\">\n   <button type=\"button\" data-action=\"record\"><strong>RECORD</strong><small>Capture microphone or other audio input</small></button>\n   <button type=\"button\" data-action=\"discover-audio\"><strong>DISCOVER</strong><small>Find licensed online audio recordings</small></button>\n   <button type=\"button\" data-action=\"import\"><strong>IMPORT</strong><small>Add existing audio files</small></button>\n  </div>\n </section>\n</div>\n<div id=\"acquire-record\" class=\"acquire-page acquire-detail\" hidden>\n <div class=\"acquire-detail-head\"><button type=\"button\" class=\"acquire-back\">‹ ACQUIRE</button><strong>RECORD AUDIO</strong></div>\n <label for=\"name\">NAME</label><input id=\"name\" type=\"text\" maxlength=\"120\" placeholder=\"New recording\">\n <label class=\"acquire-check\" for=\"mic-ready\"><input id=\"mic-ready\" type=\"checkbox\"> ENABLE MICROPHONE</label>\n <button id=\"start\" type=\"button\" disabled aria-pressed=\"false\">● HOLD TO RECORD</button>\n <progress id=\"level\" value=\"0\" max=\"1\" aria-label=\"Microphone input level\"></progress>\n <p id=\"status\" role=\"status\" aria-live=\"polite\">Enable microphone, then hold Record. Release to save.</p>\n</div>\n<div id=\"acquire-import\" class=\"acquire-page acquire-detail\" hidden>\n <div class=\"acquire-detail-head\"><button type=\"button\" class=\"acquire-back\">‹ ACQUIRE</button><strong>IMPORT AUDIO</strong></div>\n <label for=\"import\">CHOOSE AUDIO FILES</label>\n <input id=\"import\" type=\"file\" accept=\"audio/*,.wav,.flac,.aiff,.ogg,.m4a,.mp3\" multiple>\n <p id=\"acquire-import-status\" role=\"status\" aria-live=\"polite\">Select one or more files. Originals are preserved.</p>\n</div>\n<div id=\"acquire-code\" class=\"acquire-page acquire-detail\" hidden>\n <div class=\"acquire-detail-head\"><button type=\"button\" class=\"acquire-back\">‹ ACQUIRE</button><strong>SUPERCOLLIDER INSTRUMENTS</strong></div>\n <div id=\"acquire-community-sources\">\n  <div class=\"acquire-subhead\">COMMUNITY COLLECTIONS</div>\n  <div id=\"acquire-community-links\"></div>\n  <p class=\"acquire-footnote\">Verify the license, original author, and required Quarks. Public code is not necessarily licensed for reuse or compatible with browser SuperCollider.</p>\n </div>\n <form id=\"acquire-code-form\">\n  <div class=\"acquire-subhead\">IMPORT SOURCE FOR REVIEW</div>\n  <div class=\"acquire-two-inputs\">\n   <label>INSTRUMENT NAME<input id=\"acquire-code-name\" type=\"text\" maxlength=\"120\" placeholder=\"Discovered instrument\" required></label>\n   <label>OPEN .SCD / .TXT<input id=\"acquire-code-file\" type=\"file\" accept=\".scd,.txt,text/plain\"></label>\n  </div>\n  <label>SUPERCOLLIDER CODE<textarea id=\"acquire-code-source\" spellcheck=\"false\" autocorrect=\"off\" autocapitalize=\"off\" placeholder=\"Paste SynthDef or playable SuperCollider code\" required></textarea></label>\n  <div class=\"acquire-two-inputs\">\n   <label>CREATOR / AUTHOR<input id=\"acquire-code-author\" type=\"text\" maxlength=\"160\" placeholder=\"As credited at source\"></label>\n   <label>LICENSE<input id=\"acquire-code-license\" type=\"text\" maxlength=\"160\" placeholder=\"Verify at source\"></label>\n  </div>\n  <label>SOURCE LINK<input id=\"acquire-code-url\" type=\"url\" maxlength=\"800\" placeholder=\"https://...\"></label>\n  <button type=\"submit\">SAVE AND OPEN CODE</button>\n  <p id=\"acquire-code-status\" role=\"status\" aria-live=\"polite\">Imported code is not executed until you explicitly play it.</p>\n </form>\n</div>";
 const pages={collection:$('acquire-collection'),acquire:$('acquire-overview'),record:$('acquire-record'),import:$('acquire-import'),code:$('acquire-code')};
 // The saved collection remains in Library. Creation and import tools are
 // temporarily shown over the instrument workspace that invoked them.
 for(const key of ['acquire','record','import','code'])overlay.append(pages[key]);
 let active='collection',token=0;
 function microphoneOff(){
  const ready=$('mic-ready');
  if(ready.checked){ready.checked=false;ready.dispatchEvent(new Event('change',{bubbles:true}))}
 }
 function closeOverlay(){
  if(active==='record')microphoneOff();
  overlay.hidden=true;active='collection';
  for(const key of ['acquire','record','import','code'])pages[key].hidden=true;
 }
 function show(name){
  if(name==='collection'){
   closeOverlay();pages.collection.hidden=false;
   $('acquire-heading').textContent='YOUR SOUNDS';
   void refresh();return;
  }
  if(active==='record'&&name!=='record')microphoneOff();
  active=name;
  for(const key of ['acquire','record','import','code']){
   pages[key].hidden=key!==name;
   if(key===name)pages[key].scrollTop=0;
  }
  const labels={acquire:'SOUND METHODS',record:'RECORD AUDIO',import:'IMPORT AUDIO',code:'IMPORT INSTRUMENT'};
  $('bench-acquire-title').textContent=labels[name]||'SOUND METHODS';
  overlay.hidden=false;
 }
 $('bench-acquire-back').addEventListener('click',closeOverlay);
 overlay.querySelectorAll('.acquire-back').forEach(b=>b.addEventListener('click',closeOverlay));
 const controls={
  write:()=>{closeOverlay();view('play')},generate:()=>legacy('generate'),record:()=>show('record'),import:()=>show('import'),
  'discover-audio':()=>legacy('discover'),
  'discover-code':()=>{show('code');$('acquire-community-sources').hidden=false},
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
   if(kind!=='all'&&kindOf(item)!==kind)return false;
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
   const type=kindOf(item)==='hybrid'?'SAMPLE INSTRUMENT':item.blob instanceof Blob?(item.source==='recorded'?'RECORDING':'AUDIO')+' · '+size(item.blob.size):item.source==='generated'?'GENERATED INSTRUMENT':'SUPERCOLLIDER INSTRUMENT';
   meta.append(create('strong','',item.name||'Untitled'),create('small','',type+(item.origin?.creator?' · '+item.origin.creator:'')));
   const open=action('OPEN',()=>{
    if(item.preset?.soundId){location.href='./sounds-bench-preview.html?preset='+encodeURIComponent(item.id)+'#sample';return}
    if(item.code){
     const handoff={name:item.name,code:item.code,bench:item.bench};window.dispatchEvent(new CustomEvent('bench-open-source',{detail:handoff}));if(handoff.opened)view('play');return;
    }
    if(item.blob instanceof Blob){
     const select=$('lab-sound');select.value=item.id;
     if(select.value!==item.id){list.append(create('p','acquire-empty','Recording not yet available in Sample. Reopen collection.'));return}
     select.dispatchEvent(new Event('change',{bubbles:true}));view('sample');
    }
   },'acquire-open');
   if(!item.code&&!(item.blob instanceof Blob)&&!item.preset)open.disabled=true;
   row.append(meta,open);list.append(row);
  }
 }
 search.addEventListener('input',()=>void refresh());
 filter.addEventListener('change',()=>void refresh());
 document.addEventListener('sounds-library-changed',()=>{
  void refresh();
  if(active==='import')$('acquire-import-status').textContent='Audio added to Library. Open COLLECTION to use it.';
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
 import('./sounds-library.mjs?v=2').catch(error=>{
  $('status').textContent='Audio recorder unavailable: '+error.message;
  $('acquire-import-status').textContent='Import unavailable: '+error.message;
 });
}
// The bench shell is created in a DOMContentLoaded listener on the host page.
// A deferred module may run while readyState is 'interactive', before that shell exists.
if(document.readyState!=='complete')document.addEventListener('DOMContentLoaded',setup,{once:true});
else setup();
