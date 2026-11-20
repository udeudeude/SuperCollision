/* Sounds-only native buffer ingest. This reads uncompressed PCM sample values
 * directly from a RIFF/WAVE container without resampling, playback, editing,
 * filtering or a second synthesis engine. scsynth owns the actual audio buffer.
 * Unsupported formats still use the browser's decodeAudioData ingestion path. */
import {MAX_SAMPLES} from './sounds-buffer.mjs';
const fourCC=(view,offset)=>String.fromCharCode(...Array.from({length:4},(_,i)=>view.getUint8(offset+i)));
export function readPcmWaveForNativeBuffer(bytes){
 if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<12)return null;
 const view=new DataView(bytes),length=view.byteLength;
 if(fourCC(view,0)!=='RIFF'||fourCC(view,8)!=='WAVE')return null;
 if(view.getUint32(4,true)+8>length)throw Error('WAVE file is truncated.');
 let format=null,dataOffset=-1,dataLength=0;
 for(let offset=12;offset+8<=length;){
  const tag=fourCC(view,offset),size=view.getUint32(offset+4,true),start=offset+8;
  if(size>length-start)throw Error('WAVE chunk is truncated.');
  if(tag==='fmt '){
   if(size<16)throw Error('WAVE format header is incomplete.');
   format={encoding:view.getUint16(start,true),channels:view.getUint16(start+2,true),
    sampleRate:view.getUint32(start+4,true),blockAlign:view.getUint16(start+12,true),
    bits:view.getUint16(start+14,true)};
  }else if(tag==='data'&&dataOffset===-1){dataOffset=start;dataLength=size}
  offset=start+size+(size%2);
 }
 if(!format||dataOffset<0)throw Error('WAVE format or audio data is missing.');
 const {encoding,channels,sampleRate,blockAlign,bits}=format;
 if(!((encoding===1&&bits===16)||(encoding===3&&bits===32)))return null;
 if(channels<1||channels>2)throw Error('Only mono and stereo WAVE samples can be transferred.');
 if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>384000)
  throw Error('The WAVE sample rate is invalid.');
 if(blockAlign!==channels*bits/8||dataLength%blockAlign!==0)
  throw Error('WAVE sample alignment is invalid.');
 const frames=dataLength/blockAlign;
 if(frames<1||frames*channels>MAX_SAMPLES)throw Error('WAVE contains too many samples for native transfer.');
 const planar=Array.from({length:channels},()=>new Float32Array(frames));
 for(let frame=0;frame<frames;frame++){
  for(let channel=0;channel<channels;channel++){
   const offset=dataOffset+frame*blockAlign+channel*bits/8;
   const value=encoding===1?view.getInt16(offset,true)/32768:view.getFloat32(offset,true);
   if(!Number.isFinite(value))throw Error('WAVE contains an invalid sample.');
   planar[channel][frame]=value;
  }
 }
 return {sampleRate,numberOfChannels:channels,length:frames,getChannelData(channel){
  if(!Number.isInteger(channel)||channel<0||channel>=channels)throw RangeError('Invalid audio channel');
  return planar[channel];
 }};
}
