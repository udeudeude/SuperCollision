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
export function readOscReply(raw){
  const data=raw instanceof Uint8Array?raw:new Uint8Array(raw?.buffer||raw||[]);
  if(data.byteLength<8)return null;
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
  function readString(offset){
    let end=offset;while(end<data.length&&data[end])end++;
    if(end===data.length)return null;
    return {text:new TextDecoder().decode(data.subarray(offset,end)),next:(end+4)&~3};
  }
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
export class NativeBufferTransport{
  constructor(send,{timeoutMs=15000}={}){
    if(typeof send!=='function')throw Error('SuperCollider OSC sender required');
    this.send=send;this.timeoutMs=timeoutMs;this.pending=new Map();
    this.sequence=1000;this.active=false;
  }
  receive(raw){
    const message=readOscReply(raw);if(!message)return;
    if(message.address==='/synced'){
      const id=message.args[0],entry=this.pending.get(id);
      if(entry){this.pending.delete(id);clearTimeout(entry.timer);entry.resolve()}
    }else if(message.address==='/fail'&&this.pending.size){
      for(const [id,entry] of this.pending){
        this.pending.delete(id);clearTimeout(entry.timer);
        entry.reject(Error('SuperCollider rejected '+String(message.args[0]||'command')+': '+String(message.args[1]||'unknown error')));
      }
    }
  }
  sync(){
    const id=++this.sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('SuperCollider did not acknowledge the buffer transfer.'))},this.timeoutMs);
      this.pending.set(id,{resolve,reject,timer});
      try{this.send(oscMessage('/sync',[i(id)]))}catch(error){this.pending.delete(id);clearTimeout(timer);reject(error)}
    });
  }
  async upload(bufferId,audioBuffer,{signal,onProgress}={}){
    if(this.active)throw Error('Only one sample transfer can run at once');
    const frames=audioBuffer.length,channels=audioBuffer.numberOfChannels;
    if(!Number.isInteger(channels)||channels<1||channels>2||!Number.isInteger(frames)||frames<1||frames*channels>MAX_SAMPLES)
      throw Error('Choose a shorter mono or stereo recording. The current limit is '+MAX_SAMPLES+' samples.');
    this.active=true;let allocated=false;
    const check=()=>{if(signal?.aborted)throw Error('Transfer cancelled')};
    try{
      check();
      this.send(oscMessage('/b_alloc',[i(bufferId),i(frames),i(channels)]));
      allocated=true;
      await this.sync();check();
      let count=0;
      for(const {offset,packet} of audioPackets(bufferId,audioBuffer)){
        check();this.send(packet);count++;
        if(count%12===0){await this.sync();onProgress?.(Math.min(1,(offset+FLOATS_PER_PACKET)/(frames*channels)))}
      }
      await this.sync();check();
      onProgress?.(1);
      return {bufferId,frames,channels,sampleRate:audioBuffer.sampleRate};
    }catch(error){
      if(allocated){try{this.send(oscMessage('/b_free',[i(bufferId)]))}catch{}}
      throw error;
    }finally{this.active=false}
  }
  release(bufferId){this.send(oscMessage('/b_free',[i(bufferId)]))}
}
