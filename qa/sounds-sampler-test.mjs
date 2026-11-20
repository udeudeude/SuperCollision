import assert from 'node:assert/strict';
import {REGION_DEFINITIONS,validateRegion,regionPlayCommand,regionLiveSource,stopRegionCommand,sampleInstrumentSource} from '../sounds-sampler.mjs';
const normal={bufferId:700,channels:1,start:0,finish:1,rate:1,amp:0.16,loop:false};
assert.equal(validateRegion(normal).rate,1);
assert.equal(validateRegion(normal).sourceSampleRate,0,'desktop Buffer.read must retain its own file sample rate');
assert.equal(validateRegion({...normal,sourceSampleRate:44100}).sourceSampleRate,44100);
assert.match(regionPlayCommand({...normal,sourceSampleRate:44100}),/\\sourceRate, 44100/);
assert.match(regionPlayCommand(normal),/\\sourceRate, 0/);
assert.equal(validateRegion({...normal,start:0.56,finish:0.57}).finish,0.57,'one-percent regions are valid despite floating-point rounding');
assert.match(regionPlayCommand(normal),/Synth\(\\scSoundsMonoOnce/);
assert.match(regionPlayCommand({...normal,channels:2,loop:true,rate:0.5,start:0.2,finish:0.8}),/Synth\(\\scSoundsStereoLoop/);
assert.match(regionPlayCommand({...normal,channels:2,loop:false}),/Synth\(\\scSoundsStereoOnce/);
assert.match(regionPlayCommand({...normal,loop:true}),/Synth\(\\scSoundsMonoLoop/);
for(const change of [{start:0.8,finish:0.7},{start:0.2,finish:0.205},{start:-1},{finish:1.001},{rate:0},{rate:2.1},{rate:NaN},{amp:1},{channels:3},{bufferId:-1},{loop:1},{sourceSampleRate:-1},
 {sourceSampleRate:44100.5},{sourceSampleRate:7999},{sourceSampleRate:384001},{sourceSampleRate:NaN}]){
  assert.throws(()=>regionPlayCommand({...normal,...change}),Error,'unsafe region control must be rejected: '+JSON.stringify(change));
}
for(const name of ['scSoundsMonoOnce','scSoundsMonoLoop','scSoundsStereoOnce','scSoundsStereoLoop'])
  assert.ok(REGION_DEFINITIONS.includes('SynthDef(\\'+name),'Missing native instrument '+name);
assert.equal((REGION_DEFINITIONS.match(/PlayBuf\.ar/g)||[]).length,2);
assert.equal((REGION_DEFINITIONS.match(/BufRd\.ar/g)||[]).length,4);
assert.equal((REGION_DEFINITIONS.match(/Phasor\.ar/g)||[]).length,2);
assert.match(REGION_DEFINITIONS,/BufSampleRate\.kr/);
assert.match(REGION_DEFINITIONS,/seam\.cos/);
assert.match(REGION_DEFINITIONS,/seam\.sin/);
assert.match(REGION_DEFINITIONS,/phase - high \+ low \+ fadeFrames/);
assert.match(REGION_DEFINITIONS,/low \+ fadeFrames, high, low \+ fadeFrames/);
const low=300,high=4000,fade=480;
assert.equal(high-high+low+fade,low+fade,'incoming readhead must meet outgoing reset position');
assert.match(REGION_DEFINITIONS,/BufRateScale\.kr/);
assert.match(REGION_DEFINITIONS,/Select\.kr\(sourceRate > 0/);
assert.match(REGION_DEFINITIONS,/sourceRate \/ SampleRate\.ir/);
assert.match(REGION_DEFINITIONS,/frames \/ sourceFramesPerSecond/);
assert.match(REGION_DEFINITIONS,/sourceFramesPerSecond \* 0\.012/);
assert.match(REGION_DEFINITIONS,/sourceRate=0/,'desktop script can use native Buffer.read sample-rate metadata');
assert.match(REGION_DEFINITIONS,/s\.sync/);
assert.match(stopRegionCommand,/\\gate, 0/);
const nativeEditor=regionLiveSource({...normal,start:0.2,finish:0.8,rate:0.75,loop:true,sourceSampleRate:44100});
assert.ok(nativeEditor.startsWith('(')&&nativeEditor.includes('Routine({'), 'live editor source must execute as a native SuperCollider Routine');
assert.match(nativeEditor,/SynthDef\\(\\\\scSoundsMonoLoop/,'editable source must include the real synthesis graph');
assert.match(nativeEditor,/BufRd\\.ar/,'loop processing must remain visible');
assert.match(nativeEditor,/\\\\sourceRate, 44100/,'native source metadata must reach real playback');
assert.ok(nativeEditor.indexOf('SynthDef(')<nativeEditor.indexOf('s.sync;') &&
 nativeEditor.indexOf('s.sync;')<nativeEditor.indexOf('~scSoundsLabPlayer = Synth('),
 'native definition must load before playback starts');
assert.doesNotMatch(nativeEditor,/Dialog\\.openPanel/,'live source must use an already transferred native buffer');
assert.throws(()=>regionLiveSource({...normal,rate:10}),/Speed/);


const source=sampleInstrumentSource({...normal,start:0.25,finish:0.7,rate:1.5,loop:true},{
 name:'Untrusted\nSynthDef(\\unexpected, {})',
 origin:{creator:'Sample maker',license:'CC BY 4.0',url:'https://example.test/audio.wav',
  licenseUrl:'https://creativecommons.org/licenses/by/4.0/',attribution:'Sample maker; credit\nrequired'}
});
assert.match(source,/Dialog\.openPanel/,'desktop script should explicitly ask for the original audio');
assert.match(source,/Buffer\.read\(s, path, action:/,'native SuperCollider must load the exported audio itself');
assert.match(source,/SynthDef\(\\scSoundsMonoLoop/);
assert.match(source,/BufRd\.ar/);
assert.match(source,/loaded\.numChannels != 1/,'a different channel layout must not be substituted silently');
assert.match(source,/\\rate, 1\.5/);
assert.match(source,/\\start, 0\.25/);
assert.match(source,/\\finish, 0\.7/);
assert.match(source,/CC BY 4\.0/,'preserve exact license');
assert.match(source,/Sample maker; credit required/,'preserve attribution without executable newlines');
assert.equal((source.match(/SynthDef\(\\unexpected/g)||[]).length,1,'untrusted name should remain one comment line');
assert.doesNotMatch(source,/^\s*SynthDef\(\\unexpected/m,'untrusted name may not inject SuperCollider source');
assert.match(source,/NOT embedded/,'users must export the original audio independently');
assert.doesNotMatch(source,/\\sourceRate, 44100/,'desktop script must use source file sample rate, not the web server sample rate');
assert.match(sampleInstrumentSource({...normal,channels:2,loop:false}),/SynthDef\(\\scSoundsStereoOnce/);
assert.throws(()=>sampleInstrumentSource({...normal,rate:Infinity}),/Speed/);
console.log('Sounds native region definitions, one-shot, loop, and validated controls passed.');
