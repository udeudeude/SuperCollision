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
 'Prefer a self-contained 30-90 line instrument; do not include sprawling composition scaffolding.',
 'Close the SuperCollider code fence BEFORE adding any explanation. Code takes priority over commentary.',
 'After the closed code block, give two brief sentences and mention 2-4 useful controls.',
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

export function completedCodeFence(text){
 const raw=String(text||'');
 const fence=/\x60\x60\x60(?:supercollider|sclang|scd|sc)[ \t]*\n[\s\S]*?\x60\x60\x60/i;
 if(!fence.test(raw))return false;
 try{
   const item=parseSoundResponse(raw);
   const shape=inspectSoundCode(item.code);
   return !shape.blockers.some(x=>/Unclosed|Mismatched/.test(x));
 }catch{return false}
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

// Verified free coding model as of November 2026. The general free router
// remains available as an explicit alternative if this model is unavailable.
export const PREFERRED_OPENROUTER_CODE_MODEL='cohere/north-mini-code:free';
export const OPENROUTER_COMPLETION_TOKENS=8192;
export const OPENROUTER_FREE_MODEL='openrouter/free';
export function isFreeOpenRouterModel(model){
 return model===OPENROUTER_FREE_MODEL || (/^[a-z0-9._-]+\/[a-z0-9._:-]+:free$/i.test(model));
}

/* Lightweight, deliberately conservative pre-audition checks. This is NOT
 * a sandbox or a proof that generated SuperCollider code is safe.
 * SuperCollider language code remains executable and must be trusted by user.
 */
export function inspectSoundCode(source){
 const code=String(source||'');
 const masked=code.split('');
 let state='code';
 for(let i=0;i<code.length;i++){
   const ch=code[i],n=code[i+1];
   if(state==='line'){
     if(ch==='\n')state='code';
     else masked[i]=' ';
     continue;
   }
   if(state==='block'){
     masked[i]=' ';
     if(ch==='*'&&n==='/'){masked[++i]=' ';state='code'}
     continue;
   }
   if(state==='string'||state==='symbol'){
     masked[i]=' ';
     if(ch==='\\'&&n!==undefined){masked[++i]=' ';continue}
     if(ch===(state==='string'?'"':"'"))state='code';
     continue;
   }
   if(ch==='/'&&n==='/'){masked[i]=' ';masked[++i]=' ';state='line';continue}
   if(ch==='/'&&n==='*'){masked[i]=' ';masked[++i]=' ';state='block';continue}
   if(ch==='"'||ch==="'"){masked[i]=' ';state=ch==='"'?'string':'symbol';continue}
   if(ch==='$'&&n!==undefined){masked[i]=' ';masked[++i]=' ';continue}
 }
 const clean=masked.join('');
 const blockers=[],warnings=[];
 if(state==='block'||state==='string'||state==='symbol')
   blockers.push('Unclosed comment or quoted text.');
 const stack=[],pairs={')':'(',']':'[','}':'{'};
 for(let i=0;i<clean.length;i++){
   const ch=clean[i];
   if('([{'.includes(ch))stack.push({ch,i});
   else if(Object.hasOwn(pairs,ch)){
     if(stack.at(-1)?.ch===pairs[ch])stack.pop();
     else {blockers.push('Mismatched '+ch+' near character '+(i+1)+'.');break}
   }
 }
 if(stack.length)blockers.push('Unclosed '+stack.at(-1).ch+' delimiter.');
 const restricted=[
   [/\b(?:File|Pipe|UnixCmd)\s*(?:\.|\()/,'File and operating-system command objects'],
   [/\bthisProcess\b/,'interpreter or process manipulation'],
   [/\b(?:s|Server)\s*\.\s*(?:quit|reboot|killAll|options)\b/,'server shutdown or reconfiguration'],
   [/\b(?:Server|ServerOptions)\s*\.\s*(?:default|killAll|quitAll)\b/,'global server manipulation'],
   [/\bNetAddr\s*[\.(]/,'network operations'],
   [/\b(?:interpret|unixCmd)\s*\(/,'dynamic code or shell execution']
 ];
 for(const [pattern,label] of restricted){
   if(pattern.test(clean))blockers.push('Contains '+label+'; audition disabled. You may still copy or save the code.');
 }
 if(!/EnvGen|Done\.freeSelf|doneAction\s*:\s*2|\.free\b/.test(clean))
   warnings.push('No clear self-release mechanism found. The sound may continue until STOP ALL AUDIO.');
 if(!/\b(?:Out|OffsetOut|ReplaceOut)\s*\.\s*(?:ar|kr)\s*\(/.test(clean)&&
    !/\}\s*\.\s*play\b/.test(clean))
   warnings.push('No recognizable audio output found. The result may be silent.');
 warnings.push('Static checks cannot confirm output level, sound quality, or safe behavior.');
 return {blockers:[...new Set(blockers)],warnings,canAudition:blockers.length===0};
}
export function formatPuterAllowance(value){
 const info=value?.allowanceInfo;
 const remaining=Number(info?.remaining),total=Number(info?.monthUsageAllowance);
 const dollar=amount=>'$'+(amount/100000000).toFixed(2);
 if(!Number.isFinite(remaining)||!Number.isFinite(total)||total<=0||remaining<0)
   return 'Puter did not return a usable monthly balance. Check your Puter account dashboard.';
 const remainingText=dollar(remaining);
 return 'Account balance: '+remainingText+' of '+dollar(total)+' monthly allowance remaining ('+
   (100*remaining/total).toFixed(1)+'%). The allowance is shared across your Puter apps.';
}


/* OpenRouter's model catalog can contain paid models and free variants.
 * Only :free variants with explicitly zero prompt AND completion prices can
 * be selected. Do not offer zero-priced non-:free entries that may require
 * an account with pre-purchased credits.
 */
export function listVerifiedFreeModels(payload,limit=36){
 const entries=Array.isArray(payload?.data)?payload.data:[];
 const candidates=entries.filter(m=>{
   if(!isFreeOpenRouterModel(m?.id)||m.id===OPENROUTER_FREE_MODEL)return false;
   if(!m?.pricing||Number(m.pricing.prompt)!==0||Number(m.pricing.completion)!==0)return false;
   const input=m.architecture?.input_modalities;
   const output=m.architecture?.output_modalities;
   if(Array.isArray(input)&&!input.includes('text'))return false;
   if(Array.isArray(output)&&!output.includes('text'))return false;
   return (m.context_length||0)>=8000;
 });
 const score=m=>/\b(code|coding|programming|developer|software)\b/i.test(
   (m.name||'')+' '+(m.description||'').slice(0,260))?1:0;
 candidates.sort((a,b)=>score(b)-score(a)||
   (b.context_length||0)-(a.context_length||0)||
   String(a.name||a.id).localeCompare(String(b.name||b.id)));
 const unique=new Set();
 return candidates.filter(x=>!unique.has(x.id)&&unique.add(x.id)).slice(0,limit)
   .map(m=>({id:m.id,name:String(m.name||m.id).slice(0,110),
     contextLength:m.context_length||0}));
}

export function recentSuperColliderError(log){
 const text=String(log||'').slice(-30000);
 const matches=[...text.matchAll(/\b(?:ERROR|FAILURE|Exception|Parse error|Syntax Error)\b/gi)];
 if(!matches.length)return '';
 const last=matches.at(-1).index;
 // Include a preceding line if available, but never silently transmit the
 // entire user console. The user reviews this excerpt before clicking REVISE.
 const from=Math.max(0,text.lastIndexOf('\n',Math.max(0,last-2))+1);
 return text.slice(from,from+1200).trim();
}

const MAX_DRAFTS=5;
export function normalizeSoundDrafts(input){
 const data=input&&typeof input==='object'?input:{};
 const rows=Array.isArray(data.entries)?data.entries:[];
 const entries=[];
 for(const entry of rows.slice(-MAX_DRAFTS)){
   if(!entry||typeof entry!=='object'||typeof entry.code!=='string')continue;
   if(!entry.code.trim()||entry.code.length>36000)continue;
   if(!['openrouter','puter'].includes(entry.provider))continue;
   entries.push({
     code:entry.code,
     explanation:String(entry.explanation||'').slice(0,4000),
     description:String(entry.description||'').slice(0,1800),
     provider:entry.provider,
     model:String(entry.model||'unknown').slice(0,120)
   });
 }
 let current=Number.isInteger(data.current)?data.current:entries.length-1;
 current=Math.max(0,Math.min(Math.max(0,entries.length-1),current));
 return {version:1,entries,current};
}
