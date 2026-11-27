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
    marker: `<span class="sc-family-version">${shown}</span>`,
    badge: /<span class="sc-family-version">([^<]+)<\/span>/g,
  },
  'sounds-bench-preview.html': {
    marker: `<span class="sc-family-version">${shown}</span>`,
    badge: /<span class="sc-family-version">([^<]+)<\/span>/g,
  },
  'sounds-lab.html': {
    marker: `<span class="sc-family-version">${shown}</span>`,
    badge: /<span class="sc-family-version">([^<]+)<\/span>/g,
  },
  'librivox-explorer.html': {
    marker: `<span class="sc-family-version">${shown}</span>`,
    badge: /<span class="sc-family-version">([^<]+)<\/span>/g,
  },
};

for (const [path, {marker, badge}] of Object.entries(surfaces)) {
  const html = readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  assert.ok(html.includes(marker), `${path}: missing current visible release label ${shown}`);
  const labels = [...html.matchAll(badge)].map(match => match[1]);
  assert.deepEqual(labels, [shown], `${path}: one public release badge required`);
}
console.log(`Release ${shown}: all five product surfaces share the same displayed version.`);
