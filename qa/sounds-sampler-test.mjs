import assert from 'node:assert/strict';
import {REGION_DEFINITIONS,validateRegion,regionPlayCommand,stopRegionCommand} from '../sounds-sampler.mjs';
const normal={bufferId:700,channels:1,start:0,finish:1,rate:1,amp:0.16,loop:false};
assert.equal(validateRegion(normal).rate,1);
assert.equal(validateRegion({...normal,start:0.56,finish:0.57}).finish,0.57,'one-percent regions are valid despite floating-point rounding');
assert.match(regionPlayCommand(normal),/Synth\(\\scSoundsMonoOnce/);
assert.match(regionPlayCommand({...normal,channels:2,loop:true,rate:0.5,start:0.2,finish:0.8}),/Synth\(\\scSoundsStereoLoop/);
assert.match(regionPlayCommand({...normal,channels:2,loop:false}),/Synth\(\\scSoundsStereoOnce/);
assert.match(regionPlayCommand({...normal,loop:true}),/Synth\(\\scSoundsMonoLoop/);
for(const change of [{start:0.8,finish:0.7},{start:0.2,finish:0.205},{start:-1},{finish:1.001},{rate:0},{rate:2.1},{rate:NaN},{amp:1},{channels:3},{bufferId:-1},{loop:1}]){
  assert.throws(()=>regionPlayCommand({...normal,...change}),Error,'unsafe region control must be rejected: '+JSON.stringify(change));
}
for(const name of ['scSoundsMonoOnce','scSoundsMonoLoop','scSoundsStereoOnce','scSoundsStereoLoop'])
  assert.ok(REGION_DEFINITIONS.includes('SynthDef(\\'+name),'Missing native instrument '+name);
assert.equal((REGION_DEFINITIONS.match(/PlayBuf\.ar/g)||[]).length,2);
assert.equal((REGION_DEFINITIONS.match(/BufRd\.ar/g)||[]).length,2);
assert.equal((REGION_DEFINITIONS.match(/Phasor\.ar/g)||[]).length,2);
assert.match(REGION_DEFINITIONS,/BufRateScale\.kr/);
assert.match(REGION_DEFINITIONS,/s\.sync/);
assert.match(stopRegionCommand,/\\gate, 0/);
console.log('Sounds native region definitions, one-shot, loop, and validated controls passed.');
