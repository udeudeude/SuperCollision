/* Human-readable error diagnosis without modifying SuperCollider source. */
import assert from 'node:assert/strict';
import {explainConsoleError,resolveCorrection} from '../error-guide.mjs';

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
assert.equal(source.slice(diagnostic.fix.start,diagnostic.fix.end),diagnostic.fix.before);
assert.equal(diagnostic.fix.after,diagnostic.correction);
const located=resolveCorrection(source,diagnostic.fix);
assert.equal(located.start,source.indexOf('EnvGen.kr('));
const amended=source.slice(0,located.start)+located.after+source.slice(located.end);
assert.ok(amended.includes(diagnostic.correction));
assert.equal(resolveCorrection(amended,diagnostic.fix),null,
 'Never apply the same correction twice');
assert.equal(resolveCorrection(source+source,diagnostic.fix),null,
 'Never apply to an ambiguous duplicate');
const prefix='// a new note first\n';
const shifted=prefix+source;
assert.equal(resolveCorrection(shifted,diagnostic.fix).start,located.start+prefix.length,
 'A unique edit must survive unrelated insertions before it');
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
const errorCases=[
 {log:"ERROR: syntax error, unexpected VAR, expecting '}'\\nfile://interpreted_text:4:2",
  kind:'variable-declaration',includes:'beginning of that function'},
 {log:"ERROR: syntax error, unexpected ')'\\nfile://interpreted_text:4:2",
  kind:'closing-delimiter',includes:'closing parenthesis'},
 {log:"ERROR: syntax error, unexpected end of file",
  kind:'unclosed-expression',includes:'unclosed'},
 {log:"ERROR: Class not defined: DoesNotExist\\nfile://interpreted_text:7:2",
  kind:'undefined-class',includes:'DoesNotExist'},
 {log:"ERROR: Variable 'melody' not defined\\nfile://interpreted_text:3:2",
  kind:'undefined-variable',includes:'melody'},
 {log:"ERROR: Message 'ar' not understood.\\nRECEIVER: nil",
  kind:'unknown-message',includes:'receiver'},
 {log:"ERROR: Primitive '_BinaryOpFailure' failed.",
  kind:'primitive-failure',includes:'built-in'},
 {log:"FAILURE IN SERVER /s_new SynthDef not found: bagpipe",
  kind:'missing-synthdef',includes:'server received'},
 {log:"FAILURE IN SERVER /n_set Node 404 not found",
  kind:'missing-node',includes:'already have finished'}
];
for(const item of errorCases){
 const guidance=explainConsoleError(item.log,source);
 assert.equal(guidance?.kind,item.kind,'Unexpected diagnosis: '+item.log);
 assert.match(guidance.message,new RegExp(item.includes,'i'));
 assert.equal(guidance.fix,undefined,'Unverified errors must never offer a one-tap patch');
 assert.equal(guidance.correction,null,'Unverified errors must never generate replacement code');
}
assert.equal(explainConsoleError("ERROR: Class not defined: Foo",source).line,null);
console.log('Error guidance: verified patch, nine common diagnostic classes, safe no-fix fallbacks and line navigation passed.');
