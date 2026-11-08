/* Pure helpers for the user-funded SuperCollision Sound Designer.
 * Code is never evaluated by this module. */
export const SOUND_PRESETS = [
  'A deep, slightly wavering bagpipe drone with a rough, reedy texture.',
  'A crisp fife-and-drum snare with sharp stick attack and rattling wires.',
  'A cinematic low brass BWAAH, with pitch falling and a massive dark tail.',
  'A breathy wooden flute with subtle finger-hole turbulence.',
  'A resonant metallic percussion strike with an irregular, shimmering decay.'
];
const CODE_FENCE=String.fromCharCode(96).repeat(3);
export const SOUND_SYSTEM_PROMPT = [
 'You are a SuperCollider 3 sound-synthesis engineer. Generate ORIGINAL, RUNNABLE',
 'SuperCollider language source for a browser-based sclang/scsynth WebAssembly environment.',
 'The sound should perceptually match the description, prioritizing useful timbre over generic sine beeps.',
 'Use built-in SuperCollider language and standard unit generators only.',
 'Never require Quarks, external audio files, network access, plugins, mouse or keyboard input.',
 'The result MUST be a complete executable document inside one '+CODE_FENCE+'supercollider fenced block.',
 'Use a parenthesized block, s.waitForBoot({ ... });, and SynthDef with meaningful argument',
 'controls (frequency, amplitude, timbre/texture, etc.) and clear default values.',
 'Instantiate or play the synth automatically ONCE after its definition is added.',
 'Make an audible 6-12 second test rendition that frees itself (EnvGen doneAction:2),',
 'even for requests for drones. The user can lengthen it after insertion.',
 'Start conservatively quiet: e.g. amplitude <= 0.15 and use LeakDC / tanh or equivalent',
 'to limit unexpectedly loud output. Avoid arbitrary server configuration and CmdPeriod.',
 'Avoid known browser-incompatible methods (external file operations, plugins).',
 'Comment major sound components in code.',
 'After the code block, write 2-4 sentences explaining the sound and 2-5 useful controls.',
 'No JavaScript, no markdown table, no audio file, no invented SuperCollider class.'
].join(' ');

export function buildSoundMessages({description,revision='',priorCode='',includeCode=false,currentCode=''}) {
 const request = String(description||'').trim().slice(0,1800);
 if (!request) throw Error('Describe the sound first.');
 const messages = [{role:'system',content:SOUND_SYSTEM_PROMPT}];
 const question = ['Requested sound: '+request];
 if (revision.trim()) {
   if (!priorCode.trim()) throw Error('Generate an instrument before requesting a revision.');
   question.push('Revise the previous instrument following this instruction: '+revision.trim().slice(0,1500));
   question.push('Previous generated instrument:\n'+priorCode.slice(0,24000));
   question.push('Output the COMPLETE revised instrument, not a diff.');
 }
 if (includeCode && currentCode.trim()) {
   question.push('Optional user-provided reference composition (do not modify it):\n'+currentCode.slice(0,12000));
   question.push('Use this solely to understand context; the resulting instrument must run independently.');
 }
 messages.push({role:'user',content:question.join('\n\n')});
 return messages;
}

export function responseText(value) {
 if (typeof value==='string') return value;
 const content=value?.message?.content??value?.choices?.[0]?.message?.content??value?.content??value?.text;
 if (typeof content==='string')return content;
 if (Array.isArray(content))return content.filter(x=>x?.type==='text').map(x=>x.text||'').join('\n');
 return '';
}

export function parseSoundResponse(text) {
 const raw=String(text||'').trim();
 if (!raw)throw Error('The model returned no text.');
 const fence=/\x60\x60\x60(?:supercollider|sclang|scd|sc|text)?[ \t]*\n([\s\S]*?)\x60\x60\x60/gi;
 const matches=[...raw.matchAll(fence)];
 let code='';
 if(matches.length){
   const preferred=matches.find(x=>/^\x60\x60\x60(?:supercollider|sclang|scd|sc)[ \t]*\n/i.test(x[0]))||matches[0];
   code=preferred[1].trim();
 }else if(/(?:\bSynthDef\s*\(|\bPbind\s*\(|\bSinOsc\.(?:ar|kr)\s*\(|\bOut\.ar\s*\(|s\.waitForBoot)/.test(raw)){
   code=raw;
 }
 if(!code || !/(?:\bSynthDef\s*\(|\bPbind\s*\(|\bSinOsc\.(?:ar|kr)\s*\(|\bOut\.ar\s*\(|\{\s*[\s\S]*?\.play)/.test(code)){
   throw Error('The response did not contain recognizable SuperCollider code. Try again or choose a different provider.');
 }
 if(code.length>36000)throw Error('The generated code is unusually long; request a simpler instrument.');
 const explanation=matches.length?raw.replace(matches.find(x=>x[1].trim()===code)?.[0]||'', '').trim():'';
 return {code,explanation:explanation.slice(0,4000)};
}

export function describeProviderFailure(error,provider){
 const status=Number(error?.status||error?.statusCode||error?.response?.status||0);
 const message=typeof error==='object'?error?.message||error?.error?.message||error?.msg||'Unknown error':String(error);
 const text=String(message);
 if(status===401||status===403)return provider+' authorization failed. Reconnect your account.';
 if(status===402||/insufficient.funds|quota|allowance|credit|payment.required/i.test(text))
   return provider+' has run out of available credit or quota. No automatic paid retry was made.';
 if(status===429||/rate.limit/i.test(text))return provider+' rate limit reached. Try again later.';
 return provider+' error: '+text.slice(0,330);
}

export const OPENROUTER_FREE_MODEL='openrouter/free';
export function isFreeOpenRouterModel(model){
 return model===OPENROUTER_FREE_MODEL || (/^[a-z0-9._-]+\/[a-z0-9._:-]+:free$/i.test(model));
}
