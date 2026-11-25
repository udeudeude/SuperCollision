/** LibriVox: framework-neutral chapter text search, approximate seek and favorites.
 * No network access, side effects, or assumptions about chapter/text edition matching.
 * Audio positions are always estimates until verified against a recording.
 */
function chapterTokens(value){
  return Array.from(String(value||"").matchAll(/[\p{L}\p{N}]+/gu),m=>({word:m[0].normalize("NFKC").toLocaleLowerCase(),start:m.index,end:m.index+m[0].length}));
}
export function findChapterPhraseMatches(chapterText,phrase,{maxResults=200,contextChars=95}={}){
  const text=String(chapterText||"");
  const words=chapterTokens(text),needle=chapterTokens(phrase).map(x=>x.word);
  const results=[];
  if(!needle.length||!words.length)return results;
  const limit=Math.min(1000,Math.max(1,Math.trunc(Number(maxResults)||200)));
  const span=Math.min(500,Math.max(0,Math.trunc(Number(contextChars)||0)));
  for(let i=0;i<=words.length-needle.length&&results.length<limit;i++){
    if(words[i].word!==needle[0])continue;
    let valid=true;
    for(let j=1;j<needle.length;j++)if(words[i+j].word!==needle[j]){valid=false;break;}
    if(!valid)continue;
    const start=words[i].start,end=words[i+needle.length-1].end;
    const before=text.slice(Math.max(0,start-span),start),after=text.slice(end,Math.min(text.length,end+span));
    results.push({start,end,fraction:(start+end)/(2*text.length),
      before:(start>span?"…":"")+before,match:text.slice(start,end),after:after+(end+span<text.length?"…":"")});
  }
  return results;
}
export function estimateChapterSeek({fraction,durationSeconds,anchors=[]}={}){
  const duration=Number(durationSeconds),at=Number(fraction);
  if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(at))return null;
  const f=Math.max(0,Math.min(1,at)),points=[{fraction:0,seconds:0},];
  for(const a of (Array.isArray(anchors)?anchors:[])){
    const x=Number(a?.fraction),y=Number(a?.seconds);
    if(Number.isFinite(x)&&Number.isFinite(y)&&x>0&&x<1&&y>=0&&y<=duration)points.push({fraction:x,seconds:y,verified:true});
  }
  points.sort((a,b)=>a.fraction-b.fraction);
  const monotonic=[points[0]];
  for(const p of points.slice(1)){
    const last=monotonic[monotonic.length-1];
    if(p.fraction>last.fraction&&p.seconds>=last.seconds)monotonic.push(p);
  }
  monotonic.push({fraction:1,seconds:duration});
  for(let i=1;i<monotonic.length;i++){
    const b=monotonic[i];
    if(f>b.fraction&&i<monotonic.length-1)continue;
    const a=monotonic[i-1];
    const position=(f-a.fraction)/(b.fraction-a.fraction);
    return {seconds:a.seconds+(b.seconds-a.seconds)*position,method:(a.verified||b.verified)?"anchor-informed":"proportional"};
  }
  return {seconds:duration,method:"proportional"};
}
export function toggleExplorerFavorite(favorites,item){
  const kinds=new Set(["author","reader","book","passage","sample"]);
  if(!kinds.has(item?.type)||String(item?.id??"").trim()==="")throw new TypeError("Favorite requires a supported type and stable id");
  const key=String(item.id),list=Array.isArray(favorites)?favorites:[];
  const exists=list.some(x=>x.type===item.type&&String(x.id)===key);
  return exists?list.filter(x=>!(x.type===item.type&&String(x.id)===key)):[...list,{type:item.type,id:key,label:String(item.label||key)}];
}
