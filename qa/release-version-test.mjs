import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const {version} = JSON.parse(readFileSync(new URL('../app-version.json', import.meta.url), 'utf8'));
assert.match(version, /^\d+\.\d+(?:\.\d+)?$/, 'Invalid release version');

const shown = 'v' + version;
const surfaces = {
  'index.html': `<small class="app-version" aria-label="Version ${version}">${shown}</small>`,
  'sounds.html': `<small class="build" aria-label="Version ${version}">${shown}</small>`,
  'sounds-bench-preview.html': `<header><a href="./index.html">← CODE</a><h1>SOUNDS</h1><small>${shown}</small></header>`,
  'sounds-lab.html': `<h1>Instrument Bench</h1><small>${shown}</small>`,
  'librivox-explorer.html': `<span class="preview-note" aria-label="Version ${version}">${shown}</span>`,
};

for (const [path, marker] of Object.entries(surfaces)) {
  const html = readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  assert.ok(html.includes(marker), `${path}: missing current visible release label ${shown}`);
  const visibleVersions = [...html.matchAll(/\bv\d+\.\d+(?:\.\d+)?\b/g)].map(match => match[0]);
  assert.ok(visibleVersions.length > 0, `${path}: missing version label`);
  assert.ok(visibleVersions.every(found => found === shown),
    `${path}: conflicting version labels: ${visibleVersions.join(', ')}`);
}
console.log(`Release ${shown}: all five product surfaces share the same displayed version.`);
