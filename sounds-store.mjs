/* One Sounds-specific IndexedDB database shared by all five acquisition paths.
 * Upgrades are deliberately non-destructive to existing recordings. */
export const SOUNDS_DB='supercollision-sounds-v1';
const STORE='sounds';
function openDB(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(SOUNDS_DB,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'id'})};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error('Could not open sound library'));
 });
}
async function transaction(mode,fn){
 const db=await openDB();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);
  let result;
  tx.oncomplete=()=>resolve(result);
  // Request errors bubble to the transaction. Preserve their actual name and
  // reason, particularly on Safari, rather than obscuring an IndexedDB
  // storage failure behind a generic "transaction failed" message.
  const cause=event=>event?.target?.error||tx.error;
  const failure=(event,kind)=>{
   const error=cause(event);
   return error?Error('Sound library '+kind+': '+error.name+
    (error.message?' · '+error.message:'')):Error('Sound library '+kind);
  };
  tx.onerror=event=>reject(failure(event,'transaction failed'));
  tx.onabort=event=>reject(failure(event,'transaction aborted'));
  try{fn(store,value=>{result=value})}catch(error){tx.abort();reject(error)}
 })}finally{db.close()}
}
// Some WebKit installations cannot clone Blob/File values into IndexedDB even
// though IndexedDB itself works. Store the original bytes as an ordinary typed
// array only in those browsers. All callers still receive an unchanged Blob.
let byteStorageFallback=false;
function blobWriteRejected(error){
 return /Blob\\/File|DataCloneError|blob.*stor|blob.*prepar|file.*prepar/i.test(error?.message||'');
}
async function toPortableRecord(item){
 if(!(item.blob instanceof Blob))return item;
 const {blob,...metadata}=item;
 return {...metadata,blobBytes:new Uint8Array(await blob.arrayBuffer()),
  blobMime:blob.type||item.mime||'application/octet-stream'};
}
function restoreAudio(item){
 if(!item||item.blob instanceof Blob||!item.blobBytes)return item;
 const {blobBytes,blobMime,...metadata}=item;
 return {...metadata,blob:new Blob([blobBytes],{type:blobMime||item.mime||'application/octet-stream'})};
}
async function writeRecords(items,method){
 const persist=entries=>transaction('readwrite',store=>{
  for(const item of entries)store[method](item);
 });
 if(!items.some(item=>item.blob instanceof Blob))return persist(items);
 if(!byteStorageFallback){
  try{return await persist(items)}
  catch(error){
   if(!blobWriteRejected(error))throw error;
   byteStorageFallback=true;
  }
 }
 // A failed IndexedDB transaction is atomic. Retrying with portable bytes
 // cannot duplicate or partially replace any of the user's existing records.
 return persist(await Promise.all(items.map(toPortableRecord)));
}
export async function allSounds(){
 const items=await transaction('readonly',(s,set)=>{
  const r=s.getAll();r.onsuccess=()=>set(r.result);
 });
 return items.map(restoreAudio);
}
export async function saveSound(item){
 if(!item||typeof item.id!=='string'||typeof item.name!=='string')throw Error('Invalid sound entry');
 await writeRecords([item],'put');
 document.dispatchEvent(new Event('sounds-library-changed'));
}
export async function deleteSound(id){
 await transaction('readwrite',s=>s.delete(id));
 document.dispatchEvent(new Event('sounds-library-changed'));
}

/* Atomic recovery: either all new items are restored or the transaction fails.
 * Existing identifiers must be checked by the caller; never overwrite on restore. */
export async function saveSoundsBatch(items){
 if(!Array.isArray(items)||!items.every(item=>item&&typeof item.id==='string'&&typeof item.name==='string'))
  throw Error('Invalid recovery batch');
 if(!items.length)return;
 await writeRecords(items,'add');
 document.dispatchEvent(new Event('sounds-library-changed'));
}
