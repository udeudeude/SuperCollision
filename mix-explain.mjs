/* Source-grounded visual vocabulary for Mix.
 * A SuperCollider source file cannot, by itself, provide a trustworthy audio
 * waveform or a fully compiled unit-generator graph. These are syntactic
 * observations, with explicit limits, never synthesized "measurements".
 */
import {indexSource} from './live-activity.mjs';

const roles = {
  source: 'SOUND SOURCE', modulation: 'MODULATION', envelope: 'ENVELOPE',
  filter: 'FILTER', space: 'SPACE / DELAY', output: 'OUTPUT', process: 'PROCESS'
};
const descriptions = new Map(Object.entries({
  SinOsc:'Sine-wave oscillator', FSinOsc:'Fast sine-wave oscillator',
  Saw:'Sawtooth oscillator', LFSaw:'Sawtooth oscillator',
  VarSaw:'Variable-width sawtooth oscillator', Pulse:'Pulse-wave oscillator',
  LFPulse:'Pulse oscillator', LFTri:'Triangle oscillator', Formant:'Formant oscillator',
  PMOsc:'Phase-modulated oscillator', Blip:'Band-limited impulse oscillator',
  WhiteNoise:'White noise generator', PinkNoise:'Pink noise generator',
  BrownNoise:'Brown noise generator', Dust:'Random impulses',
  Impulse:'Repeated impulses', PlayBuf:'Audio-buffer playback',
  BufRd:'Audio-buffer reading', GrainBuf:'Grains from a buffer',
  GrainIn:'Granular input', SoundIn:'Audio input', In:'Audio-bus input',
  EnvGen:'Envelope generator', Linen:'Amplitude envelope',
  Line:'Linear change', XLine:'Exponential change', Decay:'Decay envelope',
  Decay2:'Attack-and-decay envelope', Lag:'Smoothing',
  LPF:'Low-pass filter', HPF:'High-pass filter', BPF:'Band-pass filter',
  BRF:'Band-reject filter', RLPF:'Resonant low-pass filter',
  RHPF:'Resonant high-pass filter', Resonz:'Resonant filter',
  MoogFF:'Ladder-style filter', LeakDC:'Remove direct-current offset',
  FreeVerb:'Reverberation', GVerb:'Reverberation', DelayN:'Delay',
  DelayL:'Interpolated delay', DelayC:'Cubic-interpolated delay',
  CombN:'Comb delay', AllpassN:'All-pass delay',
  Pan2:'Stereo panning', Balance2:'Stereo balance', Splay:'Stereo spreading',
  Out:'Write signal to an audio/control bus', OffsetOut:'Offset-aligned bus output',
  ReplaceOut:'Replace bus output', XOut:'Crossfaded bus output'
}));
const sources = /^(?:SinOsc|FSinOsc|Saw|LFSaw|VarSaw|Pulse|LFPulse|LFTri|Formant|PMOsc|Blip|WhiteNoise|PinkNoise|BrownNoise|Dust|Impulse|PlayBuf|BufRd|GrainBuf|GrainIn|SoundIn|In)$/;
const envelopes = /^(?:EnvGen|Linen|Line|XLine|Decay|Decay2|Lag)$/;
const filters = /^(?:LPF|HPF|BPF|BRF|RLPF|RHPF|Resonz|MoogFF|LeakDC|BLowPass|BHiPass|BPeakEQ)$/;
const effects = /^(?:FreeVerb|GVerb|DelayN|DelayL|DelayC|CombN|AllpassN|Pan2|Balance2|Splay)$/;
const outs = /^(?:Out|OffsetOut|ReplaceOut|XOut)$/;

