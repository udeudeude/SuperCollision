import assert from 'node:assert/strict';
import {licenseCode,licenseFacts,meetsLicenseFilters,openverseLicenseFilter} from '../sounds-licenses.mjs';
for(const [input,expected] of [
 ['cc0','cc0'],['pdm','pdm'],['Creative Commons 0','cc0'],['Attribution','by'],
 ['Attribution NonCommercial','by-nc'],['by-sa','by-sa'],['CC BY-NC-ND 4.0','by-nc-nd'],
 ['CC-BY-ND','by-nd'],['unknown license','unknown'],['','unknown']
])assert.equal(licenseCode(input),expected,'classification of '+input);
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
