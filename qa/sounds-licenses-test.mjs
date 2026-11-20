import assert from 'node:assert/strict';
import {licenseCode,licenseFacts,meetsLicenseFilters,openverseLicenseFilter,parseCreativeCommonsLicenseUrl,readableLicense} from '../sounds-licenses.mjs';
for(const [input,expected] of [
 ['cc0','cc0'],['pdm','pdm'],['Creative Commons 0','cc0'],['Attribution','by'],
 ['Attribution NonCommercial','by-nc'],['by-sa','by-sa'],['CC BY-NC-ND 4.0','by-nc-nd'],
 ['CC-BY-ND','by-nd'],
 ['https://creativecommons.org/licenses/by/4.0/','by'],
 ['http://creativecommons.org/licenses/by-nc/3.0/','by-nc'],
 ['https://creativecommons.org/licenses/by-nc-sa/4.0/deed.en','by-nc-sa'],
 ['http://creativecommons.org/publicdomain/zero/1.0/','cc0'],
 ['https://creativecommons.org/publicdomain/mark/1.0/','pdm'],
 ['https://creativecommons.org.evil.test/licenses/by/4.0/','unknown'],
 ['https://example.org/creative%20commons%200','unknown'],
 ['https://creativecommons.org/licenses/by-nd-nc/4.0/','unknown'],
 ['unknown license','unknown'],['','unknown']
])assert.equal(licenseCode(input),expected,'classification of '+input);
assert.deepEqual(parseCreativeCommonsLicenseUrl('http://creativecommons.org/licenses/by/4.0/'),{code:'by',version:'4.0',url:'https://creativecommons.org/licenses/by/4.0/'});
assert.deepEqual(parseCreativeCommonsLicenseUrl('http://creativecommons.org/publicdomain/zero/1.0/'),{code:'cc0',version:'1.0',url:'https://creativecommons.org/publicdomain/zero/1.0/'});
assert.equal(parseCreativeCommonsLicenseUrl('https://creativecommons.org.evil.test/licenses/by/4.0/'),null);
assert.equal(readableLicense('http://creativecommons.org/licenses/by/4.0/'),'Creative Commons BY 4.0');
assert.equal(meetsLicenseFilters('https://creativecommons.org/licenses/by-nc/4.0/',{commercial:true}),false);
assert.equal(meetsLicenseFilters('https://creativecommons.org/licenses/by/4.0/',{commercial:true,modification:true}),true);
assert.equal(licenseFacts('by-nd').modification,false);
assert.equal(licenseFacts('by-nc').commercial,false);
assert.equal(licenseFacts('cc0').attributionRequired,false);
assert.equal(licenseFacts('some random license').commercial,false);
assert.equal(licenseFacts('some random license').modification,false);
const safe={commercial:true,modification:true};
assert.deepEqual(openverseLicenseFilter(safe).split(','),['pdm','cc0','by','by-sa']);
assert.equal(meetsLicenseFilters('Attribution NonCommercial',safe),false);
assert.equal(meetsLicenseFilters('by-nd',safe),false);
assert.equal(meetsLicenseFilters('by',safe),true);
assert.equal(meetsLicenseFilters('cc0',{noAttribution:true}),true);
assert.equal(meetsLicenseFilters('by',{noAttribution:true}),false);
assert.deepEqual(openverseLicenseFilter({cc0Only:true}).split(','),['pdm','cc0']);
console.log('Sounds license classification and combined-filter tests passed');
