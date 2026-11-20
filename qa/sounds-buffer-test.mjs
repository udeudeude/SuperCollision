import assert from 'node:assert/strict';
import {oscMessage,samplePacket,audioPackets,readOscReply,NativeBufferTransport,FLOATS_PER_PACKET,MAX_SAMPLES} from '../sounds-buffer.mjs';
const i=value=>({type:'i',value}),f=value=>({type:'f',value});
const read=(packet)=>readOscReply(packet);
assert.deepEqual(read(oscMessage('/sync',[i(48)])),{address:'/sync',args:[48]});
assert.deepEqual(read(oscMessage('/test',[f(1),f(0),f(-0.5)])),{address:'/test',args:[1,0,-0.5]});
assert.throws(()=>oscMessage('/test',[f(Infinity)]),/Invalid numerical/);
assert.throws(()=>oscMessage('/test',[i(2**40)]),/out of range/);
assert.throws(()=>samplePacket(1,0,new Float32Array(0)),/Invalid sample/);
assert.throws(()=>samplePacket(1,0,new Float32Array(FLOATS_PER_PACKET+1)),/Invalid sample/);
const packet=samplePacket(10,7,new Float32Array([1,0,-0.5]));
assert.equal(new TextDecoder().decode(packet.subarray(0,12)).includes('/b_setn'),true);
assert.equal(new TextDecoder().decode(packet).includes(',iiifff'),true);
const mono={numberOfChannels:1,length:3,sampleRate:48000,getChannelData:()=>Float32Array.from([1,0,-0.5])};
const stereo={numberOfChannels:2,length:3,sampleRate:48000,getChannelData:ch=>ch===0?Float32Array.from([1,2,3]):Float32Array.from([4,5,6])};
assert.deepEqual([...audioPackets(1,mono)].map(({offset,count})=>[offset,count]),[[0,3]]);
assert.deepEqual(read([...audioPackets(1,stereo)][0].packet),{address:'/b_setn',args:[1,0,6,1,4,2,5,3,6]});
const long={numberOfChannels:1,length:FLOATS_PER_PACKET+1,sampleRate:44100,getChannelData:()=>new Float32Array(FLOATS_PER_PACKET+1)};
assert.deepEqual([...audioPackets(22,long)].map(({offset,count})=>[offset,count]),[[0,FLOATS_PER_PACKET],[FLOATS_PER_PACKET,1]]);
assert.throws(()=>[...audioPackets(22,{...long,length:MAX_SAMPLES+1})],/too long/);
let transport,sent=[],pending=[];
transport=new NativeBufferTransport(p=>{
  const message=read(p);sent.push(message);
  if(message.address==='/sync')queueMicrotask(()=>transport.receive(oscMessage('/synced',[i(message.args[0])])));
});
const complete=await transport.upload(42,stereo,{verify:false});
assert.deepEqual(complete,{bufferId:42,frames:3,channels:2,sampleRate:48000,verified:false});
assert.deepEqual(sent.map(p=>p.address),['/b_alloc','/sync','/b_setn','/sync']);
assert.deepEqual(sent[0].args,[42,3,2]);
transport.release(42);
assert.equal(sent.at(-1).address,'/b_free');
const cancelled=new NativeBufferTransport(()=>{}, {timeoutMs:100});
await assert.rejects(cancelled.upload(55,stereo,{signal:{aborted:true}}),/cancelled/);
assert.equal(cancelled.active,false);
const failed=new NativeBufferTransport(p=>{
 const message=read(p);pending.push(message);
 if(message.address==='/sync')queueMicrotask(()=>failed.receive(oscMessage('/fail',[{type:'s',value:'/b_alloc'},{type:'s',value:'no memory'}])));
});
await assert.rejects(failed.upload(56,mono),/rejected/);
assert.equal(pending.at(-2).address,'/b_free');
assert.equal(pending.at(-1).address,'/sync','failure cleanup must synchronize buffer release');
assert.equal(failed.active,false);

