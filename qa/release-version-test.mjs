import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const {version} = JSON.parse(readFileSync(new URL('../app-version.json', import.meta.url), 'utf8'));
assert.match(version, /^\d+\.\d+(?:\.\d+)?$/, 'Invalid release version');

const shown = 'v' + version;
const surfaces = {
  'index.html': {
    marker: `<small class="app-version" aria-label="Version ${version}">${shown}</small>`,
    badge: /<small class="app-version"[^>]*>([^<]+)<\/small>/g,
  },
  'sounds-bench-preview.html': {
    marker: `<small class="app-version" aria-label="Version ${version}">${shown}</small>`,
    badge: /<small class="app-version"[^>]*>([^<]+)<\/small>/g,
  },
  'sounds-lab.html': {
    marker: `<small class="app-version" aria-label="Version ${version}">${shown}</small>`,
    badge: /<small class="app-version"[^>]*>([^<]+)<\/small>/g,
  },
  'librivox-explorer.html': {
    marker: `<small class="app-version" aria-label="Version ${version}">${shown}</small>`,
    badge: /<small class="app-version"[^>]*>([^<]+)<\/small>/g,
  },
};

// One literal header, not four visual approximations. Any drift is a regression.
const canonicalCode = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const extractHeader = html => html.match(/<header class="sc-code-header">[\s\S]*?<\/header>/)?.[0];
const canonicalHeader = extractHeader(canonicalCode);
assert.ok(canonicalHeader, 'Code masthead is missing');
for(const path of ['sounds-bench-preview.html','sounds-lab.html','librivox-explorer.html']){
 const html=readFileSync(new URL('../'+path, import.meta.url),'utf8');
 assert.equal(extractHeader(html),canonicalHeader,path+': masthead must be identical to Code');
 assert.ok(html.includes('supercollision-header.css'),path+': missing canonical header stylesheet');
}
assert.ok(canonicalCode.includes('supercollision-header.css'),'Code must use the same header stylesheet');
for (const [path, {marker, badge}] of Object.entries(surfaces)) {
  const html = readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  assert.ok(html.includes(marker), `${path}: missing current visible release label ${shown}`);
  const labels = [...html.matchAll(badge)].map(match => match[1]);
  assert.deepEqual(labels, [shown], `${path}: one public release badge required`);
}
const legacy=readFileSync(new URL('../sounds.html',import.meta.url),'utf8');
assert.match(legacy,/location\.replace\(target\.href\)/,'Legacy Sounds URL must redirect');
console.log(`Release ${shown}: four active product surfaces share the same displayed version; legacy Sounds redirects.`);
