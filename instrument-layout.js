/* SuperCollision 1.4: mobile workbench and editor-only pinch-to-shrink. */
(() => {
  'use strict';
  const editor = document.getElementById('code');
  const gutter = document.getElementById('line-gutter');
  const layer = document.getElementById('highlight-layer');
  const shell = document.querySelector('.console-shell');
  const consolePanel = document.getElementById('console-panel');
  const viewButtons = {
    code: document.getElementById('inspector-code'),
    console: document.getElementById('inspector-console'),
    perform: document.getElementById('inspector-perform'),
    learn: document.getElementById('inspector-learn'),
    design: document.getElementById('inspector-design')
  };
  const body = document.body;
  const views = ['code', 'console', 'perform', 'learn', 'design'];
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
  const MIN_FONT = 4;
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
    const labelPx = Math.max(4, Math.min(10, fontPx * 10 / MAX_FONT));
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
    document.documentElement.style.setProperty('--gutter-font-size', Math.max(4, Math.min(10, next * 10 / MAX_FONT)) + 'px');
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


  // One accessible touch/keyboard divider, with independent saved proportions
  // for CONSOLE, MIX, LEARN and GENERATE. CODE retains the full editor.
  const divider=document.getElementById('workspace-divider');
  const workspace=document.querySelector('body > main');
  const paneTargets={
    console:shell,
    perform:document.getElementById('perform-panel'),
    learn:document.getElementById('learning-host'),
    design:document.getElementById('sound-host')
  };
  const paneDefaults={console:.46,perform:.42,learn:.48,design:.62};
  const paneProperties={
    console:'--console-pane-size',
    perform:'--perform-pane-size',
    learn:'--learn-pane-size',
    design:'--design-pane-size'
  };
  // Retain the existing Console preference for compatibility with earlier lab.
  const paneKeys={
    console:'supercollision-console-pane-ratio-v1',
    perform:'supercollision-mix-pane-ratio-v1',
    learn:'supercollision-learn-pane-ratio-v1',
    design:'supercollision-generate-pane-ratio-v1'
  };
  const paneRatios={...paneDefaults};
  for(const view of Object.keys(paneDefaults)){
    try{
      const stored=Number(localStorage.getItem(paneKeys[view]));
      if(Number.isFinite(stored)&&stored>=.15&&stored<=.85)paneRatios[view]=stored;
    }catch{}
  }
  function paneBounds(view=mode){
    const height=workspace.getBoundingClientRect().height||600;
    const separator=divider.getBoundingClientRect().height||16;
    // Other views reserve the non-resizable 40px mode/status tab strip.
    const reserved=separator+(view==='console'?0:shell.getBoundingClientRect().height||40);
    const minimumCode=Math.min(150,Math.max(80,height*.25));
    const minimumPanel=Math.min(125,Math.max(65,height*.19));
    const lower=Math.max(.15,minimumPanel/height);
    const upper=Math.max(lower,Math.min(.8,(height-minimumCode-reserved)/height));
    return {lower,upper,height};
  }
  function setPaneRatio(view,value,persist=false){
    if(!(view in paneTargets))return;
    const {lower,upper}=paneBounds(view);
    const ratio=Math.max(lower,Math.min(upper,value));
    paneRatios[view]=ratio;
    body.style.setProperty(paneProperties[view],(ratio*100).toFixed(3)+'%');
    if(view===mode){
      divider.setAttribute('aria-valuemin',String(Math.round(lower*100)));
      divider.setAttribute('aria-valuemax',String(Math.round(upper*100)));
      divider.setAttribute('aria-valuenow',String(Math.round(ratio*100)));
      divider.setAttribute('aria-valuetext',Math.round(ratio*100)+'% '+
        ({console:'console',perform:'mix',learn:'learning',design:'generator'}[view])+' and '+
        Math.round((1-ratio)*100)+'% remaining workspace');
    }
    if(persist){
      try{localStorage.setItem(paneKeys[view],String(ratio))}catch{}
    }
    if(view==='console'&&mode===view)
      requestAnimationFrame(()=>window.SCConsoleOnShow?.());
  }
  function refreshDivider(){
    if(!(mode in paneTargets)){
      divider.setAttribute('aria-label','Resize lower panel');
      return;
    }
    const name={console:'Console',perform:'Mix',learn:'Learn',design:'Generate'}[mode];
    divider.setAttribute('aria-label','Resize code editor and '+name+' panel');
    divider.setAttribute('title','Drag to resize '+name+'; double-tap to reset');
    setPaneRatio(mode,paneRatios[mode]);
  }
  let dividerDrag=null,lastDividerTap=0;
  divider.addEventListener('pointerdown',event=>{
    if(!(mode in paneTargets)||!event.isPrimary)return;
    const target=paneTargets[mode];
    const height=workspace.getBoundingClientRect().height;
    dividerDrag={id:event.pointerId,view:mode,startY:event.clientY,
      startHeight:target.getBoundingClientRect().height,height,travel:0};
    divider.setPointerCapture(event.pointerId);
    body.classList.add('resizing-panes');
    event.preventDefault();
  });
  divider.addEventListener('pointermove',event=>{
    if(!dividerDrag||dividerDrag.id!==event.pointerId)return;
    dividerDrag.travel=Math.max(dividerDrag.travel,Math.abs(event.clientY-dividerDrag.startY));
    const next=(dividerDrag.startHeight+dividerDrag.startY-event.clientY)/dividerDrag.height;
    setPaneRatio(dividerDrag.view,next);
    event.preventDefault();
  });
  function finishDivider(event){
    if(!dividerDrag||dividerDrag.id!==event.pointerId)return;
    const view=dividerDrag.view,moved=dividerDrag.travel>8;
    dividerDrag=null;
    body.classList.remove('resizing-panes');
    if(!moved&&Date.now()-lastDividerTap<350){
      setPaneRatio(view,paneDefaults[view],true);
      lastDividerTap=0;
    }else{
      lastDividerTap=moved?0:Date.now();
      setPaneRatio(view,paneRatios[view],true);
    }
    if(divider.hasPointerCapture(event.pointerId))
      divider.releasePointerCapture(event.pointerId);
  }
  divider.addEventListener('pointerup',finishDivider);
  divider.addEventListener('pointercancel',finishDivider);
  divider.addEventListener('dblclick',event=>{
    if(!(mode in paneTargets))return;
    event.preventDefault();
    setPaneRatio(mode,paneDefaults[mode],true);
  });
  divider.addEventListener('keydown',event=>{
    if(!(mode in paneTargets))return;
    const {lower,upper}=paneBounds(mode);
    let next=paneRatios[mode];
    if(event.key==='ArrowUp')next+=.04;
    else if(event.key==='ArrowDown')next-=.04;
    else if(event.key==='Home')next=lower;
    else if(event.key==='End')next=upper;
    else if(event.key==='0')next=paneDefaults[mode];
    else return;
    event.preventDefault();
    setPaneRatio(mode,next,true);
  });
  window.addEventListener('resize',()=>{
    if(mode in paneTargets)setPaneRatio(mode,paneRatios[mode]);
  },{passive:true});
  for(const view of Object.keys(paneTargets))
    body.style.setProperty(paneProperties[view],(paneRatios[view]*100).toFixed(3)+'%');

  function compactChrome() {
    body.classList.toggle('compact', editor.scrollTop > 20 || mode !== 'code');
  }
  function setMode(next) {
    if (!views.includes(next)) return;
    // Leaving CODE also leaves its keyboard-safe error repair dock.
    if(next!=='code'&&window.SCRepair?.active)window.SCRepair.close();
    mode = next;
    body.classList.toggle('view-console', next === 'console');
    body.classList.toggle('view-perform', next === 'perform');
    body.classList.toggle('view-learn', next === 'learn');
    body.classList.toggle('view-design', next === 'design');
    refreshDivider();
    consolePanel.open = next === 'console';
    for (const [view, button] of Object.entries(viewButtons)) {
      button.setAttribute('aria-pressed', String(view === next));
    }
    compactChrome();
    if(next!=='learn'){
      window.SCLearning?.hide({switchView:false});
      window.SCLanguageTools?.hide({switchView:false});
    }
    if(next==='perform')window.SCTimeline?.show();
    requestAnimationFrame(()=>{
      followEditor();
      if(next==='console')window.SCConsoleOnShow?.();
    });
  }
  window.setSuperCollisionView=setMode;
  for (const [view, button] of Object.entries(viewButtons)) {
    if(view!=='learn')button.addEventListener('click', () => setMode(view));
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
  // Console output must not change the selected workbench during playback.
  window.addEventListener('resize', () => requestAnimationFrame(followEditor), {passive:true});
  renderGutter();
  setMode('code');
})();