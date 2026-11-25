/* New Sounds panels reuse the working Generate and Discover modules.
 * No duplicate audio processing, no automatic downloads, and no autoplay. */
function panel(id,markup){
 const node=document.createElement('section');node.id=id;
 node.className='acquire-page bench-remote-panel';node.hidden=true;
 node.innerHTML=markup;return node;
}
export function createRemoteTools({onUseCode,onOpenSamples,onOpenSample}){
 const generate=panel('sounds-generate',"\n <label for=\"sounds-ai-prompt\">DESCRIBE THE SOUND</label>\n <textarea id=\"sounds-ai-prompt\" rows=\"4\" placeholder=\"A deep, wavering reed drone with a rough texture…\"></textarea>\n <div class=\"bench-remote-provider\">\n  <label for=\"sounds-ai-provider\">PROVIDER\n   <select id=\"sounds-ai-provider\"><option value=\"openrouter\">OpenRouter · free models</option><option value=\"puter\">Puter · personal allowance</option></select>\n  </label>\n  <label for=\"sounds-ai-model\">FREE MODEL <select id=\"sounds-ai-model\"></select></label>\n </div>\n <div id=\"sounds-ai-key-box\">\n  <label for=\"sounds-ai-key\">Personal OpenRouter key · never stored\n   <input id=\"sounds-ai-key\" type=\"password\" autocomplete=\"off\" placeholder=\"Your personal key\">\n  </label><a href=\"https://openrouter.ai/keys\" target=\"_blank\" rel=\"noopener noreferrer\">Get an OpenRouter key</a>\n </div>\n <button id=\"sounds-puter-connect\" type=\"button\" hidden>CONNECT PUTER</button>\n <button id=\"sounds-ai-generate\" class=\"bench-remote-primary\" type=\"button\">GENERATE INSTRUMENT</button>\n <p id=\"sounds-generate-status\" role=\"status\" aria-live=\"polite\">Generation uses your chosen provider account. No code is run automatically.</p>\n <div id=\"sounds-ai-proposal\" hidden>\n  <strong>NEW PROPOSAL · YOUR EDITS ARE PRESERVED</strong>\n  <textarea id=\"sounds-ai-proposed-code\" rows=\"7\" readonly aria-label=\"Proposed SuperCollider code\"></textarea>\n  <div class=\"bench-remote-actions\"><button id=\"sounds-ai-apply-proposal\" type=\"button\">USE PROPOSAL</button><button id=\"sounds-ai-discard-proposal\" type=\"button\">KEEP MY EDITS</button></div>\n </div>\n <div id=\"sounds-ai-result\" hidden>\n  <div class=\"bench-tool-intro\">GENERATED CODE · REVIEW BEFORE PLAYING</div>\n  <div class=\"bench-remote-actions\">\n   <button type=\"button\" id=\"bench-ai-open\" class=\"bench-remote-primary\" disabled>HEAR INSTRUMENT</button>\n   <button type=\"button\" id=\"sounds-ai-save\" disabled>SAVE TO LIBRARY</button>\n   <button type=\"button\" id=\"sounds-ai-copy\" disabled>COPY</button>\n  </div>\n  <label for=\"sounds-ai-code\">Editable SuperCollider source</label>\n  <textarea id=\"sounds-ai-code\" rows=\"9\" spellcheck=\"false\" autocapitalize=\"off\" autocorrect=\"off\" autocomplete=\"off\"></textarea>\n  <pre id=\"sounds-ai-review\" class=\"bench-remote-review\"></pre>\n  <label for=\"sounds-ai-revision\">Refine this instrument</label>\n  <textarea id=\"sounds-ai-revision\" rows=\"2\" placeholder=\"Make it darker, with a softer attack…\"></textarea>\n  <button id=\"sounds-ai-revise\" type=\"button\" disabled>REGENERATE WITH CHANGES</button>\n </div>\n");
 const discover=panel('discover',"\n <div class=\"bench-tool-intro\">DISCOVER RECORDINGS</div>\n <button class=\"bench-librivox-link\" id=\"bench-open-librivox\" type=\"button\">\n  <span><strong>LIBRIVOX · SPOKEN WORD</strong><small>Find books, readers and spoken passages. Sample audio without leaving Sounds.</small></span>\n  <span aria-hidden=\"true\">›</span>\n </button>\n <div class=\"bench-source-separator\">OTHER AUDIO COLLECTIONS</div>\n <form id=\"discover-form\">\n  <div class=\"bench-discover-search\">\n   <label for=\"discover-query\">FIND A SOUND <input id=\"discover-query\" type=\"search\" maxlength=\"200\" placeholder=\"Rain, bells, machinery, speech…\"></label>\n   <button class=\"bench-remote-primary\" type=\"submit\">SEARCH</button>\n  </div>\n  <label for=\"discover-source\">COLLECTION\n   <select id=\"discover-source\"><option value=\"openverse\">Openverse · all indexed audio</option><option value=\"wikimedia\">Wikimedia Commons</option><option value=\"freesound\">Freesound · sound effects</option></select>\n  </label>\n  <p id=\"discover-source-description\" class=\"bench-remote-note\"></p>\n  <div id=\"discover-key-box\" hidden>\n   <label for=\"discover-key\">Personal Freesound application key <input id=\"discover-key\" type=\"password\" autocomplete=\"off\" placeholder=\"Not stored\"></label>\n   <a href=\"https://freesound.org/apiv2/apply\" target=\"_blank\" rel=\"noopener noreferrer\">Request a Freesound key</a>\n  </div>\n  <details class=\"bench-remote-options\"><summary>LICENSE FILTERS · Commercial and modification permitted</summary>\n   <fieldset class=\"bench-remote-checks\"><legend>License permissions</legend>\n    <label for=\"discover-commercial\"><input id=\"discover-commercial\" type=\"checkbox\" checked> Commercial use permitted</label>\n    <label for=\"discover-modification\"><input id=\"discover-modification\" type=\"checkbox\" checked> Modification permitted</label>\n    <label for=\"discover-no-attribution\"><input id=\"discover-no-attribution\" type=\"checkbox\"> Attribution not required</label>\n    <label for=\"discover-cc0\"><input id=\"discover-cc0\" type=\"checkbox\"> Public domain or Creative Commons Zero only</label>\n   </fieldset>\n   <p>Unknown permissions are excluded when filters apply. Verify licenses at the source.</p>\n  </details>\n </form>\n <details class=\"bench-remote-options bench-network-policy\">\n  <summary>NETWORK DOWNLOADS · Wi-Fi only by default</summary>\n  <label for=\"discover-allow-unverified\" class=\"bench-network-override\">\n   <input id=\"discover-allow-unverified\" type=\"checkbox\">\n   Allow downloads and previews when Wi-Fi cannot be verified, including possible cellular use\n  </label>\n  <p>Disabled by default. iPhone browsers may not identify Wi-Fi reliably. Enable only if you explicitly permit network transfers. Nothing downloads until you tap Save.</p>\n </details>\n <button id=\"discover-cancel-download\" type=\"button\" hidden>CANCEL DOWNLOAD</button>\n <p id=\"discover-status\" role=\"status\" aria-live=\"polite\">Search licensed sound collections. Downloads require an explicit action.</p>\n <div id=\"discover-results\"></div>\n <div class=\"bench-remote-actions bench-discover-pages\">\n  <button id=\"discover-previous\" type=\"button\" disabled>PREVIOUS</button>\n  <button id=\"discover-next\" type=\"button\" disabled>NEXT</button>\n </div>\n <div id=\"bench-discover-saved\" hidden>\n  <strong>SAVED TO LIBRARY</strong>\n  <button id=\"bench-discover-open-samples\" type=\"button\" class=\"bench-remote-primary\">OPEN RECORDINGS &amp; SAMPLES</button>\n </div>\n <p class=\"bench-remote-note\">Source attribution and original audio are retained. Each explicit download is limited to 50 MB. Some providers offer compressed previews.</p>\n");
 const librivox=panel('librivox',String.raw`
 <div id="bench-librivox-load" role="status" aria-live="polite">
  <span id="bench-librivox-load-message">Opening the LibriVox sampler…</span>
  <button id="bench-librivox-retry" type="button" hidden>RETRY</button>
 </div>
 <iframe id="bench-librivox-frame" title="LibriVox spoken-word sampling interface" loading="lazy"
   data-src="./librivox-explorer.html?v=2.8.1&embedded=1"
   data-sc-embedded="true" hidden allow="autoplay"></iframe>
 <div id="bench-librivox-next" hidden>
  <span id="bench-librivox-saved-name">Sample saved.</span>
  <button type="button" class="bench-remote-primary" id="bench-librivox-use">USE IN SAMPLES</button>
 </div>`);
 const frame=librivox.querySelector('#bench-librivox-frame');
 const next=librivox.querySelector('#bench-librivox-next');
 const loadStatus=librivox.querySelector('#bench-librivox-load');
 const loadMessage=librivox.querySelector('#bench-librivox-load-message');
 const retry=librivox.querySelector('#bench-librivox-retry');
 let librivoxLoad=null,librivoxLoaded=false;
 async function loadLibriVox(){
  if(librivoxLoaded)return;
  if(librivoxLoad)return librivoxLoad;
  loadStatus.hidden=false;retry.hidden=true;
  loadMessage.textContent='Opening the LibriVox sampler…';
  librivoxLoad=(async()=>{
   try{
    // Fetching HTML as data rather than as a navigation bypasses the older
    // offline worker's incorrect homepage fallback for secondary pages.
    const response=await fetch(frame.dataset.src,{
     method:'GET',cache:'no-store',credentials:'same-origin',
     headers:{Accept:'text/html'}
    });
    if(!response.ok)throw Error('Page request failed ('+response.status+').');
    const html=await response.text();
    // Some hosting or offline fallbacks return index.html with status 200.
    // Never mount another Code app as the embedded LibriVox sampler.
    if(!html.includes('id="app-shell"')||!html.includes('id="chapter-audio"')||
       !html.includes('librivox-explorer.mjs'))
     throw Error('The server returned the wrong page instead of LibriVox.');
    frame.srcdoc=html;
    librivoxLoaded=true;
    frame.hidden=false;loadStatus.hidden=true;
   }catch(error){
    loadMessage.textContent='LibriVox could not open: '+error.message+
     ' Check the connection, then retry. Your Sounds workspace is unaffected.';
    retry.hidden=false;frame.hidden=true;
   }
  })();
  try{await librivoxLoad}finally{librivoxLoad=null}
 }
 retry.addEventListener('click',()=>{void loadLibriVox()});
 let savedSoundId=null;
 discover.querySelector('#bench-open-librivox').addEventListener('click',()=>{
  window.dispatchEvent(new CustomEvent('bench-acquire-action',{detail:{action:'librivox'}}));
 });
 librivox.querySelector('#bench-librivox-use').addEventListener('click',()=>{
  if(savedSoundId)onOpenSample(savedSoundId);
 });
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==frame.contentWindow||librivox.hidden)return;
  const value=event.data;
  if(!value||!['sc-librivox-audio-saved','sc-librivox-open-sample'].includes(value.type))return;
  const id=value.soundId;
  if(typeof id!=='string'||!id||id.length>250)return;
  savedSoundId=id;
  next.hidden=false;
  librivox.querySelector('#bench-librivox-saved-name').textContent='SAVED · '+String(value.name||'LibriVox sample').slice(0,90);
  if(value.type==='sc-librivox-open-sample')onOpenSample(id);
 });
 function stopLibriVox(){
  try{frame.contentWindow?.postMessage({type:'sc-sampler-pause'},location.origin)}catch{}
 }
 const use=generate.querySelector('#bench-ai-open');
 const output=generate.querySelector('#sounds-ai-code');
 const result=generate.querySelector('#sounds-ai-result');
 const status=generate.querySelector('#sounds-generate-status');
 function updateUse(){use.disabled=result.hidden||!output.value.trim()}
 new MutationObserver(updateUse).observe(result,{attributes:true,attributeFilter:['hidden']});
 output.addEventListener('input',updateUse);
 use.addEventListener('click',()=>{
  const source=output.value.trim();
  if(!source){status.textContent='Generate source before opening it.';return}
  const review=generate.querySelector('#sounds-ai-review').textContent;
  if(review.includes('Blocker:')&&!confirm('Code review found a blocker. Open for inspection anyway? You can still review it before playing.'))return;
  onUseCode({name:generate.querySelector('#sounds-ai-prompt').value.trim().slice(0,120)||'Generated instrument',code:source,play:true});
 });
 discover.querySelector('#bench-discover-open-samples').addEventListener('click',onOpenSamples);
 const saved=discover.querySelector('#bench-discover-saved');
 document.addEventListener('sounds-library-changed',()=>{if(!discover.hidden)saved.hidden=false});
 const networkDetails=discover.querySelector('.bench-network-policy');
 const searchStatus=discover.querySelector('#discover-status');
 // If iPhone Safari cannot report Wi-Fi and the production download guard blocks
 // a preview or save, expose the opt-in control, never silently enable it.
 new MutationObserver(()=>{
  if(/Wi-Fi cannot be verified|Preview blocked: Wi-Fi/.test(searchStatus.textContent))
   networkDetails.open=true;
 }).observe(searchStatus,{childList:true,subtree:true,characterData:true});
 const loads=new Map();
 function ensure(name){
  if(loads.has(name))return loads.get(name);
  const job=name==='generate'?import('./sounds-generate.mjs?v=1'):name==='discover'?import('./sounds-discover.mjs?v=9'):Promise.reject(Error('Unknown tool'));
  const promise=job.catch(error=>{loads.delete(name);throw error});
  loads.set(name,promise);return promise;
 }
 async function activate(name){
  if(name==='librivox'){await loadLibriVox();return;}
  if(name==='discover')saved.hidden=true;
  const message=name==='generate'?status:discover.querySelector('#discover-status');
  if(!loads.has(name))message.textContent='Preparing '+(name==='generate'?'instrument generator':'recording search')+'…';
  try{
   await ensure(name);if(name==='generate')updateUse();
   if(message.textContent.startsWith('Preparing '))message.textContent=name==='generate'
    ?'Describe an instrument, choose a provider and generate editable SuperCollider code.'
    :'Search online recordings. No previews or downloads occur without your permission.';
  }catch(error){message.textContent='Could not load '+(name==='generate'?'instrument generator':'recording search')+': '+error.message}
 }
 function stopDiscover(){document.dispatchEvent(new CustomEvent('sounds-view-changed',{detail:{view:'other'}}))}
 return {generate,discover,librivox,activate,stopDiscover,stopLibriVox};
}
