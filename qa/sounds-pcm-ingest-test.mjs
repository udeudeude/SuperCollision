import assert from 'node:assert/strict';
import {readPcmWaveForNativeBuffer} from '../sounds-pcm-ingest.mjs';

function wave({channels=2,frames=3,format=1,bits=16,rate=48000,
               extensible=false,validBits=bits,mask=channels===2?3:4,
               junk=false}={}){
 const width=bits/8,fmtSize=extensible?40:16;
 const junkSize=junk?10:0;
 const dataSize=channels*frames*width;
 const bytes=new ArrayBuffer(12+8+fmtSize+junkSize+8+dataSize+(dataSize%2));
 const view=new DataView(bytes);
 const label=(offset,text)=>{for(let i=0;i<text.length;i++)
  view.setUint8(offset+i,text.charCodeAt(i))};
 label(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);label(8,'WAVE');
 label(12,'fmt ');view.setUint32(16,fmtSize,true);
 view.setUint16(20,extensible?0xfffe:format,true);
 view.setUint16(22,channels,true);view.setUint32(24,rate,true);
 view.setUint32(28,rate*channels*width,true);
 view.setUint16(32,channels*width,true);view.setUint16(34,bits,true);
 if(extensible){
  view.setUint16(36,22,true);view.setUint16(38,validBits,true);
  view.setUint32(40,mask,true);view.setUint32(44,format,true);
  const tail=[0,0,16,0,128,0,0,170,0,56,155,113];
  tail.forEach((value,i)=>view.setUint8(48+i,value));
 }
 let offset=20+fmtSize;
 if(junk){label(offset,'JUNK');view.setUint32(offset+4,1,true);offset+=10}
 label(offset,'data');view.setUint32(offset+4,dataSize,true);
 return {bytes,view,at:offset+8,header:offset};
}
function read(w){return readPcmWaveForNativeBuffer(w.bytes)}
function equals(actual,expected){assert.deepEqual([...actual],expected)}
const pcm16=wave();
[32767,-32768,0,16384,-16384,8192].forEach((value,i)=>
 pcm16.view.setInt16(pcm16.at+i*2,value,true));
const original=pcm16.bytes.slice(0);
const sound=read(pcm16);
assert.equal(sound.length,3);
assert.equal(sound.sampleRate,48000);
assert.equal(sound.numberOfChannels,2);
equals(sound.getChannelData(0),[32767/32768,0,-0.5]);
equals(sound.getChannelData(1),[-1,0.5,0.25]);
assert.throws(()=>sound.getChannelData(2),RangeError);
assert.deepEqual(pcm16.bytes,original,'ingest must not alter source bytes');
const rate44100=wave({channels:1,frames:3,rate:44100,bits:16});
rate44100.view.setInt16(rate44100.at,16384,true);
const source44100=read(rate44100);
assert.equal(source44100.sampleRate,44100,'ingest must preserve original sample-rate metadata for native playback correction');
assert.equal(source44100.getChannelData(0)[0],0.5,'source samples must not be resampled');

const pcm8=wave({channels:1,frames:3,bits:8,junk:true});
[0,128,255].forEach((x,i)=>pcm8.view.setUint8(pcm8.at+i,x));
equals(read(pcm8).getChannelData(0),[-1,0,127/128]);

const pcm24=wave({channels:2,frames:2,bits:24});
const pcm24Values=[0x7fffff,-0x800000,-0x400000,0x400000];
for(const [i,value] of pcm24Values.entries()){
 const at=pcm24.at+i*3;
 pcm24.view.setUint8(at,value&255);
 pcm24.view.setUint8(at+1,(value>>8)&255);
 pcm24.view.setUint8(at+2,(value>>16)&255);
}
equals(read(pcm24).getChannelData(0),[0x7fffff/8388608,-0.5]);
equals(read(pcm24).getChannelData(1),[-1,0.5]);

const pcm32=wave({channels:1,frames:2,bits:32});
pcm32.view.setInt32(pcm32.at,-2147483648,true);
pcm32.view.setInt32(pcm32.at+4,1073741824,true);
equals(read(pcm32).getChannelData(0),[-1,0.5]);

