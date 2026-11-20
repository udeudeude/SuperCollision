/* Sounds-only read-only WAVE ingestion for verified native SuperCollider buffers.
 * Extract original sample values without resampling, filtering, editing or
 * playback. Native scsynth remains the only sound engine. Other containers
 * and unsupported WAVE encodings use the existing browser decode fallback. */
import {MAX_SAMPLES} from './sounds-buffer.mjs';

const fourCC=(view,offset)=>String.fromCharCode(
 ...Array.from({length:4},(_,i)=>view.getUint8(offset+i)));
const PCM_GUID_TAIL=[0,0,16,0,128,0,0,170,0,56,155,113];
function waveEncoding(view,start,size){
 let encoding=view.getUint16(start,true),validBits=view.getUint16(start+14,true);
 if(encoding!==0xfffe)return {encoding,validBits};
 // WAVE_FORMAT_EXTENSIBLE uses a 16-byte SubFormat GUID. Never interpret an
 // unknown codec as ordinary PCM merely because its low bits happen to match.
 if(size<40||view.getUint16(start+16,true)<22||
    view.getUint16(start+16,true)>size-18)
  throw Error('WAVE extensible format header is incomplete.');
 const subformat=start+24;
 if(PCM_GUID_TAIL.some((byte,i)=>view.getUint8(subformat+4+i)!==byte))
  return {encoding:0xffff,validBits};
 encoding=view.getUint32(subformat,true);
 validBits=view.getUint16(start+18,true);
 if(validBits<1||validBits>view.getUint16(start+14,true))
  throw Error('WAVE valid sample bit depth is invalid.');
 const mask=view.getUint32(start+20,true);
 const channels=view.getUint16(start+2,true);
 if(mask&&mask.toString(2).replace(/0/g,'').length!==channels)
  throw Error('WAVE channel layout does not match its channel count.');
 return {encoding,validBits};
}
function sampleValue(view,offset,encoding,bits){
 if(encoding===3){
  return bits===32?view.getFloat32(offset,true):view.getFloat64(offset,true);
 }
 if(bits===8)return (view.getUint8(offset)-128)/128;
 if(bits===16)return view.getInt16(offset,true)/32768;
 if(bits===24){
  const n=view.getUint8(offset)|(view.getUint8(offset+1)<<8)|
   (view.getUint8(offset+2)<<16);
  return (n<<8>>8)/8388608;
 }
 return view.getInt32(offset,true)/2147483648;
}
export function readPcmWaveForNativeBuffer(bytes){
 if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<12)return null;
 const view=new DataView(bytes),length=view.byteLength;
 if(fourCC(view,0)!=='RIFF'||fourCC(view,8)!=='WAVE')return null;
 const declaredSize=view.getUint32(4,true),end=declaredSize+8;
 if(declaredSize<4||end>length)throw Error('WAVE file is truncated.');
 let format=null,dataOffset=-1,dataLength=0;
 for(let offset=12;offset+8<=end;){
  const tag=fourCC(view,offset),size=view.getUint32(offset+4,true),start=offset+8;
  if(size>end-start)throw Error('WAVE chunk is truncated.');
  if(tag==='fmt '){
   if(format)throw Error('WAVE contains duplicate format headers.');
   if(size<16)throw Error('WAVE format header is incomplete.');
   const {encoding,validBits}=waveEncoding(view,start,size);
   format={encoding,validBits,channels:view.getUint16(start+2,true),
    sampleRate:view.getUint32(start+4,true),byteRate:view.getUint32(start+8,true),
    blockAlign:view.getUint16(start+12,true),bits:view.getUint16(start+14,true)};
  }else if(tag==='data'&&dataOffset===-1){dataOffset=start;dataLength=size}
  offset=start+size+(size%2);
 }
 if(!format||dataOffset<0)throw Error('WAVE format or audio data is missing.');
 const {encoding,channels,sampleRate,blockAlign,byteRate,bits,validBits}=format;
 if(!((encoding===1&&[8,16,24,32].includes(bits))||
      (encoding===3&&[32,64].includes(bits))))return null;
 if(channels<1||channels>2)
  throw Error('Only mono and stereo WAVE samples can be transferred.');
 if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>384000)
  throw Error('The WAVE sample rate is invalid.');
 if(blockAlign!==channels*bits/8||byteRate!==sampleRate*blockAlign||
    dataLength%blockAlign!==0)
  throw Error('WAVE sample alignment is invalid.');
 if(encoding===3&&validBits!==bits)
  throw Error('Floating-point WAVE bit depth is invalid.');
 // PCM extensible stores valid bits left-justified in its container, so
 // dividing by the container's full-scale denominator is correct.
 const frames=dataLength/blockAlign;
 if(frames<1||frames*channels>MAX_SAMPLES)
  throw Error('WAVE contains too many samples for native transfer.');
 const planar=Array.from({length:channels},()=>new Float32Array(frames));
 for(let frame=0;frame<frames;frame++){
  for(let channel=0;channel<channels;channel++){
   const offset=dataOffset+frame*blockAlign+channel*bits/8;
   const value=sampleValue(view,offset,encoding,bits);
   if(!Number.isFinite(value)||Math.abs(value)>3.4028234663852886e38)
    throw Error('WAVE contains an invalid sample.');
   planar[channel][frame]=value;
  }
 }
 return {sampleRate,numberOfChannels:channels,length:frames,getChannelData(channel){
  if(!Number.isInteger(channel)||channel<0||channel>=channels)
   throw RangeError('Invalid audio channel');
  return planar[channel];
 }};
}
