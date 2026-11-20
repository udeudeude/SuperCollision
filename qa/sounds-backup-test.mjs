import assert from 'node:assert/strict';
import {createSoundsBackup,readSoundsBackup} from '../sounds-backup.mjs';

const instrument={id:'instrument-1',name:'Unprocessed SuperCollider source',source:'written',created:42,
 code:'SynthDef(\\pulse, { Out.ar(0, SinOsc.ar(440) * 0.1) }).add;',favorite:true};
const sampleBytes=new Uint8Array([0,255,128,10,13,0,42,200]);
const recording={id:'recording-1',name:'Capturé 音色',source:'recorded',created:73,
 mime:'audio/wav',favorite:false,origin:{creator:'Maker',license:'CC BY 4.0'},
 blob:new Blob([sampleBytes],{type:'audio/wav'})};
const archive=createSoundsBackup([instrument,recording]);
assert.ok(archive.size>recording.blob.size,'archive must include metadata and audio bytes');
const restored=await readSoundsBackup(archive);
assert.equal(restored.length,2);
assert.deepEqual(restored[0],instrument);
assert.equal(restored[1].name,recording.name,'UTF-8 names must survive');
assert.equal(restored[1].origin.license,'CC BY 4.0','license metadata must survive');
assert.equal(restored[1].blob.type,'audio/wav');
assert.deepEqual(new Uint8Array(await restored[1].blob.arrayBuffer()),sampleBytes);
assert.equal(restored[1].favorite,false);
assert.equal(restored[0].code,instrument.code);
const sourceOnly=await readSoundsBackup(createSoundsBackup([instrument]));
assert.equal(sourceOnly[0].code,instrument.code);
await assert.rejects(()=>readSoundsBackup(new Blob([new Uint8Array([1,2,3])])),/Not a/);
await assert.rejects(()=>readSoundsBackup(new Blob([archive,'TRAILING'])),/unexpected or missing/);
await assert.rejects(()=>readSoundsBackup(archive.slice(0,archive.size-1)),/Invalid backup audio/);
await assert.rejects(()=>readSoundsBackup(createSoundsBackup([instrument,instrument])),/duplicate sound identifiers/);
assert.throws(()=>createSoundsBackup([{id:'bad'}]),/invalid library item/);
console.log('Sounds complete-backup round trip, source, audio bytes and corruption tests passed');
