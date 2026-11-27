/* Real-page masthead and Sounds navigation checks across phones and themes. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.env.SC_QA_SITE_DIR
  ? path.resolve(process.env.SC_QA_SITE_DIR)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  const relative = new URL(request.url, 'http://localhost').pathname;
  const filename = path.resolve(root, '.' + (relative === '/' ? '/index.html' : relative));
  if (!filename.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    const data = await readFile(filename);
    response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' }).end(data);
  } catch {
    response.writeHead(404).end('Not found');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port + '/';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });

try {
  const themes = ['bauhaus', 'blackmountain', 'moog', 'makenoise',
    'score', 'scope', 'patch', 'terminal'];
  for (const width of [320, 390, 430]) {
    const context = await browser.newContext({ viewport: { width, height: 844 },
      isMobile: true, hasTouch: true });
    const page = await context.newPage();
    for (const theme of themes) {
      await page.goto(origin + '?design=' + theme, { waitUntil: 'load' });
      await page.waitForFunction(value => document.body.dataset.theme === value, theme);
      await page.evaluate(() => document.fonts.ready);
      const state = await page.evaluate(() => {
        const rect = element => element.getBoundingClientRect();
        const title = document.querySelector('body > header h1');
        const version = document.querySelector('body > header .app-version');
        const artwork = document.querySelector('body > header .identity-art');
        const themeChoice = document.querySelector('body > header .theme-strip select');
        const sounds = document.querySelector('#sounds-open');
        return {
          title: title?.textContent, titleWidth: title?.clientWidth,
          titleScroll: title?.scrollWidth,
          titleBounds: rect(title).toJSON(), versionText: version?.textContent,
          versionVisible: version && getComputedStyle(version).display !== 'none',
          versionBounds: rect(version).toJSON(), themeBounds: rect(themeChoice).toJSON(),
          artworkBounds: rect(artwork).toJSON(),
          soundsBounds: rect(sounds).toJSON(),
          soundsInNavigation: sounds?.parentElement?.classList.contains('projectbar'),
          soundsInHeader: !!document.querySelector('body > header #sounds-open'),
          staleBuild: !!document.querySelector('#app-version, #development-version'),
          viewport: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          headerBounds: rect(document.querySelector('body > header')).toJSON(),
          buttonsFit: [...document.querySelectorAll('.projectbar > button, .projectbar > details')]
            .every(el => rect(el).right <= rect(el.parentElement).right + 1)
        };
      });
      const where = theme + ' at ' + width + 'px';
      assert.equal(state.title, 'SuperCollision', where + ': page name changed');
      assert.equal(state.versionText, 'v2.9', where + ': correct version is beside title');
      assert.ok(state.versionVisible, where + ': version hidden on small screen');
      assert.ok(state.titleScroll <= state.titleWidth + 1, where +
        ': title clipped (' + state.titleScroll + 'px text vs ' + state.titleWidth + 'px available)');
      assert.ok(state.titleBounds.right <= state.versionBounds.left + 2,
        where + ': title overlaps version');
      assert.ok(state.versionBounds.right <= state.themeBounds.left + 2,
        where + ': version overlaps theme picker');
      assert.ok(state.artworkBounds.right <= state.titleBounds.left + 2,
        where + ': artwork overlaps title');
      assert.ok(state.documentWidth <= state.viewport + 1, where + ': page overflows viewport');
      assert.ok(state.soundsInNavigation && !state.soundsInHeader && !state.staleBuild,
        where + ': Sounds must be in the navigation row, never the title bar');
      assert.ok(state.soundsBounds.width >= 48 && state.soundsBounds.height >= 32,
        where + ': Sounds navigation touch target too small');
      assert.ok(state.buttonsFit, where + ': navigation buttons overflow');
      if (theme === 'moog') {
        assert.equal(await page.locator('#sounds-overlay').count(), 0,
          where + ': obsolete recorder must not overlay Code');
        await page.locator('#code').fill('// Navigation must preserve unsaved Code edits');
        await page.locator('#sounds-open').click();
        await page.waitForURL('**/sounds-bench-preview.html#play');
        assert.equal(await page.locator('.bench-tabs').isVisible(), true,
          where + ': integrated Sounds did not open');
        assert.equal(await page.locator('#lab-setup').isVisible(), true,
          where + ': Instrument Bench should be the default Sounds destination');
        assert.equal(await page.locator('#sc-surface-design').inputValue(), 'moog',
          where + ': Sounds did not inherit Code design');
        await page.locator('#sc-surface-design').selectOption('bauhaus');
        await page.goto(origin+'librivox-explorer.html');
        await page.waitForURL('**/librivox-explorer.html');
        assert.equal(await page.locator('#sc-surface-design').inputValue(), 'bauhaus',
          where + ': LibriVox lost shared design');
        await page.getByRole('link',{name:'SuperCollision Code home'}).click();
        await page.waitForURL('**/index.html');
        assert.equal(await page.locator('#code').isVisible(), true,
          where + ': Code editor missing after return');
        assert.equal(await page.evaluate(()=>document.body.dataset.theme),'bauhaus',
          where + ': Code did not inherit design selected in Sounds');
        assert.equal(await page.locator('#code').inputValue(), '// Navigation must preserve unsaved Code edits',
          where + ': navigating away discarded the latest composition');
      }
    }
    await context.close();
  }
  console.log('Header/navigation checks passed: v2.9 beside full title, unified Sounds link, saved Code preserved, eight themes at three phone widths.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
