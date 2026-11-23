import {findChapterPhraseMatches, estimateChapterSeek, toggleExplorerFavorite} from './librivox-text-locator.mjs';
import {saveSound} from './sounds-store.mjs';
import {extractWavFromSource,fetchRecording} from './librivox-audio-extract.mjs';

// This standalone preview deliberately does not import or mutate the Sounds workspace.
// AudioSilo exposes a browser-accessible LibriVox catalogue mirror. LibriVox remains
// the recording source; no optional audio or book text is fetched automatically.
const API = 'https://meta.audiosilo.app/api/v1';
const FAV_KEY = 'supercollision:librivox:favorites:v1';
const ANCHOR_KEY = 'supercollision:librivox:anchors:v1';
const CLIP_KEY = 'supercollision:librivox:markers:v1';
const $ = id => document.getElementById(id);
const app = $('app-shell');
const audio = $('chapter-audio');
const state = { results: [], favorites: readLocal(FAV_KEY, []), anchors: readLocal(ANCHOR_KEY, {}), clips: readLocal(CLIP_KEY, []), work: null,
  book: null, recording: null, chapter: null, person: null, scope: 'books', showFavorites: false, matches: [], selectedMatch: -1,
  clipStart: null, clipEnd: null, regionPreview: false, request: 0, extractRun:0, extracting:false, extractAbort:null, localFile:null, localObjectUrl:null, wavBlob:null, wavObjectUrl:null, wavName:'' };
