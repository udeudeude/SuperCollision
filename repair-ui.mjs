/* Repair mode: keep instructions, keyboard, and code visible together.
 * Never changes source except for an explicitly requested, uniquely located edit.
 */
import {resolveCorrection} from './error-guide.mjs?v=2';
export function createRepairUI({editor}){
 const frame=editor.closest('.editor-frame');
 const panel=document.createElement('section');
 panel.id='repair-panel';panel.className='repair-panel';panel.hidden=true;
 panel.setAttribute('role','region');
 panel.setAttribute('aria-label','Fix an error while editing');
 panel.innerHTML=`
   <div class="repair-head">
     <strong id="repair-title">FIX AN ERROR</strong>
     <button type="button" id="repair-close">DONE</button>
   </div>
   <p id="repair-description"></p>
   <div id="repair-preview" class="repair-preview">
     <div><small>IN YOUR CODE</small><code id="repair-before"></code></div>
     <div><small>REPLACE WITH</small><code id="repair-after"></code></div>
   </div>
   <p id="repair-feedback" role="status"></p>
   <div class="repair-actions">
     <button type="button" id="repair-apply">APPLY THIS FIX</button>
     <button type="button" id="repair-undo" hidden>UNDO FIX</button>
     <button type="button" id="repair-location">GO TO ERROR</button>
   </div>`;
 frame.insertAdjacentElement('beforebegin',panel);
 const find=id=>panel.querySelector('#'+id);
 const title=find('repair-title'),description=find('repair-description');
 const preview=find('repair-preview'),before=find('repair-before'),after=find('repair-after');
 const feedback=find('repair-feedback'),apply=find('repair-apply'),undo=find('repair-undo');
 const location=find('repair-location');
 const trigger=document.createElement('button');
 trigger.id='repair-open-button';trigger.type='button';trigger.hidden=true;
 trigger.textContent='FIX ERROR';trigger.title='Edit with the error explanation visible above the code';
 document.querySelector('#engine-status').insertAdjacentElement('afterend',trigger);
 // Prevent panel buttons from dismissing the iPhone keyboard or moving the caret.
 panel.addEventListener('pointerdown',event=>{
   if(event.target.closest('button'))event.preventDefault();
 });
 let latest=null,applied=null,showing=false,key='';
 const visual=window.visualViewport;
 function revealCaret(){
   if(!showing||document.activeElement!==editor)return;
   // Shrinking the editor for the keyboard must not leave its insertion point
   // below the visible text area. Scroll the editor, never change the caret.
   const lines=editor.value.slice(0,editor.selectionStart).split('\n').length-1;
   const step=parseFloat(getComputedStyle(editor).lineHeight)||21;
   const y=12+lines*step,top=editor.scrollTop,bottom=top+editor.clientHeight;
   if(y<top+step)editor.scrollTop=Math.max(0,y-step);
   else if(y+step>bottom-step)
     editor.scrollTop=Math.max(0,y+2*step-editor.clientHeight);
 }
 function resize(){
   if(!showing)return;
   const height=visual?.height||window.innerHeight;
   document.body.style.setProperty('--repair-visual-height',Math.max(280,height)+'px');
   document.body.style.setProperty('--repair-dock-height',
     Math.max(128,Math.min(172,Math.round(height*.34)))+'px');
   requestAnimationFrame(revealCaret);
 }
 visual?.addEventListener('resize',resize);
 window.addEventListener('resize',resize);
 function sameApplied(){
   if(!applied)return false;
   return editor.value.slice(applied.start,applied.start+applied.after.length)===applied.after;
 }
 function draw(){
   if(!latest||!showing)return;
   const patch=resolveCorrection(editor.value,latest.fix);
   title.textContent=latest.title+(latest.line?' · line '+latest.line:'');
   description.textContent=latest.message;
   preview.hidden=!(latest.fix||latest.correction);
   before.textContent=latest.fix?.before||'Exact code location not verified.';
   after.textContent=latest.fix?.after||latest.correction||'';
   apply.hidden=!latest.fix||!!applied;
   apply.disabled=!patch;
   undo.hidden=!applied;
   undo.disabled=!!applied&&!sameApplied();
   location.hidden=!(patch||latest.line);
   location.textContent=patch?'GO TO THIS CODE':'GO TO REPORTED LINE';
   if(applied){
     feedback.textContent=sameApplied()?
       'Correction applied. Your cursor stays where it was. Press RUN when ready.':
       'The corrected code has changed since it was applied. Undo is unavailable.';
   }else if(latest.fix){
     feedback.textContent=patch?
       'Review the exact change above. Nothing changes until you tap APPLY.':
       'This expression was changed or removed. Edit manually or run again.';
   }else{
     feedback.textContent='No safely identified one-tap correction. Edit the code manually.';
   }
 }
 function preserveEdit(start,end,replacement){
   const a=editor.selectionStart,b=editor.selectionEnd;
   const top=editor.scrollTop,left=editor.scrollLeft,delta=replacement.length-(end-start);
   const translate=pos=>pos<=start?pos:pos>=end?pos+delta:start+replacement.length;
   editor.setRangeText(replacement,start,end,'preserve');
   editor.setSelectionRange(translate(a),translate(b));
   editor.scrollTop=top;editor.scrollLeft=left;
   editor.dispatchEvent(new Event('input',{bubbles:true}));
   // A direct action on the repair dock must not dismiss the keyboard.
   editor.focus({preventScroll:true});
 }
 function goToError(){
   if(!latest)return;
   const patch=resolveCorrection(editor.value,latest.fix);
   let pos=patch?.start;
   if(pos===undefined&&latest.line){
     const lines=editor.value.split('\n'),line=Math.max(1,Math.min(lines.length,latest.line));
     pos=lines.slice(0,line-1).reduce((n,s)=>n+s.length+1,0);
   }
   if(pos===undefined)return;
   editor.focus({preventScroll:true});
   editor.setSelectionRange(pos,pos);
   const line=editor.value.slice(0,pos).split('\n').length;
   const step=parseFloat(getComputedStyle(editor).lineHeight)||21;
   editor.scrollTop=Math.max(0,(line-3)*step);
   editor.dispatchEvent(new Event('scroll'));
 }
 apply.addEventListener('click',()=>{
   const patch=resolveCorrection(editor.value,latest?.fix);
   if(!patch){draw();return}
   preserveEdit(patch.start,patch.end,patch.after);
   applied={start:patch.start,before:patch.before,after:patch.after};
   draw();
 });
 undo.addEventListener('click',()=>{
   if(!sameApplied())return;
   preserveEdit(applied.start,applied.start+applied.after.length,applied.before);
   applied=null;draw();
 });
 location.addEventListener('click',goToError);
 function close(){
   showing=false;panel.hidden=true;
   document.body.classList.remove('repair-open');
   document.body.style.removeProperty('--repair-visual-height');
   document.body.style.removeProperty('--repair-dock-height');
   window.SCLanguageTools?.suspend?.(false);
 }
 function open({jump=false}={}){
   if(!latest)return;
   // This explicit user action changes the workbench to CODE, never an error
   // arriving during playback. Selection and scroll position are preserved.
   const a=editor.selectionStart,b=editor.selectionEnd,top=editor.scrollTop,left=editor.scrollLeft;
   window.setSuperCollisionView?.('code');
   showing=true;panel.hidden=false;document.body.classList.add('repair-open');
   window.SCLanguageTools?.suspend?.(true);
   resize();draw();
   editor.focus({preventScroll:true});
   editor.setSelectionRange(a,b);
   editor.scrollTop=top;editor.scrollLeft=left;
   if(jump)goToError();
   else requestAnimationFrame(revealCaret);
 }
 function offer(info){
   if(!info)return;
   const id=info.kind+'|'+info.title+'|'+(info.fix?.before||'')+'|'+(info.line||'');
   if(key!==id){applied=null;key=id}
   latest=info;
   trigger.hidden=false;
   trigger.textContent=info.fix?'FIX ERROR':'ERROR HELP';
   document.body.classList.add('repair-available');
   draw();
 }
 function clear(){
   close();latest=null;applied=null;key='';
   trigger.hidden=true;document.body.classList.remove('repair-available');
 }
 find('repair-close').addEventListener('click',close);
 trigger.addEventListener('click',()=>open());
 editor.addEventListener('input',()=>{if(showing)draw()});
 return {open,offer,close,clear,get active(){return showing},get latest(){return latest}};
}
