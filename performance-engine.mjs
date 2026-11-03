/* SuperCollision performance observer.
 * No source injection, rewrites, or server graph rearrangement.
 * Timelines use /s_new, /n_go, /n_end from the ordinary OSC stream.
 * Optional performance adjustments use separate /n_set requests, and only
 * when an instrument explicitly exposes a numeric "amp" control.
 */
import {readOscPacket,indexSource} from './live-activity.mjs';
const MAX_EVENTS=12000, HISTORY_MS=15*60*1000;
const enc=new TextEncoder();
export function encodeOsc(address,args=[]){
  if(typeof address!=='string'||!address.startsWith('/'))throw Error('Invalid OSC address');
  const bytes=[],append=a=>{for(const v of a)bytes.push(v)};
  const string=s=>{append(enc.encode(String(s)));bytes.push(0);while(bytes.length%4)bytes.push(0)};
  const numeric=(n,type='f')=>{const b=new ArrayBuffer(4),v=new DataView(b);if(type==='i')v.setInt32(0,n,false);else v.setFloat32(0,n,false);append(new Uint8Array(b))};
  const types=args.map(x=>typeof x==='string'?'s':Number.isInteger(x)?'i':'f').join('');
  string(address);string(','+types);
  args.forEach((a,i)=>{if(types[i]==='s')string(a);else numeric(a,types[i])});
  return Uint8Array.from(bytes);
}
function finite(v){return typeof v==='number'&&Number.isFinite(v)}
export function numericParameters(defText){
  const args=/\|\s*([^|]{1,900})\s*\|/.exec(defText||'');
  const result={};
  if(!args)return result;
  for(const item of args[1].split(',')){
    const m=/^\s*([A-Za-z_]\w*)\s*=\s*(-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?)\s*$/i.exec(item);
    if(m&&Number.isFinite(Number(m[2])))result[m[1]]=Number(m[2]);
  }
  return result;
}
const sourceLine=src=>src.split('\n').length;
export class PerformanceJournal{
  constructor({now=()=>performance.now(),onChange=()=>{},send=()=>{}}={}){
    this.now=now;this.onChange=onChange;this.send=send;
    this.nodes=new Map();this.events=[];this.defs=new Map();this.states=new Map();
    this.zero=now();this.composition=null;this.source='';this.enabled=true;
    this._unknown=0;this._replies=0;
  }
  changed(){this.onChange(this)}
  setSource(name,source){
    this.composition=name;this.source=source;
    this.changed();
  }
  evaluation(name,whole,submitted,start=1){
    this.setSource(name,whole);
    const index=indexSource(whole),end=start+sourceLine(submitted)-1;
    for(const [key,site] of index.defs){
      if(site.start<start||site.end>end)continue;
      this.defs.set(key,{name:key,params:numericParameters(site.text),
        site:{...site,composition:name,snapshot:whole}});
    }
    this.changed();
  }
  stateFor(name){
    if(!this.states.has(name))this.states.set(name,{gain:1,muted:false,solo:false,controls:{}});
    return this.states.get(name);
  }
  compatible(name){
    return finite(this.defs.get(name)?.params?.amp);
  }
  effectiveGain(name){
    const state=this.stateFor(name);
    if(state.muted)return 0;
    if([...this.states.values()].some(v=>v.solo)&&!state.solo)return 0;
    return state.gain;
  }
  active(name=null){
    return [...this.nodes.values()].filter(v=>v.confirmed&&!v.ended&&(name===null||v.name===name));
  }
  safeSolo(){
    return this.active().every(n=>this.compatible(n.name));
  }
  getInstrumentRows(){
    const map=new Map();
    for(const e of this.events){
      if(e.composition!==this.composition)continue;
      if(!map.has(e.name))map.set(e.name,{name:e.name,count:0,last:0,slot:e.slot});
      const row=map.get(e.name);row.count++;row.last=Math.max(row.last,e.start||e.request);
    }
    for(const n of this.nodes.values()){
      if(n.composition!==this.composition||n.ended)continue;
      if(!map.has(n.name))map.set(n.name,{name:n.name,count:0,last:n.request,slot:n.slot});
    }
    return [...map.values()].sort((a,b)=>b.last-a.last).map(row=>{
      const st=this.stateFor(row.name),nodes=this.active(row.name).filter(n=>n.composition===this.composition);
      return {...row,active:nodes.length,compatible:this.compatible(row.name),
        params:this.defs.get(row.name)?.params||{},gain:st.gain,muted:st.muted,solo:st.solo,
        currentControls:st.controls};
    });
  }
  _prune(){
    if(this.events.length>MAX_EVENTS)this.events.splice(0,this.events.length-MAX_EVENTS);
    const threshold=this.now()-HISTORY_MS;
    // Keep some older events for context, but avoid unbounded memory.
    while(this.events.length>1000&&this.events[0].end!==null&&this.events[0].end<threshold)
      this.events.shift();
  }
  _new(name,id,args){
    const def=this.defs.get(name);
    const params={...def?.params};
    for(let i=4;i+1<args.length;i+=2){
      if(typeof args[i]==='string'&&finite(args[i+1]))params[args[i]]=args[i+1];
    }
    const t=this.now(),owner=def?.site?.composition||this.composition||'unmapped';
    const site=def?.site||null;
    const prior=this.nodes.get(id);if(prior&&!prior.ended)this._end(id,t);
    const event={id,name,composition:owner,request:t,start:null,end:null,
      params:{...params},slot:this.colorSlot(name),site,
      status:'requested',kind:'synth'};
    this.nodes.set(id,{...event,confirmed:false,ended:false,originalAmp:finite(params.amp)?params.amp:null});
    this.events.push(event);this._prune();this.changed();
  }
  colorSlot(name){
    // Match Living Code's stable name sequence when available, otherwise hash
    // for stable independent identity across reloads.
    let v=2166136261;
    for(let i=0;i<name.length;i++){v^=name.charCodeAt(i);v=Math.imul(v,16777619)}
    return (v>>>0)%10;
  }
  _end(id,t){
    const n=this.nodes.get(id);if(!n||n.ended)return;
    n.ended=true;
    const ev=this.events.findLast(e=>e.id===id&&e.name===n.name&&e.end===null);
    if(ev){ev.end=t;ev.status=n.confirmed?'ended':'cancelled'}
    this.changed();
  }
  outgoing(raw){
    if(!this.enabled)return;
    const overrides=[];
    for(const msg of readOscPacket(raw)){
      const args=msg.args;
      if(msg.address==='/s_new'&&typeof args[0]==='string'&&Number.isInteger(args[1])){
        this._new(args[0],args[1],args);
      }else if(msg.address==='/n_set'&&Number.isInteger(args[0])){
        const n=this.nodes.get(args[0]);
        if(!n)continue;
        for(let i=1;i+1<args.length;i+=2){
          if(typeof args[i]!=='string'||!finite(args[i+1]))continue;
          n.params[args[i]]=args[i+1];
          if(args[i]==='amp'){
            n.originalAmp=args[i+1];
            const factor=this.effectiveGain(n.name);
            if(factor!==1&&this.compatible(n.name))overrides.push(encodeOsc('/n_set',[n.id,'amp',n.originalAmp*factor]));
          }
        }
        this.changed();
      }else if(msg.address==='/n_free'){
        // Do not claim an end until the audio server confirms /n_end.
      }
    }
    return overrides;
  }
  incoming(raw){
    if(!this.enabled)return;
    const overrides=[];
    for(const msg of readOscPacket(raw)){
      const id=msg.args[0],n=this.nodes.get(id);
      if(!Number.isInteger(id)||!n)continue;
      if(msg.address==='/n_go'&&!n.confirmed){
        n.confirmed=true;n.start=this.now();
        const e=this.events.findLast(x=>x.id===id&&x.name===n.name&&x.end===null);
        if(e){e.start=n.start;e.status='running'}
        const factor=this.effectiveGain(n.name);
        if(factor!==1&&this.compatible(n.name)&&finite(n.originalAmp))
          overrides.push(encodeOsc('/n_set',[id,'amp',n.originalAmp*factor]));
        this.changed();
      }else if(msg.address==='/n_end'){
        this._end(id,this.now());
      }else if(msg.address==='/n_off'){
        n.paused=true;this.changed();
      }else if(msg.address==='/n_on'){
        n.paused=false;this.changed();
      }
    }
    return overrides;
  }
  _sendGain(name){
    if(!this.compatible(name))return false;
    const f=this.effectiveGain(name);
    for(const n of this.active(name)){
      if(finite(n.originalAmp))this.send(encodeOsc('/n_set',[n.id,'amp',n.originalAmp*f]));
    }
    this.changed();return true;
  }
  gain(name,value){
    if(!this.compatible(name)||!finite(value))return false;
    this.stateFor(name).gain=Math.max(0,Math.min(2,value));
    return this._sendGain(name);
  }
  mute(name,mute){
    if(!this.compatible(name))return false;
    this.stateFor(name).muted=!!mute;return this._sendGain(name);
  }
  solo(name,solo){
    if(!this.safeSolo()||!this.compatible(name))return false;
    this.stateFor(name).solo=!!solo;
    for(const n of new Set(this.active().map(n=>n.name)))this._sendGain(n);
    this.changed();return true;
  }
  parameter(name,control,value){
    const def=this.defs.get(name);
    if(!def||!Object.prototype.hasOwnProperty.call(def.params,control)||control==='amp'||!finite(value))return false;
    const st=this.stateFor(name);st.controls[control]=value;
    for(const n of this.active(name))this.send(encodeOsc('/n_set',[n.id,control,value]));
    this.changed();return true;
  }
  reset(){
    // Restore only notes whose gain was actually changed by a user mix control.
    // In the neutral state, RESET MIX and collapsing LIVE must be pure observers:
    // an unsolicited /n_set could overwrite legitimate server-side modulation.
    for(const n of this.active()){
      if(this.compatible(n.name)&&finite(n.originalAmp)&&this.effectiveGain(n.name)!==1)
        this.send(encodeOsc('/n_set',[n.id,'amp',n.originalAmp]));
    }
    for(const st of this.states.values()){st.gain=1;st.muted=false;st.solo=false;st.controls={}}
    this.changed();
  }
  observe(on){
    if(!on)this.reset();this.enabled=!!on;this.changed();
  }
  stop(){
    for(const id of this.nodes.keys())this._end(id,this.now());
    this.reset();
  }
  eventsForCurrent(){return this.events.filter(e=>e.composition===this.composition&&e.start!==null)}
}
