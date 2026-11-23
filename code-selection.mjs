// Semantic source selection for the main Code editor. No audio or Sounds dependencies.
// The scanner is deliberately tolerant of incomplete SuperCollider code while editing.
const OPEN = { '(': ')', '[': ']', '{': '}' };
const CLOSE = { ')': '(', ']': '[', '}': '{' };
const INSTRUMENTS = new Set([
  'SynthDef', 'Ndef', 'Pdef', 'Pbind', 'Pbindef', 'Pmono', 'PmonoArtic',
  'Tdef', 'Routine', 'Task', 'Instr', 'Synth', 'ProxySpace'
]);

function scanSource(source) {
  const mask = source.split('');
  const pairs = [];
  const strings = [];
  const comments = [];
  const stack = [];
  let i = 0;
  function blank(from, to) {
    for (let j = from; j < to; j++) if (source[j] !== '\n') mask[j] = ' ';
  }
  while (i < source.length) {
    const ch = source[i];
    if (ch === '/' && source[i + 1] === '/') {
      const start = i;
      while (i < source.length && source[i] !== '\n') i++;
      blank(start, i);
      comments.push({ from: start, to: i, kind: 'Comment' });
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      const start = i;
      let depth = 1;
      i += 2;
      while (i < source.length && depth) {
        if (source.slice(i, i + 2) === '/*') { depth++; i += 2; }
        else if (source.slice(i, i + 2) === '*/') { depth--; i += 2; }
        else i++;
      }
      blank(start, i);
      comments.push({ from: start, to: i, kind: 'Comment' });
      continue;
    }
    if (ch === '"' || ch === "'") {
      const start = i, quote = ch;
      i++;
      while (i < source.length) {
        if (source[i] === '\\') { i += Math.min(2, source.length - i); continue; }
        if (source[i++] === quote) break;
      }
      blank(start, i);
      strings.push({ from: start, to: i, kind: 'String' });
      continue;
    }
    // SuperCollider character literals may themselves be brackets, e.g. $).
    if (ch === '$' && i + 1 < source.length) {
      const length = source[i + 1] === '\\' ? Math.min(3, source.length - i) : 2;
      blank(i, i + length);
      i += length;
      continue;
    }
    if (OPEN[ch]) stack.push({ char: ch, from: i });
    else if (CLOSE[ch]) {
      const match = stack.length - 1;
      if (match >= 0 && stack[match].char === CLOSE[ch]) {
        const opener = stack.pop();
        pairs.push({ from: opener.from, to: i + 1, char: opener.char });
      }
    }
    i++;
  }
  return { mask: mask.join(''), pairs, strings, comments };
}