function readLocal(key, fallback) { try { const value = JSON.parse(localStorage.getItem(key)); return value && typeof value === typeof fallback ? value : fallback; } catch { return fallback; } }
function writeLocal(key, data) { try { localStorage.setItem(key, JSON.stringify(data)); return true; } catch { return false; } }
function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = String(text); return node; }
function button(label, action, cls='') { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', action); return b; }
function safeUrl(input) { try { const url = new URL(input); return url.protocol === 'https:' ? url.href : null; } catch { return null; } }
function formatTime(seconds) { if (!Number.isFinite(Number(seconds))) return '--:--'; const v = Math.max(0, Math.floor(Number(seconds))); return `${Math.floor(v/60)}:${String(v%60).padStart(2,'0')}`; }
function parseDuration(input) { if (typeof input === 'number') return input; if (!input) return 0; const raw = String(input).trim(); if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw); if (/^\d{1,3}:\d{2}(?::\d{2})?$/.test(raw)) return raw.split(':').reduce((total,part) => total * 60 + Number(part), 0); return 0; }
function authorName(work) { return (work?.authors || []).map(a => a.name || [a.first_name,a.last_name].filter(Boolean).join(' ')).filter(Boolean).join(', ') || 'Unknown author'; }
function storeKey() { return state.book && state.chapter ? `${state.book.id}:${state.chapter.id || state.chapter.section_number || $('chapter-select').selectedIndex}` : ''; }
function selectedFavorite(type,id) { return state.favorites.some(x => x.type === type && String(x.id) === String(id)); }
function starButton(type,id,label) { const b = button(selectedFavorite(type,id) ? '★' : '☆', () => { changeFavorite(type,id,label); b.textContent = selectedFavorite(type,id) ? '★':'☆'; b.setAttribute('aria-pressed', String(selectedFavorite(type,id))); }, 'result-star'); b.setAttribute('aria-label',`${selectedFavorite(type,id) ? 'Remove':'Add'} favorite: ${label}`); b.setAttribute('aria-pressed',String(selectedFavorite(type,id))); return b; }
function changeFavorite(type,id,label) {
  state.favorites = toggleExplorerFavorite(state.favorites,{type,id:String(id),label});
  writeLocal(FAV_KEY,state.favorites); $('favorite-count').textContent = state.favorites.length;
  if (type === 'book' && state.work?.id === id) syncFavoriteBook();
  if (state.showFavorites) renderFavorites();
}
function syncFavoriteBook() { const b=$('favorite-book'); if (!state.work) return; const active=selectedFavorite('book',state.work.id); b.textContent=active?'★':'☆'; b.setAttribute('aria-pressed',String(active)); b.setAttribute('aria-label',`${active?'Remove':'Add'} favorite: ${state.work.title}`); }
function setStatus(message,kind='') { $('search-status').textContent=message; $('search-status').dataset.kind=kind; }
async function get(path, params) { const u = new URL(API + path); if (params) Object.entries(params).forEach(([k,v]) => v !== undefined && u.searchParams.set(k,String(v))); const response=await fetch(u.href,{headers:{Accept:'application/json'}}); if (!response.ok) throw new Error(response.status===429 ? 'Catalog is busy. Try again shortly.' : `Catalog request failed (${response.status}).`); return response.json(); }
function showSearch() { app.classList.remove('show-work'); }
function showWork() { app.classList.add('show-work'); }
function titleResult(item, kind='book') {
  const row=el('div','result'); const main=button('',()=>openResult(item,kind),'result-main');
  main.append(el('span','result-pill', kind==='book'?'RECORDING':kind==='reader'?'READER':'AUTHOR'));
  main.append(el('strong','',item.title || item.name));
  main.append(el('small','',kind==='book' ? `${authorName(item)}${item.language?' · '+item.language:''}` : (kind==='reader'?'Browse recordings by this reader':'Browse works by this author')));
  row.append(main,starButton(kind,item.id,item.title || item.name)); return row;
}
function renderResults(items,kind) { const pane=$('catalog-results'); pane.replaceChildren(); if (!items.length) { pane.append(el('p','status-line','No matches in this catalog. Try fewer words, or search LibriVox directly.')); return; } for (const item of items) pane.append(titleResult(item,kind)); }
function renderFavorites() { const pane=$('catalog-results'); pane.replaceChildren(); $('list-caption').textContent='SAVED FAVORITES';
  const list=state.favorites.filter(x => ['author','reader','book','passage','sample'].includes(x.type));
  if (!list.length) pane.append(el('p','status-line','No favorites yet. Star an author, reader, or book.'));
  for(const item of list) { const kind=item.type; const row=el('div','result'); const main=button('',async()=>{
    if(kind==='sample'||kind==='passage'){setStatus('Saved markers can be exported from their recording. Search the book to reopen it.');return;}
    if(kind==='book')await loadWork(item.id); else if(kind==='reader' && /^\d+$/.test(String(item.id))) await runSearch(item.label,'readers'); else await openPerson({id:item.id,name:item.label},kind);
  },'result-main'); main.append(el('span','result-pill',kind.toUpperCase()),el('strong','',item.label));
    row.append(main,starButton(item.type,item.id,item.label));pane.append(row);
  }
  setStatus(`${list.length} saved item${list.length===1?'':'s'} on this device.`);
}
async function runSearch(query,scope) {
  state.scope=scope; state.showFavorites=false; $('show-favorites').setAttribute('aria-pressed','false');
  $('list-caption').textContent=scope==='books'?'BOOK RESULTS':scope==='readers'?'READER RESULTS':'AUTHOR RESULTS';
  $('catalog-query').value=query; document.querySelector(`input[name=scope][value=${scope}]`).checked=true;
  const request=++state.request; setStatus(`Searching ${scope}…`); $('catalog-results').replaceChildren();
  const sourceLink=$('search-librivox'); const link=new URL('https://librivox.org/search'); sourceLink.href=link.href;
  try {
    const data=scope==='books' ? await get('/works/search',{q:query,source:'librivox',limit:30}) : await get('/people/search',{q:query,limit:30});
    if(request!==state.request)return;
    const raw=Array.isArray(data.results)?data.results:[];
    const items=raw.filter(x=>Boolean(x?.id)).map(x=>scope==='books'?x:{...x,name:x.name||String(x.id)});
    state.results=items; const kind=scope==='books'?'book':scope==='readers'?'reader':'author';
    renderResults(items,kind); setStatus(`${items.length} ${kind} ${items.length===1?'result':'results'} shown${scope!=='books'?' (includes people who may have other recording sources)':''}.`);
  } catch(error) { if(request!==state.request)return; setStatus(`${error.message} You can still search on LibriVox.`, 'error');
    const pane=$('catalog-results'); pane.replaceChildren(); pane.append(button('OPEN LIBRIVOX SEARCH ↗',()=>window.open('https://librivox.org/search','_blank','noopener')));
  }
}
async function openResult(item,kind) { if(kind==='book') await loadWork(item.id); else await openPerson(item,kind); }
async function openPerson(person,kind) {
  state.person={...person,kind}; state.showFavorites=false; $('show-favorites').setAttribute('aria-pressed','false');
  $('list-caption').textContent=`${kind==='reader'?'READER':'AUTHOR'} / ${person.name}`;
  setStatus(`Looking up ${person.name}…`); $('catalog-results').replaceChildren(); showSearch();
  try {
    const data=kind==='reader' ? await get(`/people/${encodeURIComponent(person.id)}/recordings`,{limit:75}) : await get(`/people/${encodeURIComponent(person.id)}`,{limit:75});
    const items=kind==='reader' ? (data.recordings||[]).map(x=>x.work).filter(Boolean) : (data.authored||[]);
    const unique=[...new Map(items.filter(x=>x.id).map(x=>[x.id,x])).values()];
    renderResults(unique,'book');
    const more=kind==='reader' ? Number(data.total||0)>unique.length : Number(data.authored_total||0)>unique.length;
    setStatus(`${unique.length} ${kind==='reader'?'recording credits':'works'} listed${more?' (first page)':''}. Select a work to check available LibriVox editions.`);
    if(kind==='reader' && person.name.toLowerCase().includes('peter yearsley')) {
      const note=el('p','status-line'); const link=el('a','','See all Peter Yearsley recordings on LibriVox ↗'); link.href='https://librivox.org/reader/167';link.target='_blank';link.rel='noopener noreferrer';note.append(link);$('catalog-results').prepend(note);
    }
  } catch(error) { setStatus(`Could not browse ${person.name}: ${error.message}`,'error'); }
}
function showLoadingWork(message) { showWork();$('work-panel').classList.remove('empty');$('empty-work').hidden=true;$('work-body').hidden=false;$('work-heading').textContent=message;$('work-byline').textContent='';$('attribution-row').replaceChildren();$('recording-select').replaceChildren();$('chapter-select').replaceChildren();$('reader-info').replaceChildren(); }
async function loadWork(id) {
  showLoadingWork('Loading recording…'); const request=++state.request;
  resetAudioSource();audio.pause();audio.removeAttribute('src');audio.load();state.chapter=null;state.book=null;state.work=null;
  try {
    const work=await get(`/works/${encodeURIComponent(id)}`); if(request!==state.request)return;
    const editions=(work.recordings||[]).filter(r=>Number(r.librivox_id)>0 || safeUrl(r.links?.librivox));
    if(!editions.length)throw new Error('No linked LibriVox recording is available for this work in the catalog mirror.');
    state.work=work; $('work-heading').textContent=work.title;$('work-byline').textContent=`${authorName(work)} · ${work.language||'Unknown language'}`;
    syncFavoriteBook(); const attrs=$('attribution-row'); attrs.replaceChildren(el('span','attrib-label','AUTHOR'));
    for(const author of work.authors||[]){const b=button(`☆ ${author.name}`,()=>changeFavorite('author',author.id,author.name),'person-chip'); b.title='Toggle author favorite';attrs.append(b);}
    const sel=$('recording-select');sel.replaceChildren(); editions.forEach((r,i)=>{const opt=el('option','',`LibriVox ${r.librivox_id||i+1} · ${(r.narrators||[]).map(x=>x.name).join(', ')||'Reader varies'} · ${r.chapter_count||'?'} sections`);opt.value=String(i);sel.append(opt);});
    state.editions=editions;await selectRecording(0);
  } catch(error) { if(request!==state.request)return; $('work-heading').textContent='Recording unavailable'; $('work-byline').textContent=error.message; $('playback-status').textContent='Unavailable'; }
}
async function selectRecording(index) {
  const edition=state.editions?.[index]; if(!edition)return;state.recording=edition;
  $('recording-select').value=String(index);$('chapter-select').replaceChildren();$('reader-info').textContent='Loading sections…';
  try {
    if(!Number(edition.librivox_id))throw new Error('This edition does not expose a LibriVox catalog identifier.');
    const result=await get('/librivox/audiobooks',{id:edition.librivox_id,extended:1});
    const book=(result.books||[])[0];if(!book)throw new Error('This recording is not available in the chapter feed.');
    state.book=book;
    $('librivox-work-link').href=safeUrl(book.url_librivox) || 'https://librivox.org';
    const src=safeUrl(book.url_text_source);$('source-text-link').href=src||'https://www.gutenberg.org';
    $('source-text-link').textContent=src?'SOURCE TEXT ↗':'FIND TEXT ↗';
    $('try-source-text').disabled=!src;
    const sections=(book.sections||[]).filter(x=>safeUrl(x.listen_url));state.sections=sections;
    const sel=$('chapter-select');sel.replaceChildren();sections.forEach((s,i)=>{
      const readerNames=(s.readers||[]).map(r=>r.display_name).filter(Boolean).join(', ');
      const opt=el('option','',`${String(i+1).padStart(2,'0')} · ${s.title||'Section '+(i+1)}${readerNames?' · '+readerNames:''}`);opt.value=String(i);sel.append(opt);
    });
    if(!sections.length)throw new Error('No playable chapter links were provided by the catalog.');
    selectChapter(0);
  } catch(error) { $('reader-info').textContent=error.message;$('playback-status').textContent='Cannot load sections'; }
}
function selectChapter(index) {
  const chapter=state.sections?.[index];if(!chapter)return;resetAudioSource();state.chapter=chapter;state.selectedMatch=-1;state.matches=[];
  $('chapter-select').value=String(index);audio.pause();audio.src=safeUrl(chapter.listen_url);audio.load();
  const readers=$('reader-info');readers.replaceChildren(el('span','attrib-label','READ BY'));
  const people=chapter.readers||[];if(!people.length)readers.append(el('span','','Reader not identified in this chapter feed'));
  for(const person of people) { const name=person.display_name||'Unknown reader';readers.append(button(`${selectedFavorite('reader',person.reader_id)?'★':'☆'} ${name}`,event=>{
      changeFavorite('reader',person.reader_id,name);const active=selectedFavorite('reader',person.reader_id);event.currentTarget.textContent=`${active?'★':'☆'} ${name}`;
    },'person-chip')); }
  $('playback-status').textContent=`${formatTime(parseDuration(chapter.playtime))} · Ready to play`;
  state.clipStart=null;state.clipEnd=null;state.regionPreview=false;renderClip();
  $('chapter-text').value='';$('phrase-query').value='';$('phrase-results').replaceChildren();
  $('text-guidance').textContent='Paste or load the text corresponding to this section. Full-book text must be narrowed to this chapter before using estimated seeks.';
}
function effectiveDuration() {return Number.isFinite(audio.duration) ? audio.duration : parseDuration(state.chapter?.playtime); }
function showMatches() {
  const text=$('chapter-text').value; const phrase=$('phrase-query').value.trim();const box=$('phrase-results');box.replaceChildren();
  state.matches=findChapterPhraseMatches(text,phrase,{maxResults:150,contextChars:68});state.selectedMatch=-1;
  if(!text.trim()) { $('text-guidance').textContent='First load or paste the text of this chapter.'; return; }
  $('text-guidance').textContent=`${state.matches.length} match${state.matches.length===1?'':'es'} in the supplied text. Tap a result to estimate the position in this chapter. Verify by listening.`;
  for(let i=0;i<state.matches.length;i++){const m=state.matches[i];const b=button('',()=>selectMatch(i),'match-result');const title=el('strong','',`MATCH ${i+1} · ${Math.round(m.fraction*100)}% THROUGH TEXT`);const snippet=el('span');snippet.append(document.createTextNode(m.before),el('mark','',m.match),document.createTextNode(m.after));b.append(title,snippet);box.append(b);}
}
function selectMatch(index) {
  const match=state.matches[index];if(!match)return;state.selectedMatch=index;
  $('phrase-results').querySelectorAll('button').forEach((b,i)=>b.classList.toggle('active',i===index));
  const anchors=state.anchors[storeKey()]||[];
  const estimate=estimateChapterSeek({fraction:match.fraction,durationSeconds:effectiveDuration(),anchors});
  if(estimate){audio.currentTime=Math.min(Math.max(estimate.seconds,0),Math.max(0,effectiveDuration()-.1));
    $('text-guidance').textContent=`Approximate audio position ${formatTime(estimate.seconds)} (${estimate.method==='anchor-informed'?'improved using saved anchors':'based on text position'}). Listen, then tap FOUND HERE to correct it.`;
  } else $('text-guidance').textContent='Audio duration is not available yet. Start playback, then try this match again.';
}
function markFound() { if(state.selectedMatch<0||!state.chapter){$('text-guidance').textContent='Select a text match, locate it in the recording, then choose FOUND HERE.';return;}
  const match=state.matches[state.selectedMatch],key=storeKey(),anchors=state.anchors[key]||[];
  const withoutNear=anchors.filter(a=>Math.abs(a.fraction-match.fraction)>.0001); withoutNear.push({fraction:match.fraction,seconds:audio.currentTime});withoutNear.sort((a,b)=>a.fraction-b.fraction);
  state.anchors[key]=withoutNear.slice(-60);writeLocal(ANCHOR_KEY,state.anchors);
  $('text-guidance').textContent=`Verified match ${state.selectedMatch+1} at ${formatTime(audio.currentTime)}. Later estimates in this chapter will use this anchor.`;
}
function clearGeneratedWav() {
  state.wavBlob=null;state.wavName='';
  if(state.wavObjectUrl)URL.revokeObjectURL(state.wavObjectUrl);
  state.wavObjectUrl=null;
  const output=$('extracted-audio');output.pause();output.removeAttribute('src');output.hidden=true;
  $('download-wav').disabled=true;
}
function cancelExtraction() {
  ++state.extractRun;
  if(state.extractAbort)state.extractAbort.abort();
  state.extractAbort=null;state.extracting=false;
  $('extract-progress').hidden=true;
  clearGeneratedWav();
}
function resetAudioSource() {
  cancelExtraction();
  if(state.localObjectUrl)URL.revokeObjectURL(state.localObjectUrl);
  state.localObjectUrl=null;state.localFile=null;
  $('restore-stream').hidden=true;
  $('sample-source-status').textContent='Source: online chapter';
  $('sample-audio-file').value='';
  $('extract-status').textContent='';
}
function safeFilename(value){return String(value||'sample').replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').replace(/\s+/g,' ').trim().slice(0,94)||'sample';}
function downloadWav() {
  if(!state.wavBlob)return;
  const href=URL.createObjectURL(state.wavBlob),a=el('a');a.href=href;a.download=state.wavName||'librivox-sample.wav';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),30000);
}
async function extractSelectedWav(){
  if(state.extracting || !state.chapter || state.clipStart===null || state.clipEnd===null || state.clipEnd<=state.clipStart)return;
  if(!state.localFile){
    const network=navigator.connection||navigator.webkitConnection;
    const knownWifi=network && (network.type==='wifi'||network.type==='ethernet');
    if(!knownWifi && !$('permit-audio-download').checked){
      $('extract-status').dataset.kind='error';
      $('extract-status').textContent='Full-chapter transfer not approved. Confirm the connection above, or use a downloaded chapter file.';return;
    }
  }
  const chapter=state.chapter,book=state.book,start=state.clipStart,end=state.clipEnd,work=state.work,local=state.localFile;
  const run=++state.extractRun,abort=new AbortController();state.extractAbort=abort;
  state.extracting=true;renderClip();clearGeneratedWav();
  const status=$('extract-status'),progress=$('extract-progress');status.dataset.kind='';
  progress.hidden=!!local;progress.removeAttribute('value');
  status.textContent=local?'Preparing selected chapter file…':'Downloading chapter to extract selected region…';
  let extracted;
  try {
    const source=local||await fetchRecording(chapter.listen_url,{signal:abort.signal,onProgress:(received,total)=>{
      if(state.extractRun!==run)return;
      if(total){progress.max=total;progress.value=received;}else progress.removeAttribute('value');
      status.textContent=total?`Downloading chapter: ${Math.round(received/total*100)}%`:`Downloading chapter: ${(received/1048576).toFixed(1)} MB`;
    }});
    if(abort.signal.aborted||state.extractRun!==run) return;
    progress.hidden=true;status.textContent='Extracting selected region…';
    const Context=window.AudioContext||window.webkitAudioContext;
    if(!Context)throw Error('This browser does not support audio decoding.');
    const ctx=new Context();
    try {extracted=await extractWavFromSource(source,{start,end,decodeAudioData:data=>ctx.decodeAudioData(data)});}
    finally {await ctx.close().catch(()=>{});}
    if(abort.signal.aborted||state.extractRun!==run||state.chapter!==chapter)return;
    const name=safeFilename(`${work?.title||book?.title} - ${chapter.title||'Chapter'} - ${formatTime(start)}-${formatTime(end)}`);
    const filename=name+'.wav';
    const record={id:(globalThis.crypto?.randomUUID?.() || `librivox-${Date.now()}-${Math.random().toString(36).slice(2)}`),name,source:'librivox',created:Date.now(),favorite:false,
      blob:extracted.blob,filename,mime:'audio/wav',license:'LibriVox recording: public domain in the United States',
      creator:(chapter.readers||[]).map(x=>x.display_name).filter(Boolean).join(', '),
      attribution:`${work?.title||book?.title||'LibriVox'} · ${authorName(work)} · ${(chapter.readers||[]).map(x=>x.display_name).join(', ')} · ${chapter.title||''}`,
      origin:{service:'LibriVox',bookId:book?.id,chapterId:chapter.id,chapter:chapter.title,author:authorName(work),
        reader:(chapter.readers||[]).map(x=>x.display_name),source_url:book?.url_librivox,
        audio_url:chapter.listen_url,text_source:book?.url_text_source,start,end}};
    try {await saveSound(record);}catch(error){
      // The WAV remains available as a download when IndexedDB quota fails.
      if(state.extractRun!==run)return;
      state.wavBlob=extracted.blob;state.wavName=filename;
      state.wavObjectUrl=URL.createObjectURL(extracted.blob);
      const preview=$('extracted-audio');preview.src=state.wavObjectUrl;preview.hidden=false;
      $('download-wav').disabled=false;
      status.dataset.kind='error';status.textContent=`WAV extracted, but not saved to Sounds (${error.message}). Download it now.`;return;
    }
    if(state.extractRun!==run)return;
    state.wavBlob=extracted.blob;state.wavName=filename;
    state.wavObjectUrl=URL.createObjectURL(extracted.blob);
    const preview=$('extracted-audio');preview.src=state.wavObjectUrl;preview.hidden=false;
    $('download-wav').disabled=false;
    status.textContent=`Saved ${(extracted.blob.size/1048576).toFixed(1)} MB WAV in Sounds. Listen here, or download a copy.`;
  }catch(error){
    if(abort.signal.aborted||state.extractRun!==run)return;
    status.dataset.kind='error';
    status.textContent=/fetch|network|Failed to fetch|Load failed/i.test(error.message)?
      'The audio host does not allow browser downloads, or the connection failed. Download the MP3 on LibriVox and select USE CHAPTER FILE here.':
      `Extraction failed: ${error.message}`;
  }finally{
    if(state.extractRun===run){state.extracting=false;state.extractAbort=null;progress.hidden=true;renderClip();}
  }
}
function renderClip() {
  $('clip-summary').textContent=`IN ${state.clipStart===null?'--:--':formatTime(state.clipStart)} · OUT ${state.clipEnd===null?'--:--':formatTime(state.clipEnd)}`;
  $('preview-region').disabled=!(state.clipStart!==null && state.clipEnd!==null && state.clipEnd>state.clipStart);
  $('save-region').disabled=$('preview-region').disabled;
  $('extract-wav').disabled=$('preview-region').disabled || state.extracting;
}
function saveRegion() {if(!state.chapter||state.clipStart===null||state.clipEnd===null||state.clipEnd<=state.clipStart)return;
  const id=`${state.book.id}:${state.chapter.id||state.chapter.section_number}:${state.clipStart.toFixed(2)}-${state.clipEnd.toFixed(2)}`;
  const item={id,title:state.work?.title||state.book.title,author:authorName(state.work),reader:(state.chapter.readers||[]).map(x=>x.display_name).join(', '),chapter:state.chapter.title,
    audio_url:state.chapter.listen_url,source_url:state.book.url_librivox,text_source:state.book.url_text_source,start:state.clipStart,end:state.clipEnd,
    phrase:state.selectedMatch<0?null:state.matches[state.selectedMatch]?.match,saved_at:new Date().toISOString()};
  state.clips=state.clips.filter(x=>x.id!==id);state.clips.push(item);writeLocal(CLIP_KEY,state.clips);
  if(!selectedFavorite('sample',id))changeFavorite('sample',id,`${item.title}: ${item.chapter} (${formatTime(item.start)}–${formatTime(item.end)})`);
  $('clip-message').textContent='Region marker saved. Use EXTRACT & SAVE WAV to create the actual audio file in Sounds.';
}
function exportMarkers() { const payload={format:'supercollision-librivox-markers',version:1,created_at:new Date().toISOString(),markers:state.clips,anchors:state.anchors};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download='supercollision-librivox-markers.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function loadLinkedText() {
  const source=safeUrl(state.book?.url_text_source);if(!source)return;
  const match=source.match(/^https:\/\/(?:www\.)?gutenberg\.org\/(?:ebooks|files)\/(\d+)/i);
  const url=match?`https://www.gutenberg.org/cache/epub/${match[1]}/pg${match[1]}.txt`:source;
  $('text-guidance').textContent='Loading text from its source…';
  try {
    const response=await fetch(url);if(!response.ok)throw Error(`Text source returned ${response.status}`);
    const type=response.headers.get('content-type')||'';if(/html/i.test(type))throw Error('Text source is a web page, not a plain-text file');
    const text=await response.text();if(/<html[\s>]/i.test(text.slice(0,1000)))throw Error('Text source is HTML');
    if(text.length>2500000)throw Error('Text is too large to load here');
    $('chapter-text').value=text;$('text-guidance').textContent='Loaded linked text. If this is a complete book, copy only the chapter matching the audio before searching.';
  } catch(error) { $('text-guidance').textContent=`Could not load source text in this browser (${error.message}). Open SOURCE TEXT ↗ and paste the chapter or load a .txt file.`; }
}
$('catalog-form').addEventListener('submit',event=>{event.preventDefault();const q=$('catalog-query').value.trim();if(q.length>=2)runSearch(q,new FormData(event.currentTarget).get('scope'));});
$('phrase-form').addEventListener('submit',event=>{event.preventDefault();showMatches();});
$('show-favorites').addEventListener('click',()=>{state.showFavorites=!state.showFavorites;$('show-favorites').setAttribute('aria-pressed',String(state.showFavorites));if(state.showFavorites)renderFavorites();else if($('catalog-query').value.trim())runSearch($('catalog-query').value.trim(),state.scope);else {$('catalog-results').replaceChildren();setStatus('Choose a search to begin.');$('list-caption').textContent='DISCOVER';}});
document.querySelectorAll('[data-quick]').forEach(b=>b.addEventListener('click',()=>{showSearch();runSearch(b.dataset.quick,b.dataset.scope);}));
$('back-to-search').addEventListener('click',showSearch);
$('recording-select').addEventListener('change',e=>selectRecording(Number(e.target.value)));
$('chapter-select').addEventListener('change',e=>selectChapter(Number(e.target.value)));
$('favorite-book').addEventListener('click',()=>{if(state.work)changeFavorite('book',state.work.id,state.work.title);});
$('mark-position').addEventListener('click',markFound);
document.querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>{if(!state.chapter)return;audio.currentTime=Math.max(0,Math.min(effectiveDuration()||1e10,(audio.currentTime||0)+Number(b.dataset.jump)));}));
$('set-start').addEventListener('click',()=>{clearGeneratedWav();state.clipStart=audio.currentTime||0;renderClip();$('clip-message').textContent='Start position set.';});
$('set-end').addEventListener('click',()=>{clearGeneratedWav();state.clipEnd=audio.currentTime||0;renderClip();$('clip-message').textContent=state.clipStart!==null&&state.clipEnd<=state.clipStart?'End must be after start.':'End position set.';});
$('preview-region').addEventListener('click',()=>{if(state.clipStart===null||state.clipEnd<=state.clipStart)return;state.regionPreview=true;audio.currentTime=state.clipStart;audio.play().catch(()=>{$('clip-message').textContent='Audio playback was blocked. Tap the standard audio player first.';});});
audio.addEventListener('timeupdate',()=>{if(state.regionPreview&&state.clipEnd!==null&&audio.currentTime>=state.clipEnd){audio.pause();state.regionPreview=false;audio.currentTime=state.clipStart||0;}});
audio.addEventListener('pause',()=>{state.regionPreview=false;});
audio.addEventListener('error',()=>{if(state.chapter)$('playback-status').textContent='Playback failed. Open recording on LibriVox for a fallback.';});
audio.addEventListener('loadedmetadata',()=>{if(state.chapter)$('playback-status').textContent=`${formatTime(audio.duration)} · Ready`;});
$('extract-wav').addEventListener('click',extractSelectedWav);
$('download-wav').addEventListener('click',downloadWav);
$('sample-audio-file').addEventListener('change',event=>{
  const file=event.target.files?.[0];if(!file)return;
  if(file.size>80*1024*1024){$('extract-status').dataset.kind='error';$('extract-status').textContent='Choose a chapter file no larger than 80 MB.';event.target.value='';return;}
  cancelExtraction();if(state.localObjectUrl)URL.revokeObjectURL(state.localObjectUrl);
  state.localFile=file;state.localObjectUrl=URL.createObjectURL(file);
  audio.pause();audio.src=state.localObjectUrl;audio.load();
  $('restore-stream').hidden=false;$('sample-source-status').textContent=`Source: ${file.name}`;
  $('extract-status').dataset.kind='';$('extract-status').textContent='Local chapter file ready. Verify that it matches the selected recording, then mark the region.';
  state.clipStart=null;state.clipEnd=null;renderClip();
});
$('restore-stream').addEventListener('click',()=>{
  resetAudioSource();audio.pause();if(state.chapter)audio.src=safeUrl(state.chapter.listen_url);audio.load();
  state.clipStart=null;state.clipEnd=null;renderClip();
});
$('save-region').addEventListener('click',saveRegion);
$('export-markers').addEventListener('click',exportMarkers);
$('text-file').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;if(file.size>2500000){$('text-guidance').textContent='Choose a plain-text file smaller than 2.5 MB.';return;} $('chapter-text').value=await file.text();$('text-guidance').textContent='Text loaded. Make sure it matches the selected audio chapter.';event.target.value='';});
$('clear-text').addEventListener('click',()=>{$('chapter-text').value='';$('phrase-results').replaceChildren();state.matches=[];state.selectedMatch=-1;$('text-guidance').textContent='Paste or load matching chapter text to search.';});
$('try-source-text').addEventListener('click',loadLinkedText);
$('favorite-count').textContent=state.favorites.length;renderClip();
// Optional deep link into a specific, verified LibriVox project (no automatic audio download).
const id=new URLSearchParams(location.search).get('book');if(id && /^\d{1,8}$/.test(id))get('/librivox/audiobooks',{id,extended:1}).then(async data=>{
  const title=data?.books?.[0]?.title;if(title){showSearch();runSearch(title,'books');}
}).catch(()=>{});