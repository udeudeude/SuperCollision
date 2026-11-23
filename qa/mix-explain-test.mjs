import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {indexSource} from '../live-activity.mjs';
import {PerformanceJournal,encodeOsc} from '../performance-engine.mjs';
import {describeSynthesis,previewWaveform,snapshotAt,sourcePreview,sourceIsCurrent} from '../mix-explain.mjs';

const code=[
  '(',
  'SynthDef(\\lesson, { |freq=440, amp=0.1|',
  '  var tone = LPF.ar(SinOsc.ar(freq, 0, amp), 900);',
  '  var env = EnvGen.kr(Env.perc(0.01, 0.3));',
  '  // FakeOsc.ar(1000);',
  '  /* Out.ar(8, FakeThing.ar(123)) */',
  '  Out.ar(0, (tone * env) ! 2);',
  '}).add;',
  'Synth(\\lesson, [\\freq, 330, \\amp, 0.2]);',
  ')'
].join('\n');
const indexed=indexSource(code),site=indexed.defs.get('lesson');
assert.ok(site);
const result=describeSynthesis(site);
assert.deepEqual(result.nodes.map(n=>n.name),['SinOsc','LPF','EnvGen','Out'],
  'Source components must precede their verified consumers');
assert.deepEqual(result.nodes.map(n=>n.role),['source','filter','envelope','output']);
assert.equal(result.nodes[0].rate,'ar');
assert.ok(result.nodes[0].inputs.some(x=>x.to==='LPF'),
  'Nested SinOsc must explicitly identify its direct destination');
assert.ok(result.nodes[0].feeds.some(x=>x.to==='LPF'&&x.reason==='nested in'));
assert.ok(result.nodes[1].feeds.some(x=>x.to==='Out'&&x.reason==='referenced by'),
  'Variable assignment sig must connect filter to output without inventing an edge');
assert.ok(result.nodes[2].feeds.some(x=>x.to==='Out'&&x.reason==='referenced by'),
  'Envelope contribution must be traced through its variable');
assert.equal(code.slice(result.nodes[0].startOffset,result.nodes[0].endOffset),
  'SinOsc.ar(freq, 0, amp)','Exact source offsets need to navigate working code');
assert.equal(result.nodes[0].line,3);
assert.equal(result.nodes.at(-1).line,7);
assert.equal(result.byRole.filter[0].name,'LPF');
assert.equal(previewWaveform(result.nodes)?.shape,'sine');
assert.match(previewWaveform(result.nodes)?.path,/^M0 /);
assert.equal(sourceIsCurrent(site,code),true);
assert.equal(sourceIsCurrent(site,'// prepend\n'+code),false);
assert.equal(sourcePreview(code).some(x=>x.name==='lesson'),true);
assert.equal(sourcePreview('({ SinOsc.ar(440,0,0.1) }.play)').some(x=>x.name==='Anonymous .play'),true);
assert.equal(previewWaveform(describeSynthesis(indexSource(
  '{ WhiteNoise.ar(0.1) }.play').anonymous[0]).nodes),null,
  'Do not invent an actual waveform for noise');
assert.equal(previewWaveform(describeSynthesis(indexSource(
  '{ SinOsc.kr(0.3) }.play').anonymous[0]).nodes),null,
  'Control-rate sine modulation must not be mistaken for audible output');
assert.equal(describeSynthesis({text:'// SinOsc.ar(100)\n"LPF.ar(3)"\n/* Out.ar(0) */',
  startOffset:0,start:1}).nodes.length,0,
  'Comments and quoted documentation must never create fake generators');

const notes=[
  {name:'lesson',start:null,end:null},
  {name:'lesson',start:1000,end:3000},
  {name:'lesson',start:1800,end:null},
  {name:'other',start:1000,end:null}
];
assert.equal(snapshotAt(notes,1500,'lesson').length,1);
assert.equal(snapshotAt(notes,2000,'lesson').length,2);
assert.equal(snapshotAt(notes,3000,'lesson').length,1);
assert.equal(snapshotAt(notes,3000,'other').length,1);
let now=1000;
const journal=new PerformanceJournal({now:()=>now});
journal.evaluation('Learning',code,code,1);
assert.equal(journal.definitionFor('lesson')?.kind,'definition');
journal.outgoing(encodeOsc('/s_new',['lesson',77,0,1,'freq',330,'amp',0.2]));
assert.equal(journal.events[0].status,'requested');
assert.equal(journal.events[0].site.kind,'trigger',
  'Where this note was requested differs from the synthesizer definition');
assert.equal(journal.events[0].definition.kind,'definition');
now=1150;
journal.incoming(encodeOsc('/n_go',[77,1,-1,-1,0]));
assert.equal(journal.events[0].status,'running');
assert.equal(journal.events[0].params.freq,330);
assert.equal(journal.active('lesson').length,1);
assert.equal(snapshotAt(journal.eventsForCurrent(),now,'lesson').length,1);
journal.incoming(encodeOsc('/n_end',[77,1,-1,-1,0]));
assert.equal(snapshotAt(journal.eventsForCurrent(),now,'lesson').length,0);
const anonymous='{ SinOsc.ar(440,0,0.1) }.play;';
journal.evaluation('Sketch',anonymous,anonymous,1);
assert.equal(journal.definitionFor('temp__0')?.kind,'anonymous');
assert.equal(journal.definitionFor('temp__0').text,'{ SinOsc.ar(440,0,0.1) }.play');
assert.equal(journal.definitionFor('unrelatedSynth'),null);
journal.outgoing(encodeOsc('/s_new',['temp__0',79,0,1]));
assert.equal(journal.events.at(-1).definition.kind,'anonymous');
const ambiguous='SynthDef(\\amb, {|amp=0.2| Out.ar(0,0);}).add; Synth(\\amb); Synth(\\amb);';
journal.evaluation('Ambiguous',ambiguous,ambiguous,1);
journal.outgoing(encodeOsc('/s_new',['amb',90,0,1]));
assert.equal(journal.events.at(-1).site.kind,'definition',
  'Ambiguous trigger matches must fall back to the definition, not invent a location');

const ui=await readFile(new URL('../performance-ui.mjs',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
assert.match(html,/id="perform-explain-graph"/);
assert.match(html,/id="perform-explain-reality"/);
assert.match(html,/id="perform-explain-wave"/);
assert.match(ui,/renderExplainer\(allRows,events,t\)/);
assert.doesNotMatch(ui,/audio (?:waveform|level) measured/i,
  'Do not claim the synthesis graph produces actual output measurements');
console.log('Mix explanation: exact components/source ranges, server evidence, anonymous and ambiguous cases, honest schematic waveform passed.');
