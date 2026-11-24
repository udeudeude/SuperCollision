# Sounds and LibriVox design consolidation (v0.5.0)

## Goal
Make the existing Sounds and LibriVox functionality feel like natural extensions
of the main Code workspace, not additional form-driven applications. Preserve
the original native SuperCollider engine, sound database, download permissions,
license metadata, and the main Code implementation.

## Interaction contract
1. **Workspace = destination.** Instruments & Code, Recordings & Samples, and
   Library are the three locations. Generate, Find Code, Import Code, Record,
   Find Audio, and Import Audio are secondary methods, not selected tabs.
2. **Location is not action.** Selected views use an outlined/underscored state.
   Filled accent is reserved for primary actions such as Make Instrument,
   Generate, Search, Extract, and Use in Samples.
3. **Stay in context.** Secondary tools appear inside a reversible Sounds panel.
   LibriVox can be embedded in Find Audio; it no longer needs to navigate away.
   Standalone LibriVox links remain valid.
4. **Each step finishes somewhere useful.** Extracted LibriVox audio can move
   directly into the sample workspace, without uploading it twice or playing it
   automatically.
5. **Design settings follow Code.** Use the existing localStorage key
   `supercollision-theme` and the same eight named designs. Graphical
   oscillator, filter, envelope, vibrato, and pitch controls use matching ink.
6. **Accessibility and reversibility.** Tab roles and arrow-key navigation,
   browser Back/Forward support, dialog semantics, background inertness,
   Escape to close and focus restoration.
7. **Mobile is the governing environment.** Fixed-frame application,
   internally scrollable tools, no global pinch or double-tap zoom, no
   keyboard-induced page zoom. The editor keeps its independent zoom.
8. **Permission is deliberate.** Do not auto-play code or audio. Do not
   automatically download LibriVox chapters or online audio. Retain Wi-Fi-first
   and explicit-download permissions.

## Architectural changes
- `sounds-workspace.css`: moves 19 historical embedded style blocks out of
  HTML into one ordered external stylesheet, without reordering their cascade.
  This is a separation of concerns, not yet a claim that all old selectors and
  duplicate `!important` declarations have been eliminated.
- `sound-surfaces-design.css`: central tokens and common interaction grammar
  for Sounds and LibriVox, mirroring eight Code designs.
- `sound-surfaces-theme.mjs`: shared accessible design picker and persistence.
- `sounds-bench-visuals.mjs`: drawings respond to selected theme.
- `sounds-bench-remote.mjs`: LibriVox within the same acquisition sheet;
  only loads on user request.
- `librivox-explorer.mjs`: optional embedded view, origin-checked parent
  messages, pause on exit, local sample handoff.
- `sounds-bench-preview.html` and `sounds-bench-acquire.mjs`: semantic tabs,
  keyboard/history, reversible in-workspace acquisition and focus management.

## Must-pass release checks
- All modified JavaScript modules parse and every referenced module exists.
- Preview/embedded file references are consistently cache-keyed to v0.5.0.
- Main Code files are unchanged. No IndexedDB schema or sound engine changes.
- All eight visual design options match the main Code page's named choices.
- LibriVox iframe is lazy and same-origin; messages check origin and window.
- Leaving LibriVox pauses audio. Saving audio does not automatically play it.
- Original network/download consent remains unchanged.
- Direct Sounds and standalone LibriVox sample links still resolve correctly.
- Fixed-screen and in-panel scrolling rules are retained.

## Remaining human-device verification
- On an actual iPhone, verify each design has readable contrast and each
  interactive panel remains operable with the keyboard displayed.
- Test microphone capture, SuperCollider startup, generated code, library
  backup/restore, LibriVox streaming/phrase search and full-chapter extraction.
- Specifically check embedded LibriVox Safari audio permissions and touch
  scrolling. Simulated checks cannot replace these device tests.

## Out of scope
- Rewriting the main Code page; reimplementing sound engine and provider APIs.
- Automatic audio downloads over cellular, cloud synchronizing stored audio,
  and theme-specific imitation of third-party brand logos or paid fonts.
