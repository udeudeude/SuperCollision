/* Explanations derived from observable console text and the current source.
   Never changes a composition or guesses an automatic fix. */
export function explainConsoleError(output,source=''){
 const log=String(output);
 // Prefer the most recent failure in a burst. The audio server can emit
 // FAILURE without the interpreter's ERROR prefix.
 const last=Math.max(log.lastIndexOf('ERROR:'),
   log.lastIndexOf('FAILURE IN SERVER'),log.lastIndexOf('FAILURE:'));
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
 // Read-only guidance for common failures: without an exact, uniquely
 // matched source span we offer no one-tap modification.
 const explain=(kind,title,help)=>({kind,title,message:help,
   correction:null,line:reportedLine});
 const failure=/FAILURE(?: IN SERVER)?\s*\/s_new[\s\S]*?(?:SynthDef|def|not found)/i.test(message);
 if(failure)return explain('missing-synthdef','Instrument was not found',
   'The audio server was asked to play an instrument it does not have. Check that the SynthDef name matches, that its definition ran successfully, and that the server received it before the Synth call. Inside a Routine, s.sync after adding SynthDefs can ensure they are ready.');
 if(/FAILURE(?: IN SERVER)?\s*\/n_set/i.test(message))
   return explain('missing-node','Could not change an instrument',
     'The server could not change the specified synthesizer. It may already have finished or been freed. Check its lifetime and the node or control name; this does not necessarily indicate a fault in the composition.');
 const undefinedVariable=/ERROR:\s*(?:Variable|var)\s+['"`]?([A-Za-z_]\w*)['"`]?\s+(?:not defined|not found)/i.exec(message);
 if(undefinedVariable)return explain('undefined-variable','Unknown variable: '+undefinedVariable[1],
   'SuperCollider does not recognize '+undefinedVariable[1]+'. Check spelling and scope. Variables declared with var must appear at the start of their function, before executable statements. Environment variables use a tilde (~), which is different from a local variable.');
 const unknownClass=/ERROR:\s*Class not defined\s*:?\s*['"`]?([A-Za-z_]\w*)/i.exec(message);
 if(unknownClass)return explain('undefined-class','Unknown class: '+unknownClass[1],
   'SuperCollider cannot find the class '+unknownClass[1]+'. Check capitalization and spelling. Some classes require an installed extension or Quark; not all desktop extensions exist in the browser.');
 if(/ERROR:\s*syntax error/i.test(message)){
   if(/unexpected\s+(?:VAR|var)\b/i.test(message))
     return explain('variable-declaration','Variable declaration is in the wrong place',
       'Within a SuperCollider function, var declarations must come before the ordinary statements. Move the declaration to the beginning of that function; keep its assigned value only where the value is available. Review the line above the reported error, too.');
   if(/unexpected\s+(?:'\)'|\)|']'|]|'\}'|})/i.test(message))
     return explain('closing-delimiter','Unexpected closing bracket',
       'The parser found a closing parenthesis, square bracket, or brace that does not fit the expression. Compare opening and closing brackets near the reported line; also check the preceding line for a missing comma.');
   if(/unexpected\s+(?:end of file|end of input|END)/i.test(message))
     return explain('unclosed-expression','An expression may be unfinished',
       'SuperCollider reached the end while still expecting more code. Check for an unclosed parenthesis, brace, string, or function earlier in this expression.');
   return explain('syntax','SuperCollider could not read this expression',
     'This is a code-grammar error, not proof of an audio problem. Look at the highlighted line and the preceding line for a missing comma, separator, bracket, or incorrect variable declaration. No automatic replacement is safe without identifying the exact expression.');
 }
 const messageNotUnderstood=/ERROR:\s*(?:Message\s+['"`]([^'"`]+)['"`]\s+not understood|(.+?)\s+does not understand the message\s+['"`]([^'"`]+)['"`])/i.exec(message);
 if(messageNotUnderstood){
   const selector=messageNotUnderstood[1]||messageNotUnderstood[3]||'this method';
   const receiver=messageNotUnderstood[2]?.trim()||'the receiving object';
   return explain('unknown-message','Command not understood: '+selector,
     'SuperCollider tried to use '+selector+' on '+receiver+'. The receiver may be the wrong kind of object or an expression may have returned nil. Check the operation and the value immediately before it. A typo or misplaced comma can change what receives a message.');
 }
 const primitive=/ERROR:\s*Primitive\s+['"`]?([^\s'"`]+)['"`]?\s+failed/i.exec(message);
 if(primitive)return explain('primitive-failure','A built-in operation failed',
   'A SuperCollider built-in operation rejected its inputs. Check the types and ranges of the values sent into the operation, and inspect the receiver and arguments in the traceback. The app cannot safely infer a single source replacement.');
 const first=(/^(?:ERROR:|FAILURE(?: IN SERVER)?)\s*([^\r\n]{1,180})/m.exec(message)||[])[1];
 if(!first)return null;
 return explain('runtime','SuperCollider reported an error',
   first+'. The full interpreter details remain in Console. Open the code at the reported line and check the operation and its inputs.');
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
