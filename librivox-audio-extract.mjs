/** Browser-local, non-destructive audio extraction for LibriVox recordings.
 * The chapter is fetched only after explicit user action, with a transfer cap.
 * MP3 frame scanning avoids decoding hours of audio merely to extract seconds.
 */
export const MAX_SOURCE_BYTES = 80 * 1024 * 1024;
export const MAX_CLIP_SECONDS = 180;
const mp3Bitrates = {
  3: [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320],
  2: [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160],
};

function frameHeader(bytes, offset) {
  if (offset+4 > bytes.length || bytes[offset]!==255 || (bytes[offset+1]&0xe0)!==0xe0) return null;
  const version=(bytes[offset+1]>>3)&3, layer=(bytes[offset+1]>>1)&3;
  if (version===1 || layer!==1) return null; // MPEG 1/2/2.5 Layer III only
  const rateIndex=(bytes[offset+2]>>2)&3, bitrateIndex=(bytes[offset+2]>>4)&15;
  if(rateIndex===3 || bitrateIndex===0 || bitrateIndex===15) return null;
  const sampleRates=[44100,48000,32000];
  const sampleRate=sampleRates[rateIndex]/(version===3?1:version===2?2:4);
  const bitrate=mp3Bitrates[version===3?3:2][bitrateIndex]*1000;
  const padding=(bytes[offset+2]>>1)&1;
  const frameLength=Math.floor((version===3?144:72)*bitrate/sampleRate)+padding;
  if(frameLength<24 || offset+frameLength>bytes.length) return null;
  return {offset,frameLength,sampleRate,samples:version===3?1152:576,version};
}
function id3Size(bytes) {
  if(bytes.length<10 || String.fromCharCode(...bytes.subarray(0,3))!=='ID3')return 0;
  const s=bytes.subarray(6,10);
  if(s.some(b=>b&0x80))return 0;
  return 10 + ((s[0]<<21)|(s[1]<<14)|(s[2]<<7)|s[3]) + ((bytes[5]&0x10)?10:0);
}
export function scanMp3Frames(source) {
  const bytes=source instanceof Uint8Array?source:new Uint8Array(source);
  const frames=[]; let i=id3Size(bytes), sampleCursor=0, rate=0, resync=0;
  while(i+4<=bytes.length) {
    const header=frameHeader(bytes,i);
    if(!header || (rate && header.sampleRate!==rate)) {
      if(!frames.length || resync<4096){i++;resync++;continue;}
      break;
    }
    if(!frames.length){
      // Reject a false sync word embedded in tag data or unrelated binary.
      const next=frameHeader(bytes,i+header.frameLength);
      if(!next || next.sampleRate!==header.sampleRate){i++;continue;}
      rate=header.sampleRate;
    }
    frames.push({...header,sampleStart:sampleCursor});
    sampleCursor+=header.samples;i+=header.frameLength;resync=0;
  }
  return {frames,sampleRate:rate,duration:rate?sampleCursor/rate:0};
}
function findFrameAt(frames,seconds,sampleRate){
  const target=Math.max(0,Math.floor(seconds*sampleRate));
  let low=0,high=frames.length-1,found=0;
  while(low<=high){const mid=(low+high)>>1;if(frames[mid].sampleStart<=target){found=mid;low=mid+1;}else high=mid-1;}
  return found;
}
function assertRegion(start,end) {
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw new Error('Set an end time after the start time.');
  if(end-start>MAX_CLIP_SECONDS)throw new Error('Choose a region no longer than three minutes.');
}
export function encodeWavRegion(buffer,startSeconds,endSeconds) {
  const sampleRate=buffer.sampleRate,channels=buffer.numberOfChannels;
  if(!Number.isFinite(sampleRate)||sampleRate<=0||channels<1||channels>2)throw Error('This recording needs a supported mono or stereo audio track.');
  assertRegion(startSeconds,endSeconds);
  const start=Math.max(0,Math.round(startSeconds*sampleRate));
  const end=Math.min(buffer.length,Math.round(endSeconds*sampleRate));
  const frames=end-start;
  if(frames<=0)throw Error('The selected region is outside the decoded audio.');
  const bytes=44+frames*channels*2;
  if(bytes>40*1024*1024)throw Error('The selected WAV would be too large. Shorten the sample.');
  const output=new ArrayBuffer(bytes),view=new DataView(output);
  const ascii=(at,s)=>{for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i));};
  ascii(0,'RIFF');view.setUint32(4,bytes-8,true);ascii(8,'WAVE');ascii(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);
  view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*channels*2,true);
  view.setUint16(32,channels*2,true);view.setUint16(34,16,true);
  ascii(36,'data');view.setUint32(40,bytes-44,true);
  const tracks=Array.from({length:channels},(_,c)=>buffer.getChannelData(c));
  const fadeSamples=Math.min(Math.floor(sampleRate*0.003),Math.floor(frames/2));
  let offset=44;
  for(let f=0;f<frames;f++){
    const fade=fadeSamples?Math.min(1,(f+1)/fadeSamples,(frames-f)/fadeSamples):1;
    for(let c=0;c<channels;c++){
      const v=Math.max(-1,Math.min(1,(tracks[c][start+f]||0)*fade));
      view.setInt16(offset,v<0?Math.round(v*32768):Math.round(v*32767),true);offset+=2;
    }
  }
  return new Blob([output],{type:'audio/wav'});
}
export async function extractWavFromSource(source, {start,end,decodeAudioData}={}) {
  assertRegion(start,end);
  if(typeof decodeAudioData!=='function')throw Error('Audio decoding is unavailable in this browser.');
  const blob=source instanceof Blob?source:new Blob([source]);
  if(blob.size>MAX_SOURCE_BYTES)throw Error('The chapter exceeds the 80 MB safe transfer limit. Use a smaller chapter recording.');
  const bytes=new Uint8Array(await blob.arrayBuffer());
  const scan=scanMp3Frames(bytes);
  let decodeBytes=bytes.buffer,relativeStart=start,relativeEnd=end,mode='full-file';
  if(scan.frames.length>2 && scan.sampleRate){
    // About 0.6 s preroll supplies the Layer III bit reservoir, rather than
    // decoding the whole audiobook chapter into uncompressed browser memory.
    const first=scan.frames[findFrameAt(scan.frames,Math.max(0,start-0.65),scan.sampleRate)];
    const last=scan.frames[findFrameAt(scan.frames,end+0.2,scan.sampleRate)];
    const sliceEnd=last.offset+last.frameLength;
    decodeBytes=bytes.slice(first.offset,sliceEnd).buffer;
    relativeStart=start-first.sampleStart/scan.sampleRate;
    relativeEnd=end-first.sampleStart/scan.sampleRate;
    mode='mp3-window';
  }else if(blob.size>20*1024*1024){
    throw Error('This recording is not a recognizable MP3 and is too large to decode safely. Choose a smaller local recording.');
  }
  // AudioBuffer decoding cannot operate directly on a Blob, and some browser
  // decoders consume their ArrayBuffer argument. Each invocation owns its copy.
  let decoded;
  try { decoded=await decodeAudioData(decodeBytes); }
  catch(error){
    if(mode==='mp3-window' && blob.size<14*1024*1024){
      decoded=await decodeAudioData(bytes.slice().buffer);relativeStart=start;relativeEnd=end;mode='full-file';
    }else throw new Error('Could not decode the selected audio window in this browser. Try downloading the chapter as an MP3 and choosing it as a local file.');
  }
  const wav=encodeWavRegion(decoded,relativeStart,relativeEnd);
  return {blob:wav,method:mode,seconds:wav.size>44?(wav.size-44)/(decoded.numberOfChannels*2*decoded.sampleRate):0,sampleRate:decoded.sampleRate,channels:decoded.numberOfChannels};
}
export async function fetchRecording(url,{signal,onProgress,maxBytes=MAX_SOURCE_BYTES}={}){
  const u=new URL(url);
  if(u.protocol!=='https:')throw Error('The chapter must use a secure HTTPS link.');
  const response=await fetch(u.href,{signal,mode:'cors',redirect:'follow'});
  if(!response.ok)throw Error(`Chapter download failed (${response.status}).`);
  const total=Number(response.headers.get('content-length'))||0;
  if(total>maxBytes)throw Error('This chapter exceeds the 80 MB download limit.');
  if(!response.body){const blob=await response.blob();if(blob.size>maxBytes)throw Error('This chapter exceeds the download limit.');return blob;}
  const reader=response.body.getReader(),chunks=[];let loaded=0;
  try{
    while(true){const part=await reader.read();if(part.done)break;
      loaded+=part.value.byteLength;
      if(loaded>maxBytes){await reader.cancel();throw Error('Stopped: chapter exceeds the 80 MB download limit.');}
      chunks.push(part.value);
      if(onProgress)onProgress(loaded,total);
    }
  }finally{reader.releaseLock();}
  return new Blob(chunks,{type:response.headers.get('content-type')||'audio/mpeg'});
}