import assert from 'node:assert/strict';
import {buildCatalog,VERIFIED_SIGNATURES,searchCatalog,completionCandidates,
  callAtCursor,insertionFor,SAFE_TEMPLATES,displayName} from '../catalog-core.mjs';

const catalog=buildCatalog();
const src='(\n{ SinOsc.ar(440, 0, 0.1) }.play;\n)';
assert.ok(catalog.classes.length>=50);
assert.equal(displayName('SinOsc'),'Sinusoidal oscillator');
assert.equal(VERIFIED_SIGNATURES['SinOsc.ar'][0].name,'freq');
assert.equal(VERIFIED_SIGNATURES['SinOsc.ar'][0].default,'440');
assert.equal(VERIFIED_SIGNATURES['SinOsc.ar'][2].default,'1');
assert.ok(searchCatalog(catalog)[0].name==='SinOsc');
assert.ok(searchCatalog(catalog,{query:'sine-wave'}).some(x=>x.name==='SinOsc'));
assert.ok(searchCatalog(catalog,{sort:'alphabetical'}).every((x,i,a)=>!i||a[i-1].name.localeCompare(x.name)<=0));
assert.ok(searchCatalog(catalog,{category:'Oscillators'}).every(x=>x.category==='Oscillators'));
assert.equal(searchCatalog(catalog,{sort:'recent',recent:['Routine']})[0].name,'Routine');
assert.equal(searchCatalog(catalog,{sort:'used',source:'LPF.ar(1); LPF.ar(1); LPF.ar(1);'})[0].name,'LPF');

let prefix=completionCandidates(catalog,'Sin',3);
assert.equal(prefix.kind,'class');
assert.equal(prefix.items[0].name,'SinOsc');
assert.equal(insertionFor(prefix.items[0],prefix.prefix).text,'SinOsc.ar(freq: 440, mul: 0.1)');
prefix=completionCandidates(catalog,'SinOsc.a',8);
assert.equal(prefix.kind,'method');
assert.ok(prefix.items.some(x=>x.name==='ar'));
prefix=completionCandidates(catalog,'s.bo',4);
assert.equal(prefix.kind,'method');
assert.equal(prefix.owner,'Server');
assert.ok(prefix.items.some(x=>x.name==='boot'));
assert.equal(completionCandidates(catalog,'// Sin',6),null);
assert.equal(completionCandidates(catalog,'"Sin',4),null);
const docMethod=buildCatalog({source:'Official help',classes:[{
 name:'SinOsc',kind:'class',summary:'Sine oscillator',category:'UGens>Generators',
 methods:[{owner:'SinOsc',name:'ar',scope:'class',args:[{name:'freq'}],summary:'Create audio-rate oscillator'}]
},{name:'SpecialThing',summary:'An experimental facility',category:'Core',
 methods:[{owner:'SpecialThing',name:'new',scope:'class',args:[{name:'whatever'}]}]}]});
assert.ok(docMethod.classes.some(x=>x.name==='SpecialThing'));
assert.deepEqual(docMethod.classes.find(x=>x.name==='SinOsc').methods.find(m=>m.name==='ar').args,
 VERIFIED_SIGNATURES['SinOsc.ar']);
let syntax=callAtCursor(catalog,'SinOsc.ar(',10);
assert.equal(syntax.signature,'SinOsc.ar');
assert.equal(syntax.args.length,4);
assert.equal(syntax.active,0);
assert.equal(syntax.args[0].default,'440');
assert.equal(syntax.requiredLeft.length,0);
syntax=callAtCursor(catalog,'Out.ar(',7);
assert.equal(syntax.requiredLeft.length,2);
assert.deepEqual(syntax.requiredLeft.map(x=>x.name),['bus','channelsArray']);
syntax=callAtCursor(catalog,'Out.ar(bus: 0, ',15);
assert.equal(syntax.requiredLeft.length,1);
assert.equal(syntax.requiredLeft[0].name,'channelsArray');
syntax=callAtCursor(catalog,'SinOsc.ar(freq: 440, ',21);
assert.equal(syntax.active,1);
syntax=callAtCursor(catalog,'Out.ar(0, SinOsc.ar(440, 0, 0.1)',36);
assert.equal(syntax.signature,'Out.ar');
assert.equal(syntax.active,1);
assert.equal(SAFE_TEMPLATES['SinOsc.ar'],'freq: 440, mul: 0.1');
assert.equal(src,'(\n{ SinOsc.ar(440, 0, 0.1) }.play;\n)');
console.log('Catalog: search/sorts, source-safe suggestions, receiver-aware methods, verified defaults and argument slots passed.');
