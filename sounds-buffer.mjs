/* Native SuperCollider sample buffer transport. No browser audio processing.
 * IndexedDB audio is decoded solely for transfer into scsynth-owned buffers. */
export const FLOATS_PER_PACKET=384;
export const MAX_SAMPLES=1200000;
const encoder=new TextEncoder();
function appendString(bytes,string){
  for(const b of encoder.encode(string))bytes.push(b);
  bytes.push(0);
  while(bytes.length%4)bytes.push(0);
}
export function oscMessage(address,args=[]){
  if(!/^\/[A-Za-z0-9_\/]+$/.test(address))throw Error('Invalid SuperCollider command address');
  const bytes=[];
  appendString(bytes,address);
  appendString(bytes,','+args.map(arg=>arg.type).join(''));
  for(const arg of args){
    if(arg.type==='s'){appendString(bytes,arg.value);continue}
    if(arg.type!=='i'&&arg.type!=='f')throw Error('Unsupported command argument');
    if(!Number.isFinite(arg.value))throw Error('Invalid numerical sample or argument');
    if(arg.type==='i'&&(!Number.isSafeInteger(arg.value)||arg.value<-2147483648||arg.value>2147483647))
      throw Error('OSC integer out of range');
    const b=new ArrayBuffer(4),v=new DataView(b);
    if(arg.type==='i')v.setInt32(0,arg.value,false);
    else v.setFloat32(0,arg.value,false);
    bytes.push(...new Uint8Array(b));
  }
  return Uint8Array.from(bytes);
}
const i=value=>({type:'i',value});
const f=value=>({type:'f',value});
export function samplePacket(bufferId,offset,values){
  if(!Number.isInteger(bufferId)||bufferId<0||!Number.isInteger(offset)||offset<0)throw Error('Invalid buffer reference');
  if(!values.length||values.length>FLOATS_PER_PACKET)throw Error('Invalid sample packet length');
  return oscMessage('/b_setn',[i(bufferId),i(offset),i(values.length),...Array.from(values,f)]);
}
export function* audioPackets(bufferId,audioBuffer){
  const channels=audioBuffer.numberOfChannels,frames=audioBuffer.length;
  if(!Number.isInteger(channels)||channels<1||channels>2||!Number.isInteger(frames)||frames<1)
    throw Error('This laboratory accepts mono or stereo audio.');
  if(frames*channels>MAX_SAMPLES)
    throw Error('Sample too long for the experimental in-memory buffer transport ('+MAX_SAMPLES+' samples maximum).');
  const arrays=Array.from({length:channels},(_,c)=>audioBuffer.getChannelData(c));
  for(let offset=0;offset<frames*channels;offset+=FLOATS_PER_PACKET){
    const count=Math.min(FLOATS_PER_PACKET,frames*channels-offset);
    const samples=new Float32Array(count);
    for(let j=0;j<count;j++){const absolute=offset+j;samples[j]=arrays[absolute%channels][Math.floor(absolute/channels)]}
    yield {offset,count,packet:samplePacket(bufferId,offset,samples)};
  }
}

/* Decode replies from ArrayBuffer or a view into a larger WebAssembly buffer. */
export function readOscReply(raw){
  let data;
  if(ArrayBuffer.isView(raw))data=new Uint8Array(raw.buffer,raw.byteOffset,raw.byteLength);
  else if(raw instanceof ArrayBuffer)data=new Uint8Array(raw);
  else if(Array.isArray(raw))data=Uint8Array.from(raw);
  else return null;
  if(data.byteLength<8)return null;
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
  const readString=offset=>{
    let end=offset;while(end<data.length&&data[end])end++;
    if(end===data.length)return null;
    const next=(end+4)&~3;
    if(next>data.length)return null;
    return {text:new TextDecoder().decode(data.subarray(offset,end)),next};
  };
  const address=readString(0);if(!address||!address.text.startsWith('/'))return null;
  const types=readString(address.next);if(!types||!types.text.startsWith(','))return null;
  let offset=types.next;const args=[];
  for(const type of types.text.slice(1)){
    if(type==='i'||type==='f'){
      if(offset+4>data.length)return null;
      args.push(type==='i'?view.getInt32(offset,false):view.getFloat32(offset,false));offset+=4;
    }else if(type==='s'){
      const item=readString(offset);if(!item)return null;args.push(item.text);offset=item.next;
    }else return null;
  }
  return {address:address.text,args};
}
const readKey=(id,start,count)=>id+':'+start+':'+count;
const checkAborted=signal=>{if(signal?.aborted)throw Error('Transfer cancelled')};

