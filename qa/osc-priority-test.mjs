import assert from 'node:assert/strict';
import {createPriorityOscBridge} from '../osc-priority-bridge.mjs';

// An active visualizer must not be allowed to delay the original notes or
// replies. Mix controls stay independent and are sent after the packet.
const seen=[];
const bridge=createPriorityOscBridge({
 sendToSynth:bytes=>seen.push(['synth',Array.from(bytes)]),
 sendToLanguage:bytes=>seen.push(['language',Array.from(bytes)]),
 observeOutgoing:[
   ()=>{seen.push(['live-out']);throw Error('visualizer broke')},
   ()=>{seen.push(['performance-out']);return [Uint8Array.from([19])]}
 ],
 observeIncoming:[
   ()=>{seen.push(['live-in']);return []},
   ()=>{seen.push(['performance-in']);return [Uint8Array.from([27])]}
 ],
 sendControl:bytes=>seen.push(['control',Array.from(bytes)]),
 onObserverError:(error,direction)=>seen.push(['observer-error',direction,error.message])
});
const fromLanguage=Uint8Array.from([1,2,3]);
bridge.fromLanguage(fromLanguage);
assert.deepEqual(seen.slice(0,4).map(x=>x[0]),
 ['synth','live-out','observer-error','performance-out']);
assert.deepEqual(seen[0][1],[1,2,3]);
assert.deepEqual(seen[4],['control',[19]]);
bridge.fromSynth(Uint8Array.from([10,20]));
assert.deepEqual(seen.slice(5).map(x=>x[0]),
 ['language','live-in','performance-in','control']);
assert.deepEqual(seen.at(-1),['control',[27]]);
assert.deepEqual(bridge.diagnostics(),{outgoingCount:1,incomingCount:1,observerErrors:1});

// The language callback may recycle its buffer; forwarding copies it.
let copy;
const copied=createPriorityOscBridge({
 sendToSynth:bytes=>{copy=bytes},
 sendToLanguage:()=>{}
});
const original=Uint8Array.from([55]);
copied.fromLanguage(original);original[0]=88;
assert.equal(copy[0],55);
assert.notEqual(copy,original);

// Thousands of notes retain their exact order even when observers fail.
// This is about the forwarding contract, not a claim of hardware jitter.
const actual=[];
const stress=createPriorityOscBridge({
 sendToSynth:bytes=>actual.push(bytes[0]),
 sendToLanguage:()=>{},
 observeOutgoing:[()=>{throw Error('display unavailable')},()=>[]]
});
for(let i=0;i<2000;i++)stress.fromLanguage(Uint8Array.from([i%256]));
assert.equal(actual.length,2000);
for(let i=0;i<2000;i++)assert.equal(actual[i],i%256);
assert.equal(stress.diagnostics().outgoingCount,2000);
assert.equal(stress.diagnostics().observerErrors,2000);
console.log('Priority OSC forwarding, per-observer isolation, controls, copies and 2000-message order passed.');