export function selectionCandidates(source, start, end = start) {
  source = String(source);
  const length = source.length;
  start = Math.max(0, Math.min(length, start));
  end = Math.max(start, Math.min(length, end));
  const { mask, pairs, strings, comments } = scanSource(source);
  const regions = [];
  const add = (from, to, kind) => {
    if (from >= 0 && to <= length && from < to &&
        from <= start && to >= end) regions.push({ from, to, kind });
  };
  for (const item of [...strings, ...comments]) add(item.from, item.to, item.kind);

  // Function names, variables and method names are one selectable command:
  // SinOsc.ar is more useful than separately selecting SinOsc and ar.
  const word = /[\\~]?[A-Za-z_][A-Za-z_0-9]*(?:\.[A-Za-z_][A-Za-z_0-9]*)*/g;
  for (const match of mask.matchAll(word)) {
    add(match.index, match.index + match[0].length, 'Word');
  }

  const byOpen = new Map(pairs.map(pair => [pair.from, pair]));
  const instrumentCalls = [];
  for (const pair of pairs) {
    add(pair.from, pair.to, pair.char === '{' ? 'Block' :
      pair.char === '[' ? 'Array' : 'Group');
    if (pair.char !== '(') continue;
    const prefixStart = Math.max(0, pair.from - 180);
    const prefix = mask.slice(prefixStart, pair.from);
    const call = prefix.match(/([\\~]?[A-Za-z_][A-Za-z_0-9]*(?:\.[A-Za-z_][A-Za-z_0-9]*)*)\s*$/);
    if (!call) continue;
    const from = pair.from - call[0].length + call[0].indexOf(call[1]);
    add(from, pair.to, 'Expression');
    const name = call[1].replace(/^[\\~]/, '').split('.')[0];
    if (!INSTRUMENTS.has(name)) continue;
    let to = pair.to;
    // Keep terminal method chains, e.g. SynthDef(...).add; and Pbind(...).play.
    while (to < length) {
      let at = to;
      while (at < length && /\s/.test(mask[at])) at++;
      if (mask[at] !== '.') break;
      const method = mask.slice(at + 1).match(/^[A-Za-z_][A-Za-z_0-9]*/);
      if (!method) break;
      to = at + 1 + method[0].length;
      while (to < length && /\s/.test(mask[to])) to++;
      if (mask[to] === '(' && byOpen.has(to)) to = byOpen.get(to).to;
    }
    let semi = to;
    while (semi < length && /\s/.test(mask[semi])) semi++;
    if (mask[semi] === ';') to = semi + 1;
    instrumentCalls.push({ from, to });
  }

  // Semicolon-delimited statements are tracked at each bracket depth. This
  // avoids a semicolon inside a SynthDef body ending the enclosing definition.
  const frames = [{ last: 0, open: null }];
  for (let i = 0; i < mask.length; i++) {
    const ch = mask[i];
    if (OPEN[ch]) {
      let last = i + 1;
      if (ch === '{') {
        // SuperCollider function headers use |arguments| before the first body statement.
        const args = mask.slice(last).match(/^\s*\|[^|]*\|/);
        if (args) last += args[0].length;
      }
      frames.push({ last, open: ch });
    } else if (CLOSE[ch]) {
      if (frames.length > 1 && frames[frames.length - 1].open === CLOSE[ch]) {
        frames.pop();
      }
    } else if (ch === ';') {
      const frame = frames[frames.length - 1];
      let from = frame.last;
      while (from < i && mask[from] === ' ') from++;
      while (from < i && /\s/.test(mask[from])) from++;
      add(from, i + 1, 'Statement');
      frame.last = i + 1;
    }
  }
  if (frames.length === 1) {
    let from = frames[0].last;
    while (from < length && /\s/.test(mask[from])) from++;
    if (from < length) add(from, length, 'Statement');
  }

  // Include a variable assignment in the instrument, if it is part of the same
  // statement: ~drone = SynthDef(...).add; rather than just SynthDef(...).
  for (const call of instrumentCalls) {
    let from = call.from, to = call.to;
    const containing = regions
      .filter(r => r.kind === 'Statement' && r.from <= from && r.to >= to)
      .sort((a, b) => a.to - a.from - (b.to - b.from))[0];
    // Only absorb a surrounding statement when it assigns this instrument.
    // A Pbind nested inside Pdef must remain its own selectable unit.
    if (containing && /=\s*$/.test(mask.slice(containing.from, from))) {
      from = containing.from; to = containing.to;
    }
    add(from, to, 'Instrument');
  }
  if (length) add(0, length, 'Composition');

  const priority = { Instrument: 13, Composition: 12, Statement: 10,
    Block: 9, Array: 8, Group: 7, Expression: 6, Word: 5, String: 4, Comment: 3 };
  const unique = new Map();
  for (const region of regions) {
    const key = region.from + ':' + region.to;
    if (!unique.has(key) || priority[region.kind] > priority[unique.get(key).kind]) {
      unique.set(key, region);
    }
  }
  return [...unique.values()].sort((a, b) =>
    (a.to - a.from) - (b.to - b.from) ||
    a.from - b.from);
}

