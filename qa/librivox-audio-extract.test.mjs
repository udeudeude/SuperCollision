import assert from 'node:assert/strict';
import {scanMp3Frames,encodeWavRegion,extractWavFromSource,MAX_CLIP_SECONDS,MAX_SOURCE_BYTES} from '../librivox-audio-extract.mjs';
function syntheticMp3(count=250){
  // MPEG 1, Layer III, 128 kbit/s, 44.1 kHz, 417-byte frames.
  const raw=new Uint8Array(count*417);
  for(let i=0;i<count;i++){const at=i*417;raw.set([0xff,0xfb,0x90,0x00],at);}
  return raw;
}
const raw=syntheticMp3();
const scan=scanMp3Frames(raw);
assert.equal(scan.frames.length,250);
assert.equal(scan.sampleRate,44100);
assert(Math.abs(scan.duration-250*1152/44100)<0.001);
const mocked={sampleRate:44100,numberOfChannels:2,length:441000,getChannelData(channel){return new Float32Array(this.length).fill(channel===0?0.5:-0.5);}};
const wav=encodeWavRegion(mocked,2,2.2);
assert.equal(wav.type,'audio/wav');
const dv=new DataView(await wav.arrayBuffer());
assert.equal(dv.getUint32(24,true),44100);
assert.equal(dv.getUint16(22,true),2);
assert.equal(dv.getUint32(40,true),Math.round(.2*44100)*4);
assert.equal(wav.size,44+Math.round(.2*44100)*4);
assert.throws(()=>encodeWavRegion(mocked,2,2),/end time/);
assert.throws(()=>encodeWavRegion(mocked,0,MAX_CLIP_SECONDS+1),/three minutes/);
let captured=0;
const output=await extractWavFromSource(new Blob([raw],{type:'audio/mpeg'}),{start:2,end:2.2,decodeAudioData:async bytes=>{
  captured=bytes.byteLength;
  const length=44100*5;
  return {sampleRate:44100,numberOfChannels:1,length,getChannelData(){return new Float32Array(length).fill(.25);}};
}});
assert.equal(output.method,'mp3-window');
assert(captured<raw.byteLength,'decodes a small MP3 window rather than full recording');
assert(output.blob.type==='audio/wav');
assert(output.blob.size>1000);
await assert.rejects(()=>extractWavFromSource(new Blob([new Uint8Array(MAX_SOURCE_BYTES+1)]),{start:0,end:1,decodeAudioData:async()=>mocked}),/80 MB/);
console.log('PASS LibriVox sample extraction (MP3 windows, WAV framing, safety limits)');