/* Native roundtrip: /b_alloc -> /b_setn -> /b_getn, with actual sample readback. */
const native=new Float32Array(6);
let verified;
verified=new NativeBufferTransport(p=>{
 const message=read(p),args=message.args;
 if(message.address==='/b_setn')native.set(args.slice(3),args[1]);
 if(message.address==='/sync')queueMicrotask(()=>verified.receive(oscMessage('/synced',[i(args[0])])));
 if(message.address==='/b_getn')queueMicrotask(()=>verified.receive(oscMessage('/b_setn',[
  i(args[0]),i(args[1]),i(args[2]),...Array.from(native.slice(args[1],args[1]+args[2]),f)
 ])));
});
const result=await verified.upload(63,stereo);
assert.equal(result.verified,true);
assert.deepEqual(Array.from(native),[1,4,2,5,3,6]);
assert.equal(verified.pendingReads.size,0);
assert.equal(verified.pending.size,0);
const corrupt=new NativeBufferTransport(p=>{
 const m=read(p);
 if(m.address==='/sync')queueMicrotask(()=>corrupt.receive(oscMessage('/synced',[i(m.args[0])])));
 if(m.address==='/b_getn')queueMicrotask(()=>corrupt.receive(oscMessage('/b_setn',[
  i(m.args[0]),i(m.args[1]),i(m.args[2]),...Array.from({length:m.args[2]},()=>f(0))
 ])));
});
await assert.rejects(corrupt.upload(70,stereo),/verification failed/);
assert.equal(corrupt.active,false);
assert.equal(corrupt.pending.size,0);
assert.equal(corrupt.pendingReads.size,0);
const abortController=new AbortController();
const waiting=new NativeBufferTransport(()=>{}, {timeoutMs:5000});
const awaiting=waiting.sync({signal:abortController.signal});
abortController.abort();
await assert.rejects(awaiting,/cancelled/);
assert.equal(waiting.pending.size,0);
const osc=oscMessage('/synced',[i(123)]);
const padded=new Uint8Array(osc.length+12);padded.set(osc,8);
assert.deepEqual(read(padded.subarray(8,8+osc.length)),{address:'/synced',args:[123]});
assert.equal(readOscReply(null),null);
/* Confirm diagnostics describe server acknowledgements, not merely queued bytes. */
const stagedFrames=FLOATS_PER_PACKET*12+3;
const stagedAudio={numberOfChannels:1,length:stagedFrames,sampleRate:48000,
 getChannelData:()=>new Float32Array(stagedFrames)};
const stages=[],progressUpdates=[];
let staged;
staged=new NativeBufferTransport(packet=>{
 const m=read(packet);
 if(m.address==='/sync')queueMicrotask(()=>staged.receive(oscMessage('/synced',[i(m.args[0])])));
});
await staged.upload(72,stagedAudio,{verify:false,
 onStage:stage=>stages.push(stage),
 onProgress:value=>progressUpdates.push(value)});
assert.deepEqual(stages.map(s=>s.phase),['allocation','transfer','transfer','transfer','readback','complete']);
assert.equal(stages[1].acknowledged,0,'queued audio must not count as acknowledged');
assert.equal(stages[2].acknowledged,FLOATS_PER_PACKET*12);
assert.equal(stages[3].acknowledged,stagedFrames);
assert.equal(stages.at(-1).packets,13);
assert.equal(progressUpdates.at(-1),1);
assert.equal(staged.active,false);

/* Force missing /synced replies after allocation; no indefinite wait, and
 * the diagnostic identifies the exact phase and unacknowledged sample count. */
let stalledSyncs=0,stalled;
stalled=new NativeBufferTransport(packet=>{
 const m=read(packet);
 if(m.address==='/sync'){
  stalledSyncs++;
  if(stalledSyncs===1||stalledSyncs===3)
   queueMicrotask(()=>stalled.receive(oscMessage('/synced',[i(m.args[0])])));
 }
},{timeoutMs:80});
await assert.rejects(stalled.upload(73,mono,{verify:false}),
 /transfer failed after \d+ ms; 0 of 3 samples acknowledged \(3 sent\).*did not respond/);
assert.equal(stalled.active,false);
assert.equal(stalled.pending.size,0);
let noReadback;
noReadback=new NativeBufferTransport(packet=>{
 const m=read(packet);
 if(m.address==='/sync')queueMicrotask(()=>noReadback.receive(oscMessage('/synced',[i(m.args[0])])));
},{timeoutMs:80});
await assert.rejects(noReadback.upload(74,mono),
 /readback failed after \d+ ms; 3 of 3 samples acknowledged/);
assert.equal(noReadback.pendingReads.size,0,'timeout must release readback listener');
assert.equal(noReadback.active,false);

console.log('Native SuperCollider buffer transfer, readback, failure and cancellation tests passed');
