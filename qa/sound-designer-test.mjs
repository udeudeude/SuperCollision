import assert from 'node:assert/strict';
import {
 SOUND_PRESETS,SOUND_SYSTEM_PROMPT,buildSoundMessages,responseText,parseSoundResponse,
 describeProviderFailure,isFreeOpenRouterModel,OPENROUTER_FREE_MODEL,
 inspectSoundCode,formatPuterAllowance,
 listVerifiedFreeModels,recentSuperColliderError,normalizeSoundDrafts,
 PREFERRED_OPENROUTER_CODE_MODEL,OPENROUTER_COMPLETION_TOKENS,completedCodeFence
} from '../sound-designer-core.mjs';
const FENCE=String.fromCharCode(96).repeat(3);
assert.equal(SOUND_PRESETS.length,5);
assert.equal(PREFERRED_OPENROUTER_CODE_MODEL,'cohere/north-mini-code:free');
assert.equal(isFreeOpenRouterModel(PREFERRED_OPENROUTER_CODE_MODEL),true);
assert.ok(OPENROUTER_COMPLETION_TOKENS>=8000);
assert.match(SOUND_SYSTEM_PROMPT,/Close the SuperCollider code fence/);
const complete='\x60\x60\x60supercollider\n(\n{ SinOsc.ar(440,0,0.1) }.play;\n)\n\x60\x60\x60\nExplain';
assert.equal(completedCodeFence(complete),true);
assert.equal(completedCodeFence('\x60\x60\x60supercollider\n(\n{ SinOsc.ar(440,0,0.1) }.play;'),false);
assert.equal(completedCodeFence('Nothing here.'),false);
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
assert.match(describeProviderFailure(new Error('Model hit its output-token limit before finishing the code'),'OpenRouter'),/output-token limit/);
assert.doesNotMatch(describeProviderFailure(new Error('Model hit its output-token limit before finishing the code'),'OpenRouter'),/out of available credit/);
assert.match(describeProviderFailure({status:402},'Puter'),/quota/);
assert.match(describeProviderFailure({status:401},'OpenRouter'),/authorization/);

const valid=inspectSoundCode(code);
assert.equal(valid.canAudition,true);
assert.equal(valid.blockers.length,0);
assert.ok(valid.warnings.some(x=>/self-release/.test(x)));
assert.equal(inspectSoundCode('(\ns.quit;\n)').canAudition,false);
assert.equal(inspectSoundCode('File.open("bad", "w");').canAudition,false);
assert.equal(inspectSoundCode('( { SinOsc.ar(400) }.play;').canAudition,false);
assert.equal(inspectSoundCode('(\n/* File.open("no") */\n{ SinOsc.ar(440) }.play\n)').canAudition,true);
assert.equal(inspectSoundCode('(\n"thisProcess and s.quit";\n{ SinOsc.ar(440) }.play\n)').canAudition,true);
assert.equal(inspectSoundCode('/* block is unfinished').canAudition,false);
assert.match(formatPuterAllowance({
 allowanceInfo:{remaining:50000000,monthUsageAllowance:100000000}
}),/\$0\.50 of \$1\.00.*50\.0%/);
assert.match(formatPuterAllowance({allowanceInfo:{remaining:12}}),/did not return/);

const models=listVerifiedFreeModels({data:[
 {id:'community/coding-good:free',name:'Coding Good',description:'Programming and code generation',
  pricing:{prompt:'0',completion:'0'},context_length:64000,
  architecture:{input_modalities:['text'],output_modalities:['text']}},
 {id:'paid/normal',name:'Paid',pricing:{prompt:'0',completion:'0'},context_length:64000},
 {id:'community/deceptive:free',name:'Deceptive',pricing:{prompt:'0.0002',completion:'0'},context_length:64000},
 {id:'community/audio-only:free',name:'Audio only',pricing:{prompt:'0',completion:'0'},context_length:64000,
  architecture:{output_modalities:['audio']}},
 {id:'community/short:free',name:'Too short',pricing:{prompt:'0',completion:'0'},context_length:2000}
]});
assert.deepEqual(models.map(m=>m.id),['community/coding-good:free']);
assert.deepEqual(listVerifiedFreeModels(null),[]);
assert.match(recentSuperColliderError('INFO: running\nERROR: Message not understood\nstack detail\n'),/ERROR: Message not understood/);
assert.equal(recentSuperColliderError('everything executed cleanly'),'');
const versions=normalizeSoundDrafts({
 entries:[
  {code:'{ SinOsc.ar(1) }.play',description:'Test',model:'free',provider:'openrouter'},
  {code:'invalid',model:'unknown',provider:'other'},
  {code:'{ SinOsc.ar(2) }.play',description:'Second',provider:'puter',model:'nano'}
 ],
 current:1
});
assert.equal(versions.entries.length,2);
assert.equal(versions.current,1);
assert.deepEqual(versions.entries.map(x=>x.provider),['openrouter','puter']);
assert.deepEqual(normalizeSoundDrafts(null),{version:1,entries:[],current:0});
assert.equal(normalizeSoundDrafts({entries:Array.from({length:10},(_,i)=>({
 code:'{ SinOsc.ar('+i+') }.play;',provider:'puter',model:'nano'})),current:9}).entries.length,5);
console.log('Sound Designer prompt, free-model filtering, version restoration, console diagnostics, quota formatting and source checks passed.');


