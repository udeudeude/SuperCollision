/* Reusable non-destructive Sounds sample-region presets.
 * A preset references its original local audio item: it never duplicates audio,
 * edits a Blob, synthesizes sound in the browser, or stores provider credentials. */
import {validateRegion} from './sounds-sampler.mjs';

const MAX_NAME=120;
export function validateSamplePreset(record){
  if(record?.source!=='sample-preset')throw Error('Not a sample-region preset.');
  const p=record.samplePreset;
  if(p?.version!==1||typeof p.sourceId!=='string'||!p.sourceId.trim()||p.sourceId.length>256)
    throw Error('Invalid preset source reference.');
  if(typeof p.sourceName!=='string'||!p.sourceName.trim()||p.sourceName.length>MAX_NAME)
    throw Error('Invalid preset source name.');
  const region=validateRegion({bufferId:700,channels:p.channels,start:p.start,finish:p.finish,rate:p.rate,amp:p.amp,loop:p.loop});
  return {version:1,sourceId:p.sourceId,sourceName:p.sourceName,
    channels:region.channels,start:region.start,finish:region.finish,rate:region.rate,amp:region.amp,loop:region.loop};
}
export function makeSamplePreset({id,name,item,settings,created=Date.now()}){
  if(typeof id!=='string'||!id.trim()||id.length>256)throw Error('Invalid preset identifier.');
  if(typeof name!=='string'||!name.trim()||name.trim().length>MAX_NAME)throw Error('Name must be 1 to 120 characters.');
  if(!item||typeof item.id!=='string'||!item.id.trim()||item.id.length>256||
    typeof item.name!=='string'||!item.name.trim()||item.name.length>MAX_NAME||
    !(item.blob instanceof Blob))throw Error('Presets require a saved audio recording.');
  if(!Number.isFinite(created)||created<0)throw Error('Invalid creation time.');
  const record={id,name:name.trim(),source:'sample-preset',created,favorite:false,
    samplePreset:{version:1,sourceId:item.id,sourceName:item.name,...validateRegion({bufferId:700,...settings})}};
  // Preserve attribution even if the source audio item is subsequently deleted.
  delete record.samplePreset.bufferId;
  if(item.origin&&typeof item.origin==='object')record.origin=structuredClone(item.origin);
  validateSamplePreset(record);
  return record;
}
export function describeSamplePreset(record){
  const p=validateSamplePreset(record);
  return 'Source: '+p.sourceName+' · '+Math.round(p.start*100)+'–'+Math.round(p.finish*100)+
    '% · '+p.rate.toFixed(2)+'× · '+(p.loop?'Loop':'One shot')+' · Volume '+Math.round(p.amp*100)+'%';
}
