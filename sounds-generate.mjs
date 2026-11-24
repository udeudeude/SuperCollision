/* Isolated Sounds artificial-intelligence instrument generator.
 * Reuses SuperCollision's pure SuperCollider prompts/validation; NEVER executes code.
 * Personal credentials stay in the current page and requests require user action. */
import {buildSoundMessages,responseText,parseSoundResponse,inspectSoundCode,
 PREFERRED_OPENROUTER_CODE_MODEL,OPENROUTER_FREE_MODEL,OPENROUTER_COMPLETION_TOKENS,
 isFreeOpenRouterModel,describeProviderFailure,completedCodeFence} from './sound-designer-core.mjs?v=4';
import {saveSound} from './sounds-store.mjs';
const $=id=>document.getElementById(id);
const provider=$('sounds-ai-provider'),keyBox=$('sounds-ai-key-box'),key=$('sounds-ai-key');
const model=$('sounds-ai-model'),prompt=$('sounds-ai-prompt'),revision=$('sounds-ai-revision');
const generate=$('sounds-ai-generate'),revise=$('sounds-ai-revise'),status=$('sounds-generate-status');
const result=$('sounds-ai-result'),preview=$('sounds-ai-code'),warnings=$('sounds-ai-review');
const save=$('sounds-ai-save'),copy=$('sounds-ai-copy'),puterConnect=$('sounds-puter-connect');
const proposal=$('sounds-ai-proposal'),proposedCode=$('sounds-ai-proposed-code');
const applyProposal=$('sounds-ai-apply-proposal'),discardProposal=$('sounds-ai-discard-proposal');
let current=null,staged=null,busy=false,puterLoading=null;
function say(value){status.textContent=value}
function reviewDraft(){
 if(!current)return;
 const review=inspectSoundCode(preview.value);
 current.review=review;
 warnings.textContent=[...review.blockers.map(x=>'Blocker: '+x),...review.warnings].join('\n');
}
function useGenerated(next){
 current=next;
 preview.value=next.code;
 result.hidden=false;save.disabled=false;copy.disabled=false;
 reviewDraft();revise.disabled=false;
}
function clearProposal(){
 staged=null;proposedCode.value='';proposal.hidden=true;
 generate.disabled=busy;revise.disabled=busy||!current;
}
preview.addEventListener('input',reviewDraft);
applyProposal.addEventListener('click',()=>{
 if(!staged)return;
 const next=staged;clearProposal();useGenerated(next);
 say('Applied the proposed code. Review and edit it before saving.');
});
discardProposal.addEventListener('click',()=>{
 clearProposal();say('Kept your edited draft. The other proposal was discarded.');
});
function syncProvider(){const isPuter=provider.value==='puter';keyBox.hidden=isPuter;puterConnect.hidden=!isPuter;model.hidden=isPuter;document.querySelector('label[for="sounds-ai-model"]').hidden=isPuter}
provider.addEventListener('change',syncProvider);syncProvider();
for(const [id,text] of [
 [PREFERRED_OPENROUTER_CODE_MODEL,'Recommended free coding model'],
 [OPENROUTER_FREE_MODEL,'Automatic free model (variable quality)']
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
  const content=responseText(data);
  if(data?.choices?.[0]?.finish_reason==='length'&&!completedCodeFence(content))
   throw Error('The free model ran out of output tokens before completing the instrument.');
  return {content,model:data.model||chosen,provider:'openrouter'};
 }
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
 if(staged){say('Choose whether to keep your draft or use the pending proposal first.');return}
 const description=prompt.value.trim();
 if(!description){say('Describe the sound you want.');prompt.focus();return}
 if(isRevision&&!current){say('Generate an instrument before requesting revisions.');return}
 if(isRevision&&!revision.value.trim()){say('Describe the desired revision first.');revision.focus();return}
 // Revise what the user can see and edit, rather than an earlier model response.
 const priorCode=isRevision?preview.value:'';
 if(isRevision&&!priorCode.trim()){say('The current code is empty. Edit it or generate a new instrument.');preview.focus();return}
 const draftAtRequest=preview.value;
 busy=true;generate.disabled=true;revise.disabled=true;
 say('Generating SuperCollider source. No sound will be played automatically.');
 try{
  const messages=buildSoundMessages({description,revision:isRevision?revision.value:'',priorCode});
  const response=await request(messages);
  const parsed=parseSoundResponse(response.content);
  const next={code:parsed.code,description,explanation:parsed.explanation,model:response.model,
   provider:response.provider,review:inspectSoundCode(parsed.code)};
  if(!result.hidden&&preview.value!==draftAtRequest){
   // The user edited while the request was in flight; the result is a proposal, not an overwrite.
   staged=next;proposedCode.value=next.code;proposal.hidden=false;
   say('A new proposal is ready. Your newer code edits were preserved; review the proposal before replacing your draft.');
  }else{
   useGenerated(next);
   say('Generated with '+response.provider+' ('+response.model+'). Review the editable source before saving or running it in SuperCollider.');
  }
 }catch(error){
  say(describeProviderFailure(error,provider.value));
 }finally{
  busy=false;generate.disabled=!!staged;revise.disabled=!current||!!staged;
 }
}
generate.addEventListener('click',()=>create(false));
revise.addEventListener('click',()=>create(true));
save.addEventListener('click',async()=>{
 if(!current)return;
 const name=current.description.slice(0,120)||'Generated instrument';
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
