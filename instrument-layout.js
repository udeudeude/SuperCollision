/* SuperCollision 1.3: unified viewport and editor gutter, no audio-engine modifications. */
(() => {
  'use strict';
  const editor = document.getElementById('code');
  const gutter = document.getElementById('line-gutter');
  const layer = document.getElementById('highlight-layer');
  const shell = document.querySelector('.console-shell');
  const consolePanel = document.getElementById('console-panel');
  const diagnostics = document.querySelector('main > details.utility');
  const consoleButton = document.getElementById('inspect-toggle');
  const body = document.body;
  let mode = 0;
  let previousLineCount = -1;
  let inner = gutter.querySelector('#line-inner');
  if (!inner) {
    inner = document.createElement('div');
    inner.id = 'line-inner';
    gutter.replaceChildren(inner);
  }
  function followEditor() {
    inner.style.transform = 'translate3d(0,' + (-editor.scrollTop) + 'px,0)';
    layer.scrollTop = editor.scrollTop;
    layer.scrollLeft = editor.scrollLeft;
  }
  function renderGutter() {
    const count = editor.value.split('\n').length;
    if (count !== previousLineCount) {
      previousLineCount = count;
      const frag = document.createDocumentFragment();
      const limit = Math.min(count, 6000);
      for (let i = 1; i <= limit; i++) {
        const line = document.createElement('span');
        line.className = 'line';
        line.textContent = String(i);
        frag.appendChild(line);
      }
      inner.replaceChildren(frag);
      if (count > limit) {
        const overflow = document.createElement('span');
        overflow.className = 'line';
        overflow.textContent = '…';
        inner.appendChild(overflow);
      }
      gutter.style.flexBasis = Math.min(56, Math.max(28, String(count).length * 8 + 14)) + 'px';
    }
    followEditor();
  }
  window.renderLineGutter = renderGutter;
  window.syncEditorScroll = followEditor;

  function compactChrome() {
    body.classList.toggle('compact', editor.scrollTop > 20 || mode > 0);
  }
  function setMode(next) {
    mode = Math.max(0, Math.min(2, next));
    body.classList.toggle('inspect-1', mode === 1);
    body.classList.toggle('inspect-2', mode === 2);
    consolePanel.open = mode > 0;
    if (mode === 2 && diagnostics) diagnostics.open = true;
    consoleButton.textContent = mode === 0 ? '▴ CONSOLE' : mode === 1 ? '▴ MORE' : '▾ EDITOR';
    consoleButton.setAttribute('aria-expanded', String(mode > 0));
    consoleButton.setAttribute('aria-label', mode === 0 ?
      'Expand console and shrink editor' : mode === 1 ?
      'Reveal diagnostics and shrink editor' : 'Restore editor height');
    compactChrome();
    requestAnimationFrame(followEditor);
  }
  consoleButton.addEventListener('click', () => setMode(mode === 2 ? 0 : mode + 1));
  editor.addEventListener('scroll', compactChrome, {passive:true});
  editor.addEventListener('scroll', followEditor, {passive:true});
  let tracking = null;
  function installSwipe(target, editorSurface) {
    target.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      tracking = {y:e.touches[0].clientY, x:e.touches[0].clientX, scroll:editor.scrollTop, surface:editorSurface};
    }, {passive:true});
    target.addEventListener('touchend', (e) => {
      if (!tracking || !e.changedTouches.length) return;
      const info = tracking;
      tracking = null;
      const dy = e.changedTouches[0].clientY - info.y;
      const dx = e.changedTouches[0].clientX - info.x;
      if (Math.abs(dy) < 48 || Math.abs(dy) < Math.abs(dx) * 1.4) return;
      if (info.surface) {
        // Preserve ordinary editor scrolling. Overscroll at the end opens the lower panels.
        const atBottom = editor.scrollTop + editor.clientHeight >= editor.scrollHeight - 5;
        const atTop = editor.scrollTop <= 5;
        if (dy < 0 && atBottom && info.scroll >= editor.scrollHeight - editor.clientHeight - 12) setMode(Math.min(2, mode + 1));
        else if (dy > 0 && atTop && mode > 0) setMode(Math.max(0, mode - 1));
      } else {
        setMode(mode + (dy < 0 ? 1 : -1));
      }
    }, {passive:true});
  }
  installSwipe(shell.querySelector('.console-bar'), false);
  installSwipe(gutter, false);
  installSwipe(editor, true);
  shell.querySelector('.console-bar').addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > 18) setMode(mode + (e.deltaY > 0 ? 1 : -1));
  }, {passive:true});
  // Errors already open details in the interpreter bridge. Ensure the output is actually visible.
  new MutationObserver(() => {
    if (consolePanel.open && mode === 0) setMode(1);
  }).observe(consolePanel, {attributes:true, attributeFilter:['open']});
  window.addEventListener('resize', () => requestAnimationFrame(followEditor), {passive:true});
  renderGutter();
  compactChrome();
})();