/* Optional local learning layer. Never evaluates or rewrites SuperCollider source. */
const STORAGE='supercollision-learning-mode-v1';
const MODES=['off','reference','guided'];
const LESSONS={
  SinOsc:['Sine oscillator','SinOsc.ar(freq, phase, mul, add) generates a sine wave. The first argument is frequency in hertz.','Try changing 440 to 220, then listen for the octave difference.'],
  SynthDef:['Synthesizer definition','SynthDef(\\name, { |arguments| ... }) describes a reusable synthesis graph. .add sends its definition to the server.','Find the argument list between vertical bars. Which values can you change when creating a Synth?'],
  Synth:['Synth instance','Synth(\\name, [\\parameter, value]) creates a node from an existing SynthDef on the server.','What happens if you create two Synth instances from the same definition?'],
  Routine:['Routine','Routine({ ... }) defines a resumable sequence. Calling .play schedules it on a clock.','Find each .wait. What controls the time between notes?'],
  Pbind:['Pattern binding','Pbind pairs event keys with patterns of values. A stream of events is produced when played.','Find the instrument and duration keys. What might happen if you change dur?'],
  EnvGen:['Envelope generator','EnvGen evaluates an envelope. doneAction: 2 can free the synth when its envelope completes.','What would happen to a note if its envelope never released?'],
  Out:['Audio bus output','Out.ar(bus, signal) writes a signal to an audio bus. Bus 0 is commonly the first output.','How many channels does the signal have? Look for ! 2.'],
  s:['Default server variable','s conventionally refers to the default SuperCollider server. s.boot starts it; s.sync waits for queued server operations.','Why might a Routine need s.sync after adding a SynthDef?'],
  ar:['Audio rate','The .ar method constructs an audio-rate unit generator, generally calculated once per sample.','Compare an oscillator using .ar with a control signal using .kr.'],
  kr:['Control rate','The .kr method constructs a control-rate unit generator, generally updated once per control block.','Which parts of your patch need sample-by-sample updates?'],
  play:['Play method','The meaning of .play depends on its receiver: a Function, Pattern, or Routine can each respond differently.','Identify the expression immediately to the left of .play.'],
  wait:['Yield from a Routine','Inside a scheduled Routine or Task, .wait yields until the clock resumes execution.','What happens if you halve the wait duration?'],
  var:['Local variable','var declares a local variable. In a function, declarations precede ordinary executable statements.','Find where the variable is first assigned and later read.'],
  tilde:['Environment variable','A leading ~ accesses a variable in the current Environment, often used to retain Synth references.','Can you find where the same ~variable is assigned and later used?'],
  backslash:['Symbol literal','\\name is a Symbol, commonly used for SynthDef names and control keys. It is not a string.','Where is the same symbol used to define and then instantiate an instrument?'],
  braces:['Function','{ ... } defines a Function. The code inside is not executed merely by writing the braces.','What action causes this function to run?'],
  brackets:['Array','[ ... ] creates an Array. Arrays often hold pitches, chord notes, or parameter pairs.','How would adding one number change this array?'],
  bars:['Function arguments','|freq=440, amp=0.1| declares named function arguments with defaults.','Which argument could you expose to make an instrument easier to control?'],
  semicolon:['Statement separator','A semicolon separates statements. The final expression of a Function is its return value.','What happens when you remove a semicolon between two statements?']
};

/* Context hints are lexical, not a claim to parse the full SuperCollider grammar.
 * Comments and quoted text are masked while preserving source offsets.
 */
