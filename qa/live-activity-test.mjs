import assert from 'node:assert/strict';
import {readOscPacket,indexSource,SoundActivityTracker} from '../live-activity.mjs';
const enc=new TextEncoder();
function oscString(s){
  const b=Array.from(enc.encode(s));b.push(0);while(b.length%4)b.push(0);
  return Uint8Array.from(b);
}
function beInt(n){const b=new ArrayBuffer(4);new DataView(b).setInt32(0,n,false);return new Uint8Array(b)}
function pack(address,types,args){
  const parts=[oscString(address),oscString(','+types)];
  for(let i=0;i<types.length;i++){
    if(types[i]==='s')parts.push(oscString(String(args[i])));
    else if(types[i]==='i')parts.push(beInt(args[i]));
    else throw Error('Test encoder unsupported type '+types[i]);
  }
  return Uint8Array.from(parts.flatMap(b=>[...b]));
}
function bundle(messages){
  const parts=[oscString('#bundle'),Uint8Array.from([0,0,0,0,0,0,0,1])];
  for(const m of messages){parts.push(beInt(m.length),m)}
  return Uint8Array.from(parts.flatMap(b=>[...b]));
}
const source=[
'(',
'SynthDef(\\bell, { |freq=440|',
'  var env = EnvGen.kr(Env.perc);',
'  Out.ar(0, SinOsc.ar(freq) * env);',
'}).add;',
'~seq = Routine({',
'  3.do { Synth(\\bell, [\\freq,440]); 0.1.wait; };',
'});',
')'
].join('\n');
const sourceIndex=indexSource(source);
assert.equal(sourceIndex.defs.get('bell').start,2);
assert.equal(sourceIndex.defs.get('bell').end,5);
assert.equal(sourceIndex.triggers.get('bell')[0].start,7);
assert.equal(indexSource('// SynthDef(\\fake, {})\n'+source).defs.has('fake'),false);
const pulse=pack('/s_new','siii',['bell',1001,0,1]);
const go=pack('/n_go','iiiii',[1001,1,-1,-1,0]);
const end=pack('/n_end','iiiii',[1001,1,-1,-1,0]);
assert.deepEqual(readOscPacket(pulse)[0],{address:'/s_new',args:['bell',1001,0,1]});
assert.equal(readOscPacket(bundle([pulse,go])).length,2);
assert.equal(readOscPacket(new Uint8Array([7,8,9])).length,0);
assert.equal(readOscPacket(new Uint8Array(2000000)).length,0);

let tick=1000,notifications=0;
const activity=new SoundActivityTracker(()=>notifications++,()=>tick);
activity.evaluation('Song A',source,source,1);
activity.setDocument('Song A',source);
activity.outgoing(pack('/notify','i',[1]));
assert.equal(activity.notifications,true);
activity.outgoing(pulse);
let state=activity.visible();
assert.equal(state.confirmed,0,'Outgoing request is not confirmed playback');
assert.equal(state.requested,1);
assert.equal(state.pulses[0].start,7,'Flash the source line that triggered synth creation');
activity.incoming(go);
state=activity.visible();
assert.equal(state.confirmed,1,'Only a server /n_go confirms running status');
assert.equal(state.active[0].start,2,'Mark SynthDef corresponding to confirmed node');
assert.equal(state.active[0].end,5);
activity.incoming(pack('/n_off','iiiii',[1001,1,-1,-1,0]));
assert.equal(activity.visible().confirmed,0);
activity.incoming(pack('/n_on','iiiii',[1001,1,-1,-1,0]));
assert.equal(activity.visible().confirmed,1);
activity.incoming(end);
assert.equal(activity.visible().confirmed,0);
assert.equal(activity.visible().active.length,0,'A completed note must release amber highlight');
assert.ok(notifications>0);

activity.outgoing(pulse);activity.incoming(go);
activity.setDocument('Another Song','SynthDef(\\bell, { }).add;');
assert.equal(activity.visible().linked,0,'Do not highlight lines in another composition');
activity.setDocument('Song A',source+'\n// edited');
assert.equal(activity.visible().linked,1,'Appending after definition does not move its mapped source');
activity.setDocument('Song A','// moved\n'+source);
assert.equal(activity.visible().linked,0,'Edited source offsets must never map to incorrect lines');
activity.stopRequested();
assert.equal(activity.visible().confirmed,0);

const one='{ SinOsc.ar(330) ! 2 }.play;';
const anonymous=indexSource(one);assert.equal(anonymous.anonymous.length,1);
activity.evaluation('Simple',one,one,1);
activity.outgoing(pack('/s_new','siii',['temp__0',2002,0,1]));
activity.incoming(pack('/n_go','iiiii',[2002,1,-1,-1,0]));
assert.equal(activity.visible().linked,1,'Unique anonymous .play must map to its source');
activity.stopRequested();

const seq='Pbind(\\instrument, \\bell, \\dur, 0.5).play;';
assert.equal(indexSource(seq).triggers.get('bell')[0].start,1);
activity.evaluation('Pattern',seq,seq,1);
tick=7000;
activity.outgoing(pack('/s_new','siii',['bell',3003,0,1]));
assert.equal(activity.visible().pulses[0].start,1);
tick=8200;
assert.equal(activity.visible().pulses.length,0,'Trigger highlight must be momentary');
activity.incoming(pack('/n_go','iiiii',[3003,1,-1,-1,0]));
assert.equal(activity.visible().linked,0,'A pattern cannot falsely claim a source definition');
console.log('Live source activity: OSC packets/bundles, notifications, synth lifecycle, source mapping and safety checks passed.');
