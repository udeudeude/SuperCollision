/* Pure catalog, completion, and argument analysis. No code is executed. */
import {visibleCode} from './learning.mjs';

const spec=(names,defaults={},required=[],descriptions={})=>names.map(name=>({
  name,required:required.includes(name),...(Object.hasOwn(defaults,name)?{default:String(defaults[name])}:{}),
  ...(descriptions[name]?{description:descriptions[name]}:{})
}));
export const VERIFIED_SIGNATURES={
  'SinOsc.ar':spec(['freq','phase','mul','add'],{freq:440,phase:0,mul:1,add:0},[],{
    freq:'Frequency in hertz (cycles per second).',phase:'Starting phase in radians.',
    mul:'Multiplies the output, commonly used to control amplitude.',add:'Adds an offset to the output.'}),
  'SinOsc.kr':spec(['freq','phase','mul','add'],{freq:440,phase:0,mul:1,add:0},[],{
    freq:'Control signal frequency in hertz.',phase:'Starting phase in radians.',
    mul:'Multiplies the signal.',add:'Adds an offset.'}),
  'SinOscFB.ar':spec(['freq','feedback','mul','add'],{freq:440,feedback:0,mul:1,add:0}),
  'SinOscFB.kr':spec(['freq','feedback','mul','add'],{freq:440,feedback:0,mul:1,add:0}),
  'SynthDef.new':spec(['name','ugenGraphFunc','rates','prependArgs','variants','metadata'],{},['name','ugenGraphFunc']),
  'Synth.new':spec(['defName','args','target','addAction'],{},['defName']),
  'Out.ar':spec(['bus','channelsArray'],{},['bus','channelsArray']),
  'Out.kr':spec(['bus','channelsArray'],{},['bus','channelsArray']),
  'Routine.new':spec(['func','stackSize'],{},['func']),
  'Pbind.new':spec(['pairs'],{},[]),
};
export const FREQUENT=[
 ['SinOsc','Sine-wave oscillator','Oscillators',100,'ar'],
 ['SynthDef','Define a reusable synthesizer','Instruments',98,'new'],
 ['Synth','Create a running synthesizer','Instruments',97,'new'],
 ['EnvGen','Play an envelope','Envelopes',95,'kr'],
 ['Out','Write audio or control signals to a bus','Routing',94,'ar'],
 ['Routine','Run a sequence that can pause and resume','Timing',93,'new'],
 ['Pbind','Bind musical event keys to patterns','Patterns',92,'new'],
 ['Saw','Sawtooth-wave oscillator','Oscillators',88,'ar'],
 ['Pulse','Pulse-wave oscillator','Oscillators',87,'ar'],
 ['PinkNoise','Pink-noise generator','Noise',85,'ar'],
 ['WhiteNoise','White-noise generator','Noise',84,'ar'],
 ['LPF','Low-pass filter','Filters',83,'ar'],
 ['HPF','High-pass filter','Filters',82,'ar'],
 ['BPF','Band-pass filter','Filters',81,'ar'],
 ['RLPF','Resonant low-pass filter','Filters',80,'ar'],
 ['Pan2','Stereo panner','Spatial',80,'ar'],
 ['Env','Envelope description','Envelopes',79,'perc'],
 ['Pseq','Pattern that plays values in order','Patterns',78,'new'],
 ['Pwhite','Pattern that chooses random values','Patterns',77,'new'],
 ['Pwrand','Weighted random choice pattern','Patterns',73,'new'],
 ['Impulse','Impulse-train generator','Oscillators',72,'ar'],
 ['Dust','Random impulse generator','Noise',71,'ar'],
 ['LFNoise1','Linearly interpolated random signal','Modulation',70,'kr'],
 ['Line','Linear transition over time','Modulation',70,'kr'],
 ['XLine','Exponential transition over time','Modulation',69,'kr'],
 ['LFOsc','Low-frequency oscillator','Modulation',60,'ar'],
 ['SinOscFB','Sine oscillator with phase feedback','Oscillators',66,'ar'],
 ['Buffer','Allocate or manage sample buffers','Buffers',66,'alloc'],
 ['PlayBuf','Play an audio buffer','Buffers',66,'ar'],
 ['RecordBuf','Record into an audio buffer','Buffers',65,'ar'],
 ['GrainBuf','Granular playback from an audio buffer','Granular',65,'ar'],
 ['TGrains','Triggered granular synthesis','Granular',65,'ar'],
 ['FreqShift','Frequency shifter','Effects',64,'ar'],
 ['FreeVerb','Reverberation effect','Effects',64,'ar'],
 ['CombC','Interpolating comb delay','Effects',63,'ar'],
 ['DelayC','Interpolating delay','Effects',63,'ar'],
 ['AllpassC','All-pass delay','Effects',63,'ar'],
 ['MouseX','Mouse horizontal coordinate mapping','Control',62,'kr'],
 ['MouseY','Mouse vertical coordinate mapping','Control',61,'kr'],
 ['Server','Control the audio server','Server',78,'boot'],
 ['Group','Group synthesis nodes','Server',68,'new'],
 ['Bus','Allocate audio or control buses','Routing',72,'audio'],
 ['TempoClock','Clock for tempo-synchronized scheduling','Timing',74,'new'],
 ['SystemClock','Clock for real-time scheduling','Timing',66,'sched'],
 ['Array','Ordered collection of values','Language',80,'new'],
 ['Function','Reusable block of code','Language',75,'value'],
 ['Symbol','Interned name such as \\freq','Language',75,'new'],
 ['Event','Dictionary of musical event parameters','Patterns',71,'new'],
 ['Ndef','Named node proxy','Instruments',69,'new'],
 ['Pdef','Named pattern proxy','Patterns',70,'new']
];
const FALLBACK_INSTANCE_METHODS={
 Server:['boot','quit','sync','sendMsg','queryAllNodes'],
 Synth:['set','free','release','run','map'],
 Routine:['play','stop','reset','next'],
 Buffer:['play','free','read']
};
const categoryLookup=(category='')=>{
 const x=category.toLowerCase();
 if(x.includes('generator')||x.includes('oscill'))return 'Oscillators';
 if(x.includes('envelope'))return 'Envelopes';
 if(x.includes('filter'))return 'Filters';
 if(x.includes('pattern')||x.includes('stream'))return 'Patterns';
 if(x.includes('control'))return 'Control';
 if(x.includes('server')||x.includes('node'))return 'Server';
 if(x.includes('buffer'))return 'Buffers';
 if(x.includes('demand'))return 'Patterns';
 if(x.includes('ugen'))return 'Synthesis';
 if(x.includes('core')||x.includes('kernel'))return 'Language';
 return category.split(' / ')[0]||'Other';
};
export const SYNTAX_ENTRIES=[
  {name:'var',kind:'syntax',category:'Language',summary:'Declare a local variable inside a function.',docs:'https://doc.sccode.org/Reference/Scope.html',usefulness:89},
  {name:'~variable',kind:'syntax',category:'Language',summary:'Access a variable in the current Environment.',docs:'https://doc.sccode.org/Classes/Environment.html',usefulness:79},
  {name:'\\symbol',kind:'syntax',category:'Language',summary:'Write a Symbol literal (an interned name).',docs:'https://doc.sccode.org/Classes/Symbol.html',usefulness:77},
  {name:'{ function }',kind:'syntax',category:'Language',summary:'Define a Function using curly braces.',docs:'https://doc.sccode.org/Classes/Function.html',usefulness:89},
  {name:'|arguments|',kind:'syntax',category:'Language',summary:'Declare arguments within a Function.',docs:'https://doc.sccode.org/Reference/Functions.html',usefulness:85},
  {name:'; semicolon',kind:'syntax',category:'Language',summary:'Separate language expressions or statements.',docs:'https://doc.sccode.org/Reference/Syntax-Shortcuts.html',usefulness:81}
];
const alias={'SinOsc':'Sinusoidal oscillator','SinOscFB':'Sine oscillator with feedback',
 'EnvGen':'Envelope generator','SynthDef':'Synthesizer definition',
 'LPF':'Low-pass filter','HPF':'High-pass filter','BPF':'Band-pass filter',
 'RLPF':'Resonant low-pass filter','LFNoise1':'Low-frequency noise with interpolation',
 'UGen':'Unit generator','Pbind':'Pattern binding'};
