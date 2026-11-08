import assert from 'node:assert/strict';
import {
 SOUND_PRESETS,SOUND_SYSTEM_PROMPT,buildSoundMessages,responseText,parseSoundResponse,
 describeProviderFailure,isFreeOpenRouterModel,OPENROUTER_FREE_MODEL
} from '../sound-designer-core.mjs';
const FENCE=String.fromCharCode(96).repeat(3);
assert.equal(SOUND_PRESETS.length,5);
assert.ok(SOUND_SYSTEM_PROMPT.includes('s.waitForBoot'));
assert.ok(SOUND_SYSTEM_PROMPT.includes('doneAction:2'));
assert.ok(isFreeOpenRouterModel(OPENROUTER_FREE_MODEL));
assert.ok(isFreeOpenRouterModel('example/coding-model:free'));
assert.equal(isFreeOpenRouterModel('anthropic/claude-sonnet-4'),false);
assert.equal(isFreeOpenRouterModel('openrouter/auto'),false);
const original='SynthDef(\\existing,{ SinOsc.ar(440) }).add;';
const messages=buildSoundMessages({description:'Bagpipe drone',includeCode:false,currentCode:original});
assert.equal(messages.length,2);
assert.ok(messages[1].content.includes('Bagpipe drone'));
assert.ok(!messages[1].content.includes('existing'),'current source must remain private by default');
const context=buildSoundMessages({description:'Bagpipe drone',includeCode:true,currentCode:original});
assert.ok(context[1].content.includes(original));
const revised=buildSoundMessages({description:'Bagpipe drone',revision:'make it rougher',
 priorCode:'{ SinOsc.ar(440) }.play;'});
assert.ok(revised[1].content.includes('make it rougher'));
assert.ok(revised[1].content.includes('SinOsc'));
assert.throws(()=>buildSoundMessages({description:'   '}),/Describe/);
assert.throws(()=>buildSoundMessages({description:'x',revision:'change',priorCode:''}),/Generate/);
assert.equal(responseText({message:{content:'ok'}}),'ok');
assert.equal(responseText({choices:[{message:{content:'response'}}]}),'response');
assert.equal(responseText({message:{content:[{type:'text',text:'alpha'},{type:'text',text:'beta'}]}}),'alpha\nbeta');
const code='(\ns.waitForBoot({ SynthDef(\\test,{ Out.ar(0,SinOsc.ar(440,0,0.1)) }).add; });\n)';
const parsed=parseSoundResponse('Here is the sound:\n'+FENCE+'supercollider\n'+code+'\n'+FENCE+'\nA thin sine wave.');
assert.equal(parsed.code,code);
assert.equal(parsed.explanation,'Here is the sound:\n\nA thin sine wave.');
assert.equal(parseSoundResponse(code).code,code);
assert.throws(()=>parseSoundResponse('This is not code.'),/recognizable/);
assert.throws(()=>parseSoundResponse(''),/no text/);
assert.match(describeProviderFailure({status:429},'OpenRouter'),/rate limit/);
assert.match(describeProviderFailure({status:402},'Puter'),/quota/);
assert.match(describeProviderFailure({status:401},'OpenRouter'),/authorization/);
console.log('Sound Designer prompt, revision, code extraction, free-only routing, and failures passed.');
