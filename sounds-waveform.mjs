/* Read-only waveform summary for the Sounds UI.
 * Computes display peaks only: no audio is changed, mixed or played here. */
export function waveformPeaks(audio,columns=480){
  const frames=audio?.length,channels=audio?.numberOfChannels;
  if(!Number.isSafeInteger(frames)||frames<1||!Number.isSafeInteger(channels)||channels<1||channels>2||typeof audio.getChannelData!=='function')
    throw Error('Valid mono or stereo decoded audio is required for waveform display.');
  if(!Number.isSafeInteger(columns)||columns<1||columns>2048)throw Error('Invalid waveform display width.');
  const count=Math.min(columns,frames);
  const samples=Array.from({length:channels},(_,channel)=>audio.getChannelData(channel));
  const peaks=[];
  for(let column=0;column<count;column++){
    const from=Math.floor(column*frames/count);
    const to=Math.max(from+1,Math.floor((column+1)*frames/count));
    let low=0,high=0;
    for(let frame=from;frame<to;frame++){
      for(const data of samples){
        const value=data[frame];
        if(Number.isFinite(value)){
          low=Math.min(low,value);
          high=Math.max(high,value);
        }
      }
    }
    peaks.push([Math.max(-1,low),Math.min(1,high)]);
  }
  return peaks;
}
export function waveformDragRegion(first,last){
  const pct=value=>Math.round(Math.max(0,Math.min(1,Number.isFinite(value)?value:0))*100);
  const a=pct(first),b=pct(last);
  const start=Math.min(a,b),finish=Math.max(a,b);
  return {start:Math.min(99,start),finish:Math.min(100,Math.max(start+1,finish))};
}
