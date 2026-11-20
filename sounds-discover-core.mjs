/* Pure provider-normalization and download metadata helpers for Sounds / Discover.
 * These functions never fetch, process audio or access browser state. */
export const COMMONS_SOURCE='wikimedia_audio';
/* An indexed provider URL is not proof of original mastering quality. */
export function audioVariantFromResult(sound,provider){
 const sources=[provider,sound?.source,sound?.provider].map(x=>String(x||'').toLowerCase());
 return sources.includes('freesound')?'compressed preview':'provider-supplied audio (original quality unverified)';
}
export function freesoundLicenseFilter(filters={}){
 if(filters.cc0Only||filters.noAttribution)return 'license:"Creative Commons 0"';
 if(filters.commercial)return 'license:("Attribution" OR "Creative Commons 0")';
 return '';
}
export function openverseSourceFilter(source){
 return source==='wikimedia'?COMMONS_SOURCE:'';
}
export function durationSeconds(value,provider){
 const n=Number(value);
 if(!Number.isFinite(n)||n<=0)return 0;
 // Freesound reports seconds; Openverse's duration is milliseconds.
 return provider==='freesound'?n:n/1000;
}
const EXT_TO_MIME={mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',
 flac:'audio/flac',aif:'audio/aiff',aiff:'audio/aiff',m4a:'audio/mp4',
 mp4:'audio/mp4',webm:'audio/webm',opus:'audio/ogg',aac:'audio/aac'};
/* A successful HTTP status is not proof of audio; some hosts redirect
 * inaccessible recordings to an HTML login/error page with HTTP 200. */
export function importedAudioMime(contentType,url){
 const declared=String(contentType||'').split(';')[0].trim().toLowerCase();
 if(/^(text\/|image\/|video\/|application\/(?:json|xml|pdf|javascript|xhtml\+xml))/.test(declared))
  throw Error('The source returned '+declared+' instead of audio. Open the source page and import manually.');
 if(declared.startsWith('audio/'))return declared;
 if(declared&&declared!=='application/octet-stream'&&declared!=='binary/octet-stream'&&declared!=='application/ogg')
  throw Error('The source did not return a recognized audio format ('+declared+').');
 if(declared==='application/ogg')return 'audio/ogg';
 let extension='';
 try{extension=new URL(url).pathname.split('.').pop().toLowerCase()}catch{}
 return EXT_TO_MIME[extension]||'application/octet-stream';
}

/* Read-only transfer diagnostics. A success status and an audio MIME header
 * are not proof that a remote server returned audio rather than an error page. */
export function rejectMislabelledAudio(bytes){
 const prefix=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||[]);
 const head=new TextDecoder().decode(prefix.subarray(0,256)).replace(/^\uFEFF/,'').trimStart();
 if(/^(?:<!doctype\s+html\b|<html(?:\s|>)|<head(?:\s|>)|<body(?:\s|>)|<\?xml\b|<\?php\b|[\[{]\s*["']?(?:error|errors|detail|message)\b)/i.test(head))
  throw Error('The server returned an error page instead of audio. Open its source page and Import the file manually.');
}
export function downloadProgressText(bytes,total=0){
 const count=Math.max(0,Number(bytes)||0),size=Number(total);
 const mb=n=>(n/1048576).toFixed(n<10485760?2:1);
 if(Number.isFinite(size)&&size>0)
  return 'Downloading: '+mb(count)+' of '+mb(size)+' MB ('+Math.min(100,Math.floor(100*count/size))+'%).';
 return 'Downloading: '+mb(count)+' MB received (50 MB limit).';
}
