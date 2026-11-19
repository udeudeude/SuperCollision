# Three visual worlds for SuperCollision

Art-direction reference, 19 November 2026. These are original interface designs, not facsimiles of protected artwork or of historical equipment. They share the same information hierarchy and working code editor.

## Thesis

**OPEN FORM is sound as a score. SIGNAL ATLAS is sound as a route. CONTROL ROOM is sound as a measurement.**

The distinctions must survive even when screenshots are converted to grayscale and when only the header and transport are visible. Changing foreground colors alone is not an art direction. Use layout rhythm, stroke character, typography, selection behavior, annotation and the shape of the surrounding instrument.

| Dimension | Open Form (`score`) | Signal Atlas (`patch`) | Control Room (`terminal`) |
|---|---|---|---|
| Concept | Graphic notation and deliberate empty space | Routing diagrams and pin-matrix crosspoints | Operational telemetry and calibrated readouts |
| Structural surface | Ink navy `#233b46` | Petrol `#143640` | Graphite green `#111c17` |
| Work surface | Warm paper `#f5f0e5` | Deep blue-black `#0d242c` | Near-black `#101b16` |
| Accent | Vermilion `#d45138`; darker `#bd422c` on white-labeled action buttons | Peach `#f59b69` for action, citron `#e2e980` for selections | Amber `#ffbd61` for decisions; gray-green for secondary information |
| Typography | Expressive italic serif titles + sober technical data | Compact technical sans + diagram lettering | Tabular-number monospace readouts |
| Key shapes | Double rules, orthogonal fragments, deliberately unbalanced masses | Nodes, dotted registration marks, dashed connection boundaries | Numbered ticks, thin ruled compartments, rectangular controls |
| Console | Printed navigator with coral selected marker | Routing-map selector with luminous junction | Monochrome command panel with amber active state |
| Mix timeline | Fine musical-duration ruler | Signal measurement grid | Calibrated instrument scale |
| Do *not* | Recreate a traditional five-line staff beneath code | Put fake patch cords over functional controls | Simulate bloom, scanlines, or fictitious engine status |

## Research anchors

1. **Open Form.** Earle Brown's *December 1952*, 1952, uses oriented rectangular graphic events, independent of conventional notation. The Getty Research Institute describes its interpretive freedom: https://www.getty.edu/publications/scores/object-index/301/ . Cornelius Cardew's *Treatise* (1963–1967) extends the possible language of line, form and silence: https://www.beyondnotation.com/ . Our emblem is a new miniature geometry, not an excerpt of either score.
2. **Signal Atlas.** Pin matrices in the EMS VCS3 routed inputs and outputs at their intersections; the matrix is a model for the **language**, not an invitation to invent functioning routing controls: https://www.synthforbreakfast.nl/all-about-ems/ . The National Music Centre documents the independent patch-and-control philosophy of the Buchla 100: https://nmc.emuseum.com/objects/199/buchla-100 . Our field uses crosspoints, dashed registration and traces; no copied panel marks.
3. **Control Room.** Original Apollo mission-control consoles were physical information instruments with purpose-specific displays. NASA's restoration records their period materials and display technology: https://www.nasa.gov/johnson/history/apollo-mcc-restoration/ . This is not a purported recreation of an Apollo workstation or a period-accurate terminal; it combines archival instrument restraint with modern readability.

## Interface contract

1. **Do not sacrifice the workpiece to decoration.** The code editor background must remain solid. Never put staff lines, grid wallpaper, phosphor scanlines, logos, or stickers under source text.
2. **Do not change function to match aesthetic fantasy.** STOP stops; SAVE saves; highlighted controls must reflect real state. A static decorative lamp must never imply the synthesizer is running.
3. **Readable first.** Text on principal buttons, file menu, header and selected tabs must meet at least 4.5:1 contrast. Visible syntax text on its editor background is held to 7:1 in `qa/layout-check.mjs`. Focus indicators remain visible.
4. **Compact geometry is common law.** At 320, 390 and 430 CSS pixels, six transport controls remain on one row, the code retains usable height, and active settings are visible without horizontal scrolling. No new controls are introduced solely to carry decoration.
5. **Offline-first and no font downloads.** Use system serif, condensed fallback sans and monospace families only. The emblem vector art is inline with the app. No remote assets.
6. **Extend consistently.** When editing a theme, check the identity, composition strip, editor, toolbar, console, Live inset, Mix, Learn, Generate, file menu and correction interface. Use semantic state selectors such as `[aria-pressed=true]`.
7. **Test rather than announce.** Run visual-layout checks and examine deployment status before calling a visual release ready. Real audio activity is a separate functional test and must be reported accurately.

## CSS architecture

The latest intentional declarations are scoped under `body[data-theme=score]`, `body[data-theme=patch]`, and `body[data-theme=terminal]` at the end of `instrument-layout.css` and `performance.css`. They override earlier prototype surfaces without changing the shared editor/transport geometry. Future refactoring should consolidate repeated legacy definitions rather than add more global `body button` rules. The three small header `<g>` emblems are in `index.html`.

Theme choice persists via the existing app behavior and uses the stable values `score`, `patch`, and `terminal`. Names may evolve without breaking saved theme preferences.
