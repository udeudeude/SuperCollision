/* Explanations derived from observable console text and the current source.
   Never changes a composition or guesses an automatic fix. */
export function explainConsoleError(output,source=''){
 const log=String(output),last=log.lastIndexOf('ERROR:');
 if(last<0)return null;
 const message=log.slice(last);
 const lineMatch=/file:\/\/interpreted_text:(\d+):\d+/.exec(message);
 const reportedLine=lineMatch?Number(lineMatch[1]):null;
 const nilAction=/Nil\s+does not understand\s+the message\s+['"]doneAction['"]/i.test(message);
 if(nilAction){
   const wrong=/EnvGen\s*\.\s*kr\s*\(\s*Env\s*\.\s*perc\s*\(\s*([^()]*)\s*\)\s*,\s*levelScale\s*:\s*nil\s+doneAction\s*:\s*2\s*\)/g;
   const m=wrong.exec(String(source));
   if(m){
     const line=String(source).slice(0,m.index).split('\n').length;
     return {kind:'envelope-argument',title:'Envelope has a misplaced input',
       message:'The note envelope has levelScale: nil immediately before doneAction: 2. Remove levelScale: nil and put doneAction: 2 after the Env.perc(...) call, separated by a comma. The correction below preserves your envelope values.',
       correction:'EnvGen.kr(Env.perc('+m[1].trim()+'), doneAction: 2)',
       line};
   }
   return {kind:'envelope-argument',title:'Envelope input needs checking',
     message:'SuperCollider tried to send doneAction to nil instead of using it as an EnvGen input. Check for a missing comma or a misplaced levelScale: nil before doneAction: 2.',
     correction:null,line:reportedLine};
 }
 if(/(?:ERROR:).*?syntax error/i.test(message))
   return {kind:'syntax',title:'SuperCollider could not read this code',
     message:'Check the indicated line and the one before it for a missing comma, semicolon, or closing bracket. The detailed interpreter message remains below.',
     correction:null,line:reportedLine};
 const first=(/^ERROR:\s*([^\r\n]{1,180})/m.exec(message)||[])[1];
 if(!first)return null;
 return {kind:'runtime',title:'SuperCollider reported an error',
   message:first+'. See the interpreter details below or use Go to code to inspect the reported line.',
   correction:null,line:reportedLine};
}
