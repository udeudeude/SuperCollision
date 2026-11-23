import assert from 'node:assert/strict';
import { selectionCandidates, expandedSelection, statementSelection } from '../code-selection.mjs';

const piece = '(\n' +
  's.waitForBoot({\n' +
  '  SynthDef(\\drone, { |freq=110|\n' +
  '    var tone = SinOsc.ar(freq, 0, 0.1);\n' +
  '    Out.ar(0, tone ! 2);\n' +
  '  }).add;\n' +
  '});\n' +
  ')';

const cursor = piece.indexOf('SinOsc.ar') + 3;
const word = selectionCandidates(piece, cursor).find(item => item.kind === 'Word');
assert.equal(piece.slice(word.from, word.to), 'SinOsc.ar', 'double-tap selects the command and method');

const statement = statementSelection(piece, cursor);
assert.equal(piece.slice(statement.from, statement.to), 'var tone = SinOsc.ar(freq, 0, 0.1);',
  'triple-tap selects one statement, not a line fragment or enclosing function');

let current = { from: cursor, to: cursor };
const kinds = [];
let iterations = 0;
while (iterations++ < 20) {
  const next = expandedSelection(piece, current.from, current.to);
  if (!next) break;
  assert.ok(next.from <= current.from && next.to >= current.to, 'expansion must contain old selection');
  assert.ok(next.from < current.from || next.to > current.to, 'expansion must strictly enlarge selection');
  kinds.push(next.kind);
  current = next;
}
assert.equal(piece.slice(current.from, current.to), piece);
for (const expected of ['Word', 'Expression', 'Statement', 'Block', 'Instrument', 'Composition']) {
  assert.ok(kinds.includes(expected), 'missing semantic level: ' + expected + ' (got ' + kinds.join(', ') + ')');
}

const instrument = selectionCandidates(piece, cursor).find(item => item.kind === 'Instrument');
assert.ok(piece.slice(instrument.from, instrument.to).includes('SynthDef(\\drone'));
assert.ok(piece.slice(instrument.from, instrument.to).endsWith('}).add;'));

const assigned = '(\n~lead = SynthDef(\\lead, { Out.ar(0, SinOsc.ar(440)); }).add;\n)';
const lead = assigned.indexOf('SinOsc.ar');
const assignedInstrument = selectionCandidates(assigned, lead).find(item => item.kind === 'Instrument');
assert.ok(assignedInstrument, 'SynthDef assignment must be an instrument');
assert.ok(assigned.slice(assignedInstrument.from, assignedInstrument.to).startsWith('~lead = SynthDef'));
assert.ok(assigned.slice(assignedInstrument.from, assignedInstrument.to).endsWith('}).add;'));

const pattern = 'Pdef(\\part, Pbind(\\instrument, \\bell, \\dur, Pseq([1, 2], inf))).play;';
const nested = pattern.indexOf('Pseq');
const instruments = selectionCandidates(pattern, nested).filter(item => item.kind === 'Instrument');
assert.ok(instruments.length >= 1, 'pattern definitions are recognized as selectable instruments');

const quoted = 'var text = "not a call: SynthDef(\\fake, { /* } */ )";\nOut.ar(0, SinOsc.ar(440));';
const quotedCursor = quoted.indexOf('fake') + 1;
const string = selectionCandidates(quoted, quotedCursor).find(item => item.kind === 'String');
assert.ok(string);
assert.equal(quoted.slice(string.from, string.to), '"not a call: SynthDef(\\fake, { /* } */ )"');
assert.equal(selectionCandidates(quoted, quotedCursor).filter(item => item.kind === 'Instrument').length, 0);

const commented = '/* outer /* inner ) } */ remains */\nSynthDef(\\real, { SinOsc.ar(330) }).add;';
const realCursor = commented.indexOf('SinOsc.ar');
assert.ok(selectionCandidates(commented, realCursor).find(item => item.kind === 'Instrument'),
  'nested comments must not break matching brackets');

const characterLiteral = 'var x = $); var y = $(; SinOsc.ar(440);';
const characterCursor = characterLiteral.indexOf('SinOsc.ar') + 3;
assert.equal(selectionCandidates(characterLiteral, characterCursor).find(item => item.kind === 'Statement')
  .kind, 'Statement', 'character literals should not corrupt bracket nesting');

const unicode = '// 🎹 🎚️ emoji before code\nvar tone = SinOsc.ar(440);';
const unicodeWord = selectionCandidates(unicode, unicode.indexOf('SinOsc.ar') + 2)
  .find(item => item.kind === 'Word');
assert.equal(unicode.slice(unicodeWord.from, unicodeWord.to), 'SinOsc.ar',
  'selection offsets must use UTF-16 indices, like textarea.selectionStart');

const incomplete = '(\nSynthDef(\\unfinished, {\n  SinOsc.ar(440;';
assert.ok(selectionCandidates(incomplete, incomplete.indexOf('SinOsc.ar') + 2).length > 0,
  'incomplete code remains selectable without throwing');

assert.equal(expandedSelection('', 0, 0), null);
console.log('Semantic selection: word, statement, nested blocks, instruments, comments, Unicode, incomplete code passed.');
