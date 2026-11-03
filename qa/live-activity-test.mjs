import assert from 'node:assert/strict';
import {readOscPacket,indexSource,SoundActivityTracker} from '../live-activity.mjs';
import {prepareRoutineTrace} from '../routine-trace.mjs';
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
    else if(types[i]==='b'){
      const bytes=Uint8Array.from(args[i]),padded=Uint8Array.from([...bytes,...new Array((4-bytes.length%4)%4).fill(0)]);
      parts.push(beInt(bytes.length),padded);
    }
    else throw Error('Test encoder unsupported type '+types[i]);
  }
  return Uint8Array.from(parts.flatMap(b=>[...b]));
}
function numericCommand(id,types,args){
 const data=pack('/s_new',types,args),addressLength=oscString('/s_new').length;
 return Uint8Array.from([...beInt(id),...data.slice(addressLength)]);
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
const number9=numericCommand(9,'siii',['bell',1007,0,1]);
const number59=numericCommand(59,'siii',['bell',1008,0,1]);
assert.deepEqual(readOscPacket(number9)[0],{address:'/s_new',args:['bell',1007,0,1]});
assert.deepEqual(readOscPacket(number59)[0],{address:'/s_new',args:['bell',1008,0,1]});
assert.equal(readOscPacket(bundle([number9,go])).length,2,'Recognize numeric start inside OSC bundle');

const embedded=pack('/d_recv','bb',[Uint8Array.from([83,67,103,102]),pulse]);
assert.deepEqual(readOscPacket(embedded).map(x=>x.address),['/d_recv','/s_new'],
  'The /d_recv completion message can create a synth without a separate top-level /s_new');
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
assert.equal(state.pulses[0].site.start,7,'Flash the source line that triggered synth creation');
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

activity.outgoing(number9);
assert.equal(activity.visible().requested,1,'Numeric command creates a pending sound node');
activity.stopRequested();
activity.outgoing(pulse);activity.incoming(go);
activity.setDocument('Another Song','SynthDef(\\bell, { }).add;');
assert.equal(activity.visible().linked,0,'Do not highlight lines in another composition');
activity.setDocument('Song A',source+'\n// edited');
assert.equal(activity.visible().linked,1,'Appending after definition does not move its mapped source');
activity.setDocument('Song A','// moved\n'+source);
assert.equal(activity.visible().linked,0,'Edited source offsets must never map to incorrect lines');
activity.stopRequested();
assert.equal(activity.visible().confirmed,0);
activity.evaluation('Song A',source,source,1);
activity.outgoing(embedded);
assert.equal(activity.visible().requested,1,'Track /s_new inside SynthDef completion blob');
activity.incoming(go);
assert.equal(activity.visible().confirmed,1);
activity.stopRequested();

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
assert.equal(activity.visible().pulses[0].site.start,1);
tick=8200;
assert.equal(activity.visible().pulses.length,0,'Trigger highlight must be momentary');
activity.incoming(pack('/n_go','iiiii',[3003,1,-1,-1,0]));
assert.equal(activity.visible().linked,0,'A pattern cannot falsely claim a source definition');


// Real source instrumentation must preserve the saved source and variable-declaration order.
const sourceRoutine=[
  '(',
  '~player = Routine({',
  '    var counter = 0;',
  '    3.do {',
  '        Synth(\\bell, [\\freq, 440]);',
  '        0.2.wait;',
  '        counter = counter + 1;',
  '    };',
  '}).play(SystemClock);',
  ')'
].join('\n');
const originalCopy=sourceRoutine;
const plan=prepareRoutineTrace(sourceRoutine,1,'uQa123');
assert.equal(sourceRoutine,originalCopy,'Preparation must not mutate user composition');
assert.equal(plan.instrumented,true,'Routine was not instrumented');
assert.equal(plan.routines.length,1,'One Routine definition detected');
assert.equal(plan.checkpoints.length,3,'Expected loop, Synth and wait checkpoints, never var declarations');
assert.ok(plan.checkpoints.some(p=>p.line===5&&p.kind==='step'));
assert.ok(plan.checkpoints.some(p=>p.line===6&&p.kind==='wait'&&p.wait==='0.2'));
assert.ok(plan.code.includes('counter = counter + 1;'));
assert.ok(plan.code.includes('var counter = 0;'),'Never insert trace statements before SC var declarations');
assert.equal(plan.code.split('\n').length,sourceRoutine.split('\n').length,'Line numbers must not shift in executed source');
assert.equal(prepareRoutineTrace('// Routine({ Synth(\\fake) })').instrumented,false,'Comments do not get traced');
const variableWait=prepareRoutineTrace('Routine({\n    var waitTime=1.5;\n    waitTime.wait;\n}).play(SystemClock);',1,'varClock');
assert.ok(variableWait.instrumented&&variableWait.code.includes('(waitTime).asString'),'Variable waits should measure actual runtime value without re-evaluation');
const traceTracker=new SoundActivityTracker(()=>{},()=>tick);
traceTracker.evaluation('Routine Song',sourceRoutine,sourceRoutine);
traceTracker.registerRoutinePlan(plan,'Routine Song',sourceRoutine);
const synthMarker=plan.checkpoints.find(p=>p.kind==='step').marker;
const waitMarker=plan.checkpoints.find(p=>p.kind==='wait').marker.replace(/__$/,':2__');
assert.ok(plan.code.includes('thisThread.clock.isKindOf(TempoClock)'),'Actual clock tempo should be sampled in Routine');
assert.ok(plan.code.includes('0.2).asString'),'Wait value must be measured at runtime');
tick=10000;
assert.equal(traceTracker.consumeLanguagePrint(synthMarker+'\n'),'','Invisible trace markers must not pollute the console');
let traced=traceTracker.visible();
assert.equal(traced.routines.length,1);
assert.equal(traced.routines[0].line,5);
assert.equal(traced.routines[0].kind,'step');
tick=12000;
assert.equal(traceTracker.consumeLanguagePrint(waitMarker+'\n'),'');
traced=traceTracker.visible();
assert.equal(traced.routines[0].line,6,'Wait trace must follow execution progression');
assert.equal(traced.routines[0].kind,'wait');
assert.equal(traced.routines[0].wait,0.2);
assert.equal(traced.routines[0].tempo,2,'TempoClock running at 2 beats per second');
assert.equal(traced.routines[0].waitSeconds,0.1,'0.2 beats at tempo 2 = 0.1 seconds');
assert.equal(traced.routines[0].remaining,0.1,'Countdown should begin with actual clock rate');
tick+=50;
assert.ok(Math.abs(traceTracker.visible().routines[0].remaining-0.05)<1e-6,'Countdown follows clock elapsed time');
tick+=50;
assert.equal(traceTracker.visible().routines[0].remaining,0,'Countdown reaches zero exactly at scheduled target');
assert.equal(traceTracker.consumeLanguagePrint('actual composer output\n'),'actual composer output\n');
traceTracker.setDocument('Another Composition','Synth(\\bell);');
assert.equal(traceTracker.visible().routines.length,0,'Never attribute a trace to the wrong composition');
traceTracker.setDocument('Routine Song',sourceRoutine);
assert.equal(traceTracker.visible().routines.length,1);
tick=28001;
assert.equal(traceTracker.visible().routines[0].stale,true,'Last checkpoint must not masquerade as current instruction');
tick=60000;
assert.equal(traceTracker.visible().routines.length,0,'Stale Routine pointers eventually disappear');
traceTracker.stopRequested();
assert.equal(traceTracker.visible().routines.length,0,'STOP clears routine pointers');

const lifetimeTracker=new SoundActivityTracker(()=>{},()=>tick);
lifetimeTracker.evaluation('Stats Song',source,source);
lifetimeTracker.outgoing(pack('/s_new','siii',['bell',6001,0,1]));
lifetimeTracker.incoming(pack('/n_go','iiiii',[6001,1,-1,-1,0]));
const initialStats=lifetimeTracker.visible().instruments.find(x=>x.name==='bell');
assert.equal(initialStats.active,1,'Per-instrument active count must be server confirmed');
assert.equal(initialStats.total,1,'Count synth starts');
tick+=2400;
lifetimeTracker.incoming(pack('/n_end','iiiii',[6001,1,-1,-1,0]));
const endedStats=lifetimeTracker.visible().instruments.find(x=>x.name==='bell');
assert.equal(endedStats.active,0,'Freeing synth decrements its own instrument count');
assert.equal(endedStats.total,1);
assert.equal(endedStats.lastDuration,2400,'Show confirmed node lifetime');
lifetimeTracker.outgoing(pack('/s_new','siii',['bell',6002,0,1]));
lifetimeTracker.incoming(pack('/n_go','iiiii',[6002,1,-1,-1,0]));
assert.equal(lifetimeTracker.visible().instruments.find(x=>x.name==='bell').total,2,'Total count persists across separate notes');
const hue=lifetimeTracker.colorSlot('bell');
assert.equal(lifetimeTracker.colorSlot('bell'),hue,'Instrument hue must stay stable across notes');
assert.notEqual(lifetimeTracker.colorSlot('drone'),hue,'Different named instruments use distinct palette slots');
assert.ok(lifetimeTracker.visible().instruments.find(x=>x.name==='bell').voices[0].slot>=0,'Individual concurrent voices expose colored tick identity');

console.log('Live source activity: OSC, instrument lifetimes, safe Routine checkpoints, source mapping and safety checks passed.');
