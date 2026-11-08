/* SuperCollision Sound Designer, opt-in per-user AI generation.
 * No developer credentials, no background inference, no automatic evaluation.
 */
import {
 SOUND_PRESETS,buildSoundMessages,responseText,parseSoundResponse,
 describeProviderFailure,OPENROUTER_FREE_MODEL,isFreeOpenRouterModel,
 inspectSoundCode,formatPuterAllowance
} from './sound-designer-core.mjs';

const AUTH_KEY='supercollision-openrouter-session-key-v1';
const OAUTH_KEY='supercollision-openrouter-pkce-v1';
const PROMPT_KEY='supercollision-openrouter-draft-v1';
const ENDPOINT='https://openrouter.ai/api/v1';
function node(tag,cls='',txt=''){
 const e=document.createElement(tag);
 if(cls)e.className=cls;
 if(txt)e.textContent=txt;
 return e;
}
function action(txt,id='',cls=''){
 const b=node('button',cls,txt);b.type='button';
 if(id)b.id=id;return b;
}
function removeTransientParams(){
 const u=new URL(location.href);
 ['code','state','error','error_description'].forEach(k=>u.searchParams.delete(k));
 history.replaceState(history.state,'',u.pathname+u.search+u.hash);
}
async function makeChallenge(){
 const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);
 const verifier=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
 const challenge=btoa(String.fromCharCode(...new Uint8Array(digest)))
   .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const state=Array.from(crypto.getRandomValues(new Uint8Array(18)),
    x=>x.toString(16).padStart(2,'0')).join('');
 return {verifier,challenge,state};
}
async function providerRequest({provider,messages,key,puter,signal}){
 if(provider==='openrouter'){
   if(!key)throw Error('Connect your OpenRouter account first.');
   const model=OPENROUTER_FREE_MODEL;
   if(!isFreeOpenRouterModel(model))throw Error('Refusing a nonfree OpenRouter model.');
   const response=await fetch(ENDPOINT+'/chat/completions',{
     signal,method:'POST',headers:{'Content-Type':'application/json',
       'Authorization':'Bearer '+key,'HTTP-Referer':location.origin,'X-Title':'SuperCollision Sound Designer'},
     body:JSON.stringify({model,messages,temperature:0.55,max_tokens:3500,
       usage:{include:true}})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok){
     const error=new Error(data?.error?.message||'HTTP '+response.status);
     error.status=response.status;throw error;
   }
   if(data?.choices?.[0]?.finish_reason==='length')
     throw Error('The model stopped before completing the code. Try a shorter sound description.');
   return {text:responseText(data),model:data?.model||model,usage:data?.usage};
 }
 if(provider==='puter'){
   if(!puter?.ai?.chat)throw Error('Load Puter and sign in first.');
   const response=await puter.ai.chat(messages,{
     // Explicitly select the inexpensive documented default, rather than
     // an automatically chosen expensive model.
     model:'gpt-5.4-nano',normalize:true,max_tokens:3500,
     temperature:0.5,stream:false,fallback:false,signal
   });
   if(response?.finish_reason==='length')
     throw Error('The model stopped before completing the code. Try a shorter description.');
   return {text:responseText(response),model:response?.model||'gpt-5.4-nano',
     usage:response?.usage||response?.usageDetails};
 }
 throw Error('Unknown provider');
}
function prettyUsage(usage){
 if(!usage||typeof usage!=='object')return '';
 const inp=usage.prompt_tokens??usage.input_tokens??usage.inputTokens;
 const out=usage.completion_tokens??usage.output_tokens??usage.outputTokens;
 if(Number.isFinite(inp)&&Number.isFinite(out))
   return ' · '+inp+' input + '+out+' output tokens';
 return '';
}
export function createSoundDesigner({host,editor,saveComposition,audition,stopAudio}){
 if(!host||!editor)throw Error('Sound Designer requires its panel and editor.');
 const box=node('div','sound-designer');
 const head=node('div','sound-head');
 const title=node('strong','','SOUND DESIGNER / LAB');
 const security=node('span','sound-tag','YOUR OWN QUOTA');
 head.append(title,security);
 const label=node('label','','PROVIDER');
 const provider=node('select');provider.id='sound-provider';provider.setAttribute('aria-label','Sound generation provider');
 [['openrouter','OpenRouter · free models'],['puter','Puter · personal allowance']].forEach(([v,t])=>{
   const opt=node('option','',t);opt.value=v;provider.append(opt);
 });
 const authPanel=node('div','sound-auth');
 const authStatus=node('span','sound-auth-status');authStatus.id='sound-auth-status';
 const authActions=node('div','sound-actions');
 const connect=action('CONNECT OPENROUTER','sound-connect');
 const disconnect=action('DISCONNECT','sound-disconnect','sound-secondary');
 const puterLoad=action('LOAD PUTER','sound-puter-load');
 const puterSignIn=action('SIGN IN TO PUTER','sound-puter-signin');
 const puterUsage=action('CHECK ALLOWANCE','sound-puter-usage','sound-secondary');
 const alternate=action('ENTER PERSONAL KEY','sound-manual-toggle','sound-link');
 const manual=node('div','sound-manual');manual.hidden=true;
 const manualInput=node('input');manualInput.type='password';manualInput.placeholder='OpenRouter personal key (session only)';
 manualInput.autocomplete='off';manualInput.setAttribute('aria-label','Personal OpenRouter key');
 const manualAccept=action('USE FOR THIS SESSION','sound-manual-save');
 manual.append(manualInput,manualAccept);
 authActions.append(connect,disconnect,puterLoad,puterSignIn,puterUsage,alternate);
 const allowance=node('pre','sound-allowance');allowance.hidden=true;
 authPanel.append(authStatus,authActions,manual,allowance);
 const promptLabel=node('label','','DESCRIBE A SOUND');
 const description=node('textarea');description.id='sound-description';
 description.rows=3;description.maxLength=1800;
 description.placeholder='Example: a deep wavering bagpipe drone with rough reeds';
 description.value=SOUND_PRESETS[0];
 const presets=node('div','sound-presets');
 SOUND_PRESETS.slice(0,5).forEach((p,i)=>{
   const b=action(['BAGPIPE','SNARE','TRAILER BWAAH','FLUTE','METALLIC'][i]);
   b.onclick=()=>{description.value=p;description.focus();};presets.append(b);
 });
 const includeWrap=node('label','sound-check');
 const include=node('input');include.type='checkbox';include.id='sound-include-source';
 includeWrap.append(include,node('span','','Send current composition as additional context (optional)'));
 const privacy=node('p','sound-fine',
  'Only the description, optional composition context, and previous result when revising are sent to the selected provider. No model request happens until GENERATE or REVISE is pressed.');
 const generate=action('GENERATE INSTRUMENT','sound-generate','sound-primary');
 const cancel=action('CANCEL REQUEST','sound-cancel','sound-secondary');
 cancel.hidden=true;
 const requestActions=node('div','sound-actions sound-request-actions');
 requestActions.append(generate,cancel);
 const status=node('p','sound-status','Ready. Connect a provider, then describe a sound.');
 status.id='sound-status';status.setAttribute('role','status');
 const scratch=node('section','sound-result');scratch.hidden=true;scratch.id='sound-result';
 const resultTop=node('div','sound-result-head');
 const resultTitle=node('strong','','GENERATED CODE · NOT YET RUN');
 const resultModel=node('small');
 resultTop.append(resultTitle,resultModel);
 const code=node('pre','sound-code');code.id='sound-code';
 const review=node('div','sound-review');review.id='sound-review';
 review.setAttribute('role','note');
 const explanation=node('p','sound-explanation');explanation.id='sound-explanation';
 const revisionLabel=node('label','','CHANGE THIS SOUND');
 const revision=node('textarea');revision.id='sound-revision';revision.rows=2;
 revision.placeholder='Example: rougher reed, less vibrato, longer decay';
 const resultActions=node('div','sound-actions sound-result-actions');
 const revise=action('REVISE','sound-revise','sound-primary');
 const copy=action('COPY CODE','sound-copy','sound-secondary');
 const save=action('SAVE AS NEW COMPOSITION','sound-save','sound-secondary');
 const test=action('AUDITION','sound-audition','sound-secondary');
 const halt=action('STOP ALL AUDIO','sound-stop','sound-secondary');
 resultActions.append(revise,copy,save,test,halt);
 const caution=node('p','sound-fine',
  'AUDITION explicitly runs the displayed code on the shared SuperCollider server. It can affect other playing sounds. STOP ALL AUDIO also stops your current composition. Generated code is untrusted until tested.');
 scratch.append(resultTop,code,review,explanation,revisionLabel,revision,resultActions,caution);
 const footer=node('p','sound-fine',
  'OpenRouter is restricted to its free-model route. Puter uses your own monthly allowance. No developer key is used, no paid OpenRouter models are requested, and no automatic retry is made.');
 box.append(head,label,provider,authPanel,promptLabel,description,presets,includeWrap,privacy,requestActions,status,scratch,footer);
 host.append(box);
 let key='';let puterLoaded=false;let pending=false;let latest=null;let currentAbort=null;
 try{key=sessionStorage.getItem(AUTH_KEY)||'';}catch{}
 try{
   const draft=sessionStorage.getItem(PROMPT_KEY);
   if(draft)description.value=draft;
 }catch{}
 function setStatus(text,warning=false){
   status.textContent=text;status.classList.toggle('sound-error',warning);
 }
 function refreshAuth(){
   const open=provider.value==='openrouter';
   connect.hidden=!open||!!key;disconnect.hidden=!open||!key;
   alternate.hidden=!open||!!key;
   puterLoad.hidden=open||puterLoaded;
   puterSignIn.hidden=open||!puterLoaded;
   puterUsage.hidden=open||!puterLoaded||!window.puter?.auth?.isSignedIn?.();
   if(open)authStatus.textContent=key?'OpenRouter connected · key stored only until this browser session ends':
     'OpenRouter not connected · free-model requests only';
   else authStatus.textContent=puterLoaded?
       (window.puter?.auth?.isSignedIn?.()?'Puter signed in':'Puter ready · sign in to use your allowance'):
       'Puter library not loaded. LOAD PUTER first.';
 }
 provider.onchange=()=>{allowance.hidden=true;manual.hidden=true;refreshAuth()};
 disconnect.onclick=()=>{
   key='';try{sessionStorage.removeItem(AUTH_KEY)}catch{}
   refreshAuth();setStatus('OpenRouter disconnected from this browser session.');
 };
 alternate.onclick=()=>{manual.hidden=!manual.hidden;manualInput.focus()};
 manualAccept.onclick=()=>{
   const k=manualInput.value.trim();
   if(!/^sk-or-[A-Za-z0-9_-]{15,}$/.test(k)){
     setStatus('Enter an OpenRouter personal key from your own account.',true);return;
   }
   key=k;manualInput.value='';manual.hidden=true;
   try{sessionStorage.setItem(AUTH_KEY,key)}catch{}
   refreshAuth();setStatus('Your personal OpenRouter key is ready for this browser session.');
 };
 connect.onclick=async()=>{
   try{
     if(!crypto?.subtle||!sessionStorage)throw Error('Secure browser storage is unavailable.');
     const proof=await makeChallenge();
     sessionStorage.setItem(OAUTH_KEY,JSON.stringify({verifier:proof.verifier,state:proof.state,
       timestamp:Date.now()}));
     sessionStorage.setItem(PROMPT_KEY,description.value);
     const params=new URLSearchParams({
       callback_url:location.origin+location.pathname,
       code_challenge:proof.challenge,code_challenge_method:'S256',
       state:proof.state,key_label:'SuperCollision Sound Designer'
     });
     location.assign('https://openrouter.ai/auth?'+params);
   }catch(e){setStatus('OpenRouter authorization could not start: '+e.message,true)}
 };
 async function oauthReturn(){
   const params=new URLSearchParams(location.search);
   if(!params.has('code')&&!params.has('error'))return;
   const oauthCode=params.get('code'),state=params.get('state'),error=params.get('error');
   removeTransientParams(); // prevent retaining an authorization code in browser history
   let pendingAuth=null;
   try{pendingAuth=JSON.parse(sessionStorage.getItem(OAUTH_KEY)||'null');
       sessionStorage.removeItem(OAUTH_KEY)}catch{}
   if(error){
     setStatus('OpenRouter authorization declined: '+error,true);return;
   }
   if(!pendingAuth||!state||state!==pendingAuth.state||Date.now()-pendingAuth.timestamp>12*60*1000){
     setStatus('OpenRouter authorization state expired or did not match. Please reconnect.',true);return;
   }
   try{
     setStatus('Exchanging one-time OpenRouter authorization...');
     const res=await fetch(ENDPOINT+'/auth/keys',{
       method:'POST',headers:{'Content-Type':'application/json'},
       body:JSON.stringify({code:oauthCode,code_verifier:pendingAuth.verifier,
         code_challenge_method:'S256'})
     });
     const json=await res.json().catch(()=>({}));
     if(!res.ok||!json.key)throw Error(json?.error?.message||'HTTP '+res.status);
     key=json.key;try{sessionStorage.setItem(AUTH_KEY,key);sessionStorage.removeItem(PROMPT_KEY)}catch{}
     provider.value='openrouter';refreshAuth();setStatus('OpenRouter connected. Choose GENERATE to use one free request.');
     window.setSuperCollisionView?.('design');
   }catch(e){setStatus('OpenRouter key exchange failed: '+e.message,true)}
 }
 let puterLoading=null;
 function loadPuter(){
   if(window.puter?.ai?.chat){puterLoaded=true;refreshAuth();return Promise.resolve(window.puter)}
   if(puterLoading)return puterLoading;
   puterLoading=new Promise((resolve,reject)=>{
     const script=document.createElement('script');script.src='https://js.puter.com/v2/';
     script.async=true;
     script.onload=()=>{
       if(window.puter?.ai?.chat){puterLoaded=true;refreshAuth();resolve(window.puter)}
       else reject(Error('Puter library loaded without its chat interface.'));
     };
     script.onerror=()=>reject(Error('Puter script was blocked. Check cross-origin isolation and network settings.'));
     document.head.append(script);
   }).catch(e=>{puterLoading=null;throw e});
   return puterLoading;
 }
 puterLoad.onclick=async()=>{
   puterLoad.disabled=true;setStatus('Loading Puter on this device...');
   try{await loadPuter();setStatus('Puter loaded. Tap SIGN IN TO PUTER.')}
   catch(e){setStatus(e.message,true)}
   finally{puterLoad.disabled=false;refreshAuth()}
 };
 puterSignIn.onclick=async()=>{
   // Important: invoke signIn() synchronously inside the trusted click event,
   // not after an awaited network request, because iPhone Safari blocks delayed popups.
   if(!puterLoaded||!window.puter)return;
   let request;
   try{request=window.puter.auth.signIn()}
   catch(e){setStatus('Puter sign-in failed: '+e.message,true);return}
   setStatus('Complete Puter sign-in in the opened window.');
   try{await request;refreshAuth();setStatus('Puter connected. GENERATE will use your Puter allowance.')}
   catch(e){setStatus('Puter sign-in failed: '+(e?.msg||e?.message||String(e)),true)}
 };
 puterUsage.onclick=async()=>{
   if(!window.puter?.auth?.isSignedIn?.())return;
   puterUsage.disabled=true;
   try{
     const data=await window.puter.auth.getMonthlyUsage();
     // Puter's documented allowance numbers are denominated in microcents.
     allowance.textContent='MONTHLY ALLOWANCE\n'+formatPuterAllowance(data);
     allowance.hidden=false;setStatus('Monthly allowance information retrieved from Puter.');
   }catch(e){setStatus('Allowance lookup failed: '+e.message,true)}
   finally{puterUsage.disabled=false}
 };
 function busy(flag){
   pending=flag;generate.disabled=flag;revise.disabled=flag;provider.disabled=flag;
   cancel.hidden=!flag;
   generate.textContent=flag?'GENERATING...':'GENERATE INSTRUMENT';
   revise.textContent=flag?'GENERATING...':'REVISE';
 }
 cancel.onclick=()=>{
   if(!pending||!currentAbort)return;
   currentAbort.abort();
   cancel.disabled=true;
   setStatus('Cancellation requested. A provider may still count an already-started request.');
 };
 function renderInspection(inspection){
   review.replaceChildren();
   for(const issue of inspection.blockers){
     const item=node('p','sound-blocker','AUDITION BLOCKED: '+issue);
     review.append(item);
   }
   for(const issue of inspection.warnings){
     const item=node('p','sound-review-note',issue);
     review.append(item);
   }
   test.disabled=!inspection.canAudition;
   test.title=inspection.canAudition?'Review the generated code before auditioning':
     'Audition disabled because the generated source failed local checks.';
 }
 async function generateSound(isRevision=false){
   if(pending)return;
   const chosen=provider.value;
   if(chosen==='openrouter'&&!key){setStatus('Connect your OpenRouter account before generating.',true);return}
   if(chosen==='puter'&&!window.puter?.auth?.isSignedIn?.()){
     setStatus('Load Puter and sign in before generating.',true);return;
   }
   let messages;
   try{
     messages=buildSoundMessages({
       description:description.value,revision:isRevision?revision.value:'',
       priorCode:isRevision?latest?.code||'':'',
       includeCode:include.checked,currentCode:editor.value
     });
   }catch(e){setStatus(e.message,true);return}
   // Keep the previous result visible if this user-funded request fails.
   const controller=new AbortController();
   currentAbort=controller;
   cancel.disabled=false;
   const timeout=setTimeout(()=>controller.abort('timeout'),90000);
   busy(true);
   setStatus('Request sent to '+(chosen==='openrouter'?'OpenRouter free models':'Puter')+
     '. This uses one request from your own account.');
   try{
     const answer=await providerRequest({
       provider:chosen,messages,key,puter:window.puter,signal:controller.signal
     });
     if(controller.signal.aborted)return;
     const parsed=parseSoundResponse(answer.text);
     const inspection=inspectSoundCode(parsed.code);
     latest={...parsed,inspection,description:description.value,model:answer.model,provider:chosen};
     scratch.hidden=false;
     code.textContent=parsed.code;explanation.textContent=parsed.explanation||
       'Generated SuperCollider code. Examine it before auditioning.';
     renderInspection(inspection);
     resultModel.textContent=chosen.toUpperCase()+' · '+answer.model;
     setStatus((isRevision?'Revised':'Generated')+' instrument received'+prettyUsage(answer.usage)+
       '. Your current composition is unchanged.');
     scratch.scrollIntoView({block:'nearest',behavior:'smooth'});
   }catch(e){
     if(controller.signal.aborted)
       setStatus('Request cancelled or timed out. It may still count toward your provider quota.',true);
     else setStatus(describeProviderFailure(e,chosen==='openrouter'?'OpenRouter':'Puter'),true);
   }finally{
     clearTimeout(timeout);
     if(currentAbort===controller)currentAbort=null;
     busy(false);
   }
 }
 generate.onclick=()=>generateSound();
 revise.onclick=()=>generateSound(true);
 copy.onclick=async()=>{
   if(!latest)return;
   try{await navigator.clipboard.writeText(latest.code);setStatus('Generated SuperCollider code copied.')}
   catch(e){setStatus('Copy failed: '+e.message,true)}
 };
 save.onclick=()=>{
   if(!latest)return;
   try{
     const name='AI sound · '+latest.description.slice(0,45);
     const saved=saveComposition({name,code:latest.code});
     window.setSuperCollisionView?.('code');
     setStatus('Saved as new composition: '+saved+'. Original composition preserved.');
   }catch(e){setStatus('Could not save the composition: '+e.message,true)}
 };
 test.onclick=()=>{
   if(!latest)return;
   if(!latest.inspection.canAudition){
     setStatus('Cannot audition: generated code failed local preflight checks.',true);return;
   }
   try{
     const result=audition(latest.code);
     if(!result){setStatus('Press POWER and wait for the audio server before auditioning.',true);return}
     setStatus('Audition submitted to the SuperCollider audio server. The original editor code was not changed.');
   }catch(e){setStatus('Audition failed: '+e.message,true)}
 };
 halt.onclick=()=>{stopAudio();setStatus('Stop command sent to all running SuperCollider sounds.')};
 refreshAuth();
 oauthReturn();
 return {
   open(){window.setSuperCollisionView?.('design')},
   get latest(){return latest},
   get connected(){return !!key},
   get provider(){return provider.value},
   get pending(){return pending}
 };
}
