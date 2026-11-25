/* Isolated preview-only SuperCollider voice and pitch catalogs.
   No JavaScript synthesis or browser-generated audio. */
export const toneDefaults=Object.freeze({
 frequency:440,amplitude:0.16,waveform:0,pulseWidth:0.5,cutoff:3200,
 resonance:0.4,attack:0.01,release:1.2,vibratoHz:0,vibratoDepth:0,
 detune:0,echoMix:0
});
export const toneControls=Object.freeze([
 {key:'frequency',name:'PITCH',min:25,max:8000,step:0.01,unit:'Hz'},
 {key:'amplitude',name:'LEVEL',min:0,max:0.25,step:0.005,unit:'%'},
 {key:'waveform',name:'OSCILLATOR',values:['Sine','Triangle','Saw','Pulse']},
 {key:'cutoff',name:'FILTER',min:80,max:12000,step:10,unit:'Hz'},
 {key:'resonance',name:'RESONANCE',min:0.05,max:0.95,step:0.01},
 {key:'pulseWidth',name:'PULSE WIDTH',min:0.05,max:0.95,step:0.01},
 {key:'attack',name:'ATTACK',min:0.005,max:2,step:0.005,unit:'s'},
 {key:'release',name:'RELEASE',min:0.05,max:5,step:0.01,unit:'s'},
 {key:'vibratoHz',name:'VIBRATO RATE',min:0,max:12,step:0.1,unit:'Hz'},
 {key:'vibratoDepth',name:'VIBRATO DEPTH',min:0,max:1,step:0.01,unit:'semi'},
 {key:'detune',name:'DETUNE',min:-25,max:25,step:0.5,unit:'cent'},
 {key:'echoMix',name:'ECHO',min:0,max:0.65,step:0.01,unit:'%'}
]);
export function normalizeToneSettings(source={}){
 const result={};
 for(const control of toneControls){
  let value=Number(source[control.key]??toneDefaults[control.key]);
  if(!Number.isFinite(value))throw Error('Invalid '+control.name);
  if(control.values){
   if(!Number.isInteger(value)||value<0||value>=control.values.length)throw Error('Invalid '+control.name);
  }else if(value<control.min||value>control.max)throw Error(control.name+' outside supported range');
  result[control.key]=value;
 }
 return result;
}
export function demoSynthSource(settings={}){
 const p=normalizeToneSettings(settings);
 const scalar=x=>String(Number(x.toFixed(4)));
 const lines=[
  '(',
  'Routine({',
  '  SynthDef(\\scSoundsDemo, { |freq=440, amp=0.16, wave=0, cutoff=3200, rq=0.4, pw=0.5, attack=0.01, release=1.2, vibratoHz=0, vibrato=0, detune=0, echoMix=0|',
  '    var pitch, raw, envelope, filtered, voice, echo;',
  '    pitch = freq * (2 ** (detune / 1200)) * (2 ** (SinOsc.kr(vibratoHz) * vibrato / 12));',
  '    raw = Select.ar(wave, [SinOsc.ar(pitch), LFTri.ar(pitch), Saw.ar(pitch), Pulse.ar(pitch, pw)]);',
  '    filtered = RLPF.ar(raw, cutoff.clip(80, 12000), rq.clip(0.05, 0.95));',
  '    envelope = EnvGen.kr(Env.perc(attack, release), doneAction: 2);',
  '    voice = filtered * envelope * amp;',
  '    echo = CombC.ar(voice, 0.5, 0.18, 1.4) * echoMix;',
  '    Out.ar(0, Pan2.ar(voice + echo));',
  '  }).add;',
  '  s.sync;',
  '  Synth(\\scSoundsDemo, [',
  '    \\freq, '+scalar(p.frequency)+',',
  '    \\amp, '+scalar(p.amplitude)+',',
  '    \\wave, '+p.waveform+',',
  '    \\cutoff, '+scalar(p.cutoff)+',',
  '    \\rq, '+scalar(p.resonance)+',',
  '    \\pw, '+scalar(p.pulseWidth)+',',
  '    \\attack, '+scalar(p.attack)+',',
  '    \\release, '+scalar(p.release)+',',
  '    \\vibratoHz, '+scalar(p.vibratoHz)+',',
  '    \\vibrato, '+scalar(p.vibratoDepth)+',',
  '    \\detune, '+scalar(p.detune)+',',
  '    \\echoMix, '+scalar(p.echoMix),
  '  ]);',
  '  "__SC_SOUNDS_LAB_DEMO__".postln;',
  '}).play(SystemClock);',
  ')'
 ];
 return lines.join('\n');
}
const chromatic=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const midiFrequency=n=>440*Math.pow(2,(n-69)/12);
function item(label,hz,detail=''){
 return {label,frequency:Number(hz.toFixed(2)),detail};
}
function cycles(steps,label,root=261.625565){
 const out=[];
 for(let oct=-2;oct<=3;oct++)for(let i=0;i<steps.length;i++){
  const hz=root*Math.pow(2,oct)*steps[i].ratio;
  if(hz>=25&&hz<=8000)out.push(item(label(i,oct+4),hz,steps[i].detail||''));
 }
 return out;
}
const just=[
 [1,'1/1'],[16/15,'16/15'],[9/8,'9/8'],[6/5,'6/5'],
 [5/4,'5/4'],[4/3,'4/3'],[45/32,'45/32'],[3/2,'3/2'],
 [8/5,'8/5'],[5/3,'5/3'],[9/5,'9/5'],[15/8,'15/8']
].map(([ratio,detail])=>({ratio,detail}));
const rast=[
 [0,'Rast'],[200,'Dukah'],[350,'Sikah'],[500,'Jaharkah'],
 [700,'Nawa'],[900,'Husayni'],[1050,'Awj']
].map(([cents,name])=>({ratio:Math.pow(2,cents/1200),detail:name}));
const bhairav=[
 [0,'Sa'],[100,'komal Re'],[400,'Ga'],[500,'Ma'],
 [700,'Pa'],[800,'komal Dha'],[1100,'Ni']
].map(([cents,name])=>({ratio:Math.pow(2,cents/1200),detail:name}));
export const tuningOptions=Object.freeze([
 {value:'western',label:'12-tone equal',info:'Chromatic Western note names; A4 = 440 Hz.'},
 {value:'rast',label:'Maqam Rast · approx.',info:'Rast on C, using 24-division approximations of microtonal degrees. Actual performance intonation varies.'},
 {value:'bhairav',label:'Raga Bhairav · approx.',info:'Hindustani swara positions shown with a 12-tone approximation, not a prescribed raga intonation.'},
 {value:'just',label:'5-limit just intonation',info:'Simple rational frequency ratios relative to C.'},
 {value:'nineteen',label:'19 equal divisions',info:'19 equally spaced steps per octave.'},
 {value:'twentyfour',label:'24 equal divisions',info:'24 equally spaced steps per octave.'},
 {value:'bohlen',label:'Bohlen–Pierce',info:'13 equal steps in a 3:1 tritave rather than an octave.'},
 {value:'harmonics',label:'Harmonic series',info:'Integer multiples of a 110 Hz fundamental.'}
]);
export function notesForTuning(tuning='western'){
 if(tuning==='western')return Array.from({length:73},(_,i)=>{
  const midi=i+36;return item(chromatic[midi%12]+(Math.floor(midi/12)-1),midiFrequency(midi));
 });
 if(tuning==='rast')return cycles(rast,(i,oct)=>rast[i].detail+' · '+oct);
 if(tuning==='bhairav')return cycles(bhairav,(i,oct)=>bhairav[i].detail+' · '+oct);
 if(tuning==='just')return cycles(just,(i,oct)=>chromatic[i] +oct);
 if(tuning==='nineteen'||tuning==='twentyfour'){
  const n=tuning==='nineteen'?19:24,out=[];
  for(let i=0;i<n*6;i++){
   const hz=65.406391*Math.pow(2,i/n);
   if(hz<=8000)out.push(item('STEP '+String(i%n+1).padStart(2,'0')+' · '+(Math.floor(i/n)+2),hz));
  }
  return out;
 }
 if(tuning==='bohlen'){
  const out=[];
  for(let i=0;i<=48;i++){const hz=110*Math.pow(3,i/13);if(hz<=8000)out.push(item('BP '+String(i).padStart(2,'0'),hz));}
  return out;
 }
 if(tuning==='harmonics')return Array.from({length:72},(_,i)=>item('HARMONIC '+(i+1),110*(i+1))).filter(n=>n.frequency<=8000);
 throw Error('Unknown tuning');
}