import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const moduleSource = await readFile(new URL('../code-selection.mjs', import.meta.url), 'utf8');
const mainPage = await readFile(new URL('../index.html', import.meta.url), 'utf8');
assert.match(mainPage, /<script type="module" src="\.\/code-selection\.mjs\?v=1"><\/script>/,
  'Code page must actually load the semantic selection module');

const example = '(\nSynthDef(\\drone, { |freq=110|\n' +
  '    var tone = SinOsc.ar(freq, 0, 0.1);\n' +
  '    Out.ar(0, tone ! 2);\n' +
  '}).add;\n)';
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<style>body{padding:12px}#code{width:100%;height:350px;font:16px/24px monospace}' +
  '.code-selection-bar[hidden]{display:none}.code-selection-bar{position:fixed;display:flex;gap:8px;' +
  'bottom:10px;background:#222;color:white;z-index:10;padding:8px}' +
  '.code-selection-bar button{min-height:42px;min-width:42px}</style></head><body>' +
  '<textarea id="code" aria-label="SuperCollider code editor"></textarea>' +
  '<script type="module" src="/code-selection.mjs"></script></body></html>';
const server = createServer((req, res) => {
  if (req.url?.startsWith('/code-selection.mjs')) {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
    res.end(moduleSource);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + server.address().port + '/';
const browser = await chromium.launch({ channel: process.env.SELECTION_BROWSER_CHANNEL || 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(url);
  await page.locator('#code').fill(example);
  const cursor = example.indexOf('SinOsc.ar') + 3;
  const selectionText = () => page.locator('#code').evaluate(element =>
    element.value.slice(element.selectionStart, element.selectionEnd));
  const reset = () => page.locator('#code').evaluate((element, pos) => {
    element.focus();
    element.setSelectionRange(pos, pos);
  }, cursor);

  await reset();
  await page.locator('#code').evaluate(element => {
    element.dispatchEvent(new MouseEvent('click', { detail: 2, bubbles: true }));
  });
  await page.waitForFunction(() => {
    const element = document.querySelector('#code');
    return element.value.slice(element.selectionStart, element.selectionEnd) === 'SinOsc.ar';
  });
  assert.equal(await selectionText(), 'SinOsc.ar', 'double click selects complete method name');
  assert.equal(await page.locator('#selection-kind').innerText(), 'Word');
  assert.ok(await page.locator('#code-selection-bar').isVisible(), 'selection toolbar appears when text selected');

  await page.locator('#selection-expand').click();
  assert.equal(await selectionText(), 'SinOsc.ar(freq, 0, 0.1)');
  assert.equal(await page.locator('#selection-kind').innerText(), 'Expression');
  assert.equal(await page.locator('#code').evaluate(element => document.activeElement === element), true,
    'selection buttons do not close the editing keyboard');

  await page.locator('#selection-expand').click();
  assert.equal(await selectionText(), 'var tone = SinOsc.ar(freq, 0, 0.1);');
  await page.locator('#selection-contract').click();
  assert.equal(await selectionText(), 'SinOsc.ar(freq, 0, 0.1)', 'contract returns to previous selection');
  await page.locator('#selection-contract').click();
  assert.equal(await selectionText(), 'SinOsc.ar', 'second contraction restores original word');

  await reset();
  await page.locator('#code').evaluate(element => {
    element.dispatchEvent(new MouseEvent('click', { detail: 3, bubbles: true }));
  });
  await page.waitForFunction(() => {
    const element = document.querySelector('#code');
    return element.value.slice(element.selectionStart, element.selectionEnd) ===
      'var tone = SinOsc.ar(freq, 0, 0.1);';
  });
  assert.equal(await page.locator('#selection-kind').innerText(), 'Statement');

  await page.locator('#selection-close').click();
  assert.equal(await page.locator('#code-selection-bar').isVisible(), false, 'close hides temporary controls');

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true });
  const touchPage = await mobile.newPage();
  await touchPage.goto(url);
  await touchPage.locator('#code').fill(example);
  await touchPage.locator('#code').evaluate(async (element, pos) => {
    element.focus();
    element.setSelectionRange(pos, pos);
    for (let count = 0; count < 3; count++) {
      const touch = new Touch({ identifier: count, target: element, clientX: 50, clientY: 90 });
      element.dispatchEvent(new TouchEvent('touchstart', {
        bubbles: true, touches: [touch], targetTouches: [touch], changedTouches: [touch]
      }));
      element.dispatchEvent(new TouchEvent('touchend', {
        bubbles: true, touches: [], targetTouches: [], changedTouches: [touch]
      }));
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
  }, cursor);
  assert.equal(await touchPage.locator('#code').evaluate(element =>
    element.value.slice(element.selectionStart, element.selectionEnd)),
  'var tone = SinOsc.ar(freq, 0, 0.1);', 'triple touch selects statement on phone viewport');
  assert.ok(await touchPage.locator('#code-selection-bar').isVisible());
  await mobile.close();
  await page.close();
  console.log('Code selection browser checks passed: double/triple gestures, expand, contract, focus, phone touch.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
