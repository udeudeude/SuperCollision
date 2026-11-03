/* SuperCollision 1.4: mobile workbench and editor-only pinch-to-shrink. */
(() => {
  'use strict';
  const editor = document.getElementById('code');
  const gutter = document.getElementById('line-gutter');
  const layer = document.getElementById('highlight-layer');
  const shell = document.querySelector('.console-shell');
  const consolePanel = document.getElementById('console-panel');
  const diagnostics = document.getElementById('audio-panel');
  const viewButtons = {
    code: document.getElementById('inspector-code'),
    console: document.getElementById('inspector-console'),
    audio: document.getElementById('inspector-audio'),
    perform: document.getElementById('inspector-perform')
  };
  const body = document.body;
  const views = ['code', 'console', 'audio', 'perform'];
  let mode = 'code';
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
      updateGutterWidth(count);
    }
    followEditor();
  }
  window.renderLineGutter = renderGutter;
  window.syncEditorScroll = followEditor;

  // Normal code size is the upper bound. Zoom changes only the editor,
  // highlighted text and line-number gutter, never the application chrome.
  const MAX_FONT = 14;
  const MIN_FONT = 6;
  const DEFAULT_FONT = MAX_FONT;
  const ZOOM_KEY = 'supercollision-editor-font-px-v1';
  const frame = document.querySelector('.editor-frame');
  const zoomIndicator = document.getElementById('code-zoom-indicator');
  const padX = 8;
  const padY = 12;
  const clamp = x => Math.max(MIN_FONT, Math.min(MAX_FONT, x));
  let fontPx = DEFAULT_FONT;
  let pinch = null;

  function updateGutterWidth(count = previousLineCount) {
    const digits = String(Math.max(count, 1)).length;
    const labelPx = Math.max(6, Math.min(10, fontPx * 10 / MAX_FONT));
    const width = Math.max(20, Math.min(56, Math.ceil(digits * labelPx * .66 + 13)));
    gutter.style.flexBasis = width + 'px';
  }
  function saveFont() {
    try { localStorage.setItem(ZOOM_KEY, String(fontPx)); } catch {}
  }
  function applyFont(nextPx, focus = null) {
    const old = fontPx;
    const next = Math.round(clamp(nextPx) * 10) / 10;
    if (!Number.isFinite(next)) return;
    const box = editor.getBoundingClientRect();
    const pointX = focus ? focus.startX - box.left : box.width / 2;
    const pointY = focus ? focus.startY - box.top : box.height / 2;
    const oldScrollX = focus ? focus.scrollLeft : editor.scrollLeft;
    const oldScrollY = focus ? focus.scrollTop : editor.scrollTop;
    const currentX = focus ? focus.currentX - box.left : pointX;
    const currentY = focus ? focus.currentY - box.top : pointY;
    const ratio = next / (focus ? focus.startFont : old);
    fontPx = next;
    document.documentElement.style.setProperty('--editor-font-size', next + 'px');
    document.documentElement.style.setProperty('--line-height', (next * 1.5) + 'px');
    document.documentElement.style.setProperty('--gutter-font-size', Math.max(6, Math.min(10, next * 10 / MAX_FONT)) + 'px');
    updateGutterWidth();
    // Retain the source position under the pinch centre as type shrinks.
    editor.scrollTop = Math.max(0, padY + (oldScrollY + pointY - padY) * ratio - currentY);
    editor.scrollLeft = Math.max(0, padX + (oldScrollX + pointX - padX) * ratio - currentX);
    followEditor();
    zoomIndicator.textContent = 'CODE ' + Math.round(next / MAX_FONT * 100) + '%';
  }
  function distance(a, b) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }
  function midpoint(a, b) {
    return {x:(a.clientX+b.clientX)/2,y:(a.clientY+b.clientY)/2};
  }
  function beginPinch(a, b) {
    const center = midpoint(a, b);
    pinch = {kind:'touch', startFont:fontPx, dist:Math.max(1,distance(a,b)),
      startX:center.x,startY:center.y,scrollTop:editor.scrollTop,scrollLeft:editor.scrollLeft};
    zoomIndicator.hidden = false;
  }
  function finishPinch() {
    if (!pinch) return;
    pinch = null;
    zoomIndicator.hidden = true;
    saveFont();
  }
  frame.addEventListener('touchstart', e => {
    if (e.touches.length === 2 && !pinch) beginPinch(e.touches[0], e.touches[1]);
  }, {passive:true});
  frame.addEventListener('touchmove', e => {
    if (e.touches.length !== 2) return;
    if (!pinch) beginPinch(e.touches[0],e.touches[1]);
    if (pinch.kind !== 'touch') return;
    e.preventDefault();
    const mid = midpoint(e.touches[0],e.touches[1]);
    applyFont(pinch.startFont * distance(e.touches[0],e.touches[1]) / pinch.dist,
      {...pinch,currentX:mid.x,currentY:mid.y});
  }, {passive:false});
  frame.addEventListener('touchend', e => {
    if (pinch && e.touches.length < 2) finishPinch();
  }, {passive:true});
  frame.addEventListener('touchcancel', finishPinch, {passive:true});

  // WebKit emits gesture events on some iOS versions instead of touchmove.
  frame.addEventListener('gesturestart', e => {
    e.preventDefault();
    if (!pinch) {
      pinch = {kind:'gesture',startFont:fontPx,startX:e.clientX,startY:e.clientY,
        scrollTop:editor.scrollTop,scrollLeft:editor.scrollLeft};
      zoomIndicator.hidden = false;
    }
  }, {passive:false});
  frame.addEventListener('gesturechange', e => {
    e.preventDefault();
    if (!pinch || pinch.kind !== 'gesture') return;
    applyFont(pinch.startFont * e.scale,
      {...pinch,currentX:e.clientX,currentY:e.clientY});
  }, {passive:false});
  frame.addEventListener('gestureend', e => {
    e.preventDefault();
    if (pinch && pinch.kind === 'gesture') finishPinch();
  }, {passive:false});

  // Non-touch alternatives live in the existing FILE menu.
  document.getElementById('code-size-smaller').addEventListener('click', () => {
    applyFont(fontPx - 1); saveFont();
  });
  document.getElementById('code-size-larger').addEventListener('click', () => {
    applyFont(fontPx + 1); saveFont();
  });
  document.getElementById('code-size-reset').addEventListener('click', () => {
    applyFont(DEFAULT_FONT); saveFont();
  });
  editor.addEventListener('keydown', e => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    if (e.key === '-' || e.key === '_') {
      e.preventDefault(); applyFont(fontPx - 1); saveFont();
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault(); applyFont(fontPx + 1); saveFont();
    } else if (e.key === '0') {
      e.preventDefault(); applyFont(DEFAULT_FONT); saveFont();
    }
  });
  try {
    const saved = Number(localStorage.getItem(ZOOM_KEY));
    if (Number.isFinite(saved) && saved >= MIN_FONT && saved <= MAX_FONT) fontPx = saved;
  } catch {}
  const restoredFont = fontPx;
  fontPx = DEFAULT_FONT;
  applyFont(restoredFont);
  window.getSuperCollisionCodeFontSize = () => fontPx;


  function compactChrome() {
    body.classList.toggle('compact', editor.scrollTop > 20 || mode !== 'code');
  }
  function setMode(next) {
    if (!views.includes(next)) return;
    mode = next;
    body.classList.toggle('view-console', next === 'console');
    body.classList.toggle('view-audio', next === 'audio');
    body.classList.toggle('view-perform', next === 'perform');
    consolePanel.open = next === 'console';
    diagnostics.setAttribute('aria-hidden', String(next !== 'audio'));
    diagnostics.inert = next !== 'audio';
    for (const [view, button] of Object.entries(viewButtons)) {
      button.setAttribute('aria-pressed', String(view === next));
    }
    compactChrome();
    if(next==='perform')window.SCTimeline?.show();
    requestAnimationFrame(followEditor);
  }
  for (const [view, button] of Object.entries(viewButtons)) {
    button.addEventListener('click', () => setMode(view));
  }
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
        if (dy < -70 && atBottom && info.scroll >= editor.scrollHeight - editor.clientHeight - 12) {
          setMode(views[Math.min(2, views.indexOf(mode) + 1)]);
        } else if (dy > 70 && atTop && mode !== 'code') {
          setMode(views[Math.max(0, views.indexOf(mode) - 1)]);
        }
      } else {
        setMode(views[Math.max(0, Math.min(2, views.indexOf(mode) + (dy < 0 ? 1 : -1)))]);
      }
    }, {passive:true});
  }
  installSwipe(shell.querySelector('.console-bar'), false);
  // Transport and gutter are not gesture targets: their use must not change the panel accidentally.
  installSwipe(editor, true);
  shell.querySelector('.console-bar').addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > 18) setMode(views[Math.max(0, Math.min(2, views.indexOf(mode) + (e.deltaY > 0 ? 1 : -1)))]);
  }, {passive:true});
  // Errors already open details in the interpreter bridge. Ensure the output is actually visible.
  new MutationObserver(() => {
    if (consolePanel.open && mode !== 'console') setMode('console');
  }).observe(consolePanel, {attributes:true, attributeFilter:['open']});
  window.addEventListener('resize', () => requestAnimationFrame(followEditor), {passive:true});
  renderGutter();
  setMode('code');
})();