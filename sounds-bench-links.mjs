/* Parameter-aware navigation between editable SuperCollider text and its sound controls.
 * Never executes or rewrites arbitrary user code. */
export const parameterNames=Object.freeze({
 frequency:'freq',amplitude:'amp',waveform:'wave',pulseWidth:'pw',
 cutoff:'cutoff',resonance:'rq',attack:'attack',release:'release',
 vibratoHz:'vibratoHz',vibratoDepth:'vibrato',detune:'detune',echoMix:'echoMix'
});
const aliases=Object.freeze({
 freq:'frequency',pitch:'frequency',frequency:'frequency',
 amp:'amplitude',amplitude:'amplitude',
 wave:'waveform',raw:'waveform',pw:'pulseWidth',
 cutoff:'cutoff',filtered:'cutoff',rq:'resonance',
 attack:'attack',release:'release',vibratoHz:'vibratoHz',
 vibrato:'vibratoDepth',detune:'detune',echoMix:'echoMix',echo:'echoMix'
});
export function linkedControlAtCursor(source,index){
 if(typeof source!=='string'||!Number.isInteger(index))return null;
 const position=Math.max(0,Math.min(source.length,index));
 const before=source.lastIndexOf('\n',Math.max(0,position-1));
 const begin=before+1;
 let end=source.indexOf('\n',position);
 if(end<0)end=source.length;
 const line=source.slice(begin,end);
 const matches=[...line.matchAll(/\\?[A-Za-z][A-Za-z0-9]*/g)]
  .map(m=>({key:aliases[m[0].replace(/^\\/,'')],begin:begin+m.index,end:begin+m.index+m[0].length}))
  .filter(m=>m.key);
 if(!matches.length)return null;
 // For Synth([...]) parameter lines, the named parameter owns its value.
 const primary=/^\s*\\([A-Za-z][A-Za-z0-9]*)/.exec(line);
 if(primary&&aliases[primary[1]])return aliases[primary[1]];
 const inToken=matches.find(m=>m.begin<=position&&position<=m.end);
 if(inToken)return inToken.key;
 // If the cursor is on a value, use the preceding parameter in the same line.
 const preceding=matches.filter(m=>m.begin<=position).at(-1);
 return (preceding||matches[0]).key;
}
export function controlTextRange(source,key){
 const token=parameterNames[key];
 if(typeof source!=='string'||!token)return null;
 // Use the actual value passed to the synth, rather than the parameter
 // defaults in SynthDef. This is the editable live instrument setting.
 const expression=new RegExp('\\\\'+token+'\\s*,\\s*[^,\\n\\]]+','g');
 let found=null,match;
 while((match=expression.exec(source))){
  found={start:match.index,end:match.index+match[0].length};
 }
 if(found)return found;
 const fallback=new RegExp('\\b'+token+'\\b');
 const other=fallback.exec(source);
 return other?{start:other.index,end:other.index+other[0].length}:null;
}
