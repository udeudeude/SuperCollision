/* SuperCollision: OSC-derived source-to-sound activity.
 * Intercepts copies of OSC packets; never changes, delays or replaces their delivery.
 * Amber means scsynth has sent /n_go without a corresponding /n_end.
 * Cyan marks a /s_new request. Source mapping is best-effort and confidence-gated.
 */
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
    const addr=readString(start,limit);
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
    this.onChange=onChange;this.now=now;this.nodes=new Map();this.defs=new Map();this.calls=new Map();
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
        this.nodes.set(id,{id,name,definition,call,confirmed:false,running:true,time:t});
        this.pulses.push({name,site:call||definition,at:t});
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
        if(node){node.confirmed=true;node.running=true;this.confirmedCount++;this.lastServerMessage=this.now();this.notify()}
      }else if(msg.address==='/n_end'&&Number.isInteger(id)){
        if(node){this.nodes.delete(id);this.lastServerMessage=this.now();this.notify()}
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
      'Recent language→server OSC: '+(this.recentSent.join(' ')||'(none)'),
      'Recent server→language OSC: '+(this.recentReceived.join(' ')||'(none)')
    ].join('\n');
  }
  stopRequested(){
    this.nodes.clear();this.pulses=[];this.notify();
  }
  visible(now=this.now()){
    const doc=this.document;const active=[],pulses=[];
    const matches=site=>!!doc&&!!site&&site.composition===doc.composition&&
      doc.text.slice(site.startOffset,site.endOffset+1)===site.text;
    for(const node of this.nodes.values()){
      if(node.confirmed&&node.running&&matches(node.definition))active.push(node.definition);
    }
    this.pulses=this.pulses.filter(p=>now-p.at<800);
    for(const p of this.pulses)if(matches(p.site))pulses.push(p.site);
    return {active,pulses,confirmed:[...this.nodes.values()].filter(n=>n.confirmed&&n.running).length,
      requested:[...this.nodes.values()].filter(n=>!n.confirmed).length,events:this.requestCount,
      linked:active.length,notifications:this.notifications};
  }
}
export function createLiveActivityUI({editor,gutter,overlay,status,code,composition,toggle}){
  let enabled=true,queued=false,clearPulse=null;
  const track=new SoundActivityTracker(()=>schedule());
  const render=()=>{
    queued=false;const v=track.visible();
    const activeLines=new Set(),pulseLines=new Set();
    for(const range of v.active){
      // Highlight the sound-producing definition, but limit large blocks to the visible lines.
      const lines=range.text.split('\n');
      for(let j=0;j<lines.length&&j<1000;j++){
        const line=lines[j].trim();
        // Highlight the definition and its actual signal-generator/control-rate
        // expressions, not comments or every line in the enclosing Routine.
        if(j===0||(!line.startsWith('//')&&/\.(?:ar|kr|ir|dr)\s*\(|\b(?:Out|OffsetOut|ReplaceOut)\s*\.\s*ar\b/.test(line)))activeLines.add(range.start+j);
      }
    }
    for(const range of v.pulses)pulseLines.add(range.start);
    for(const el of gutter.querySelectorAll('.line.live-active,.line.live-trigger'))el.classList.remove('live-active','live-trigger');
    overlay.replaceChildren();
    const lineHeight=parseFloat(getComputedStyle(editor).lineHeight)||21;
    const topPadding=parseFloat(getComputedStyle(editor).paddingTop)||12;
    const first=Math.max(1,Math.floor(editor.scrollTop/lineHeight)-1);
    const last=first+Math.ceil(editor.clientHeight/lineHeight)+3;
    const lineNodes=gutter.querySelector('#line-inner')?.children||[];
    if(enabled){
      for(let line=first;line<=last;line++){
        const isPulse=pulseLines.has(line),isActive=activeLines.has(line);
        if(!isPulse&&!isActive)continue;
        const row=document.createElement('div');
        row.className='live-source-line '+(isPulse?'live-source-trigger':'live-source-active');
        row.style.top=(topPadding+(line-1)*lineHeight-editor.scrollTop)+'px';
        row.style.height=lineHeight+'px';
        overlay.append(row);
        const label=lineNodes[line-1];
        if(label)label.classList.add(isPulse?'live-trigger':'live-active');
      }
    }
    status.textContent=enabled?'● '+v.confirmed+'  ✦ '+track.pulses.length:'ACTIVITY OFF';
    status.title=enabled?(v.confirmed+' server-confirmed synths; '+v.requested+
      ' unconfirmed starts. Amber = live SynthDef; blue = recent /s_new request. Not an audio meter.'):'Live code tracking disabled';
    clearTimeout(clearPulse);
    if(track.pulses.length)clearPulse=setTimeout(schedule,810);
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
    evaluation:(...args)=>{if(enabled)track.evaluation(...args)},
    stop:()=>track.stopRequested(),
    document:(name,text)=>{track.setDocument(name,text)},
    refresh:schedule,
    get enabled(){return enabled},
    diagnostics:()=>track.diagnosticReport()
  };
  toggle.addEventListener('click',()=>{
    enabled=!enabled;
    toggle.textContent=enabled?'Live code tracking: on':'Live code tracking: off';
    if(!enabled)track.stopRequested();
    else track.setDocument(composition(),code.value);
    schedule();
  });
  editor.addEventListener('scroll',schedule,{passive:true});
  editor.addEventListener('input',()=>track.setDocument(composition(),code.value));
  window.addEventListener('resize',schedule,{passive:true});
  track.setDocument(composition(),code.value);
  return api;
}
