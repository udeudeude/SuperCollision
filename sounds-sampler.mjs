/* Native-only sample region and loop instruments for the isolated Sounds laboratory.
 * Browser code formats controls; SuperCollider does ALL playback and processing. */
const NAMES=Object.freeze({
  '1:false':'scSoundsMonoOnce', '1:true':'scSoundsMonoLoop',
  '2:false':'scSoundsStereoOnce', '2:true':'scSoundsStereoLoop'
});
function definition(channels,loop){
  const name=NAMES[channels+':'+loop];
  // Native /b_alloc buffers inherit the server sample rate, not the WAVE file's.
  // sourceRate restores the original timing without modifying any samples;
  // desktop Buffer.read leaves it zero and uses the buffer's own file rate.
  // Entire crossfade is calculated by SuperCollider. The incoming readhead
  // finishes at the phase reset position, avoiding a click at the wrap.
  const loopReader=
    '    var fadeFrames = (sourceFramesPerSecond * 0.012 * rate.clip(0.25, 2)).min((high - low) * 0.25).max(0.25);\n'+
    '    var phase = Phasor.ar(0, playbackRate, low + fadeFrames, high, low + fadeFrames);\n'+
    '    var seam = ((phase - (high - fadeFrames)) / fadeFrames).clip(0, 1) * 1.5707963267948966;\n'+
    '    var tail = BufRd.ar('+channels+', bufnum, phase, loop: 1, interpolation: 2);\n'+
    '    var head = BufRd.ar('+channels+', bufnum, phase - high + low + fadeFrames, loop: 1, interpolation: 2);\n'+
    '    var signal = (tail * seam.cos) + (head * seam.sin);\n';
  const onceReader='    var signal = PlayBuf.ar('+channels+', bufnum, playbackRate, startPos: low, loop: 0);\n';
  const stopEnvelope='EnvGen.kr(Env.asr(0.008, 1, 0.03), gate, doneAction: 2)';
  const envelope=loop ? stopEnvelope :
    '(progress / (0.006 / segmentSeconds).clip(0.01, 0.45)).clip(0, 1) * ((1 - progress) / (0.006 / segmentSeconds).clip(0.01, 0.45)).clip(0, 1) * '+stopEnvelope;
  const output=channels===1?'Pan2.ar(signal * amp * envelope)':'signal * amp * envelope';
  return 'SynthDef(\\'+name+', { |bufnum=0, amp=0.16, rate=1, start=0, finish=1, gate=1, sourceRate=0|\n'+
    '    var frames = BufFrames.kr(bufnum);\n'+
    '    var low = (start.clip(0, 0.99) * frames).clip(0, frames - 2);\n'+
    '    var high = (finish.clip(0.01, 1) * frames).clip(low + 1, frames);\n'+
    '    var sourceFramesPerSecond = Select.kr(sourceRate > 0, [BufSampleRate.kr(bufnum), sourceRate]);\n'+
    '    var playbackRate = Select.kr(sourceRate > 0, [BufRateScale.kr(bufnum), sourceRate / SampleRate.ir]) * rate.clip(0.25, 2);\n'+
    '    var segmentSeconds = ((finish - start).max(0.01) * frames / sourceFramesPerSecond / rate.clip(0.25, 2)).max(0.012);\n'+
    (loop?loopReader:onceReader)+
    (loop?'':'    var progress = Line.kr(0, 1, segmentSeconds, doneAction: 2);\n')+
    '    var envelope = '+envelope+';\n'+
    '    Out.ar(0, '+output+');\n'+
    '  }).add;';
}
export const REGION_DEFINITIONS='(\nRoutine({\n'+[1,2].flatMap(ch=>[false,true].map(loop=>definition(ch,loop))).join('\n')+
  '\n  s.sync;\n  "__SC_SOUNDS_LAB_DEFS__".postln;\n}).play(SystemClock);\n)';
/* Explicitly validated numbers only. No raw user text ever enters SuperCollider commands. */
export function validateRegion({bufferId,channels,start,finish,rate,amp,loop,sourceSampleRate=0}){
  if(!Number.isSafeInteger(bufferId)||bufferId<0||bufferId>1023)throw Error('Invalid native buffer identifier');
  if(channels!==1&&channels!==2)throw Error('Only mono and stereo samples are supported');
  if(!Number.isFinite(start)||!Number.isFinite(finish)||start<0||finish>1||finish-start<0.009999)
    throw Error('Region must span at least 1% of the sample.');
  if(!Number.isFinite(rate)||rate<0.25||rate>2)throw Error('Speed must be from 0.25× to 2×.');
  if(!Number.isFinite(amp)||amp<0||amp>0.5)throw Error('Volume must be between 0 and 50%.');
  if(typeof loop!=='boolean')throw Error('Invalid loop setting');
  if(!Number.isSafeInteger(sourceSampleRate)||sourceSampleRate<0||
     (sourceSampleRate>0&&(sourceSampleRate<8000||sourceSampleRate>384000)))
    throw Error('Invalid source sample rate');
  return {bufferId,channels,start,finish,rate,amp,loop,sourceSampleRate};
}
export function regionPlayCommand(options){
  const p=validateRegion(options);
  const def=NAMES[p.channels+':'+p.loop];
  return '~scSoundsLabPlayer.tryPerform(\\free); ~scSoundsLabPlayer = Synth(\\'+def+
    ', [\\bufnum, '+p.bufferId+', \\amp, '+p.amp+', \\rate, '+p.rate+
    ', \\start, '+p.start+', \\finish, '+p.finish+', \\sourceRate, '+p.sourceSampleRate+']);';
}
/* The exact native synthesis definition and invocation shown in the editable
 * Sample Lab source editor. Unlike a control-only command, this includes the
 * real DSP graph; user edits are compiled in SuperCollider before playback.
 * Routine/s.sync guarantees that the definition is installed before Synth. */