export function displayName(name){return alias[name]||name}
export function buildCatalog(document){
 const provided=Array.isArray(document?.classes)?document.classes:[];
 const byName=new Map();
 for(const item of provided){
   if(!/^[A-Za-z_]\w*$/.test(item.name||''))continue;
   byName.set(item.name,{
     ...item,kind:'class',
     category:categoryLookup(item.category),
     rawCategory:item.category,
     usefulness:0,methods:Array.isArray(item.methods)?item.methods:[]
   });
 }
 for(const [name,summary,category,usefulness,preferredMethod] of FREQUENT){
   const existing=byName.get(name)||{name,kind:'class',methods:[],docs:'https://doc.sccode.org/Classes/'+name+'.html'};
   byName.set(name,{...existing,name,summary:existing.summary||summary,
     category:category||existing.category,usefulness,preferredMethod});
 }
 for(const [key,args] of Object.entries(VERIFIED_SIGNATURES)){
   const [owner,method]=key.split('.');
   const item=byName.get(owner);
   if(!item)continue;
   const methods=item.methods.map(m=>({...m}));
   const target=methods.find(m=>m.name===method&&m.scope==='class');
   if(target)target.args=args;
   else methods.push({owner,name:method,scope:'class',args,summary:'Verified argument names and requirements'});
   item.methods=methods;
 }
 for(const [owner,methods] of Object.entries(FALLBACK_INSTANCE_METHODS)){
   const cls=byName.get(owner);
   if(!cls)continue;
   for(const name of methods){
     if(!cls.methods.some(m=>m.name===name&&m.scope==='instance'))
       cls.methods.push({owner,name,scope:'instance',args:[],summary:'See the official '+owner+' documentation.'});
   }
 }
 for(const cls of byName.values()){
   const name=cls.preferredMethod;
   if(name&&!cls.methods.some(m=>m.name===name)){
     cls.methods.push({owner:cls.name,name,scope:cls.name==='Server'?'instance':'class',
       args:[],summary:'See the official '+cls.name+' documentation.'});
   }
 }
 const classes=[...byName.values(),...SYNTAX_ENTRIES];
 return {classes,source:provided.length>100?document.source:'Built-in common-language reference',
   full:provided.length>100,classCount:byName.size};
}
export function countOccurrences(source,name){
 if(!source||!/^[A-Za-z_]\w*$/.test(name))return 0;
 const sanitized=visibleCode(source);
 const pattern=new RegExp('\\b'+name+'\\b','g');
 return [...sanitized.matchAll(pattern)].length;
}
export function searchCatalog(catalog,{query='',sort='usefulness',category='all',source='',recent=[],counts={},limit=60}={}){
 const q=query.trim().toLowerCase();
 let found=(catalog?.classes||[]).filter(x=>
   (category==='all'||x.category===category)&&
   (!q||[x.name,x.summary,x.category,x.rawCategory,x.methods?.map(m=>m.name).join(' ')]
     .join(' ').toLowerCase().includes(q)));
 const rank=x=>(x.usefulness||0)+(counts[x.name]||0)*18+Math.min(12,countOccurrences(source,x.name)*3);
 const byName=(a,b)=>a.name.localeCompare(b.name);
 found.sort((a,b)=>{
   if(sort==='alphabetical')return byName(a,b);
   if(sort==='category')return a.category.localeCompare(b.category)||byName(a,b);
   if(sort==='used')return (countOccurrences(source,b.name)+(counts[b.name]||0)*2)-
     (countOccurrences(source,a.name)+(counts[a.name]||0)*2)||rank(b)-rank(a)||byName(a,b);
   if(sort==='recent')return (recent.indexOf(a.name)<0?10000:recent.indexOf(a.name))-
     (recent.indexOf(b.name)<0?10000:recent.indexOf(b.name))||rank(b)-rank(a)||byName(a,b);
   return rank(b)-rank(a)||byName(a,b);
 });
 return found.slice(0,limit);
}
function methodFor(catalog,owner,name){
 const item=catalog?.classes?.find(x=>x.name===owner);
 if(!item)return null;
 const exact=item.methods?.find(m=>m.name===name&&m.scope==='class');
 const instance=item.methods?.find(m=>m.name===name);
 return exact||instance||null;
}
function methodToken(source,pos){
 const clean=visibleCode(source),prefix=clean.slice(0,pos);
 const dot=/\b([A-Za-z_]\w*)\s*\.\s*([A-Za-z_]\w*)?$/.exec(prefix);
 if(dot){
   const owner=dot[1]==='s'?'Server':dot[1];
   return {kind:'method',owner,prefix:dot[2]||'',replaceStart:pos-(dot[2]||'').length,replaceEnd:pos};
 }
 const classToken=/\b([A-Za-z_]\w*)$/.exec(prefix);
 if(!classToken)return null;
 return {kind:'class',prefix:classToken[1],replaceStart:pos-classToken[1].length,replaceEnd:pos};
}
export function completionCandidates(catalog,source,pos,{counts={},recent=[]}={}){
 if(pos<0||pos>source.length)return null;
 const current=methodToken(source,pos);
 if(!current||!current.prefix)return null;
 const p=current.prefix.toLowerCase();
 if(current.kind==='method'){
   const owner=catalog.classes.find(x=>x.name===current.owner);
   const scope=current.owner==='Server'?'instance':'class';
   const unique=new Set();
   const matches=(owner?.methods||[]).filter(m=>m.scope===scope&&m.name.toLowerCase().startsWith(p)&&
     !unique.has(m.name)&&unique.add(m.name)).slice(0,8);
   return {...current,items:matches.map(m=>({name:m.name,owner:current.owner,kind:'method',
      summary:m.summary||current.owner+' method',signature:m}))};
 }
 const sorted=searchCatalog(catalog,{query:current.prefix,sort:'usefulness',source,counts,recent,limit:60});
 const items=sorted.filter(x=>x.kind==='class'&&x.name.toLowerCase().startsWith(p)).slice(0,8);
 return {...current,items:items.map(x=>({name:x.name,kind:'class',summary:x.summary,
   preferredMethod:x.preferredMethod,owner:x.name}))};
}
/* Scan up to the caret. Nested calls/arrays/functions do not count as commas
 * belonging to the outer method signature. Quoted and commented code is masked.
 */
