/* Safe, auditable retirement of proved obsolete SuperCollision branches.
 * Every delete uses a Git lease against the exact inspected commit.
 * Divergent, branch-only work without an associated completed PR is retained.
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {writeFile,appendFile} from 'node:fs/promises';

const repo=process.env.GITHUB_REPOSITORY;
assert.equal(repo,'udeudeude/SuperCollision');
const token=process.env.GITHUB_TOKEN;
assert.ok(token,'Missing scoped GitHub token');
const root='https://api.github.com/repos/'+repo;
async function api(path){
  const response=await fetch(root+path,{headers:{
    Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28'
  },signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(path+' HTTP '+response.status+' '+(await response.text()).slice(0,250));
  return response.json();
}
async function listPages(endpoint){
  const result=[];
  for(let page=1;page<=10;page++){
    const items=await api(endpoint+(endpoint.includes('?')?'&':'?')+'per_page=100&page='+page);
    result.push(...items);
    if(items.length<100)break;
  }
  return result;
}
const [branches,prs,main]=await Promise.all([
  listPages('/branches'),listPages('/pulls?state=all'),api('/branches/main')
]);
assert.equal(main.commit.sha,process.env.GITHUB_SHA,'Main advanced during branch cleanup, refusing stale audit');
const prByHead=new Map(prs.filter(pr=>pr.head?.repo?.full_name===repo).map(pr=>[pr.head.ref,pr]));
const superseded=new Set([7,25,30,31,32,33,34,35,38]);
const merged=new Set(prs.filter(pr=>pr.merged_at).map(pr=>pr.number));
assert.ok(merged.has(8)&&merged.has(39),'Replacements not merged; refuse to discard superseded work');
const decisions=[];
for(const branch of branches){
  const name=branch.name,sha=branch.commit.sha;
  let reason='',action='retain';
  const pr=prByHead.get(name);
  if(name==='main'||name==='pages-build')reason='protected deployment branch';
  else if(pr){
    if(pr.head.sha!==sha)reason='branch advanced after pull request inspection';
    else if(pr.state!=='closed')reason='open pull request';
    else if(pr.merged_at){action='delete';reason='merged pull request #'+pr.number}
    else if(superseded.has(pr.number)){action='delete';reason='explicitly superseded closed pull request #'+pr.number}
    else reason='closed unmerged pull request not proven superseded #'+pr.number;
  }else if(/^pages-preview-sounds-pr-(35|39)$/.test(name)){
    action='delete';reason='disposable preview of released/superseded pull request';
  }else{
    try{
      const compare=await api('/compare/'+sha+'...'+main.commit.sha);
      if(compare.behind_by===0&&compare.status!=='diverged'){
        action='delete';reason='strict ancestor of merged main';
      }else reason='distinct branch-only commits; retained';
    }catch(error){reason='unrelated history or unverified ancestry; retained ('+error.message.slice(0,100)+')'}
  }
  decisions.push({name,sha,action,reason});
}
const deleted=[],failed=[];
for(const entry of decisions.filter(item=>item.action==='delete')){
  assert.match(entry.name,/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/);
  assert.ok(!['main','pages-build'].includes(entry.name));
  // The one destructive action is an optimistic-lease Git ref deletion.
  const args=['push','--force-with-lease=refs/heads/'+entry.name+':'+entry.sha,
    'origin',':refs/heads/'+entry.name];
  const result=spawnSync('git',args,{encoding:'utf8',timeout:30000});
  if(result.status===0){deleted.push(entry.name);console.log('RETIRED '+entry.name+' : '+entry.reason)}
  else{failed.push({name:entry.name,error:(result.stderr||result.stdout||'git failed').slice(0,300)});console.log('NOT DELETED '+entry.name+': '+failed.at(-1).error)}
}
const retained=decisions.filter(item=>item.action==='retain');
const report={sourceCommit:main.commit.sha,inspected:branches.length,deleted,retained,failed};
await writeFile('branch-retirement-report.json',JSON.stringify(report,null,2)+'\n');
if(process.env.GITHUB_STEP_SUMMARY){
  const summary='## Safe branch retirement\n\nRemoved '+deleted.length+
    ' merged, superseded or disposable refs; preserved '+retained.length+
    ' refs including production and any distinct unmerged work.\n\n'+
    '| Branch | Decision |\n|---|---|\n'+
    retained.map(item=>'| '+item.name+' | '+item.reason.replace(/\|/g,'/')+' |').join('\n')+'\n';
  await appendFile(process.env.GITHUB_STEP_SUMMARY,summary);
}
console.log('BRANCH RETIREMENT SUMMARY: '+JSON.stringify({deleted:deleted.length,retained:retained.length,failures:failed}));
if(failed.length)process.exitCode=1;