const floating=wave({channels:1,frames:2,format:3,bits:32});
floating.view.setFloat32(floating.at,-0.75,true);
floating.view.setFloat32(floating.at+4,0.125,true);
equals(read(floating).getChannelData(0),[-0.75,0.125]);
const float64=wave({channels:1,frames:2,format:3,bits:64});
float64.view.setFloat64(float64.at,-0.5,true);
float64.view.setFloat64(float64.at+8,0.25,true);
equals(read(float64).getChannelData(0),[-0.5,0.25]);

const extendedPcm=wave({channels:2,frames:2,bits:24,extensible:true});
new Uint8Array(extendedPcm.bytes).set(
 new Uint8Array(pcm24.bytes,pcm24.at,12),extendedPcm.at);
equals(read(extendedPcm).getChannelData(1),[-1,0.5]);
const extendedFloat=wave({channels:1,frames:2,format:3,bits:32,extensible:true});
extendedFloat.view.setFloat32(extendedFloat.at,0.625,true);
extendedFloat.view.setFloat32(extendedFloat.at+4,-0.25,true);
equals(read(extendedFloat).getChannelData(0),[0.625,-0.25]);

const differentCodec=wave({channels:1,frames:1,extensible:true});
differentCodec.view.setUint8(48,1);
assert.equal(read(differentCodec),null,'unknown extensible codec must not masquerade as PCM');
const badMask=wave({channels:2,frames:1,extensible:true,mask:4});
assert.throws(()=>read(badMask),/channel layout/);
const badValidBits=wave({channels:1,frames:1,extensible:true,validBits:33});
assert.throws(()=>read(badValidBits),/valid sample bit depth/);
const badFloatBits=wave({channels:1,frames:1,format:3,bits:32,extensible:true,validBits:24});
assert.throws(()=>read(badFloatBits),/Floating-point/);
const tooShortFmt=wave({channels:1,frames:1,extensible:true});
tooShortFmt.view.setUint16(36,21,true);
assert.throws(()=>read(tooShortFmt),/extensible format header/);
const invalidNumber=wave({channels:1,frames:1,format:3,bits:32});
invalidNumber.view.setFloat32(invalidNumber.at,NaN,true);
assert.throws(()=>read(invalidNumber),/invalid sample/);
const invalidByteRate=wave();
invalidByteRate.view.setUint32(28,1,true);
assert.throws(()=>read(invalidByteRate),/alignment/);
const unsupported=wave();
unsupported.view.setUint16(20,6,true);
assert.equal(read(unsupported),null,'unsupported compressed WAVE uses existing fallback');
assert.equal(readPcmWaveForNativeBuffer(new ArrayBuffer(4)),null);
assert.throws(()=>readPcmWaveForNativeBuffer(pcm16.bytes.slice(0,-1)),/truncated/);
const wrongRiffSize=wave();
wrongRiffSize.view.setUint32(4,wrongRiffSize.bytes.byteLength+20,true);
assert.throws(()=>read(wrongRiffSize),/truncated/);
const bogusData=wave();
bogusData.view.setUint32(bogusData.header+4,0xffffffff,true);
assert.throws(()=>read(bogusData),/truncated/);
const large=wave({channels:1,frames:1200001,bits:8});
assert.throws(()=>read(large),/too many samples/);
const extraTrailing=wave({channels:1,frames:2,bits:16});
const trailing=new Uint8Array(extraTrailing.bytes.byteLength+8);
trailing.set(new Uint8Array(extraTrailing.bytes));
trailing.fill(255,extraTrailing.bytes.byteLength);
assert.equal(readPcmWaveForNativeBuffer(trailing.buffer).length,2,
 'trailing data outside declared RIFF must not be parsed as audio');
console.log('Sounds PCM WAVE: 8/16/24/32-bit signed/unsigned, floating-point, extensible GUID, layout, corruption, immutable input and native bounds passed');