export function callAtCursor(catalog,source,pos){
 const clean=visibleCode(source),stack=[];
 for(let i=0;i<pos;i++){
   const c=clean[i];
   if('([{'.includes(c))stack.push({char:c,start:i});
   else if(')]}'.includes(c)){
     const expected={')':'(',']':'[','}':'{'}[c];
     if(stack.length&&stack[stack.length-1].char===expected)stack.pop();
   }
 }
 const open=[...stack].reverse().find(x=>x.char==='(');
 if(!open)return null;
 const before=clean.slice(Math.max(0,open.start-130),open.start);
 const call=/\b([A-Za-z_]\w*)(?:\s*\.\s*([A-Za-z_]\w*))?\s*$/.exec(before);
 if(!call)return null;
 const owner=call[1]==='s'?'Server':call[1];
 const method=call[2]||(owner==='Server'?'boot':'new');
 const signature=methodFor(catalog,owner,method);
 if(!signature?.args?.length)return null;
 const args=signature.args;
 // Count only separators at this call's level.
 const fragments=[];let start=open.start+1,depth=0;
 for(let i=start;i<pos;i++){
   const c=clean[i];
   if('([{'.includes(c))depth++;
   else if(')]}'.includes(c))depth=Math.max(0,depth-1);
   else if(c===','&&depth===0){fragments.push({start,end:i,text:source.slice(start,i)});start=i+1}
 }
 fragments.push({start,end:pos,text:source.slice(start,pos)});
 const active=fragments.at(-1),named=/^\s*([A-Za-z_]\w*)\s*:/.exec(active.text);
 const namedUsed=new Set(fragments.map(f=>/^\s*([A-Za-z_]\w*)\s*:/.exec(f.text)?.[1]).filter(Boolean));
 const ordinal=named?Math.max(0,args.findIndex(x=>x.name===named[1])):
   Math.min(args.length-1,fragments.length-1);
 const requiredLeft=args.filter((a,i)=>a.required&&!namedUsed.has(a.name)&&
   !(fragments[i]?.text.trim()&&!/^\s*\w+\s*:/.test(fragments[i].text)));
 return {owner,method,args,open:open.start,active:Math.max(0,ordinal),namedUsed,
   requiredLeft,fragments,signature:owner+'.'+method,verified:!!VERIFIED_SIGNATURES[owner+'.'+method]};
}
export const SAFE_TEMPLATES={
  'SinOsc.ar':'freq: 440, mul: 0.1',
  'SinOsc.kr':'freq: 1, mul: 0.1',
  'SinOscFB.ar':'freq: 440, mul: 0.1',
  'SinOscFB.kr':'freq: 1, mul: 0.1',
};
export function insertionFor(candidate,typedPrefix=''){
 if(candidate.kind==='class'){
   const method=candidate.preferredMethod;
   const key=candidate.name+'.'+method;
   if(SAFE_TEMPLATES[key]&&typedPrefix.length>=2){
     return {text:key+'('+SAFE_TEMPLATES[key]+')',select:'440'};
   }
   return {text:candidate.name,select:null};
 }
 return {text:candidate.name+(candidate.signature?.args?.length?'(':''),select:null};
}
