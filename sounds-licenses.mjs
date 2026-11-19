/* Conservative, source-independent Creative Commons license classification.
 * Unknown/malformed licenses never silently acquire commercial or remix rights. */
const LICENSES=['pdm','cc0','by','by-sa','by-nd','by-nc','by-nc-sa','by-nc-nd'];
export const OPENVERSE_LICENSES=Object.freeze([...LICENSES]);
export function licenseCode(value){
 let s=String(value||'').trim().toLowerCase();
 if(!s)return 'unknown';
 if(s==='pdm'||s.includes('public domain mark'))return 'pdm';
 if(s==='cc0'||s==='cc-0'||s.includes('creative commons 0')||s.includes('cc zero')||s.includes('public domain dedication'))return 'cc0';
 if(s==='attribution')return 'by';
 if(s==='attribution noncommercial'||s==='attribution non-commercial')return 'by-nc';
 s=s.replace(/^creative commons\s+/,'').replace(/^cc[ -]?/,'').replace(/^attribution(?:[ -])/,'by-')
   .replace(/noncommercial/g,'nc').replace(/non-commercial/g,'nc')
   .replace(/sharealike/g,'sa').replace(/no-derivatives/g,'nd').replace(/noderivs/g,'nd')
   .replace(/[\s_]+/g,'-').replace(/(?:-?\d+(?:\.\d+)?)(?:\/.*)?$/,'').replace(/-+$/,'');
 return LICENSES.includes(s)?s:'unknown';
}
export function licenseFacts(value){
 const code=licenseCode(value);
 const known=code!=='unknown';
 const publicDomain=code==='cc0'||code==='pdm';
 return {code,known,publicDomain,commercial:known&&(publicDomain||!code.includes('-nc')),modification:known&&(publicDomain||!code.includes('-nd')),attributionRequired:known&&!publicDomain};
}
export function meetsLicenseFilters(license,filters={}){
 const f=licenseFacts(license);
 if(filters.cc0Only&&!f.publicDomain)return false;
 if(filters.commercial&&!f.commercial)return false;
 if(filters.modification&&!f.modification)return false;
 if(filters.noAttribution&&!f.known)return false;
 if(filters.noAttribution&&f.attributionRequired)return false;
 return true;
}
export function openverseLicenseFilter(filters={}){
 const codes=OPENVERSE_LICENSES.filter(x=>meetsLicenseFilters(x,filters));
 return codes.length===OPENVERSE_LICENSES.length?'':codes.join(',');
}
export function readableLicense(value){
 const code=licenseCode(value);
 if(code==='pdm')return 'Public Domain Mark';
 if(code==='cc0')return 'Creative Commons Zero (CC0)';
 if(code==='unknown')return String(value||'License not specified');
 return 'Creative Commons '+code.toUpperCase();
}
