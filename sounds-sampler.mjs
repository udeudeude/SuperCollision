/* Native-only sample region and loop instruments for the isolated Sounds laboratory.
 * Browser code formats controls; SuperCollider does ALL playback and processing. */
const NAMES=Object.freeze({
  '1:false':'scSoundsMonoOnce', '1:true':'scSoundsMonoLoop',
  '2:false':'scSoundsStereoOnce', '2:true':'scSoundsStereoLoop'
});
function definition(channels,loop){
  const name=NAMES[channels+':'+loop];
  const reader=loop
    ? 'BufRd.ar('+channels+', bufnum, Phasor.ar(0, playbackRate, low, high, low), loop: 1, interpolation: 2)'
    : 'PlayBuf.ar('+channels+', bufnum, playbackRate, startPos: low, loop: 0)';
  const stopEnvelope='EnvGen.kr(Env.asr(0.008, 1, 0.03), gate, doneAction: 2)';
  const envelope=loop ? stopEnvelope :
    '(progress / (0.006 / segmentSeconds).clip(0.01, 0.45)).clip(0, 1) * ((1 - progress) / (0.006 / segmentSeconds).clip(0.01, 0.45)).clip(0, 1) * '+stopEnvelope;
  const output=channels===1?'Pan2.ar(signal * amp * envelope)':'signal * amp * envelope';
  return 'SynthDef(\\'+name+', { |bufnum=0, amp=0.16, rate=1, start=0, finish=1, gate=1|\n'+
    '    var frames = BufFrames.kr(bufnum);\n'+
    '    var low = (start.clip(0, 0.99) * frames).clip(0, frames - 2);\n'+
    '    var high = (finish.clip(0.01, 1) * frames).clip(low + 1, frames);\n'+
    '    var playbackRate = BufRateScale.kr(bufnum) * rate.clip(0.25, 2);\n'+
    '    var segmentSeconds = ((finish - start).max(0.01) * BufDur.kr(bufnum) / rate.clip(0.25, 2)).max(0.012);\n'+
    '    var signal = '+reader+';\n'+
    (loop?'':'    var progress = Line.kr(0, 1, segmentSeconds, doneAction: 2);\n')+
    '    var envelope = '+envelope+';\n'+
    '    Out.ar(0, '+output+');\n'+
    '  }).add;';
}
export const REGION_DEFINITIONS='(\nRoutine({\n'+[1,2].flatMap(ch=>[false,true].map(loop=>definition(ch,loop))).join('\n')+
  '\n  s.sync;\n  "__SC_SOUNDS_LAB_DEFS__".postln;\n}).play(SystemClock);\n)';
/* Explicitly validated numbers only. No raw user text ever enters SuperCollider commands. */
export function validateRegion({bufferId,channels,start,finish,rate,amp,loop}){
  if(!Number.isSafeInteger(bufferId)||bufferId<0||bufferId>1023)throw Error('Invalid native buffer identifier');
  if(channels!==1&&channels!==2)throw Error('Only mono and stereo samples are supported');
  if(!Number.isFinite(start)||!Number.isFinite(finish)||start<0||finish>1||finish-start<0.01)
    throw Error('Region must span at least 1% of the sample.');
  if(!Number.isFinite(rate)||rate<0.25||rate>2)throw Error('Speed must be from 0.25× to 2×.');
  if(!Number.isFinite(amp)||amp<0||amp>0.5)throw Error('Volume must be between 0 and 50%.');
  if(typeof loop!=='boolean')throw Error('Invalid loop setting');
  return {bufferId,channels,start,finish,rate,amp,loop};
}
export function regionPlayCommand(options){
  const p=validateRegion(options);
  const def=NAMES[p.channels+':'+p.loop];
  return '~scSoundsLabPlayer.tryPerform(\\free); ~scSoundsLabPlayer = Synth(\\'+def+
    ', [\\bufnum, '+p.bufferId+', \\amp, '+p.amp+', \\rate, '+p.rate+
    ', \\start, '+p.start+', \\finish, '+p.finish+']);';
}
export const stopRegionCommand='~scSoundsLabPlayer.tryPerform(\\set, \\gate, 0); ~scSoundsLabPlayer = nil;';
