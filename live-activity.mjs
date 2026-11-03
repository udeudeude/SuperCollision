/* SuperCollision: OSC-derived source-to-sound activity.
 * Intercepts copies of OSC packets; never changes, delays or replaces their delivery.
 * Amber means scsynth has sent /n_go without a corresponding /n_end.
 * Cyan marks a /s_new request. Source mapping is best-effort and confidence-gated.
 */
import {prepareRoutineTrace,routineTracePattern} from './routine-trace.mjs?v=20';
const MAX_PACKET=1024*1024, MAX_MESSAGES=512;
function bytesOf(raw){
  if(raw instanceof Uint8Array)return raw;
  if(raw instanceof ArrayBuffer)return new Uint8Array(raw);
  if(ArrayBuffer.isView(raw))return new Uint8Array(raw.buffer,raw.byteOffset,raw.byteLength);
  if(Array.isArray(raw))return Uint8Array.from(raw);
  return null;
}
export function readOscPacket(raw){
  const data=bytesOf(raw),output=[];
  if(!data||!data.byteLength||data.byteLength>MAX_PACKET)return output;
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
  const decoder=new TextDecoder('utf-8',{fatal:false});
  const str=(start,end)=>decoder.decode(data.subarray(start,end));
  function readString(off,limit){
    if(off>=limit)return null;
    let end=off;
    while(end<limit&&data[end]!==0)end++;
    if(end>=limit)return null;
    const next=(end+4)&~3;
    if(next>limit)return null;
    return {text:str(off,end),next};
  }
  function parse(start,limit,depth){
    if(depth>5||start>=limit||output.length>=MAX_MESSAGES)return;
    // SuperCollider accepts an integer command ID instead of an OSC path.
    // Synth creation is cmd_s_new = 9 (or cmd_s_newargs = 59).
    // These are valid especially inside timestamped bundles.
    const numeric=start+4<=limit?view.getUint32(start,false):-1;
    const numbered=(numeric===9||numeric===59);
    const addr=numbered?{text:'/s_new',next:start+4}:readString(start,limit);
    if(!addr)return;
    if(addr.text==='#bundle'){
      let off=addr.next+8;
      while(off+4<=limit&&output.length<MAX_MESSAGES){
        const n=view.getUint32(off,false);off+=4;
        if(n<1||n>MAX_PACKET||off+n>limit)return;
        parse(off,off+n,depth+1);off+=n;
      }
      return;
    }
    if(!addr.text.startsWith('/'))return;
    const types=readString(addr.next,limit);
    if(!types||!types.text.startsWith(','))return;
    const args=[],embedded=[];let off=types.next;
    for(const t of types.text.slice(1)){
      if(args.length>96)return;
      if(t==='i'||t==='f'||t==='c'||t==='r'||t==='m'){
        if(off+4>limit)return;
        args.push(t==='f'?view.getFloat32(off,false):view.getInt32(off,false));off+=4;
      }else if(t==='s'||t==='S'){
        const item=readString(off,limit);
        if(!item)return;
        args.push(item.text);off=item.next;
      }else if(t==='b'){
        if(off+4>limit)return;
        const size=view.getUint32(off,false);off+=4;
        if(size>MAX_PACKET||off+size>limit)return;
        if(size>0&&(data[off]===47||data[off]===35))embedded.push([off,off+size]);
        off+=((size+3)&~3);
        if(off>limit)return;
        args.push('[blob]');
      }else if(t==='h'||t==='t'||t==='d'){
        if(off+8>limit)return;
        args.push(t==='d'?view.getFloat64(off,false):'[64-bit]');off+=8;
      }else if(t==='T'||t==='F'||t==='N'||t==='I'){
        args.push(t==='T'?true:t==='F'?false:null);
      }else if(t==='['||t===']'){
        continue;
      }else{
        // Do not guess an unfamiliar OSC type's byte width.
        return;
      }
    }
    output.push({address:addr.text,args});
    // /d_recv and /d_load may carry an OSC /s_new completion message in a blob.
    // Inspect only a blob beginning with a valid OSC address (never SynthDef binary).
    for(const [a,b] of embedded)parse(a,b,depth+1);
  }
  try{parse(0,data.byteLength,0)}catch{}
  return output;
}
function maskComments(source){
  // Keep original character and line positions for source mapping.
  const output=source.split('');
  let i=0,mode='code';
  const blank=j=>{if(source[j]!=='\n'&&source[j]!=='\r')output[j]=' '};
  while(i<source.length){
    const ch=source[i],next=source[i+1];
    if(mode==='code'){
      if(ch==='"'){mode='string';i++;continue}
      if(ch==='/'&&next==='/'){blank(i);blank(i+1);i+=2;mode='line';continue}
      if(ch==='/'&&next==='*'){blank(i);blank(i+1);i+=2;mode='block';continue}
      i++;continue;
    }
    if(mode==='string'){
      if(ch==='\\'){i+=2;continue}
      if(ch==='"')mode='code';
      i++;continue;
    }
    if(mode==='line'){
      if(ch==='\n'){mode='code';i++;continue}
      blank(i++);continue;
    }
    if(mode==='block'){
      if(ch==='*'&&next==='/'){blank(i);blank(i+1);i+=2;mode='code';continue}
      blank(i++);continue;
    }
  }
  return output.join('');
}
function sourceLine(text,index){
  let n=1;for(let i=0;i<Math.min(index,text.length);i++)if(text.charCodeAt(i)===10)n++;
  return n;
}
function span(text,a,b,kind,name){
  return {start:sourceLine(text,a),end:sourceLine(text,Math.max(a,b)),startOffset:a,endOffset:b,
    text:text.slice(a,b+1),kind,name};
}
function findMatchingBrace(text,start){
  let depth=0,quoted=false;
  for(let i=start;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='\\'){i++;continue}
      if(ch==='"')quoted=false;
      continue;
    }
    if(ch==='"'){quoted=true;continue}
    if(ch==='{')depth++;
    if(ch==='}'&&--depth===0)return i;
  }
  return -1;
}
export function indexSource(source){
  const text=maskComments(source),defs=new Map(),triggers=new Map(),anonymous=[];
  const named=/\bSynthDef\s*\(\s*(?:\\([A-Za-z_]\w*)|"([^"]+)")/g;
  for(const m of text.matchAll(named)){
    const name=m[1]||m[2],open=text.indexOf('{',m.index+m[0].length);
    if(open<0||open-m.index>1200)continue;
    const end=findMatchingBrace(text,open);
    if(end<0)continue;
    // Last character is a brace; follow any subsequent .add or .send only if nearby.
    let stop=end;
    const suffix=/^\s*\)\s*\.\s*(?:add|send|store)\s*;?/.exec(text.slice(end+1,end+100));
    if(suffix)stop=end+suffix[0].length;
    defs.set(name,span(source,m.index,stop,'definition',name));
  }
  const calls=/\bSynth\s*\(\s*(?:\\([A-Za-z_]\w*)|"([^"]+)")/g;
  for(const m of text.matchAll(calls)){
    const name=m[1]||m[2],a=triggers.get(name)||[];
    a.push(span(source,m.index,m.index+m[0].length-1,'trigger',name));triggers.set(name,a);
  }
  // For a Pbind the language schedules repeated note starts on the server.
  const pattern=/\b(?:Pbind|Pbindef)\s*\([\s\S]{0,1200}?\binstrument\s*,\s*(?:\\([A-Za-z_]\w*)|"([^"]+)")/g;
  for(const m of text.matchAll(pattern)){
    const name=m[1]||m[2],a=triggers.get(name)||[];
    a.push(span(source,m.index,m.index+Math.min(m[0].length,120)-1,'trigger',name));
    triggers.set(name,a);
  }
  // An anonymous function .play generates a temporary SynthDef name at runtime.
  // This association is used only when exactly one such block was evaluated.
  const anonymousEnd=/\}\s*\.play\b/g;
  for(const m of text.matchAll(anonymousEnd)){
    const endBrace=m.index;
    let level=1,open=-1;
    for(let i=endBrace-1;i>=0;i--){
      if(text[i]==='}')level++;
      else if(text[i]==='{'&&--level===0){open=i;break}
    }
    if(open>=0)anonymous.push(span(source,open,m.index+m[0].length-1,'anonymous','anonymous'));
  }
  return {defs,triggers,anonymous};
}
export class SoundActivityTracker{
  constructor(onChange=()=>{},now=()=>Date.now()){
    this.onChange=onChange;this.now=now;this.nodes=new Map();this.defs=new Map();this.calls=new Map();this.instrumentStats=new Map();this.routines=new Map();this.traceSessions=new Map();this.colorSlots=new Map();this.nextColorSlot=0;
    this.anonymous=null;this.document=null;this.pulses=[];this.requestCount=0;this.confirmedCount=0;
    this.lastServerMessage=0;this.notifications=false;this.sentPackets=0;this.receivedPackets=0;this.recentSent=[];this.recentReceived=[];this.unknownPacketTypes=0;
  }
  setDocument(composition,text){this.document={composition,text};this.notify()}
  evaluation(composition,whole,submitted,startLine=1){
    const data=indexSource(whole),endLine=startLine+submitted.split('\n').length-1;
    const included=r=>r.start>=startLine&&r.end<=endLine;
    const belongs=r=>({ ...r,composition,snapshot:whole });
    for(const [name,r] of data.defs)if(included(r))this.defs.set(name,belongs(r));
    // Only claim a trigger site if there is exactly one possible site in the evaluated code.
    for(const [name,ranges] of data.triggers){
      const matches=ranges.filter(included);
      if(matches.length===1)this.calls.set(name,belongs(matches[0]));
      else if(matches.length>1)this.calls.delete(name);
    }
    const singles=data.anonymous.filter(included);
    this.anonymous=singles.length===1?belongs(singles[0]):null;
    this.setDocument(composition,whole);
  }
  registerRoutinePlan(plan,composition,whole){
    if(!plan.instrumented)return;
    const allowed=new Set(plan.checkpoints.map(p=>p.routine+':'+p.line+':'+p.kind));
    this.traceSessions.set(plan.run,{composition,whole,allowed});
    if(this.traceSessions.size>25)this.traceSessions.delete(this.traceSessions.keys().next().value);
    for(const r of plan.routines){
      this.routines.set(plan.run+':'+r.id,{
        ...r,composition,snapshot:whole,lastLine:null,lastKind:null,
        lastAt:0,steps:0,wait:null,tempo:null,waitSeconds:null,waitUntil:null
      });
    }
    if(this.routines.size>90)this.routines.delete(this.routines.keys().next().value);
    this.notify();
  }
  consumeLanguagePrint(t,observe=true){
    const src=String(t);
    let saw=false;
    const stripped=src.replace(routineTracePattern,(full,run,routine,line,kind,wait,tempo)=>{
      const session=this.traceSessions.get(run);
      const allowed=session?.allowed.has(routine+':'+line+':'+kind);
      if(!allowed)return full;
      saw=true;
      const target=this.routines.get(run+':'+routine);
      if(target&&observe){
        target.lastLine=Number(line);target.lastKind=kind;
        target.lastAt=this.now();target.steps++;
        target.wait=kind==='wait'&&wait!=='x'?Number(wait):null;
        const rate=Number(tempo);
        target.tempo=kind==='wait'&&Number.isFinite(rate)&&rate>0?rate:null;
        target.waitSeconds=target.wait!==null&&target.tempo!==null?
          Math.max(0,target.wait/target.tempo):null;
        target.waitUntil=target.waitSeconds!==null&&Number.isFinite(target.waitSeconds)?
          target.lastAt+target.waitSeconds*1000:null;
        this.notify();
      }
      return '';
    });
    if(!saw)return src;
    return stripped.split(/\r?\n/).filter(x=>x.trim()).join('\n');
  }
  colorSlot(name){
    if(!this.colorSlots.has(name)){
      this.colorSlots.set(name,this.nextColorSlot%10);
      this.nextColorSlot++;
    }
    return this.colorSlots.get(name);
  }
  statistics(name,composition='unmapped'){
    const key=composition+'|'+name;
    let row=this.instrumentStats.get(key);
    if(!row){
      row={name,composition,total:0,ended:0,lastDuration:null,totalDuration:0,lastAt:0,slot:this.colorSlot(name)};
      this.instrumentStats.set(key,row);
    }
    return row;
  }
  notify(){this.onChange(this)}
  outgoing(raw){
    this.sentPackets++;
    const messages=readOscPacket(raw);
    if(!messages.length)this.unknownPacketTypes++;
    for(const msg of messages){
      this.recentSent.push(msg.address);
      if(this.recentSent.length>16)this.recentSent.shift();
      if(msg.address==='/s_new'){
        const name=msg.args[0],id=msg.args[1];
        if(typeof name!=='string'||!Number.isInteger(id))continue;
        const isTemp=/^(?:temp[_-]|anonymous[_-]|aFunction)/i.test(name);
        const definition=this.defs.get(name)||((isTemp&&this.anonymous)?this.anonymous:null);
        const call=this.calls.get(name)||null;
        const t=this.now();
        // Audio is only confirmed active by the server's /n_go.
        const owner=definition?.composition||call?.composition||this.document?.composition||'unmapped';
        this.nodes.set(id,{id,name,definition,call,composition:owner,confirmed:false,running:true,time:t,startedAt:null,slot:this.colorSlot(name),voiceSlot:(this.requestCount%10)});
        this.statistics(name,owner).lastAt=t;
        this.pulses.push({name,site:call||definition,at:t,slot:this.colorSlot(name),voiceSlot:this.requestCount%10});
        this.requestCount++;
        if(this.nodes.size>5000){
          const oldest=this.nodes.keys().next().value;
          this.nodes.delete(oldest);
        }
        this.notify();
      }else if(msg.address==='/notify'){
        this.notifications=Number(msg.args[0])===1;
      }else if(msg.address==='/quit'){
        this.stopRequested();
      }
    }
  }
  incoming(raw){
    this.receivedPackets++;
    const messages=readOscPacket(raw);
    if(!messages.length)this.unknownPacketTypes++;
    for(const msg of messages){
      this.recentReceived.push(msg.address);
      if(this.recentReceived.length>16)this.recentReceived.shift();
      const id=msg.args[0],node=this.nodes.get(id);
      if(msg.address==='/n_go'&&Number.isInteger(id)){
        if(node&&!node.confirmed){node.confirmed=true;node.running=true;node.startedAt=this.now();this.statistics(node.name,node.composition).total++;this.confirmedCount++;this.lastServerMessage=this.now();this.notify()}
      }else if(msg.address==='/n_end'&&Number.isInteger(id)){
        if(node){if(node.confirmed){const stats=this.statistics(node.name,node.composition);stats.ended++;const elapsed=Math.max(0,this.now()-(node.startedAt||node.time));stats.lastDuration=elapsed;stats.totalDuration+=elapsed}this.nodes.delete(id);this.lastServerMessage=this.now();this.notify()}
      }else if(msg.address==='/n_off'&&node){node.running=false;this.notify()}
      else if(msg.address==='/n_on'&&node){node.running=true;this.notify()}
    }
  }
  diagnosticReport(){
    const v=this.visible();
    return [
      'SuperCollision Live Code observer',
      'OSC packets language→server: '+this.sentPackets,
      'OSC packets server→language: '+this.receivedPackets,
      'Packets without recognizable OSC: '+this.unknownPacketTypes,
      'Server notifications requested: '+this.notifications,
      'Recognized synth requests: '+this.requestCount,
      'Recognized node-start confirmations: '+this.confirmedCount,
      'Currently confirmed running: '+v.confirmed,
      'Currently awaiting confirmation: '+v.requested,
      'Mapped active definitions on screen: '+v.linked,
      'Mapped named SynthDefs: '+this.defs.size,
      'Mapped named trigger sites: '+this.calls.size,
      'Named instruments: '+v.instruments.map(i=>i.name+'='+i.active+' active / '+i.total+' started').join(', '),
      'Observed Routines: '+v.routines.map(r=>'L'+r.id+' at L'+r.line+' '+r.kind).join(', '),
      'Recent language→server OSC: '+(this.recentSent.join(' ')||'(none)'),
      'Recent server→language OSC: '+(this.recentReceived.join(' ')||'(none)')
    ].join('\n');
  }
  stopRequested(){
    this.nodes.clear();this.pulses=[];this.routines.clear();this.notify();
  }
  visible(now=this.now()){
    const doc=this.document,active=[],pulses=[],activeVoices=[];
    const matches=site=>!!doc&&!!site&&site.composition===doc.composition&&
      doc.text.slice(site.startOffset,site.endOffset+1)===site.text;
    const instruments=new Map();
    for(const stats of this.instrumentStats.values()){
      const name=stats.name,connected=this.defs.get(name);
      if(!doc||stats.composition!==doc.composition||!(connected&&matches(connected)))continue;
      const row={...stats,active:0,pending:0,voices:[],paused:0,def:connected,latestAge:Math.max(0,now-stats.lastAt)};
      instruments.set(name,row);
    }
    for(const node of this.nodes.values()){
      const row=instruments.get(node.name);
      if(node.confirmed&&node.running&&matches(node.definition)){
        active.push(node.definition);
        activeVoices.push({site:node.definition,slot:node.slot,voiceSlot:node.voiceSlot,id:node.id,name:node.name});
        if(row){
          row.active++;
          row.voices.push({id:node.id,slot:node.voiceSlot,startedAt:node.startedAt||node.time});
          row.oldestStartAt=row.oldestStartAt===undefined?(node.startedAt||node.time):Math.min(row.oldestStartAt,node.startedAt||node.time);
        }
      }else if(!node.confirmed&&row)row.pending++;
      else if(node.confirmed&&!node.running&&row)row.paused++;
    }
    this.pulses=this.pulses.filter(p=>now-p.at<800);
    for(const p of this.pulses)if(matches(p.site))pulses.push({site:p.site,slot:p.slot,voiceSlot:p.voiceSlot,name:p.name});
    const recent=Array.from(instruments.values()).filter(x=>x.active>0||x.latestAge<15000);
    recent.sort((a,b)=>b.active-a.active||b.lastAt-a.lastAt);
    const progress=[];
    for(const r of this.routines.values()){
      if(!doc||r.composition!==doc.composition||r.snapshot!==doc.text||!r.lastAt)continue;
      const elapsed=now-r.lastAt;
      if(elapsed>Math.max(45000,(r.waitSeconds||0)*1000+15000))continue; // A trace position is not proof the Routine still runs.
      const waiting=r.lastKind==='wait'&&r.waitUntil!==null;
      const remaining=waiting?Math.max(0,(r.waitUntil-now)/1000):null;
      const stale=elapsed>Math.max(15000,(r.waitSeconds||0)*1000+1500);
      progress.push({id:r.id,line:r.lastLine,kind:r.lastKind,at:r.lastAt,
        ago:elapsed,steps:r.steps,wait:r.wait,tempo:r.tempo,waitSeconds:r.waitSeconds,
        remaining,waiting,stale});
    }
    progress.sort((a,b)=>b.at-a.at);
    return {active,activeVoices,pulses,instruments:recent.slice(0,8),routines:progress.slice(0,3),
      confirmed:[...this.nodes.values()].filter(n=>n.confirmed&&n.running).length,
      requested:[...this.nodes.values()].filter(n=>!n.confirmed).length,events:this.requestCount,
      linked:active.length,notifications:this.notifications};
  }
}
export function createLiveActivityUI({editor,gutter,overlay,status,code,composition,panel,instrumentsEl,routinesEl,panelToggle}){
  let enabled=true,queued=false,refreshTimer=null;
  const track=new SoundActivityTracker(()=>schedule(),()=>performance.now());
  const scrollToLine=(line)=>{
    if(!Number.isInteger(line))return;
    const h=parseFloat(getComputedStyle(editor).lineHeight)||21;
    editor.scrollTop=Math.max(0,(line-1)*h-editor.clientHeight*0.33);
    editor.dispatchEvent(new Event('scroll'));
  };
  function renderInstrumentRows(rows){
    instrumentsEl.replaceChildren();
    for(const item of rows.slice(0,5)){
      const row=document.createElement('button');
      row.type='button';row.className='live-instrument-row';
      row.title=item.name+': '+item.active+' running; '+item.total+' started; latest lifetime '+(item.lastDuration===null?'not yet completed':(item.lastDuration/1000).toFixed(1)+' seconds');
      row.style.setProperty('--voice-color','var(--voice-'+item.slot+')');
      const name=document.createElement('span');name.className='live-instrument-name';name.textContent=item.name;
      const count=document.createElement('span');count.className='live-instrument-count';
      count.textContent='●'+item.active;
      count.dataset.active=String(item.active>0);
      const runs=document.createElement('span');runs.className='live-instrument-total';
      runs.textContent='/'+item.total;
      const age=document.createElement('span');age.className='live-instrument-duration';
      const duration=item.active>0?(track.now()-(item.oldestStartAt||track.now())):item.lastDuration;
      age.textContent=duration===null?'·':(duration/1000).toFixed(1)+'s';
      const voices=document.createElement('span');
      voices.className='live-voice-marks';voices.setAttribute('aria-hidden','true');
      for(const v of item.voices.slice(0,4)){
        const mark=document.createElement('span');
        mark.className='live-voice-mark';
        mark.style.setProperty('--voice-color','var(--voice-'+v.slot+')');
        mark.title='Node '+v.id;
        voices.append(mark);
      }
      row.append(name,voices,count,runs,age);
      if(item.def)row.addEventListener('click',()=>scrollToLine(item.def.start));
      instrumentsEl.append(row);
    }
    if(!rows.length){
      const noInstruments=document.createElement('div');noInstruments.className='live-idle';
      noInstruments.textContent='NO ACTIVE INSTRUMENTS';instrumentsEl.append(noInstruments);
    }
    if(rows.length>5){
      const extra=document.createElement('small');extra.textContent='+'+(rows.length-5);
      instrumentsEl.append(extra);
    }
  }
  function renderRoutineRows(rows){
    routinesEl.replaceChildren();
    for(const r of rows.slice(0,2)){
      const row=document.createElement('button');row.type='button';
      row.className='live-routine-row';row.title='Routine at last confirmed checkpoint on line '+r.line;
      const progress=r.waiting&&r.waitSeconds>0?Math.max(0,Math.min(100,(1-r.remaining/r.waitSeconds)*100)):0;
      row.style.setProperty('--wait-progress',progress+'%');
      if(r.waiting&&!r.stale)row.classList.add('live-waiting');
      if(r.stale)row.classList.add('live-routine-stale');
      const name=document.createElement('span');name.textContent='R'+r.id+' · L'+r.line;
      const state=document.createElement('span');state.className='live-routine-state';
      state.textContent=r.stale?'LAST':r.waiting&&r.remaining!==null?
        (r.remaining>0?'WAIT '+r.remaining.toFixed(1)+'s':'DUE'):
        r.kind==='wait'?'WAIT ·':'STEP';
      row.append(name,state);
      row.addEventListener('click',()=>scrollToLine(r.line));
      routinesEl.append(row);
    }
  }
  const render=()=>{
    queued=false;
    const v=track.visible(),activeLines=new Map(),pulseLines=new Map(),routineLines=new Map();
    for(const event of v.activeVoices){
      const range=event.site;
      const lines=range.text.split('\n');
      for(let j=0;j<lines.length&&j<1000;j++){
        const lineText=lines[j].trim();
        if(j!==0&&(lineText.startsWith('//')||!/\.(?:ar|kr|ir|dr)\s*\(|\b(?:Out|OffsetOut|ReplaceOut)\s*\.\s*ar\b/.test(lineText)))continue;
        const line=range.start+j;
        let entry=activeLines.get(line);
        if(!entry){entry={slot:event.slot,voices:new Set()};activeLines.set(line,entry)}
        entry.voices.add(event.voiceSlot);
      }
    }
    for(const event of v.pulses)pulseLines.set(event.site.start,event);
    for(const r of v.routines)if(!r.stale)routineLines.set(r.line,r);
    for(const el of gutter.querySelectorAll('.line.live-active,.line.live-trigger,.line.live-routine,.line.live-wait')){
      el.classList.remove('live-active','live-trigger','live-routine','live-wait');
      el.style.removeProperty('--voice-color');
    }
    overlay.replaceChildren();
    const lineHeight=parseFloat(getComputedStyle(editor).lineHeight)||21;
    const topPadding=parseFloat(getComputedStyle(editor).paddingTop)||12;
    const first=Math.max(1,Math.floor(editor.scrollTop/lineHeight)-1);
    const last=first+Math.ceil(editor.clientHeight/lineHeight)+3;
    const lineNodes=gutter.querySelector('#line-inner')?.children||[];
    if(enabled){
      for(let line=first;line<=last;line++){
        const pulse=pulseLines.get(line),active=activeLines.get(line),routine=routineLines.get(line);
        if(!pulse&&!active&&!routine)continue;
        const row=document.createElement('div');
        const classes=['live-source-line'];
        if(active)classes.push('live-source-active');
        if(pulse)classes.push('live-source-trigger');
        if(routine)classes.push(routine.waiting?'live-source-wait':'live-source-routine');
        row.className=classes.join(' ');
        const slot=active?.slot??pulse?.slot;
        if(slot!==undefined)row.style.setProperty('--voice-color','var(--voice-'+slot+')');
        if(active?.voices.size){
          const colors=Array.from(active.voices).slice(0,6);
          const parts=colors.map((slot,i)=>'var(--voice-'+slot+') '+(i*3)+'px '+((i+1)*3)+'px');
          row.style.setProperty('--voice-stripes','linear-gradient(to right,'+parts.join(',')+',transparent '+(colors.length*3)+'px)');
          row.dataset.voices=String(active.voices.size);
        }
        if(routine?.waiting&&routine.waitSeconds>0)
          row.style.setProperty('--wait-progress',(100*Math.max(0,1-routine.remaining/routine.waitSeconds)).toFixed(1)+'%');
        row.style.top=(topPadding+(line-1)*lineHeight-editor.scrollTop)+'px';
        row.style.height=lineHeight+'px';
        overlay.append(row);
        const label=lineNodes[line-1];
        if(label){
          if(active)label.classList.add('live-active');
          if(pulse)label.classList.add('live-trigger');
          if(routine)label.classList.add(routine.waiting?'live-wait':'live-routine');
          if(slot!==undefined)label.style.setProperty('--voice-color','var(--voice-'+slot+')');
        }
      }
    }
    status.textContent=enabled?'●'+v.confirmed+'  ✦'+track.pulses.length:'OFF';
    panel.classList.toggle('live-disabled',!enabled);
    renderInstrumentRows(enabled?v.instruments:[]);
    renderRoutineRows(enabled?v.routines:[]);
    routinesEl.hidden=!enabled||!v.routines.length;
    clearTimeout(refreshTimer);
    if(enabled&&(track.pulses.length||v.routines.length||v.confirmed>0)){
      const counting=v.routines.some(r=>r.waiting&&r.remaining!==null&&r.remaining>0&&!r.stale);
      refreshTimer=setTimeout(schedule,counting?100:650);
    }
  };
  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(render);
  }
  const api={
    tracker:track,
    outgoing:raw=>{if(enabled)track.outgoing(raw)},
    incoming:raw=>{if(enabled)track.incoming(raw)},
    evaluation:(compositionName,whole,submitted,startLine=1)=>{
      if(!enabled)return submitted;
      track.evaluation(compositionName,whole,submitted,startLine);
      const plan=prepareRoutineTrace(submitted,startLine);
      track.registerRoutinePlan(plan,compositionName,whole);
      return plan.code;
    },
    consumePrint:t=>track.consumeLanguagePrint(t,enabled),
    stop:()=>track.stopRequested(),
    document:(name,text)=>{track.setDocument(name,text)},
    refresh:schedule,
    get enabled(){return enabled},
    diagnostics:()=>track.diagnosticReport()
  };
  function setEnabled(next){
    enabled=Boolean(next);
    panel.classList.toggle('live-collapsed',!enabled);
    panelToggle.setAttribute('aria-expanded',String(enabled));
    panelToggle.setAttribute('aria-label',enabled?
      'Collapse Live Code and switch tracking off':
      'Expand Live Code and switch tracking on');
    // No observed synths or routines remain falsely active while tracking
    // is off. Older checkpoint messages are still hidden from the console.
    if(!enabled){
      track.stopRequested();
      track.instrumentStats.clear();
    }else{
      track.setDocument(composition(),code.value);
    }
    schedule();
  }
  panelToggle.addEventListener('click',()=>setEnabled(!enabled));
  editor.addEventListener('scroll',schedule,{passive:true});
  editor.addEventListener('input',()=>track.setDocument(composition(),code.value));
  window.addEventListener('resize',schedule,{passive:true});
  track.setDocument(composition(),code.value);
  return api;
}
