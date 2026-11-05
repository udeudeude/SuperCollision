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
  panel.append(header,selected,title,terms,body,extra,actions,official);host.append(panel);
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
  function setPanelOpen(open){panel.hidden=!open;document.body.classList.toggle('view-learn',open);
    if(open){window.setSuperCollisionView?.('learn');}else if(document.body.classList.contains('view-learn')){
      document.body.classList.remove('view-learn');window.setSuperCollisionView?.('code');
    }}

  function setMode(next){
    if(!MODES.includes(next))return;
    mode=next;modeSelect.value=mode;openButton.hidden=mode==='off';
    if(mode==='off')setPanelOpen(false);
    try{localStorage.setItem(STORAGE,mode)}catch{}
    onChange(mode);
  }
  function display(data,kind='reference'){
    if(mode==='off')return;
    activeError=kind==='error'?data:null;hintIndex=0;
    heading.textContent=kind==='error'?'DEBUG / LEARN':'LEARN';
    const literal=kind==='error'?String(data.selection||'SuperCollider error'):String(data.selection||data.token||'');
    selected.textContent=literal?'SELECTED: '+literal:'';
    title.textContent=data.title;
    terms.textContent=kind==='error'?'Term: '+data.title:
      'TERMS: '+(expansions[data.token]||data.title)+(data.token&&expansions[data.token]&&data.title!==expansions[data.token]?' · '+data.title:'');
    body.textContent=data.explanation;
    extra.textContent='';hint.hidden=kind!=='error';hint.disabled=false;experiment.hidden=kind==='error';
    skip.hidden=mode!=='guided';
    const path=docs[data.token];
    official.hidden=!path;official.href=path?'https://doc.sccode.org/'+path:'https://doc.sccode.org/';
    setPanelOpen(true);
  }
  function explain(){if(mode!=='off'){const data=explainSelection(editor.value,editor.selectionStart,editor.selectionEnd);data.selection=editor.value.slice(editor.selectionStart,editor.selectionEnd)||data.token;display(data)}}
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
    }else if(panel.hidden)explain();else setPanelOpen(false);
  });
  close.addEventListener('click',()=>setPanelOpen(false));
  hint.addEventListener('click',()=>{
    if(!activeError?.steps)return;
    extra.textContent=activeError.steps[Math.min(hintIndex++,activeError.steps.length-1)];
    if(hintIndex>=activeError.steps.length)hint.disabled=true;
  });
  experiment.addEventListener('click',()=>{extra.textContent=explainSelection(editor.value,editor.selectionStart,editor.selectionEnd).experiment});
  skip.addEventListener('click',()=>{
    dismissed=true;setPanelOpen(false);openButton.textContent='LEARN';delete openButton.dataset.error;
  });
  editor.addEventListener('selectionchange',()=>{if(mode==='guided'&&!dismissed&&editor.selectionStart!==editor.selectionEnd&&!panel.hidden)explain()});
  editor.addEventListener('select',()=>{if(mode==='guided'&&!dismissed&&editor.selectionStart!==editor.selectionEnd&&panel.hidden){openButton.textContent='LEARN?'}});
  modeSelect.addEventListener('change',()=>{dismissed=false;lastError='';openButton.textContent='LEARN';delete openButton.dataset.error;setMode(modeSelect.value)});
  setMode(mode);
  return {get mode(){return mode},explain,offerError,setMode,open:explain,hide:()=>setPanelOpen(false)};
}
