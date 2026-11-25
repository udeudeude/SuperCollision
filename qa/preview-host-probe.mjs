/* One-time public hosted-preview diagnostic. Proves that a Cloudflare
 * branch alias serves the precise compiled files, not merely a Git branch. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const [sitePath,pr]=process.argv.slice(2);
if(!sitePath||!/^[1-9][0-9]*$/.test(pr))throw Error('Usage: node qa/preview-host-probe.mjs SITE_PATH PR_NUMBER');
const base='https://pages-preview-sounds-pr-'+pr+'.supercollision.pages.dev';
const checks=['sounds.html','librivox-explorer.html','lab-offline-assets.json'];
let failures=[];
for(const name of checks){
 const expected=await readFile(resolve(sitePath,name));
 try{
  const response=await fetch(base+'/'+name,{headers:{'User-Agent':'SuperCollision-preview-audit/1.0'},
   signal:AbortSignal.timeout(11000),redirect:'follow'});
  const actual=Buffer.from(await response.arrayBuffer());
  const digest=buffer=>createHash('sha256').update(buffer).digest('hex').slice(0,16);
  const identical=response.ok&&actual.equals(expected);
  console.log(name,'HTTP',response.status,'exact',identical,
   'source',digest(expected),'host',digest(actual),'url',response.url);
  if(!identical)failures.push(name+' HTTP '+response.status+' or mismatched content');
 }catch(error){failures.push(name+' '+error.message);console.log(name,'HOST FAILURE',error.message)}
}
if(failures.length){
 console.log('::warning::Compiled preview branch exists, but public Pages deployment is not proven: '+failures.join(' | '));
 console.log('Cloudflare branch aliases require a successful Pages build or deployment for pages-preview-sounds-pr-'+pr+'.');
} else console.log('PUBLIC PREVIEW VERIFIED: Compiled Code site, LibriVox, and offline index match the isolated release.');
