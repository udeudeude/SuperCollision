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
  'sounds.html': {
    marker: `<small class="build" aria-label="Version ${version}">${shown}</small>`,
    badge: /<small class="build"[^>]*>([^<]+)<\/small>/g,
  },
  'sounds-bench-preview.html': {
    marker: `<header><a href="./index.html">← CODE</a><h1>SOUNDS</h1><small>${shown}</small></header>`,
    badge: /<header><a href="\.\/index\.html">← CODE<\/a><h1>SOUNDS<\/h1><small>([^<]+)<\/small><\/header>/g,
  },
  'sounds-lab.html': {
    marker: `<h1>Instrument Bench</h1><small>${shown}</small>`,
    badge: /<h1>Instrument Bench<\/h1><small>([^<]+)<\/small>/g,
  },
  'librivox-explorer.html': {
    marker: `<span class="preview-note" aria-label="Version ${version}">${shown}</span>`,
    badge: /<span class="preview-note"[^>]*>([^<]+)<\/span>/g,
  },
};

for (const [path, {marker, badge}] of Object.entries(surfaces)) {
  const html = readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  assert.ok(html.includes(marker), `${path}: missing current visible release label ${shown}`);
  const labels = [...html.matchAll(badge)].map(match => match[1]);
  assert.deepEqual(labels, [shown], `${path}: one public release badge required`);
}
console.log(`Release ${shown}: all five product surfaces share the same displayed version.`);