function masked(text) {
  // Preserve lengths, even for strings and nested block comments.
  const out=text.split(''); let state='code',depth=0;
  const blank=i=>{if(text[i]!=='\n'&&text[i]!=='\r')out[i]=' '};
  for(let i=0;i<text.length;i++){
    const ch=text[i],nx=text[i+1];
    if(state==='line'){if(ch==='\n')state='code';else blank(i);continue}
    if(state==='block'){
      if(ch==='/'&&nx==='*'){blank(i);blank(++i);depth++;continue}
      if(ch==='*'&&nx==='/'){blank(i);blank(++i);if(!--depth)state='code';continue}
      blank(i);continue;
    }
    if(state==='string'){
      blank(i);
      if(ch==='\\'&&i+1<text.length)blank(++i);
      else if(ch==='"')state='code';
      continue;
    }
    if(ch==='"'){blank(i);state='string';continue}
    if(ch==='/'&&nx==='/'){blank(i);blank(++i);state='line';continue}
    if(ch==='/'&&nx==='*'){blank(i);blank(++i);state='block';depth=1;continue}
  }
  return out.join('');
}
function matchingParen(text,open){
  let count=0;
  for(let i=open;i<text.length;i++){
    if(text[i]==='(')count++;
    else if(text[i]===')'&&--count===0)return i;
  }
  return -1;
}
function splitArguments(text){
  let start=0,depth=0;const parts=[];
  for(let i=0;i<text.length;i++){
    if('([{'.includes(text[i]))depth++;
    else if(')]}'.includes(text[i]))depth--;
    if(text[i]===','&&depth===0){parts.push(text.slice(start,i).trim());start=i+1}
  }
  parts.push(text.slice(start).trim());return parts;
}
function roleFor(name,rate){
  if(outs.test(name))return 'output';
  if(envelopes.test(name))return 'envelope';
  if(filters.test(name))return 'filter';
  if(effects.test(name))return 'space';
  if(sources.test(name))return rate==='kr'||rate==='ir'?'modulation':'source';
  return 'process';
}
const clip=(value,n=54)=>value.length>n?value.slice(0,n-1)+'…':value;
export function describeSynthesis(site){
  if(!site?.text)return {nodes:[],site:null,summary:'Definition unavailable'};
  const code=site.text,mask=masked(code);
  const nodes=[],matches=/\b([A-Z][A-Za-z_0-9]*)\s*\.\s*(ar|kr|ir)\s*\(/g;
  for(const found of mask.matchAll(matches)){
    const open=found.index+found[0].lastIndexOf('('),close=matchingParen(mask,open);
    if(close<0)continue;
    const name=found[1],rate=found[2],role=roleFor(name,rate);
    const args=splitArguments(code.slice(open+1,close));
    const relative=found.index;
    const startOffset=(site.startOffset??0)+relative;
    const endOffset=(site.startOffset??0)+close+1;
    const line=(site.start??1)+(code.slice(0,relative).match(/\n/g)||[]).length;
    const text=clip(code.slice(relative,close+1).replace(/\s+/g,' ').trim(),100);
    nodes.push({name,rate,role,roleLabel:roles[role],
      description:descriptions.get(name)||name+' unit generator',
      arguments:args.map(v=>clip(v.replace(/\s+/g,' '))),text,line,startOffset,endOffset,
      begin:relative,end:close,inputs:[],feeds:[]});
  }
  const link=(from,to,reason)=>{
    if(from===to||from.feeds.some(x=>x.at===to.begin))return;
    from.feeds.push({to:to.name,at:to.begin,reason});
  };
  for(const node of nodes){
    const parents=nodes.filter(other=>other!==node&&other.begin<node.begin&&other.end>node.end);
    if(parents.length){
      const parent=parents.reduce((min,next)=>
        next.end-next.begin<min.end-min.begin?next:min);
      node.inputs.push({to:parent.name,reason:'nested in its arguments'});
      link(node,parent,'nested in');
    }
  }
  // Source-level variable references establish additional observable
  // dependencies. They do not prove audio-rate signal flow.
  for(const from of nodes){
    const preceding=mask.slice(Math.max(0,from.begin-200),from.begin);
    const assigned=/(?:^|[;{}\n])\s*(?:var\s+)?([A-Za-z_]\w*)\s*=\s*$/.exec(preceding);
    if(!assigned)continue;
    const symbol=assigned[1],reference=new RegExp('\\b'+symbol+'\\b');
    for(const to of nodes){
      if(to===from||to.begin<from.begin)continue;
      const args=mask.slice(to.begin+to.name.length,to.end+1);
      // For Out, the first argument is the bus number, not an input signal.
      const search=to.role==='output'?args.slice(args.indexOf(',')+1):args;
      if(reference.test(search))link(from,to,'referenced by');
    }
  }
  // Present dependencies before their consumers. Where no connection can
  // be determined, retain the original source order without inventing edges.
  const byStart=new Map(nodes.map(node=>[node.begin,node]));
  const degree=new Map(nodes.map(node=>[node.begin,0]));
  for(const node of nodes)for(const edge of node.feeds)
    degree.set(edge.at,(degree.get(edge.at)||0)+1);
  const pending=nodes.filter(node=>degree.get(node.begin)===0);
  const ordered=[];
  while(pending.length){
    pending.sort((a,b)=>a.begin-b.begin);
    const node=pending.shift();ordered.push(node);
    for(const edge of node.feeds){
      degree.set(edge.at,degree.get(edge.at)-1);
      if(degree.get(edge.at)===0)pending.push(byStart.get(edge.at));
    }
  }
  const display=ordered.length===nodes.length?ordered:nodes;
  const byRole={};for(const node of display)(byRole[node.role]??=[]).push(node);
  return {site,nodes:display,byRole,summary:nodes.length?
    nodes.length+' source-level unit generator'+(nodes.length===1?'':'s')+' identified':
    'No directly recognizable .ar/.kr/.ir calls'};
}

export function previewWaveform(nodes){
  // A pure shape legend for one recognizable oscillator, never audio output.
  const first=nodes.find(n=>n.role==='source'&&
    /^(?:SinOsc|FSinOsc|Saw|LFSaw|VarSaw|Pulse|LFPulse|LFTri)$/.test(n.name));
  if(!first)return null;
  const type=/^(?:SinOsc|FSinOsc)$/.test(first.name)?'sine':
    /^(?:Saw|LFSaw|VarSaw)$/.test(first.name)?'saw':
    /^(?:Pulse|LFPulse)$/.test(first.name)?'pulse':'triangle';
  const width=240,height=58,points=[];
  for(let x=0;x<=width;x+=2){
    const p=(x/width*3.5)%1;
    const v=type==='sine'?Math.sin(p*Math.PI*2):
      type==='saw'?2*p-1:type==='pulse'?(p<.5?1:-1):
      1-4*Math.abs(p-.5);
    points.push((x===0?'M':'L')+x+' '+(height/2-v*height*.35).toFixed(2));
  }
  return {name:first.name,shape:type,path:points.join(' '),description:first.description};
}
export function formatWhen(seconds){
  const s=Math.max(0,Math.floor(Number.isFinite(seconds)?seconds:0));
  return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
}
export function snapshotAt(events,stamp,name=null){
  return events.filter(e=>(!name||name===e.name)&&e.start!==null&&
    e.start<=stamp&&(e.end===null||e.end>stamp));
}
export function sourcePreview(text){
  const found=indexSource(text);
  const named=[...found.defs.entries()].map(([name,site])=>({name,site,kind:'visible'}));
  const anon=found.anonymous.length===1?
    [{name:'Anonymous .play',site:found.anonymous[0],kind:'visible'}]:[];
  return named.concat(anon);
}
export function sourceIsCurrent(site,source){
  if(!site||!source)return false;
  const offset=site.startOffset;
  return Number.isInteger(offset)&&source.slice(offset,offset+site.text.length)===site.text;
}