export function regionLiveSource(options){
 const p=validateRegion(options);
 return '(\nRoutine({\n'+definition(p.channels,p.loop)+'\n  s.sync;\n  '+
   regionPlayCommand(p)+'\n}).play(SystemClock);\n)';
}
export const stopRegionCommand='~scSoundsLabPlayer.tryPerform(\\set, \\gate, 0); ~scSoundsLabPlayer = nil;';

/* A short native SuperCollider audition that needs neither a recording nor
 * a browser audio oscillator. The displayed source is the source we execute.
 * The marker is emitted only after s.sync and the native Synth request. */
export const DEMO_MARKER='__SC_SOUNDS_LAB_DEMO__';
export function demoSynthSource({frequency=440,amplitude=0.16}={}){
 if(!Number.isSafeInteger(frequency)||frequency<150||frequency>1000)
  throw Error('Demo pitch must be between 150 and 1000 Hz.');
 if(!Number.isFinite(amplitude)||amplitude<0.05||amplitude>0.25)
  throw Error('Demo volume must be between 0.05 and 0.25.');
 return '(\nRoutine({\n'+
  '  SynthDef(\\scSoundsDemo, { |freq=440, amp=0.16|\n'+
  '    var envelope = EnvGen.kr(Env.perc(0.01, 1.2), doneAction: 2);\n'+
  '    var tone = SinOsc.ar(freq) * envelope * amp;\n'+
  '    Out.ar(0, Pan2.ar(tone));\n'+
  '  }).add;\n'+
  '  s.sync;\n'+
  '  Synth(\\scSoundsDemo, [\\freq, '+frequency+', \\amp, '+Number(amplitude.toFixed(2))+']);\n'+
  '  "'+DEMO_MARKER+'".postln;\n'+
  '}).play(SystemClock);\n)';
}
/* Export a standalone SuperCollider script for a user-supplied copy of the
 * original audio. A sound preset never embeds audio or assumes browser
 * IndexedDB paths are readable by a desktop SuperCollider server. */
function scComment(value){
 return String(value??'').replace(/[\r\n\u2028\u2029\t\x00-\x1f\x7f]+/g,' ').trim().slice(0,500);
}
export function sampleInstrumentSource(settings,{name='Sound',origin=null}={}){
 const p=validateRegion({bufferId:0,...settings});
 const def=NAMES[p.channels+':'+p.loop];
 const header=[
  '// SuperCollision Sounds - native SuperCollider sample instrument',
  '// Source sound: '+scComment(name),
  '// Audio is NOT embedded. Export the original separately from Sounds Library.',
  '// Select that original audio file when the desktop SuperCollider file dialog opens.',
  '// Source file must have '+p.channels+' channel(s).',
 ];
 if(origin){
  for(const [label,value] of [['Creator',origin.creator],['License',origin.license],
    ['Original URL',origin.url],['License URL',origin.licenseUrl],['Attribution',origin.attribution]]){
   if(value)header.push('// '+label+': '+scComment(value));
  }
 }
 const lines=[
  '(',
  'Dialog.openPanel({ |path|',
  '  s.waitForBoot({',
  definition(p.channels,p.loop),
  '    s.sync;',
  '    Buffer.read(s, path, action: { |loaded|',
  '      if(loaded.numChannels != '+p.channels+') {',
  '        ("Expected '+p.channels+' audio channel(s); selected file has " ++ loaded.numChannels).warn;',
  '        loaded.free;',
  '      } {',
  '        ~scSoundsExportPlayer.tryPerform(\\free);',
  '        ~scSoundsExportBuffer.tryPerform(\\free);',
  '        ~scSoundsExportBuffer = loaded;',
  '        ~scSoundsExportPlayer = Synth(\\'+def+', [\\bufnum, loaded.bufnum, \\amp, '+p.amp+
    ', \\rate, '+p.rate+', \\start, '+p.start+', \\finish, '+p.finish+']);',
  '      };',
  '    });',
  '  });',
  '}, { "No audio file selected.".postln; });',
  ')',
  '',
  '// Stop: ~scSoundsExportPlayer.tryPerform(\\set, \\gate, 0);',
  '// Free buffer after stopping: ~scSoundsExportBuffer.tryPerform(\\free);',
  ''
 ];
 return header.join('\n')+'\n\n'+lines.join('\n');
}
