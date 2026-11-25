import assert from 'node:assert/strict';
import {demoSynthSource} from '../sounds-bench-tone.mjs';
import {linkedControlAtCursor,controlTextRange,parameterNames} from '../sounds-bench-links.mjs';
const code=demoSynthSource();
for(const [key,name] of Object.entries(parameterNames)){
 const sought='\\'+name+', ';
 const where=code.lastIndexOf(sought);
 assert.ok(where>=0,'Missing Synth parameter '+name);
 assert.equal(linkedControlAtCursor(code,where+2),key,'Wrong control for '+name);
 const actual=controlTextRange(code,key);
 assert.ok(actual,'No highlight range for '+name);
 assert.equal(code.slice(actual.start,actual.end).startsWith(sought),true,'Wrong marked text for '+name);
 assert.equal(linkedControlAtCursor(code,where+sought.length),key,'Value does not link to '+name);
}
assert.equal(linkedControlAtCursor(code,code.indexOf('Routine({')),null);
assert.equal(linkedControlAtCursor(code,code.indexOf('filtered = RLPF')),'cutoff');
assert.equal(linkedControlAtCursor(code,code.indexOf('envelope = EnvGen')),'attack');
assert.equal(linkedControlAtCursor('not-a-parameter',4),null);
console.log('Bidirectional code links pass for '+Object.keys(parameterNames).length+' parameters.');
