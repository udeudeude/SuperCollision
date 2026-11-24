/* Isolated Sounds artificial-intelligence instrument generator.
 * Reuses SuperCollision's pure SuperCollider prompts/validation; NEVER executes code.
 * Personal credentials stay in the current page and requests require user action. */
import {buildSoundMessages,responseText,parseSoundResponse,inspectSoundCode,
 PREFERRED_OPENROUTER_CODE_MODEL,OPENROUTER_FREE_MODEL,OPENROUTER_COMPLETION_TOKENS,
 isFreeOpenRouterModel,listVerifiedFreeModels,describeProviderFailure,completedCodeFence} from './sound-designer-core.mjs?v=4';
import {saveSound} from './sounds-store.mjs';
const $=id=>document.getElementById(id);
const provider=$('sounds-ai-provider'),keyBox=$('sounds-ai-key-box'),key=$('sounds-ai-key');
const model=$('sounds-ai-model'),prompt=$('sounds-ai-prompt'),revision=$('sounds-ai-revision');
const generate=$('sounds-ai-generate'),revise=$('sounds-ai-revise'),status=$('sounds-generate-status');
const result=$('sounds-ai-result'),preview=$('sounds-ai-code'),warnings=$('sounds-ai-review');
const save=$('sounds-ai-save'),copy=$('sounds-ai-copy'),puterConnect=$('sounds-puter-connect');
let current=null,busy=false,puterLoading=null;
const details=document.createElement('details');details.id='sounds-ai-request-details';details.innerHTML='<summary>Request details · exact messages and model</summary><pre id="sounds-ai-request-body" style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:340px;overflow:auto"></pre><button id="sounds-ai-copy-request" type="button">Copy request</button>';
status.after(details);
let lastRequest='';
details.querySelector('button').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(lastRequest);say('Request details copied.')}catch{say('Select the request text to copy it.')}});
function recordRequest(modelId,messages,settings){lastRequest=JSON.stringify({model:modelId,messages,...settings},null,2);details.querySelector('pre').textContent=lastRequest;}
function say(value){status.textContent=value}
function syncProvider(){const isPuter=provider.value==='puter';keyBox.hidden=isPuter;puterConnect.hidden=!isPuter;model.hidden=isPuter;refreshModels.hidden=isPuter;document.querySelector('label[for="sounds-ai-model"]').hidden=isPuter}
provider.addEventListener('change',syncProvider);
const refreshModels=document.createElement('button');refreshModels.type='button';refreshModels.textContent='Find available free models';model.after(refreshModels);
refreshModels.addEventListener('click',async()=>{refreshModels.disabled=true;say('Checking current OpenRouter free models…');try{const response=await fetch('https://openrouter.ai/api/v1/models?output_modalities=text',{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);const entries=listVerifiedFreeModels(await response.json());if(!entries.length)throw Error('No free text models available');const old=model.value;model.replaceChildren(new Option('Automatic free · OpenRouter routing',OPENROUTER_FREE_MODEL),...entries.map(m=>new Option(m.name+' · '+m.id,m.id)));model.value=[...model.options].some(o=>o.value===old)?old:OPENROUTER_FREE_MODEL;say(entries.length+' free models found. Choose one or use Automatic.');}catch(e){say('Model catalog unavailable: '+e.message)}finally{refreshModels.disabled=false}});
syncProvider();
for(const [id,text] of [
 [OPENROUTER_FREE_MODEL,'Automatic free · OpenRouter chooses an available model']
]){const option=document.createElement('option');option.value=id;option.textContent=text;model.append(option)}
async function loadPuter(){
 if(window.puter?.ai?.chat)return window.puter;
 if(!puterLoading)puterLoading=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://js.puter.com/v2/';
  script.onload=()=>window.puter?.ai?.chat?resolve(window.puter):reject(Error('Puter did not initialize'));
  script.onerror=()=>reject(Error('Could not load Puter'));
  document.head.append(script);
 }).catch(error=>{puterLoading=null;throw error});
 return puterLoading;
}
puterConnect.addEventListener('click',async()=>{
 puterConnect.disabled=true;say('Connecting to Puter…');
 try{
  const puter=await loadPuter();
  if(typeof puter.auth?.signIn==='function')await puter.auth.signIn();
  say('Puter connected. Generating will consume your personal Puter allowance.');
 }catch(error){say('Puter unavailable: '+error.message)}
 finally{puterConnect.disabled=false}
});
async function request(messages){
 if(provider.value==='openrouter'){
  const personalKey=key.value.trim(),chosen=model.value;
  if(!personalKey)throw Error('Provide your personal OpenRouter key. It is not stored.');
  if(!isFreeOpenRouterModel(chosen))throw Error('Selected model is not free.');
  recordRequest(chosen,messages,{temperature:0.45,max_completion_tokens:OPENROUTER_COMPLETION_TOKENS});
  say('Connecting to OpenRouter · '+chosen+'…');
  const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{
   method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',
    Authorization:'Bearer '+personalKey,'HTTP-Referer':location.origin,
    'X-Title':'SuperCollision Sounds'},
   body:JSON.stringify({model:chosen,messages,temperature:0.45,
    max_completion_tokens:OPENROUTER_COMPLETION_TOKENS})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
   const error=new Error(data.error?.message||'HTTP '+response.status);
   error.status=response.status;throw error;
  }
  say('OpenRouter responded · checking generated source…');
  const content=responseText(data);
  if(!content.trim())throw Error('Model '+(data.model||chosen)+' returned no usable text (finish reason: '+(data?.choices?.[0]?.finish_reason||'unknown')+'). Try another free model.');
  if(data?.choices?.[0]?.finish_reason==='length'&&!completedCodeFence(content))
   throw Error('The free model ran out of output tokens before completing the instrument.');
  return {content,model:data.model||chosen,provider:'openrouter'};
 }
 recordRequest('gpt-5.4-nano',messages,{temperature:0.5,max_tokens:3500});
 const puter=await loadPuter();
 if(!puter.ai?.chat)throw Error('Puter is not connected.');
 const data=await puter.ai.chat(messages,{model:'gpt-5.4-nano',normalize:true,
  max_tokens:3500,temperature:0.5,stream:false,fallback:false});
 const content=responseText(data);
 if(data?.finish_reason==='length'&&!completedCodeFence(content))
  throw Error('Puter stopped before completing the instrument; no automatic retry was made.');
 return {content,model:data?.model||'gpt-5.4-nano',provider:'puter'};
}
async function create(isRevision){
 if(busy)return;
 const description=prompt.value.trim();
 if(!description){say('Describe the sound you want.');prompt.focus();return}
 if(isRevision&&!current){say('Generate an instrument before requesting revisions.');return}
 if(isRevision&&!revision.value.trim()){say('Describe the desired revision first.');revision.focus();return}
 busy=true;generate.disabled=true;revise.disabled=true;say('Preparing request…');
 try{
  const messages=buildSoundMessages({description,revision:isRevision?revision.value:'',priorCode:isRevision?current?.code:''});
  const response=await request(messages);
  say('Response received · checking SuperCollider code…');
  const parsed=parseSoundResponse(response.content);
  const inspected=inspectSoundCode(parsed.code);
  current={code:parsed.code,description,explanation:parsed.explanation,model:response.model,
   provider:response.provider,review:inspected};
  preview.value=current.code;
  const notes=[...inspected.blockers.map(x=>'Blocker: '+x),...inspected.warnings];
  warnings.textContent=notes.join('\n');
  result.hidden=false;save.disabled=false;copy.disabled=false;revise.disabled=false;
  say('Generated with '+response.provider+' ('+response.model+'). Review source before saving or running it in SuperCollider.');
 }catch(error){
  say(describeProviderFailure(error,provider.value));
 }finally{busy=false;generate.disabled=false;revise.disabled=!current}
}
generate.addEventListener('click',()=>create(false));
revise.addEventListener('click',()=>create(true));
save.addEventListener('click',async()=>{
 if(!current)return;
 const name=prompt.value.trim().slice(0,120)||'Generated instrument';
 const code=preview.value.trim();
 if(!code){say('There is no code to save.');return}
 try{
  await saveSound({id:crypto.randomUUID(),name,source:'generated',created:Date.now(),favorite:false,
   code,generator:{provider:current.provider,model:current.model,description:current.description,
    explanation:current.explanation}});
  say('Saved generated SuperCollider source to your library, without executing it.');
 }catch(error){say('Could not save generated code: '+error.message)}
});
copy.addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(preview.value);say('SuperCollider code copied.')}
 catch{say('Clipboard unavailable. Select the code and copy manually.')}
});
