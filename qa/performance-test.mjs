import assert from 'node:assert/strict';
import {PerformanceJournal,encodeOsc,numericParameters} from '../performance-engine.mjs';
import {readOscPacket} from '../live-activity.mjs';
import {readFile} from 'node:fs/promises';
const program=[
  '(',
  'SynthDef(\\haze, { |freq=220, amp=0.1, brightness=0.5|',
  '  Out.ar(0, SinOsc.ar(freq,0,amp) ! 2);',
  '}).add;',
  'SynthDef(\\bell, { |freq=440, amp=0.08|',
  '  Out.ar(0, SinOsc.ar(freq,0,amp) ! 2);',
  '}).add;',
  'SynthDef(\\uncontrollable, { |freq=220|',
  '  Out.ar(0, SinOsc.ar(freq,0,0.1) ! 2);',
  '}).add;',
  'Synth(\\haze, [\\freq,330,\\amp,0.12]);',
  ')'
].join('\n');
assert.deepEqual(numericParameters('SynthDef(\\haze, {|amp=0.1, freq=220| Out.ar(0,0)})'),{amp:.1,freq:220});
let tick=1000,notifications=0;
const sent=[];
const journal=new PerformanceJournal({now:()=>tick,onChange:()=>notifications++,
  send:msg=>sent.push(readOscPacket(msg)[0])});
journal.evaluation('Test',program,program,1);
assert.equal(journal.defs.get('haze').params.amp,0.1);
assert.equal(journal.defs.get('bell').params.freq,440);
assert.equal(journal.compatible('uncontrollable'),false);
const start=encodeOsc('/s_new',['haze',1001,0,1,'freq',330,'amp',0.12]);
const bytes=Uint8Array.from(start);
assert.equal(journal.outgoing(start).length,0);
assert.deepEqual(start,bytes,'Observation must not modify any byte of original OSC message');
assert.equal(journal.events[0].status,'requested');
assert.equal(journal.events[0].start,null,'Events must not start before server confirmation');
tick=1100;
journal.incoming(encodeOsc('/n_go',[1001,1,-1,-1,0]));
assert.equal(journal.events[0].start,1100);
assert.equal(journal.events[0].status,'running');
assert.equal(journal.active('haze').length,1);
assert.equal(sent.length,0,'Neutral monitoring must send NO additional server commands');
assert.equal(journal.gain('haze',.5),true);
assert.equal(sent.at(-1).address,'/n_set');
assert.equal(sent.at(-1).args[0],1001);
assert.equal(sent.at(-1).args[1],'amp');
assert.ok(Math.abs(sent.at(-1).args[2]-.06)<1e-6);
journal.mute('haze',true);
assert.deepEqual(sent.at(-1),{address:'/n_set',args:[1001,'amp',0]});
assert.equal(journal.effectiveGain('haze'),0);
tick=1250;
const codeUpdate=encodeOsc('/n_set',[1001,'amp',0.2]);
assert.equal(journal.outgoing(codeUpdate).length,1,'External amp change while muted needs reapplication');
assert.deepEqual(journal.outgoing(codeUpdate).at(-1),encodeOsc('/n_set',[1001,'amp',0]));
assert.ok(Math.abs(journal.nodes.get(1001).originalAmp-.2)<1e-6);
journal.mute('haze',false);
const restored=readOscPacket(encodeOsc('/n_set',[1001,'amp',.1]))[0];
assert.equal(sent.at(-1).address,'/n_set');
assert.deepEqual(sent.at(-1).args.slice(0,2),[1001,'amp']);
assert.ok(Math.abs(sent.at(-1).args[2]-.1)<1e-6,'Unmute restores updated source amp times user gain');
assert.equal(journal.parameter('haze','brightness',.8),true);
assert.equal(sent.at(-1).address,'/n_set');
assert.deepEqual(sent.at(-1).args.slice(0,2),[1001,'brightness']);
assert.ok(Math.abs(sent.at(-1).args[2]-.8)<1e-6);
assert.equal(journal.parameter('haze','unknown',.5),false);
assert.equal(journal.parameter('haze','amp',0),false,'Amplitude must be controlled through safe ratio/mute path');
assert.equal(journal.safeSolo(),true);
assert.equal(journal.solo('haze',true),true);
assert.equal(journal.stateFor('haze').solo,true);
const other=encodeOsc('/s_new',['bell',1002,0,1]);
journal.outgoing(other);tick=1500;
const overrides=journal.incoming(encodeOsc('/n_go',[1002,1,-1,-1,0]));
assert.equal(overrides.length,1,'New note must follow current solo state after server confirmation');
const soloArgs=readOscPacket(overrides[0])[0].args;
assert.equal(soloArgs[0],1002);assert.equal(soloArgs[1],'amp');assert.equal(soloArgs[2],0);
const newer=encodeOsc('/s_new',['uncontrollable',1003,0,1]);
journal.outgoing(newer);journal.incoming(encodeOsc('/n_go',[1003,1,-1,-1,0]));
assert.equal(journal.safeSolo(),false,'Uncontrollable active nodes make universal solo unsafe');
assert.equal(journal.solo('bell',true),false,'Solo must refuse to claim it can silence an incompatible synth');
assert.equal(journal.mute('uncontrollable',true),false,'Mute must refuse if amp control absent');
tick=4800;
journal.incoming(encodeOsc('/n_end',[1001,1,-1,-1,0]));
assert.equal(journal.events[0].end,4800);
assert.equal(journal.events[0].status,'ended');
assert.equal(journal.getInstrumentRows().find(x=>x.name==='haze').active,0);
assert.equal(journal.eventsForCurrent()[0].start,1100);
assert.equal(journal.eventsForCurrent()[0].end,4800);
const beforeReset=sent.length;
journal.reset();
assert.ok(sent.length>beforeReset,'RESET MIX must restore amplitudes modified by the mixer');
assert.equal(journal.stateFor('haze').gain,1);
assert.equal(journal.stateFor('haze').solo,false);
assert.equal(journal.stateFor('haze').muted,false);
const afterReset=sent.length;
journal.reset();
assert.equal(sent.length,afterReset,'RESET MIX at neutral must not overwrite unmodified server amplitude');
journal.observe(false);
assert.equal(sent.length,afterReset,'Collapsing LIVE at neutral must send no extra amplitude commands');
const nBefore=journal.events.length;
journal.outgoing(encodeOsc('/s_new',['bell',3012,0,1]));
assert.equal(journal.events.length,nBefore,'Collapsed LIVE stops observation');
journal.observe(true);
journal.setSource('Unrelated Composition','Synth(\\haze);');
assert.equal(journal.eventsForCurrent().length,0,'Timeline must not show another composition events');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const live=await readFile(new URL('../live-activity.mjs',import.meta.url),'utf8');
assert.ok(html.includes('lang.runCode(source)'),'Exact user source must reach SuperCollider untouched');
assert.ok(!html.includes('lang.runCode(evaluated)'),'Do not substitute modified/rewritten user source');
assert.ok(!live.includes('registerRoutinePlan(plan,compositionName,whole)'), 'No injected Routine tracing in live execution');
assert.ok(html.includes('id="inspector-perform"'),'PERFORM must be accessible');
assert.ok(notifications>0);
console.log('Performance journal: exact source, immutable OSC observation, confirmed timelines, amp, mute, solo, parameters, compatibility checks passed.');
