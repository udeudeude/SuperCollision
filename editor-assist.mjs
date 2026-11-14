/* Indexed SuperCollider language browser and explicit, reversible editor assistance.
 * Never silently changes or executes a composition.
 */
import {buildCatalog,searchCatalog,completionCandidates,callAtCursor,
  insertionFor,SAFE_TEMPLATES,VERIFIED_SIGNATURES,displayName} from './catalog-core.mjs?v=2';

const PREF='supercollision-completion-enabled-v1';
const HISTORY='supercollision-completion-history-v1';
const SORTS=[['usefulness','Useful first'],['alphabetical','Alphabetical'],
 ['used','Most used'],['recent','Recently used'],['category','By category']];
function element(tag,className='',text=''){
 const el=document.createElement(tag);
 if(className)el.className=className;
 if(text)el.textContent=text;
 return el;
}
export function createLanguageTools({editor,host,getLearningMode=()=> 'guided',onEdit=()=>{}}){
 let catalog=buildCatalog(),enabled=true,suspended=false,selection=null,typing=null,
   lastCaret=0,previousFocus=null,completed=false;
 let history={counts:{},recent:[]};
 try{
   const value=localStorage.getItem(PREF);if(value!==null)enabled=value!=='false';
   const stored=JSON.parse(localStorage.getItem(HISTORY)||'{}');
   if(stored&&typeof stored==='object'){
     history.counts=stored.counts&&typeof stored.counts==='object'?stored.counts:{};
     history.recent=Array.isArray(stored.recent)?stored.recent.slice(0,30):[];
   }
 }catch{}
 const panel=element('section','language-browser');
 panel.hidden=true;panel.setAttribute('aria-label','SuperCollider language catalog');
 const heading=element('div','catalog-head');
 const title=element('strong','', 'SUPERCOLLIDER / BROWSE');
 const close=element('button','catalog-close','CLOSE');close.type='button';
 heading.append(title,close);
 const count=element('p','catalog-count');
 const search=element('input','catalog-search');
 search.type='search';search.placeholder='Find commands, classes, methods or purposes';
 search.setAttribute('aria-label','Search SuperCollider language catalog');
 const sorts=element('select','catalog-sort');sorts.setAttribute('aria-label','Sort language catalog');
 for(const [key,label] of SORTS){const opt=element('option','',label);opt.value=key;sorts.append(opt)}
 const categories=element('select','catalog-category');categories.setAttribute('aria-label','Filter language catalog category');
 const filters=element('div','catalog-controls');filters.append(sorts,categories);
 const list=element('div','catalog-list');
 const detail=element('div','catalog-detail');detail.hidden=true;
 const fullCatalogButton=element('button','catalog-download','Load complete catalog (1.5 MB)');
 fullCatalogButton.type='button';
 fullCatalogButton.title='Optional large download. The built-in reference works without it.';
 panel.append(heading,count,fullCatalogButton,search,filters,list,detail);
 host.append(panel);
 const frame=editor.closest('.editor-frame');
 const tray=element('div','completion-tray');tray.id='completion-tray';tray.hidden=true;
 tray.setAttribute('role','region');tray.setAttribute('aria-label','Code suggestions and argument guidance');
 frame.insertAdjacentElement('beforebegin',tray);
 // A touch on the completion tray should not dismiss the keyboard or move the
 // textarea insertion point before the selection is accepted.
 tray.addEventListener('pointerdown',event=>{if(event.target.closest('button'))event.preventDefault()});
 function remember(name){
   history.counts[name]=Math.min(10000,(history.counts[name]||0)+1);
   history.recent=[name,...history.recent.filter(x=>x!==name)].slice(0,30);
   try{localStorage.setItem(HISTORY,JSON.stringify(history))}catch{}
 }
 function closeTray(){
   tray.hidden=true;tray.replaceChildren();typing=null;
   document.body.classList.remove('completion-open');
 }
 function hide({switchView=true}={}){
   panel.hidden=true;detail.hidden=true;
   if(switchView)window.setSuperCollisionView?.('code');
 }
 function open(){
   lastCaret=editor.selectionStart;previousFocus=document.activeElement;
   window.SCLearning?.hide({switchView:false});
   panel.hidden=false;detail.hidden=true;selection=null;
   window.setSuperCollisionView?.('learn');
   buildCategories();renderList();closeTray();
 }
 close.onclick=()=>hide();
 function buildCategories(){
   const chosen=categories.value||'all';
   categories.replaceChildren();
   const all=element('option','','All categories');all.value='all';categories.append(all);
   const names=[...new Set(catalog.classes.map(x=>x.category).filter(Boolean))].sort();
   for(const name of names){const opt=element('option','',name);opt.value=name;categories.append(opt)}
   categories.value=names.includes(chosen)?chosen:'all';
 }
 function renderList(){
   if(panel.hidden)return;
   const items=searchCatalog(catalog,{query:search.value,sort:sorts.value||'usefulness',
     category:categories.value||'all',source:editor.value,counts:history.counts,recent:history.recent,limit:80});
   count.textContent=(catalog.full?catalog.classCount+' documented classes':'Common-language reference')+
     ' · '+items.length+' shown · '+(search.value?'Filtered results':'Use search or change the order');
   list.replaceChildren();
   if(!items.length)list.append(element('p','catalog-empty','No matching entries.'));
   for(const item of items){
     const button=element('button','catalog-entry');button.type='button';
     const top=element('strong','',item.name);
     const desc=element('span','',item.summary||'See the official SuperCollider class documentation.');
     const tag=element('small','',item.category+(item.kind==='syntax'?' · SYNTAX':''));
     button.append(top,desc,tag);
     button.onclick=()=>renderDetail(item);
     list.append(button);
   }
 }
 function signatureText(method){
   const args=(method.args||[]).map(x=>x.name+
     (Object.hasOwn(x,'default')?' = '+x.default:x.required?' [required]':'')).join(', ');
   return method.name+'('+args+')';
 }
 function chooseInsertion(item,method=null){
   const chosen=method?{kind:'method',owner:item.name,name:method.name,signature:method}:
     {kind:'class',name:item.name,owner:item.name,preferredMethod:item.preferredMethod};
   let inserted=insertionFor(chosen,'Si').text;
   if(method){
     if(SAFE_TEMPLATES[item.name+'.'+method.name])inserted=item.name+'.'+method.name+'('+SAFE_TEMPLATES[item.name+'.'+method.name]+')';
     else inserted=item.name+'.'+method.name+'(';
   }else if(item.kind==='syntax')inserted=item.name;
   insertAt(lastCaret,lastCaret,inserted,item.name);
   hide({switchView:false});
   // Inserting from LEARN returns to editing. The user's source changes only
   // because they explicitly pressed INSERT.
   window.setSuperCollisionView?.('code');
 }
 function renderDetail(item){
   selection=item;detail.hidden=false;list.hidden=true;
   detail.replaceChildren();
   const back=element('button','catalog-back','← BACK TO RESULTS');back.type='button';
   back.onclick=()=>{detail.hidden=true;list.hidden=false};
   const h=element('h3','',item.name);
   const meaning=displayName(item.name);
   const overview=element('p','',meaning!==item.name?meaning+'. '+item.summary:item.summary);
   const category=element('p','catalog-meta',item.category+' · '+(item.kind||'class'));
   const actions=element('div','catalog-detail-actions');
   const insert=element('button','','INSERT INTO CODE');insert.type='button';
   insert.onclick=()=>chooseInsertion(item);
   const docs=element('a','','OFFICIAL DOCUMENTATION');docs.target='_blank';docs.rel='noopener noreferrer';
   docs.href=item.docs||'https://doc.sccode.org/';
   actions.append(insert,docs);
   detail.append(back,h,category,overview,actions);
   if(item.methods?.length){
     const sub=element('h4','','DOCUMENTED METHODS');detail.append(sub);
     for(const m of item.methods.slice(0,45)){
       const row=element('div','catalog-method');
       const line=element('strong','',m.scope==='instance'?'-'+signatureText(m):'*'+signatureText(m));
       const desc=element('p','',m.summary||'Method documented in the official help system.');
       const b=element('button','','INSERT');b.type='button';b.onclick=()=>chooseInsertion(item,m);
       row.append(line,desc,b);
       if(m.args?.length){
         const hint=element('small','catalog-method-args',m.args.map(x=>x.name+
           (x.required?' (required)':Object.hasOwn(x,'default')?' (default '+x.default+')':'')).join(' · '));
         row.append(hint);
       }
       detail.append(row);
     }
     if(item.methods.length>45)detail.append(element('p','catalog-meta',
       'Additional methods are available in the official documentation.'));
   }
   detail.scrollTop=0;host.scrollTop=0;
 }
 search.addEventListener('input',()=>{detail.hidden=true;list.hidden=false;renderList()});
 sorts.addEventListener('change',renderList);categories.addEventListener('change',renderList);
 function setTrayOpen(open){
   if(!enabled||suspended)open=false;
   tray.hidden=!open;document.body.classList.toggle('completion-open',open);
 }
 function insertAt(start,end,text,name){
   // Never alter code without an explicit completion/insert click or key press.
   const prev=editor.value;
   editor.focus({preventScroll:true});
   editor.setRangeText(text,start,end,'end');
   const cursor=start+text.length;
   editor.setSelectionRange(cursor,cursor);
   if(editor.value!==prev){
     remember(name);
     editor.dispatchEvent(new Event('input',{bubbles:true}));
     onEdit();
   }
   lastCaret=cursor;
   refresh();
 }
 function makeChoiceButton(label,secondary,callback){
   const button=element('button','completion-choice');button.type='button';
   button.append(element('strong','',label),element('small','',secondary));
   button.onclick=callback;return button;
 }
 function renderSuggestions(info){
   const label=element('p','completion-label',
     info.kind==='method'?'METHOD SUGGESTIONS · '+info.owner:'CODE SUGGESTIONS · choose to insert');
   const row=element('div','completion-scroll');
   for(const item of info.items){
     const b=makeChoiceButton(item.name,item.summary||item.kind,()=>{
       const inserted=insertionFor(item,info.prefix);
       insertAt(info.replaceStart,info.replaceEnd,inserted.text,item.owner||item.name);
     });
     row.append(b);
   }
   const dismiss=element('button','completion-dismiss','×');
   dismiss.type='button';dismiss.setAttribute('aria-label','Dismiss code completions');
   dismiss.onclick=closeTray;
   tray.append(label,row,dismiss);setTrayOpen(true);
   typing={kind:'suggestions',info,index:-1};
 }
 function findValueRange(info,index){
   const name=info.args[index].name;
   for(const f of info.fragments){
     const hit=new RegExp('^\\s*'+name+'\\s*:\\s*').exec(f.text);
     if(hit){
       const start=f.start+hit[0].length;
       return {start,end:f.end};
     }
   }
   const fragment=info.fragments[index];
   if(fragment&&!/^\s*\w+\s*:/.test(fragment.text)&&fragment.text.trim())
      return {start:fragment.start+fragment.text.search(/\S/),end:fragment.end};
   return null;
 }
 function selectSlot(info,index){
   const range=findValueRange(info,index);
   if(range){
     editor.focus({preventScroll:true});
     editor.setSelectionRange(range.start,range.end);
     lastCaret=range.start;
   }else if(info.fragments.at(-1).text.trim()===''){
     const a=info.args[index];
     // Unspecified input values must not silently become nil. In many audio
     // commands a fabricated nil makes an otherwise valid instrument fail.
     if(!Object.hasOwn(a,'default'))return;
     const fallback=String(a.default);
     insertAt(editor.selectionStart,editor.selectionEnd,a.name+': '+fallback,a.name);
     editor.setSelectionRange(editor.selectionStart-fallback.length,editor.selectionStart);
   }
 }
 const PLAIN_GUIDES={
   'Mix.new':{title:'Mix · Combine sounds',
     purpose:'Adds several sounds together. The square brackets [ ] contain the sounds to combine.',
     example:'Mix([SinOsc.ar(440), SinOsc.ar(660)])',
     fields:{array:'the list of sounds being combined'}},
   'SinOsc.ar':{title:'SinOsc · Make a pure tone',
     purpose:'Creates a smooth sine-wave sound. Its frequency sets the pitch.',
     fields:{freq:'pitch in hertz (440 is a concert A)',phase:'where the wave begins',mul:'volume or scaling',add:'offset added to the output'}},
   'SinOsc.kr':{title:'SinOsc · Make a slow-changing signal',
     purpose:'Creates a sine wave at control rate, often for vibrato or other slow changes.',
     fields:{freq:'speed of oscillation per second',phase:'starting position',mul:'depth of modulation',add:'offset'}},
   'EnvGen.kr':{title:'EnvGen · Shape a note',
     purpose:'Uses an envelope to change a sound over time, such as a quick attack and fading release.',
     fields:{envelope:'the shape of the sound over time',gate:'whether an envelope should continue',levelScale:'strength of the envelope',doneAction:'what to do when the envelope finishes (2 frees the synthesizer)'}},
   'Env.perc':{title:'Env.perc · Make a short note shape',
     purpose:'Creates a sound that rises and falls, useful for struck or plucked notes.',
     fields:{attackTime:'seconds to reach maximum level',releaseTime:'seconds to fade away',level:'peak strength',curve:'the shape of the rise and fall'}},
   'Out.ar':{title:'Out · Send sound to an output',
     purpose:'Sends a sound signal to an audio bus. Output bus 0 is normally the main speaker output.',
     fields:{bus:'which audio output to use',channelsArray:'the sound signal or signals to send'}},
   'Pan2.ar':{title:'Pan2 · Position sound in stereo',
     purpose:'Moves one sound between the left and right speakers.',
     fields:{in:'the sound to position',pos:'stereo position: -1 left, 0 center, 1 right',level:'output volume'}},
   'LPF.ar':{title:'LPF · Soften the sound',
     purpose:'Reduces high frequencies above a chosen cutoff.',
     fields:{in:'the sound to filter',freq:'cutoff frequency in hertz'}},
   'Synth.new':{title:'Synth · Play an instrument',
     purpose:'Starts an instrument already defined with SynthDef.',
     fields:{defName:'which instrument to start',args:'values to send to its controls'}},
   'SynthDef.new':{title:'SynthDef · Define an instrument',
     purpose:'Describes how an instrument creates its sound.',
     fields:{name:'the instrument name',ugenGraphFunc:'the function describing its sound'}}
 };
 const INPUT_HINTS={freq:'frequency or pitch',amp:'volume',dur:'duration in seconds',
   pan:'left/right position',out:'output bus',gate:'on/off or envelope control',
   mul:'multiplier',add:'offset',array:'list of values'};
 function renderSignature(info){
   const guide=PLAIN_GUIDES[info.signature];
   const display=info.method==='new'?info.owner:info.signature;
   const headline=element('strong','completion-heading',guide?.title||display+' · Inputs');
   const dismiss=element('button','completion-dismiss','×');
   dismiss.type='button';dismiss.setAttribute('aria-label','Close argument guide');dismiss.onclick=closeTray;
   const purpose=element('p','completion-purpose',
     guide?.purpose||'You are inside '+display+'(...). These are the values this command can use.');
   const active=info.args[info.active];
   const fieldDesc=active?(guide?.fields?.[active.name]||INPUT_HINTS[active.name]||active.description||'the value for '+active.name):'';
   const detail=element('p','completion-field-detail',
     active?'INPUT '+(info.active+1)+' OF '+info.args.length+': '+active.name+' · '+fieldDesc:'No inputs documented');
   const chips=element('div','completion-slots');
   info.args.forEach((arg,index)=>{
     const chip=element('button','completion-slot');chip.type='button';
     chip.classList.toggle('current',index===info.active);
     chip.classList.toggle('needed',!!info.verified&&info.requiredLeft.some(a=>a.name===arg.name));
     chip.textContent=arg.name+(Object.hasOwn(arg,'default')?' = '+arg.default:'');
     chip.title=guide?.fields?.[arg.name]||INPUT_HINTS[arg.name]||arg.description||'Select the '+arg.name+' input';
     chip.setAttribute('aria-label',arg.name+': '+chip.title);
     chip.setAttribute('aria-current',String(index===info.active));
     chip.onclick=()=>selectSlot(info,index);
     chips.append(chip);
   });
   const footer=element('div','completion-footer');
   const note=element('span','',guide?.example?
     'Example: '+guide.example:
     info.verified&&info.requiredLeft.length?
       'Still needs: '+info.requiredLeft.map(a=>a.name).join(', '):
       'Tap a named input to edit it; code changes only when you insert something.');
   note.title=note.textContent;footer.append(note);
   if(SAFE_TEMPLATES[info.signature]&&info.fragments.length===1&&!info.fragments[0].text.trim()){
     const template=element('button','completion-insert','INSERT EXAMPLE');template.type='button';
     template.title='Put a working example in your composition';
     template.onclick=()=>insertAt(info.open+1,editor.selectionStart,SAFE_TEMPLATES[info.signature]+')',info.owner);
     footer.append(template);
   }
   if(info.args.length>1){
     const next=element('button','completion-next','NEXT INPUT');next.type='button';
     next.title='Move to the next input. Tab also works.';
     next.onclick=()=>selectSlot(info,(info.active+1)%info.args.length);
     footer.append(next);
   }
   const technical=element('details','completion-technical');
   const technicalSummary=element('summary','','Technical details');technical.append(technicalSummary);
   technical.append(element('p','',info.signature+' · '+
     (info.verified?
       (info.requiredLeft.length?'Missing required inputs: '+info.requiredLeft.map(a=>a.name).join(', '):
        'No required fields missing'):
       'The reference does not confirm which inputs are required.')));
   tray.append(headline,dismiss,purpose,detail,chips,footer,technical);
   setTrayOpen(true);
   typing={kind:'signature',info};
 }
 function refresh(){
   if(!enabled||suspended||document.activeElement!==editor){closeTray();return}
   const caret=editor.selectionStart;
   if(editor.selectionEnd!==caret){closeTray();return}
   lastCaret=caret;
   const word=completionCandidates(catalog,editor.value,caret,{counts:history.counts,recent:history.recent});
   const signature=callAtCursor(catalog,editor.value,caret);
   tray.replaceChildren();
   if(word?.items?.length){renderSuggestions(word);return}
   if(signature){renderSignature(signature);return}
   closeTray();
 }
 editor.addEventListener('input',refresh);
 editor.addEventListener('click',refresh);
 editor.addEventListener('keyup',event=>{
   if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key))refresh();
 });
 editor.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&!tray.hidden){
     event.preventDefault();closeTray();return;
   }
   if(typing?.kind==='suggestions'&&!tray.hidden){
     if(event.key==='ArrowDown'||event.key==='ArrowUp'){
       event.preventDefault();
       typing.index=(typing.index+(event.key==='ArrowDown'?1:-1)+typing.info.items.length)%
         typing.info.items.length;
       for(const [i,b] of [...tray.querySelectorAll('.completion-choice')].entries())
         b.setAttribute('aria-selected',String(i===typing.index));
     }else if(event.key==='Tab'||event.key==='Enter'&&typing.index>=0){
       event.preventDefault();
       const i=Math.max(0,typing.index);
       tray.querySelectorAll('.completion-choice')[i]?.click();
     }
   }else if(typing?.kind==='signature'&&event.key==='Tab'&&!event.shiftKey&&!tray.hidden){
     event.preventDefault();
     selectSlot(typing.info,Math.min(typing.info.args.length-1,typing.info.active+1));
   }
 });
 document.addEventListener('pointerdown',event=>{
   if(!tray.hidden&&!event.target.closest('#completion-tray')&&event.target!==editor)closeTray();
 });
 function setEnabled(next){
   enabled=Boolean(next);
   try{localStorage.setItem(PREF,String(enabled))}catch{}
   if(!enabled)closeTray();else refresh();
 }
 function modeChanged(mode){
   if(mode==='off')panel.hidden=true;
   refresh();
 }
 // The complete language catalog is ~1.5 MB. Never fetch it automatically,
 // because iOS cannot reliably distinguish Wi-Fi from cellular.
 // Common-language completions remain available from the built-in catalog.
 fullCatalogButton.onclick=async()=>{
   if(catalog.full)return;
   if(!window.confirm('The complete SuperCollider command catalog is about 1.5 MB. iPhone browsers cannot reliably detect Wi-Fi. Continue only if you are on Wi-Fi or explicitly authorize this download over cellular.'))return;
   fullCatalogButton.disabled=true;
   fullCatalogButton.textContent='Loading catalog...';
   try{
     const response=await fetch('./language-catalog.json',{cache:'force-cache'});
     if(!response.ok)throw Error('catalog unavailable');
     const payload=await response.json();
     if(!Array.isArray(payload.classes)||payload.classes.length<800)throw Error('incomplete catalog');
     catalog=buildCatalog(payload);
     fullCatalogButton.hidden=true;
     if(!panel.hidden){buildCategories();renderList()}
     refresh();
   }catch(error){
     fullCatalogButton.textContent='Retry complete catalog download';
     count.textContent='Complete catalog unavailable. Built-in reference remains available.';
   }finally{
     fullCatalogButton.disabled=false;
   }
 };
 function suspend(next){
   suspended=Boolean(next);
   if(suspended)closeTray();else refresh();
 }
 return {open,hide,refresh,setEnabled,modeChanged,suspend,get enabled(){return enabled},
   get catalog(){return catalog},get isOpen(){return !panel.hidden}};
}
