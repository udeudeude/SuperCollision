# SuperCollision mobile interface contract

Version 1.3 replaces the experimental reordering of controls with a strict interaction architecture shared by all eight visual studies.

## Required spatial order (phone and desktop)

1. SuperCollision identity and the compact DESIGN selector.
2. Composition selector and FILE menu.
3. Working code editor with correctly aligned line numbers.
4. Exactly one transport row: RUN / SELECTED / STOP / POWER / REC / SAVE.
5. Always-visible CODE / CONSOLE / AUDIO view controls, running-synth counter, and abbreviated engine state.
6. Console output is visible only in CONSOLE mode; it cannot be independently collapsed.
7. The separate browser audio test is visible only in AUDIO mode; it has no disclosure arrow.

The experiment may change graphic treatment, layout of elements **within** these sections, icons, geometry, materials, and typography, but must not reorder the sections or reduce editor usability.

## Behavior

- The header and composition/file row remain visible.
- After the code editor scrolls, header and file row reduce their heights.
- Editor consumes all remaining viewport space between file row and fixed transport row.
- The CODE / CONSOLE / AUDIO selector always stays visible beneath transport.
- Select CODE, CONSOLE or AUDIO directly. Only a deliberate upward swipe on the view bar or an overscroll at the editor bottom advances the view; transport and gutter gestures never change it. Console errors automatically select CONSOLE.
- Native scrolling *inside* the code editor must remain intact. When the editor has already reached its bottom, a further upward swipe may reveal the console.
- Scrolling within a long composition must not move line numbers out of alignment or scroll the editor horizontally while the gutter moves.
- The editor uses non-wrapped lines, a shared font/line-height for textarea and highlight, and pixel-aligned scrolling.
- In an editing session the keyboard can reduce available viewport space but must not hide transport or console access.
- Project records use their existing browser localStorage keys, without schema migration.
- Opening different designs does not reload or reset the synthesis engine.

## Visual studies

- Bauhaus: rigorous geometric color-blocks, orthogonal rules, triangular/circular vector identity.
- Black Mountain College: woven vector identity, manuscript page and tactile print-shop proportions.
- Moog: dial/rack vector identity, recessed editor and instrument fascia.
- Make Noise: erratic patch trace vector identity, graphic interruption and monochrome patch-panel treatment.
- Living Score: five-line stave vector, score-paper editing surface.
- Oscilloscope: green waveform vector, graticule and luminous display treatment.
- Patch Diagram: network-node vector, exposed module borders and rounded controls.
- Brutalist Terminal: cursor/command vector, black/white monospaced editorial machine.

Individual studies are selected from the common DESIGN menu and can be linked directly using `?design=bauhaus` (or any other theme id).

## Device verification matrix

Test on iPhone Safari (normal and standalone if installed) and one desktop browser.

1. Verify all eight themes use the same vertical section order.
2. Check all six control buttons remain one row at viewport widths 320px, 375px, 390px, and 430px.
3. Scroll 200+ lines and compare gutter line numbers against the corresponding code lines before and after horizontal scrolling. Confirm no soft wrapping.
4. Tap CONSOLE: editor shrinks and console appears. Tap AUDIO: console closes and the independent browser audio-test panel appears. Tap CODE: both lower panels close.
5. Scroll within code itself: code should scroll independently with its gutter. Header compacts on scroll.
6. Type and edit while the iOS keyboard is open. Controls must remain visible.
7. Switch project and theme, reload, verify composition and theme persist.
8. Boot authentic sclang/scsynth and run/stop a composition. Verify that neither style switching nor inspector changes interrupt audio.
9. Check a long composition, console errors, waveform recording and import/export.

## Known limitations

- Browser background synthesis is not guaranteed on iOS.
- The existing source-highlighting overlay is not a full IDE parser.
- Source-to-active-synth visualization requires server-node and routine-level instrumentation; the misleading full-document activity indication was removed.
- Layout was committed to source and deployment branch. Physical-device QA is still required before declaring visual acceptance.

## Editor-only pinch zoom (1.4)

- A two-finger pinch **within the code editor** reduces or enlarges text continuously, without resizing the surrounding application or changing the system zoom.
- Normal source text (14 CSS pixels, 100%) is the **maximum**, not the minimum. Zooming out reaches 6 CSS pixels (approximately 43% of normal).
- The input text, highlighted overlay, caret positioning, line height, line-number font and scroll synchronization use the same scale variables. The editor scroll offset follows the gesture midpoint as closely as practical.
- One-finger vertical/horizontal editor scrolling and code selection remain usable.
- An unobtrusive CODE percentage indicator appears during a pinch, and the selection persists in localStorage under `supercollision-editor-font-px-v1` (never in the composition code or browser cache).
- FILE contains Code text smaller, Code text larger and Reset code text size. With the editor focused, Cmd/Ctrl+Minus, Plus, and 0 provide equivalents.
- Verify on iPhone Safari with a long composition: pinch both directions repeatedly, confirm normal size cannot be exceeded, then verify line-number alignment while scrolling, syntax-overlay alignment, and size persistence after reload. Check the browser does not zoom the entire page.

## Version 1.8 interface refinements

- RUN uses a drawn monochrome vector triangle rather than an emoji glyph. SAVE recording uses a distinct downward-arrow/tray vector, not the STOP square. STOP and REC retain the existing geometric symbols.
- The selected-code evaluation button reads SELECTED. With no selected code, it evaluates the current line.
- The single ambiguous CONSOLE → MORE → EDITOR cycle and independently collapsible Audio diagnostic <details> control are eliminated. CODE, CONSOLE and AUDIO are explicit exclusive lower-panel modes. The console header bar remains visible in all three modes.
- AUDIO exposes an independent browser Web Audio test oscillator. It does not inspect or measure individual SuperCollider synth nodes; those are tracked separately by Living Code.
- The FILE menu no longer contains generic on-screen explanation prose for SELECTED. Controls should make sense directly; extended explanations belong in documentation and conversation.
- The full SuperCollision masthead remains legible on phone widths, with condensed version metadata. All views preserve one-row transport controls, editor pinch zoom, and live OSC-derived highlighting.
