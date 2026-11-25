/* Verify a real Cloudflare branch deployment, not just a Git branch.
 * Cloudflare publication is asynchronous, so allow the immutable compiled
 * preview to propagate before declaring its offline asset index stale.
 * This is a host-content audit, not the known-broken direct source build. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';

const [sitePath,pr]=process.argv.slice(2);
if(!sitePath||!/^[1-9][0-9]*$/.test(pr))
 throw Error('Usage: node qa/preview-host-probe.mjs SITE_PATH PR_NUMBER');

const base='https://pages-preview-sounds-pr-'+pr+'.supercollision.pages.dev';
const files=['sounds.html','librivox-explorer.html','lab-offline-assets.json'];
const expected=new Map(await Promise.all(files.map(async name=>
 [name,await readFile(resolve(sitePath,name))])));
const manifest=JSON.parse(expected.get('lab-offline-assets.json').toString('utf8'));
if(!/^[0-9a-f]{40}$/.test(manifest.version))
 throw Error('Staged offline manifest does not identify a full source commit');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex').slice(0,16);

let failures=[];
for(let attempt=1;attempt<=9;attempt++){
 failures=[];
 for(const name of files){
  const expectedBytes=expected.get(name);
  const url=new URL(base+'/'+name);
  // Bypass stale edge cache without altering the canonical branch URL.
  url.searchParams.set('sc_preview_audit',manifest.version.slice(0,12)+'-'+attempt);
  try{
   const response=await fetch(url,{cache:'no-store',redirect:'follow',
    headers:{'Cache-Control':'no-cache','User-Agent':'SuperCollision-preview-audit/1.1'},
    signal:AbortSignal.timeout(12000)});
   const received=Buffer.from(await response.arrayBuffer());
   const same=response.ok&&received.equals(expectedBytes);
   console.log('Preview check '+attempt+'/'+9,name,'HTTP',response.status,
    'exact',same,'expected',digest(expectedBytes),'received',digest(received));
   if(!same)failures.push(name+': '+(response.ok?'bytes differ':'HTTP '+response.status));
  }catch(error){
   failures.push(name+': '+error.message);
   console.log('Preview check '+attempt+'/'+9,name,'unavailable',error.message);
  }
 }
 if(!failures.length){
  console.log('PUBLIC PREVIEW VERIFIED: all three files, including the exact offline asset index, match source '+manifest.version);
  process.exit(0);
 }
 if(attempt<9){
  console.log('Cloudflare preview publication not yet consistent: '+failures.join(' | '));
  await pause(5000);
 }
}
console.error('::error::Hosted preview remained inconsistent after publication window: '+failures.join(' | '));
process.exitCode=1;