/* Only SuperCollider's synthesis server owns buffers and performs playback. */
export class NativeBufferTransport{
  constructor(send,{timeoutMs=15000}={}){
    if(typeof send!=='function')throw Error('SuperCollider OSC sender required');
    this.send=send;this.timeoutMs=timeoutMs;this.pending=new Map();
    this.pendingReads=new Map();this.sequence=1000;this.active=false;
  }
  receive(raw){
    const message=readOscReply(raw);if(!message)return;
    if(message.address==='/synced'){
      this.pending.get(message.args[0])?.resolve();
    }else if(message.address==='/b_setn'){
      const [id,start,count,...samples]=message.args;
      if(Number.isInteger(count)&&count>=1&&samples.length===count)
        this.pendingReads.get(readKey(id,start,count))?.resolve(samples);
    }else if(message.address==='/fail'){
      const error=Error('SuperCollider rejected '+String(message.args[0]||'command')+': '+String(message.args[1]||'unknown error'));
      for(const entry of [...this.pending.values(),...this.pendingReads.values()])entry.reject(error);
    }
  }
  awaitReply(map,key,command,{signal,timeoutMs=this.timeoutMs}={}){
    checkAborted(signal);
    if(map.has(key))throw Error('A native buffer request is already pending');
    return new Promise((resolve,reject)=>{
      let timer;
      const cleanup=()=>{
        clearTimeout(timer);signal?.removeEventListener?.('abort',abort);map.delete(key);
      };
      const entry={
        resolve:value=>{cleanup();resolve(value)},
        reject:error=>{cleanup();reject(error)}
      };
      const abort=()=>entry.reject(Error('Transfer cancelled'));
      map.set(key,entry);
      timer=setTimeout(()=>entry.reject(Error('SuperCollider did not respond to '+readOscReply(command)?.address+'.')),timeoutMs);
      signal?.addEventListener?.('abort',abort,{once:true});
      if(signal?.aborted){abort();return}
      try{this.send(command)}catch(error){entry.reject(error)}
    });
  }
  sync({signal,timeoutMs}={}){
    const id=++this.sequence;
    if(this.sequence>=2147483000)this.sequence=1000;
    return this.awaitReply(this.pending,id,oscMessage('/sync',[i(id)]),{signal,timeoutMs});
  }
  readSamples(bufferId,start,count,{signal,timeoutMs}={}){
    if(!Number.isInteger(bufferId)||bufferId<0||!Number.isInteger(start)||start<0||
       !Number.isInteger(count)||count<1||count>32)throw Error('Invalid buffer readback request');
    return this.awaitReply(this.pendingReads,readKey(bufferId,start,count),
      oscMessage('/b_getn',[i(bufferId),i(start),i(count)]),{signal,timeoutMs});
  }
  async verifySamples(bufferId,audioBuffer,{signal}={}){
    const channels=audioBuffer.numberOfChannels,frames=audioBuffer.length;
    const points=[...new Set([0,Math.floor(frames/2),frames-1])];
    for(const frame of points){
      checkAborted(signal);
      const values=await this.readSamples(bufferId,frame*channels,channels,{signal});
      for(let channel=0;channel<channels;channel++){
        const expected=audioBuffer.getChannelData(channel)[frame],actual=values[channel];
        if(!Number.isFinite(actual)||Math.abs(actual-expected)>0.00001)
          throw Error('SuperCollider buffer verification failed at frame '+frame+', channel '+channel);
      }
    }
    return points.length;
  }
  async upload(bufferId,audioBuffer,{signal,onProgress,onStage,verify=true}={}){
    if(this.active)throw Error('Only one sample transfer can run at once');
    const frames=audioBuffer.length,channels=audioBuffer.numberOfChannels;
    if(!Number.isInteger(channels)||channels<1||channels>2||!Number.isInteger(frames)||frames<1||frames*channels>MAX_SAMPLES)
      throw Error('Choose a shorter mono or stereo recording. The current limit is '+MAX_SAMPLES+' samples.');
    this.active=true;
    const total=frames*channels,started=Date.now();
    let allocated=false,phase='allocation',sent=0,acknowledged=0,packets=0;
    const report=()=>onStage?.({phase,sent,acknowledged,total,packets,elapsedMs:Date.now()-started});
    try{
      checkAborted(signal);
      report();
      this.send(oscMessage('/b_alloc',[i(bufferId),i(frames),i(channels)]));
      allocated=true;
      await this.sync({signal});
      phase='transfer';report();
      for(const {offset,count,packet} of audioPackets(bufferId,audioBuffer)){
        checkAborted(signal);
        this.send(packet);packets++;sent=offset+count;
        // A /synced response only confirms packets through the preceding
        // /sync. Do not report queued bytes as acknowledged by scsynth.
        if(packets%12===0){
          await this.sync({signal});
          acknowledged=sent;report();
          onProgress?.(Math.min(0.98,0.98*acknowledged/total));
        }
      }
      await this.sync({signal});
      acknowledged=total;report();
      checkAborted(signal);
      phase='readback';report();
      if(verify)await this.verifySamples(bufferId,audioBuffer,{signal});
      phase='complete';report();
      onProgress?.(1);
      return {bufferId,frames,channels,sampleRate:audioBuffer.sampleRate,verified:verify};
    }catch(error){
      const failedPhase=phase,failedSent=sent,failedAck=acknowledged,elapsedMs=Date.now()-started;
      phase='cleanup';report();
      if(allocated){
        // Best-effort cleanup is bounded independently of the failed sync.
        try{this.send(oscMessage('/b_free',[i(bufferId)]));await this.sync({timeoutMs:2000})}catch{}
      }
      throw Error('Native SuperCollider '+failedPhase+' failed after '+elapsedMs+' ms; '+
        failedAck+' of '+total+' samples acknowledged ('+failedSent+' sent): '+error.message);
    }finally{this.active=false}
  }
  release(bufferId){this.send(oscMessage('/b_free',[i(bufferId)]))}
}