export function visibleCode(source){
  const chars=String(source).split('');
  let quote='',line=false,block=0,escaped=false;
  for(let i=0;i<chars.length;i++){
    const c=chars[i],next=chars[i+1];
    if(line){if(c==='\n')line=false;else chars[i]=' ';continue}
    if(block){
      if(c==='/'&&next==='*'){block++;chars[i]=chars[++i]=' ';continue}
      if(c==='*'&&next==='/'){block--;chars[i]=chars[++i]=' ';continue}
      if(c!=='\n')chars[i]=' ';
      continue;
    }
    if(quote){
      if(escaped){escaped=false;chars[i]=' ';continue}
      if(c==='\\'){escaped=true;chars[i]=' ';continue}
      if(c===quote)quote='';
      if(c!=='\n')chars[i]=' ';
      continue;
    }
    if(c==='/'&&next==='/'){line=true;chars[i]=chars[++i]=' ';continue}
    if(c==='/'&&next==='*'){block=1;chars[i]=chars[++i]=' ';continue}
    if(c==='"'||c==="'"){quote=c;chars[i]=' '}
  }
  return chars.join('');
}
const sinePattern=/\bSinOsc\s*\.\s*ar\s*\(\s*(\d+(?:\.\d+)?|\.\d+)\s*(?:,\s*(\d+(?:\.\d+)?|\.\d+)\s*(?:,\s*(\d+(?:\.\d+)?|\.\d+)\s*)?)?\)/g;
function niceNumber(n){return String(Number(n.toPrecision(7)))}
/* Only literal, unmodulated sine oscillators can use this comparison. */
export function findPitchExperiment(source,position=null){
  const clean=visibleCode(source),candidates=[];
  for(const m of clean.matchAll(sinePattern)){
    const frequency=Number(m[1]),phase=m[2]===undefined?0:Number(m[2]);
    const amplitude=m[3]===undefined?1:Number(m[3]);
    if(!Number.isFinite(frequency)||frequency<20||frequency>4000||
       phase!==0||!Number.isFinite(amplitude)||amplitude<=0||amplitude>1)continue;
    const end=m.index+m[0].length;
    const variantFrequency=frequency<=1000?frequency*2:frequency/2;
    const expression=source.slice(m.index,end);
    const opening=expression.indexOf('(')+1;
    const rel=expression.slice(opening).indexOf(m[1])+opening;
    const variation=expression.slice(0,rel)+niceNumber(variantFrequency)+expression.slice(rel+m[1].length);
    candidates.push({start:m.index,end,frequency,variantFrequency,
      amplitude,expression,variation,direction:variantFrequency>frequency?'higher':'lower'});
  }
  if(!candidates.length)return null;
  if(position===null)return candidates[0];
  candidates.sort((a,b)=>Math.abs(a.start-position)-Math.abs(b.start-position));
  return Math.abs(candidates[0].start-position)<=100?candidates[0]:null;
}
const GUIDED_PATTERNS=[
  {id:'sine',regex:/\bSinOsc\s*\.\s*ar\s*\(/,token:'SinOsc',category:'SOUND',
   title:'How does this sine oscillator work?',question:'Explore frequency and pitch in your own code.'},
  {id:'definition',regex:/\bSynthDef\s*\(/,token:'SynthDef',category:'SYNTAX',
   title:'How does a synthesizer definition become an instrument?',question:'Follow the definition, arguments, and .add.'},
  {id:'routine',regex:/\bRoutine\s*\(/,token:'Routine',category:'SYNTAX',
   title:'How does a Routine schedule notes?',question:'Find out what .play and .wait mean.'},
  {id:'rates',regex:/\.ar\s*\(/,token:'ar',category:'SYNTAX',
   title:'What does .ar mean?',question:'Compare audio-rate and control-rate methods.'},
  {id:'pattern',regex:/\bPbind\s*\(/,token:'Pbind',category:'SYNTAX',
   title:'How does Pbind produce a sequence?',question:'Explore event keys and patterns.'},
  {id:'envelope',regex:/\bEnvGen\s*\.\s*(?:kr|ar)\s*\(/,token:'EnvGen',category:'SOUND',
   title:'Why does this sound change over time?',question:'Trace the envelope and its release.'},
  {id:'variable',regex:/\bvar\s+[A-Za-z_]/,token:'var',category:'SYNTAX',
   title:'What is a local variable?',question:'See where a value is declared and reused.'},
  {id:'output',regex:/\bOut\s*\.\s*ar\s*\(/,token:'Out',category:'SOUND',
   title:'Where does this sound go?',question:'Explore the audio bus and channels.'},
  {id:'environment',regex:/~[A-Za-z_]\w*/,token:'tilde',category:'SYNTAX',
   title:'What does the ~ prefix mean?',question:'Learn about environment variables.'},
  {id:'function',regex:/\{\s*(?:\||[A-Za-z_])/,token:'braces',category:'SYNTAX',
   title:'Why is the code inside braces?',question:'Explore functions and when they execute.'}
];
export function contextualSuggestions(source,limit=3){
  const clean=visibleCode(source),out=[];
  for(const def of GUIDED_PATTERNS){
    const match=def.regex.exec(clean);
    if(!match)continue;
    const possible=def.id==='sine'?findPitchExperiment(source,match.index):null;
    out.push({id:def.id,token:def.token,category:def.category,
      title:possible?'Predict what changing this pitch will do':def.title,
      question:possible?'Hear the original frequency and a one-octave variation.':def.question,
      start:match.index,end:match.index+match[0].length,
      experiment:possible});
    if(out.length>=limit)break;
  }
  return out;
}

function tokenAt(text,pos){
  const left=text.slice(0,pos),right=text.slice(pos);
  const a=/[A-Za-z_][A-Za-z_0-9]*$/.exec(left),b=/^[A-Za-z_0-9]*/.exec(right);
  return (a?.[0]||'')+(b?.[0]||'');
}
export function explainSelection(source,start,end){
  const selected=source.slice(start,end).trim();
  let token=selected&&/^[A-Za-z_][\w]*$/.test(selected)?selected:tokenAt(source,start);
  if(!token){
    const ch=source[start]||source[start-1];
    token=ch==='~'?'tilde':ch==='\\'?'backslash':ch==='{'||ch==='}'?'braces':ch==='['||ch===']'?'brackets':ch==='|'?'bars':ch===';'?'semicolon':'';
  }
  const entry=LESSONS[token];
  if(entry)return {token,title:entry[0],explanation:entry[1],experiment:entry[2]};
  return {token:token||selected.slice(0,50),title:token||'Selected expression',
    explanation:'No verified local explanation for this expression yet. Inspect its receiver, arguments and surrounding syntax. Consult the official SuperCollider help for class and method details.',
    experiment:'Try changing one value at a time in a copy of your composition.'};
}
export function errorLesson(output){
  const text=String(output);
  if(/Class not defined|not defined/i.test(text))return ['Unknown class or name','Check the spelling and capitalization of the name. Is it a class, a variable, or a Symbol?','Compare the exact name against its definition or the SuperCollider help index.'];
  if(/Message .*not understood|doesNotUnderstand/i.test(text))return ['Message not understood','Identify the receiver immediately before the method name. What kind of object is it?','Check whether that receiver implements the requested method, and whether you meant .ar, .kr, or .play.'];
  if(/syntax error|parse failed|unexpected|expected/i.test(text))return ['Syntax error','Find the first reported line and check paired parentheses, brackets, braces, quotes and vertical bars.','Inspect the statement just before the reported location. A missing delimiter can shift the apparent error.'];
  if(/ERROR:|FAILURE/i.test(text))return ['Execution error','Read the first error line. Was the failure in the language interpreter or the audio server?','Check whether the server is booted and whether required SynthDefs or buffers have been created.'];
  return null;
}
export function createLearning({editor,host,modeSelect,openButton,onChange=()=>{}}){
  let saved='guided';try{saved=localStorage.getItem(STORAGE)||'guided'}catch{}
  let mode=MODES.includes(saved)?saved:'guided',dismissed=false,lastError='',hintIndex=0,activeError=null;
  const panel=document.createElement('section');panel.className='learning-panel';panel.hidden=true;
  panel.setAttribute('aria-label','SuperCollider learning');
  const header=document.createElement('div');header.className='learning-header';
  const heading=document.createElement('strong');heading.textContent='LEARN';
  const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Close learning panel');
  header.append(heading,close);
  const title=document.createElement('strong'),body=document.createElement('p'),extra=document.createElement('p');
  const actions=document.createElement('div');actions.className='learning-actions';
  const hint=document.createElement('button');hint.type='button';hint.textContent='Next hint';
  const skip=document.createElement('button');skip.type='button';skip.textContent="I'm not trying to learn right now";
  const experiment=document.createElement('button');experiment.type='button';experiment.textContent='Experiment idea';
  actions.append(hint,experiment,skip);
  const selected=document.createElement('pre');selected.className='learning-selected';
  const terms=document.createElement('p');terms.className='learning-terms';
  const official=document.createElement('a');official.className='learning-official';
  official.target='_blank';official.rel='noopener noreferrer';official.textContent='Official SuperCollider documentation';
  const suggestionArea=document.createElement('div');
  suggestionArea.className='learning-suggestions';suggestionArea.hidden=true;
  const back=document.createElement('button');back.type='button';back.className='learning-back';
  back.textContent='← Other learning suggestions';back.hidden=true;
  const experimentArea=document.createElement('div');experimentArea.className='learning-experiment';experimentArea.hidden=true;
  const experimentCode=document.createElement('pre');experimentCode.className='learning-experiment-code';
  const experimentQuestion=document.createElement('p');experimentQuestion.className='learning-experiment-question';
  const choices=document.createElement('div');choices.className='learning-predictions';
  const predictionResult=document.createElement('p');predictionResult.className='learning-prediction-result';
  const comparison=document.createElement('div');comparison.className='learning-comparison';comparison.hidden=true;
  const hearOriginal=document.createElement('button');hearOriginal.type='button';hearOriginal.textContent='HEAR ORIGINAL';
  const hearVariation=document.createElement('button');hearVariation.type='button';hearVariation.textContent='HEAR VARIATION';
  const auditionInfo=document.createElement('p');auditionInfo.className='learning-audition-note';
  auditionInfo.textContent='Short, reduced-volume browser sine previews. Your composition is not executed, edited, or interrupted.';
  comparison.append(hearOriginal,hearVariation);
  experimentArea.append(experimentCode,experimentQuestion,choices,predictionResult,comparison,auditionInfo);
  panel.append(header,suggestionArea,back,selected,title,terms,body,extra,actions,experimentArea,official);host.append(panel);
  const docs={SinOsc:'Classes/SinOsc.html',SynthDef:'Classes/SynthDef.html',Synth:'Classes/Synth.html',
    Routine:'Classes/Routine.html',Pbind:'Classes/Pbind.html',EnvGen:'Classes/EnvGen.html',
    Out:'Classes/Out.html',play:'Reference/Functions.html',ar:'Guides/UGens-and-Synths.html',
    kr:'Guides/UGens-and-Synths.html',s:'Classes/Server.html'};
  const expansions={SinOsc:'Sinusoidal oscillator (sine-wave oscillator)',SynthDef:'Synthesizer definition',
    EnvGen:'Envelope generator',Pbind:'Pattern binding',Out:'Output',ar:'Audio rate',
    kr:'Control rate',freq:'Frequency',amp:'Amplitude',mul:'Multiplication factor',
    add:'Addition offset',hz:'Hertz',dur:'Duration',pan:'Panorama / stereo position',
    var:'Variable declaration',s:'Default server variable',tilde:'Environment variable (~)',
    backslash:'Symbol literal (backslash)',braces:'Function body (braces)',
    brackets:'Array literal (square brackets)',bars:'Function argument delimiters (vertical bars)',
    semicolon:'Statement separator'};

  let panelView='lesson',currentExperiment=null,previewContext=null;
  const voices=new Set();
  function stopPreview(){
    for(const voice of voices){
      try{voice.stop()}catch{}
      try{voice.disconnect()}catch{}
    }
    voices.clear();
  }
  async function hear(frequency){
    const Context=window.AudioContext||window.webkitAudioContext;
    if(!Context)throw Error('Web Audio is unavailable in this browser.');
    if(!previewContext||previewContext.state==='closed')previewContext=new Context();
    await previewContext.resume();
    stopPreview();
    const now=previewContext.currentTime;
    const osc=previewContext.createOscillator(),gain=previewContext.createGain();
    osc.type='sine';osc.frequency.setValueAtTime(frequency,now);
    const safeVolume=Math.min(0.07,Math.max(0.015,currentExperiment?.amplitude||0.07));
    gain.gain.setValueAtTime(0,now);
    gain.gain.linearRampToValueAtTime(safeVolume,now+0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001,now+0.6);
    osc.connect(gain);gain.connect(previewContext.destination);
    voices.add(osc);osc.onended=()=>{voices.delete(osc);osc.disconnect();gain.disconnect()};
    osc.start(now);osc.stop(now+0.63);
  }
  function openExperiment(){
    if(!currentExperiment)return;
    const e=currentExperiment;
    experimentArea.hidden=false;choices.replaceChildren();
    experimentCode.textContent='ORIGINAL: '+e.expression+'\nVARIATION: '+e.variation;
    experimentQuestion.textContent='Prediction: if '+e.frequency+' hertz becomes '+e.variantFrequency+' hertz, will the pitch be higher, lower, or unchanged?';
    predictionResult.textContent='Choose a prediction before listening.';
    comparison.hidden=true;
    for(const [answer,label] of [['higher','HIGHER'],['lower','LOWER'],['same','UNCHANGED']]){
      const choice=document.createElement('button');choice.type='button';choice.textContent=label;
      choice.onclick=()=>{
        for(const button of choices.children)button.setAttribute('aria-pressed',String(button===choice));
        comparison.hidden=false;
        predictionResult.textContent='You predicted '+answer+'. Listen to both isolated tones, then compare.';
        experimentArea.dataset.prediction=answer;
      };
      choice.setAttribute('aria-pressed','false');choices.append(choice);
    }
  }
  async function audition(variant){
    const e=currentExperiment;
    if(!e)return;
    const hz=variant?e.variantFrequency:e.frequency;
    try{
      await hear(hz);
      if(variant){
        const correct=e.direction;
        const guess=experimentArea.dataset.prediction;
        predictionResult.textContent=(guess===correct?'Your prediction was correct. ':'The change makes the pitch '+correct+'. ')+
          (correct==='higher'?'Doubling':'Halving')+' frequency changes pitch by one octave. No source was changed.';
      }
    }catch(error){predictionResult.textContent='Preview unavailable: '+error.message}
  }
  hearOriginal.onclick=()=>audition(false);
  hearVariation.onclick=()=>audition(true);
  function lessonVisibility(shown){
    for(const element of [selected,title,terms,body,extra,actions,official])element.hidden=!shown;
    if(!shown)experimentArea.hidden=true;
  }
  function refreshCue(){
    if(mode!=='guided'||dismissed){
      openButton.classList.remove('learning-has-suggestions');return;
    }
    const available=contextualSuggestions(editor.value);
    openButton.title=available.length?available.length+' optional lessons from your composition':'No contextual lessons for this code yet';
    openButton.classList.toggle('learning-has-suggestions',available.length>0);
  }
  function showSuggestions(){
    if(mode!=='guided')return explain();
    stopPreview();panelView='suggestions';currentExperiment=null;activeError=null;
    heading.textContent='GUIDED / YOUR COMPOSITION';
    lessonVisibility(false);back.hidden=true;suggestionArea.hidden=false;
    suggestionArea.replaceChildren();
    const intro=document.createElement('p');intro.textContent='Optional lessons from your current composition. Choose one whenever you want; playback is unaffected.';
    suggestionArea.append(intro);
    const items=contextualSuggestions(editor.value);
    if(!items.length){
      const empty=document.createElement('p');
      empty.textContent='No recognized lesson yet. Select a word in the editor, then choose Explain selection.';
      suggestionArea.append(empty);
    }
    for(const item of items){
      const button=document.createElement('button');button.type='button';button.className='learning-suggestion';
      const category=document.createElement('small');category.textContent=item.category;
      const headingText=document.createElement('strong');headingText.textContent=item.title;
      const prompt=document.createElement('span');prompt.textContent=item.question;
      button.append(category,headingText,prompt);
      button.onclick=()=>{
        const data=explainSelection(item.token,0,item.token.length);
        data.selection=item.experiment?.expression||editor.value.slice(item.start,item.end);
        data.position=item.start;data.pitchExperiment=item.experiment;
        display(data);
      };
      suggestionArea.append(button);
    }
    setPanelOpen(true);
  }

  function setPanelOpen(open,{switchView=true}={}){
    if(!open)stopPreview();
    panel.hidden=!open;
    if(switchView)window.setSuperCollisionView?.(open?'learn':'code');
    else document.body.classList.toggle('view-learn',open);
  }

  function setMode(next){
    if(!MODES.includes(next))return;
    mode=next;modeSelect.value=mode;openButton.hidden=mode==='off';
    if((mode==='off'||mode==='reference'&&panelView==='suggestions')&&!panel.hidden)setPanelOpen(false);
    if(mode==='off'&&previewContext){previewContext.close().catch(()=>{});previewContext=null;}
    try{localStorage.setItem(STORAGE,mode)}catch{}
    refreshCue();onChange(mode);
  }
  function display(data,kind='reference'){
    if(mode==='off')return;
    activeError=kind==='error'?data:null;hintIndex=0;panelView='lesson';
    suggestionArea.hidden=true;lessonVisibility(true);back.hidden=mode!=='guided';
    experimentArea.hidden=true;currentExperiment=kind==='error'?null:(data.pitchExperiment||findPitchExperiment(editor.value,data.position??editor.selectionStart));
    heading.textContent=kind==='error'?'DEBUG / LEARN':'LEARN';
    const literal=kind==='error'?String(data.selection||'SuperCollider error'):String(data.selection||data.token||'');
    selected.textContent=literal?'SELECTED: '+literal:'';
    title.textContent=data.title;
    const relevant=Object.entries(expansions).filter(([term])=>
      term===data.token||new RegExp('\\b'+term+'\\b','i').test(data.explanation));
    terms.textContent=kind==='error'?'Term: '+data.title:
      'TERMS: '+(relevant.length?relevant.map(([term,meaning])=>term+' = '+meaning).join(' · '):data.title);
    body.textContent=data.explanation;
    extra.textContent='';hint.hidden=kind!=='error';hint.disabled=false;experiment.hidden=kind==='error';
    experiment.textContent=currentExperiment?'PREDICT & LISTEN':'Experiment idea';
    skip.hidden=mode!=='guided';
    const path=docs[data.token];
    official.hidden=!path;official.href=path?'https://doc.sccode.org/'+path:'https://doc.sccode.org/';
    setPanelOpen(true);
  }
  function explain(){if(mode!=='off'){const data=explainSelection(editor.value,editor.selectionStart,editor.selectionEnd);data.selection=editor.value.slice(editor.selectionStart,editor.selectionEnd)||data.token;data.position=editor.selectionStart;display(data)}}
  function offerError(output){
    if(mode!=='guided'||dismissed)return;
    const item=errorLesson(output);
    if(!item)return;
    const signature=item[0]+'|'+String(output).slice(0,140);
    if(signature===lastError)return;
    lastError=signature;activeError={title:item[0],selection:String(output).trim().slice(0,240),explanation:'An error occurred. Want to investigate it step by step?',steps:[item[1],item[2]]};
    // A suggestion, never an unsolicited lesson or interruption.
    openButton.textContent='DEBUG?';openButton.hidden=false;
    openButton.dataset.error='true';
  }
  openButton.addEventListener('click',()=>{
    if(openButton.dataset.error==='true'&&activeError){
      delete openButton.dataset.error;openButton.textContent='LEARN';
      display(activeError,'error');
    }else if(panel.hidden){
      if(mode==='guided'&&editor.selectionStart===editor.selectionEnd)showSuggestions();
      else explain();
    }else setPanelOpen(false);
  });
  close.addEventListener('click',()=>setPanelOpen(false));
  back.onclick=showSuggestions;
  hint.addEventListener('click',()=>{
    if(!activeError?.steps)return;
    extra.textContent=activeError.steps[Math.min(hintIndex++,activeError.steps.length-1)];
    if(hintIndex>=activeError.steps.length)hint.disabled=true;
  });
  experiment.addEventListener('click',()=>{if(currentExperiment)openExperiment();else extra.textContent=explainSelection(editor.value,editor.selectionStart,editor.selectionEnd).experiment});
  skip.addEventListener('click',()=>{
    dismissed=true;setPanelOpen(false);openButton.textContent='LEARN';delete openButton.dataset.error;
  });
  editor.addEventListener('selectionchange',()=>{if(mode==='guided'&&!dismissed&&panelView==='lesson'&&editor.selectionStart!==editor.selectionEnd&&!panel.hidden)explain()});
  editor.addEventListener('input',()=>{refreshCue();if(mode==='guided'&&panelView==='suggestions'&&!panel.hidden)showSuggestions()});
  editor.addEventListener('select',()=>{if(mode==='guided'&&!dismissed&&editor.selectionStart!==editor.selectionEnd&&panel.hidden){openButton.textContent='LEARN'}});
  modeSelect.addEventListener('change',()=>{dismissed=false;lastError='';openButton.textContent='LEARN';delete openButton.dataset.error;setMode(modeSelect.value)});
  setMode(mode);
  return {get mode(){return mode},explain,offerError,setMode,open:explain,suggest:showSuggestions,hide:options=>setPanelOpen(false,options)};
}
