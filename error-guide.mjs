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
   const matches=[...String(source).matchAll(wrong)];
   const scored=matches.map(m=>({
     match:m,line:String(source).slice(0,m.index).split('\n').length
   })).sort((a,b)=>reportedLine===null?a.line-b.line:
     Math.abs(a.line-reportedLine)-Math.abs(b.line-reportedLine));
   // A precise edit is permitted only when the occurrence is unambiguous.
   const choice=scored[0];
   const ambiguous=scored.length>1&&(reportedLine===null||
     Math.abs(scored[0].line-reportedLine)===Math.abs(scored[1].line-reportedLine));
   if(choice&&!ambiguous){
     const m=choice.match,line=choice.line;
     const correction='EnvGen.kr(Env.perc('+m[1].trim()+'), doneAction: 2)';
     return {kind:'envelope-argument',title:'Envelope has a misplaced input',
       message:'The envelope has a stray levelScale: nil before doneAction: 2. Replace this call with the corrected version below. Your other code stays unchanged.',
       correction,line,
       fix:{before:m[0],after:correction,start:m.index,end:m.index+m[0].length}};
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

/* Locate a proposed edit against the CURRENT code. Refuse ambiguous or stale
   matches rather than applying a correction to the wrong instrument. */
export function resolveCorrection(source,fix){
 if(!fix||typeof fix.before!=='string'||typeof fix.after!=='string'||
   !fix.before.length||fix.before===fix.after)return null;
 const text=String(source),i=text.indexOf(fix.before);
 if(i<0||text.indexOf(fix.before,i+fix.before.length)>=0)return null;
 return {start:i,end:i+fix.before.length,before:fix.before,after:fix.after};
}
