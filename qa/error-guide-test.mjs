/* Human-readable error diagnosis without modifying SuperCollider source. */
import assert from 'node:assert/strict';
import {explainConsoleError} from '../error-guide.mjs';

const source=[
 'SynthDef(\\gardenMarimba, {',
 ' var env, body;',
 ' env = EnvGen.kr(',
 '   Env.perc(0.003, 0.48, 1, -5),levelScale: nil',
 '   doneAction: 2',
 ' );',
 '});'
].join('\n');
const output=[
 "ERROR: Nil does not understand the message 'doneAction'.",
 'file://interpreted_text:56:26',
 ' 57*│ ^ Nil does not understand the message \'doneAction\'.'
].join('\n');
const diagnostic=explainConsoleError(output,source);
assert.equal(diagnostic?.kind,'envelope-argument');
assert.match(diagnostic.title,/Envelope/);
assert.match(diagnostic.message,/levelScale: nil/);
assert.equal(diagnostic.line,3);
assert.equal(diagnostic.correction,
 'EnvGen.kr(Env.perc(0.003, 0.48, 1, -5), doneAction: 2)');
assert.equal(source.split('\n')[3].includes('levelScale: nil'),true,
 'The diagnostic must never rewrite the original source');

const unrecognized=explainConsoleError(output,'{ 1.wait; }');
assert.equal(unrecognized.kind,'envelope-argument');
assert.equal(unrecognized.correction,null);
assert.equal(unrecognized.line,56);
const generic=explainConsoleError('ERROR: Class not defined: Wibble\nfile://interpreted_text:7:2','');
assert.equal(generic.kind,'runtime');
assert.equal(generic.line,7);
assert.equal(explainConsoleError('All notes completed.',''),null);
console.log('Error guidance: known envelope input, source preservation, unknown error, line navigation passed.');
