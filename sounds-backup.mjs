/* Sounds-only portable backup. Files contain unmodified Blob bytes and JSON metadata.
 * Versioned archive with bounded manifest and strict framing; no audio processing. */
const MAGIC='SCSOUNDS1\n';
const DIGITS=10;
const MAX_MANIFEST=16*1024*1024;
const MAX_ENTRIES=50000;
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const PREFIX_BYTES=encoder.encode(MAGIC).byteLength+DIGITS+1;

function validateMetadata(value){
 if(!value||typeof value!=='object'||Array.isArray(value)
  ||typeof value.id!=='string'||!value.id||value.id.length>256
  ||typeof value.name!=='string'||!value.name||value.name.length>1000)
  throw Error('Backup contains an invalid library item.');
}
export function createSoundsBackup(items){
 if(!Array.isArray(items)||items.length>MAX_ENTRIES)throw Error('Too many sounds to back up.');
 const blobs=[],entries=[];
 for(const item of items){
  validateMetadata(item);
  const metadata={...item};delete metadata.blob;
  const blob=item.blob instanceof Blob?item.blob:null;
  blobs.push(blob);
  entries.push({metadata,binary:blob?{size:blob.size,type:blob.type||item.mime||'application/octet-stream'}:null});
 }
 const manifestBytes=encoder.encode(JSON.stringify({
  format:'supercollision-sounds',version:1,exportedAt:new Date().toISOString(),entries
 }));
 if(manifestBytes.byteLength>MAX_MANIFEST)throw Error('Sound metadata exceeds the 16 MB backup limit.');
 const size=String(manifestBytes.byteLength).padStart(DIGITS,'0');
 const parts=[MAGIC,size+'\n',manifestBytes];
 for(const blob of blobs)if(blob)parts.push(blob);
 return new Blob(parts,{type:'application/octet-stream'});
}
export async function readSoundsBackup(file){
 if(!(file instanceof Blob)||file.size<PREFIX_BYTES)throw Error('Not a SuperCollision Sounds backup.');
 const prefix=await file.slice(0,PREFIX_BYTES).text();
 if(!prefix.startsWith(MAGIC)||prefix.at(-1)!=='\n')throw Error('Unrecognized backup format.');
 const lengthString=prefix.slice(MAGIC.length,-1);
 if(!/^\d{10}$/.test(lengthString))throw Error('Corrupt backup header.');
 const length=Number(lengthString);
 if(!Number.isSafeInteger(length)||length<2||length>MAX_MANIFEST
  ||PREFIX_BYTES+length>file.size)throw Error('Invalid or oversized backup manifest.');
 let manifest;
 try{manifest=JSON.parse(decoder.decode(await file.slice(PREFIX_BYTES,PREFIX_BYTES+length).arrayBuffer()))}
 catch{throw Error('Backup manifest is not valid UTF-8 JSON.')}
 if(manifest?.format!=='supercollision-sounds'||manifest.version!==1
  ||!Array.isArray(manifest.entries)||manifest.entries.length>MAX_ENTRIES)
  throw Error('Unsupported or corrupt Sounds backup version.');
 let offset=PREFIX_BYTES+length;
 const items=[];
 for(const entry of manifest.entries){
  if(!entry||typeof entry!=='object')throw Error('Invalid backup entry.');
  validateMetadata(entry.metadata);
  if(entry.binary!==null&&entry.binary!==undefined){
   const binary=entry.binary;
   if(!binary||!Number.isSafeInteger(binary.size)||binary.size<0
    ||typeof binary.type!=='string'||binary.type.length>150
    ||offset+binary.size>file.size)throw Error('Invalid backup audio length.');
   const metadata={...entry.metadata};
   delete metadata.blob;
   const blob=file.slice(offset,offset+binary.size,binary.type);
   items.push({...metadata,blob});
   offset+=binary.size;
  }else{
   const metadata={...entry.metadata};delete metadata.blob;
   items.push(metadata);
  }
 }
 if(offset!==file.size)throw Error('Backup contains unexpected or missing audio bytes.');
 const ids=new Set();
 for(const item of items){if(ids.has(item.id))throw Error('Backup contains duplicate sound identifiers.');ids.add(item.id)}
 return items;
}
