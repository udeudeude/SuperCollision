/* Conservative source-level Routine checkpoints for SuperCollision.
 * Only inserts a postln side-effect before independent statement lines in
 * recognized Routine({ ... }) or Task({ ... }) bodies. No user source is saved
 * or displayed in transformed form.
 *
 * Deliberately does not promise arbitrary statement-level tracing: function
 * expressions and syntaxes we can't classify remain untouched.
 */
const TRACE_HEAD='__SCLIVE__';
let serial=0;
function mask(text){
  const out=Array.from(text);
  let mode='code',i=0;
  for(;i<text.length;){
    const a=text[i],b=text[i+1];
    if(mode==='code'){
      if(a==='/'&&b==='/'){out[i]=' ';out[i+1]=' ';i+=2;mode='line';continue}
      if(a==='/'&&b==='*'){out[i]=' ';out[i+1]=' ';i+=2;mode='block';continue}
      if(a==='"'||a==="'"){out[i]=' ';i++;mode=a;continue}
      i++;continue;
    }
    if(mode==='line'){
      if(a==='\n')mode='code';else out[i]=' ';
      i++;continue;
    }
    if(mode==='block'){
      if(a==='*'&&b==='/'){out[i]=' ';out[i+1]=' ';i+=2;mode='code';continue}
      if(a!=='\n'&&a!=='\r')out[i]=' ';
      i++;continue;
    }
    if(a==='\\'){out[i]=' ';if(i+1<text.length){out[i+1]=' ';i+=2}else i++;continue}
    if(a===mode)mode='code';
    if(a!=='\n'&&a!=='\r')out[i]=' ';
    i++;
  }
  return out.join('');
}
function lineOf(src,idx){
  let n=1;
  for(let i=0;i<idx;i++)if(src.charCodeAt(i)===10)n++;
  return n;
}
function matchingBrace(src,open){
  let depth=0;
  for(let i=open;i<src.length;i++){
    if(src[i]==='{')depth++;
    else if(src[i]==='}'&&--depth===0)return i;
  }
  return -1;
}
const checkpoint=/^(\s*)(?:((?:~\w+|\w+)\s*=\s*)?Synth\s*\(|((?:\d+(?:\.\d+)?|[A-Za-z_]\w*)\s*)\.wait\s*;|(?:while|loop|[0-9]+\.do)\b)/;
export function prepareRoutineTrace(source,startLine=1,runToken=null){
  const masked=mask(source);
  const run=(runToken||('r'+Date.now().toString(36)+(++serial).toString(36))).replace(/[^A-Za-z0-9]/g,'');
  const routines=[],insertions=[],seen=new Set();
  const pat=/\b(?:Routine|Task)\s*\(\s*\{/g;
  for(const m of masked.matchAll(pat)){
    const brace=masked.indexOf('{',m.index),end=matchingBrace(masked,brace);
    if(end<0)continue;
    const rId=startLine+lineOf(source,m.index)-1;
    const routine={id:rId,start:rId,end:startLine+lineOf(source,end)-1,run,source:'routine',checkpointCount:0};
    const firstNewline=source.indexOf('\n',brace);
    if(firstNewline<0||firstNewline>=end)continue;
    let lineStart=firstNewline+1;
    while(lineStart<end){
      let lineEnd=source.indexOf('\n',lineStart);
      if(lineEnd<0||lineEnd>end)lineEnd=end;
      const raw=masked.slice(lineStart,lineEnd);
      const hit=checkpoint.exec(raw);
      if(hit){
        // Instrument only an independent statement, not a fragment of a
        // multi-line argument, and never put a statement before 'var'.
        const rawOriginal=source.slice(lineStart,lineEnd);
        const prefix=hit[1]||'';
        const line=startLine+lineOf(source,lineStart)-1;
        const kind=hit[3]?'wait':'step';
        const wait=kind==='wait'&&/^\d+(?:\.\d+)?$/.test(hit[3].trim())?hit[3].trim():'x';
        const key=run+':'+rId+':'+line;
        if(!seen.has(key)){
          seen.add(key);
          // Preserve original line count and keep the evaluated source
          // structurally the same apart from the small post statement.
          const marker=TRACE_HEAD+run+':'+rId+':'+line+':'+kind+':'+wait+'__';
          insertions.push({at:lineStart+prefix.length,code:'("'+marker+'").postln; ',routine:rId,line,kind,wait,marker,original:rawOriginal});
          routine.checkpointCount++;
        }
      }
      lineStart=lineEnd+1;
    }
    if(routine.checkpointCount>0)routines.push(routine);
  }
  if(!insertions.length)return {code:source,run,routines:[],checkpoints:[],instrumented:false};
  // Splicing from right to left avoids changing earlier source positions.
  let code=source;
  for(const p of insertions.sort((a,b)=>b.at-a.at))code=code.slice(0,p.at)+p.code+code.slice(p.at);
  return {code,run,routines,checkpoints:insertions.map(({routine,line,kind,wait,marker})=>({routine,line,kind,wait,marker})),instrumented:true};
}
export const routineTracePattern=/__SCLIVE__([A-Za-z0-9]+):(\d+):(\d+):(step|wait):(\d+(?:\.\d+)?|x)__/g;
