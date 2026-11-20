/* Entire Sounds library backup and recovery. No sound processing, server, or credentials. */
import {allSounds,saveSoundsBatch} from './sounds-store.mjs';
import {createSoundsBackup,readSoundsBackup} from './sounds-backup.mjs';
const exportButton=document.getElementById('sounds-backup-export');
const input=document.getElementById('sounds-backup-import');
const status=document.getElementById('sounds-backup-status');
const say=text=>{status.textContent=text};
exportButton.addEventListener('click',async()=>{
 exportButton.disabled=true;
 try{
  const items=await allSounds();
  if(!items.length){say('The library is empty. There is nothing to back up.');return}
  say('Preparing '+items.length+' sounds for backup…');
  const blob=createSoundsBackup(items),url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;
  a.download='SuperCollision-Sounds-'+new Date().toISOString().slice(0,10)+'.scsounds';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  say('Prepared '+items.length+' sounds ('+(blob.size/1024/1024).toFixed(1)+' MB). Save the downloaded file somewhere outside browser storage, such as Files.');
 }catch(error){say('Backup failed: '+error.message)}
 finally{exportButton.disabled=false}
});
input.addEventListener('change',async()=>{
 const file=input.files?.[0];if(!file)return;
 input.disabled=true;
 try{
  say('Checking backup format and file lengths…');
  const items=await readSoundsBackup(file);
  const existing=new Set((await allSounds()).map(item=>item.id));
  const toRestore=items.filter(item=>!existing.has(item.id));
  const skipped=items.length-toRestore.length;
  if(!toRestore.length){say('Nothing to restore: all '+skipped+' sounds already exist. No changes made.');return}
  if(!confirm('Restore '+toRestore.length+' sound'+(toRestore.length===1?'':'s')+' into this device? '+skipped+' existing item'+(skipped===1?' is':'s are')+' preserved without replacement.')){say('Restore cancelled. No changes made.');return}
  say('Restoring '+toRestore.length+' sounds…');
  await saveSoundsBatch(toRestore);
  say('Restored '+toRestore.length+' sounds. '+skipped+' already-present sounds skipped. Existing library items were not replaced.');
 }catch(error){say('Restore failed, no changes should be made: '+error.message)}
 finally{input.value='';input.disabled=false}
});