export function expandedSelection(source, start, end = start) {
  return selectionCandidates(source, start, end)
    .find(region => region.from < start || region.to > end) || null;
}

export function statementSelection(source, position) {
  const candidates = selectionCandidates(source, position, position);
  return candidates.find(region => region.kind === 'Statement') ||
    candidates.find(region => region.kind === 'Block') ||
    candidates.find(region => region.kind === 'Expression') ||
    candidates[0] || null;
}

export function installCodeSelection(editor = document.querySelector('#code')) {
  if (!editor || editor.dataset.semanticSelectionInstalled) return;
  editor.dataset.semanticSelectionInstalled = 'true';

  const bar = document.createElement('div');
  bar.id = 'code-selection-bar';
  bar.className = 'code-selection-bar';
  bar.hidden = true;
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Expand or contract code selection');
  bar.innerHTML = '<button type="button" id="selection-contract" aria-label="Contract selection" title="Contract selection">−</button>' +
    '<span id="selection-kind" role="status" aria-live="polite">Cursor</span>' +
    '<button type="button" id="selection-expand" aria-label="Expand selection" title="Expand selection">+</button>' +
    '<button type="button" id="selection-close" aria-label="Hide selection controls" title="Hide selection controls">×</button>';
  document.body.append(bar);
  const contract = bar.querySelector('#selection-contract');
  const expand = bar.querySelector('#selection-expand');
  const close = bar.querySelector('#selection-close');
  const kind = bar.querySelector('#selection-kind');
  let history = [];
  let hiddenByUser = false;
  let longPressTimer = null;
  let touchStart = null;
  let lastTap = null;
  let tapCount = 0;
  let touchAnchor = 0;
  let touchedAt = 0;

  function positionBar() {
    const viewport = window.visualViewport;
    const obstructed = viewport ?
      Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
    bar.style.bottom = 'calc(env(safe-area-inset-bottom) + ' + (obstructed + 8) + 'px)';
  }
  function selection() {
    return { from: editor.selectionStart, to: editor.selectionEnd };
  }
  function classify(from, to) {
    if (from === to) return 'Cursor';
    return selectionCandidates(editor.value, from, to)
      .find(region => region.from === from && region.to === to)?.kind || 'Selection';
  }
  function show() {
    hiddenByUser = false;
    bar.hidden = false;
    positionBar();
    refresh();
  }
  function refresh() {
    if (bar.hidden) return;
    const current = selection();
    if (!history.length ||
      history[history.length - 1].from !== current.from ||
      history[history.length - 1].to !== current.to) {
      history = [{ ...current, kind: classify(current.from, current.to) }];
    }
    const last = history[history.length - 1];
    kind.textContent = last.kind;
    kind.title = 'Selected: ' + last.kind;
    contract.disabled = history.length < 2;
    expand.disabled = !expandedSelection(editor.value, current.from, current.to);
  }
  function apply(region, push = true) {
    if (!region) return;
    const previous = selection();
    if (push && (!history.length ||
        history[history.length - 1].from !== previous.from ||
        history[history.length - 1].to !== previous.to)) {
      history = [{ ...previous, kind: classify(previous.from, previous.to) }];
    }
    const top = editor.scrollTop, left = editor.scrollLeft;
    try { editor.focus({ preventScroll: true }); } catch { editor.focus(); }
    editor.setSelectionRange(region.from, region.to);
    editor.scrollTop = top;
    editor.scrollLeft = left;
    if (push) history.push({ from: region.from, to: region.to, kind: region.kind });
    bar.hidden = false;
    hiddenByUser = false;
    positionBar();
    refresh();
  }
  function syncSelection() {
    const current = selection();
    if (history.length &&
        current.from === history[history.length - 1].from &&
        current.to === history[history.length - 1].to) return;
    history = [];
    if (current.from !== current.to && !hiddenByUser) show();
    else bar.hidden = true;
  }

  // Do not steal focus or close the keyboard when the thumb controls are used.
  bar.addEventListener('pointerdown', event => event.preventDefault());
  expand.addEventListener('click', () => {
    const { from, to } = selection();
    apply(expandedSelection(editor.value, from, to));
  });
  contract.addEventListener('click', () => {
    if (history.length < 2) return;
    history.pop();
    apply(history[history.length - 1], false);
  });
  close.addEventListener('click', () => {
    hiddenByUser = true;
    bar.hidden = true;
  });

  editor.addEventListener('select', syncSelection);
  editor.addEventListener('keyup', syncSelection);
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === editor) syncSelection();
  });
  editor.addEventListener('input', () => { history = []; bar.hidden = true; });
  editor.addEventListener('blur', () => {
    setTimeout(() => { if (document.activeElement !== editor) bar.hidden = true; }, 0);
  });
  document.addEventListener('pointerdown', event => {
    if (event.target !== editor && !bar.contains(event.target)) bar.hidden = true;
  });

  // Keep the native one-tap caret and native long-press copy/paste handles.
  // Override only the completed double- or triple-tap selection.
  function selectTap(kindName, anchor) {
    const candidates = selectionCandidates(editor.value, anchor, anchor);
    const region = kindName === 'Word' ?
      (candidates.find(item => item.kind === 'Word') ||
       candidates.find(item => item.kind === 'String')) :
      statementSelection(editor.value, anchor);
    if (region) {
      history = [];
      apply(region);
    }
  }
  editor.addEventListener('click', event => {
    if (touchedAt && performance.now() - touchedAt < 800) return;
    if (event.detail === 2 || event.detail === 3) {
      const offset = editor.selectionStart;
      requestAnimationFrame(() => selectTap(event.detail === 2 ? 'Word' : 'Statement', offset));
    } else if (event.detail === 1) {
      syncSelection();
    }
  });

  editor.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    touchStart = { x: touch.clientX, y: touch.clientY, moved: false, held: false };
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      if (!touchStart || touchStart.moved) return;
      touchStart.held = true;
      history = [];
      show();
    }, 560);
  }, { passive: true });
  editor.addEventListener('touchmove', event => {
    if (!touchStart || !event.touches.length) return;
    const touch = event.touches[0];
    if (Math.hypot(touch.clientX - touchStart.x, touch.clientY - touchStart.y) > 12) {
      touchStart.moved = true;
      clearTimeout(longPressTimer);
    }
  }, { passive: true });
  editor.addEventListener('touchend', event => {
    touchedAt = performance.now();
    clearTimeout(longPressTimer);
    if (!touchStart || touchStart.moved || touchStart.held ||
        !event.changedTouches.length) { touchStart = null; return; }
    const touch = event.changedTouches[0];
    const at = performance.now();
    if (lastTap && at - lastTap.at < 380 &&
        Math.hypot(touch.clientX - lastTap.x, touch.clientY - lastTap.y) < 25) {
      tapCount++;
    } else {
      tapCount = 1;
    }
    lastTap = { at, x: touch.clientX, y: touch.clientY };
    if (tapCount === 1) {
      requestAnimationFrame(() => { touchAnchor = editor.selectionStart; });
    } else if (tapCount === 2 || tapCount === 3) {
      const requested = tapCount === 2 ? 'Word' : 'Statement';
      requestAnimationFrame(() => selectTap(requested, touchAnchor));
    } else if (tapCount > 3) {
      tapCount = 0;
    }
    touchStart = null;
  }, { passive: true });
  editor.addEventListener('touchcancel', () => {
    clearTimeout(longPressTimer);
    touchStart = null;
    lastTap = null;
    tapCount = 0;
  }, { passive: true });

  window.visualViewport?.addEventListener('resize', positionBar);
  window.visualViewport?.addEventListener('scroll', positionBar);
  window.addEventListener('resize', positionBar);
}

if (typeof document !== 'undefined') installCodeSelection();
