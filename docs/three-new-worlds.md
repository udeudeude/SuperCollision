# The three new visual worlds

Design directions for theme values \`score\`, \`patch\`, and \`terminal\`. Values and URL arguments deliberately remain stable for saved preferences and bookmarks. This is an original visual system, not a recreation of third-party artwork.

## Open Form (\`score\`)

**Musical idea:** a graphic score that invites interpretation rather than resembling staff-paper stationery. Earle Brown's *December 1952* is an exemplary source of expressive horizontal and vertical blocks; Cornelius Cardew's *Treatise* demonstrates how circles and geometric lines can feel intrinsically musical without using conventional notes.

**Working palette:** deep blue-black \`#233b46\`, pale print stock \`#f5f0e5\`, vermilion \`#d45138\`, soft ochre for selected tabs. The original emblem shows non-standard durations and a hollow note-like circular event, **not** a copied score fragment. The editor is plain, with all ornament outside the text area.

Sources: [Getty Research Institute, December 1952](https://www.getty.edu/publications/scores/object-index/301/); [Cornelius Cardew's Treatise, Pew Center](https://www.pewcenterarts.org/post/unsettling-score-experiments-notation-part-ii).

## Signal Atlas (\`patch\`)

**Musical idea:** a routing map, not decorative faux patch cords. The crossed grid and selected junctions refer to the logic of pin-matrix routing found in early synthesizers, including the EMS VCS3. Unlike a literal hardware diagram, the emblem is an original stylization.

**Working palette:** petrol \`#102a32\`, dark planning-board \`#0d242c\`, cream \`#edf0db\`, signal citron \`#e2e980\`, and salmon \`#f59b69\`. A dotted editor gutter and pin-matrix insignia are the only exposed diagram language; signal graphics never obscure code.

Source: [Pin matrix, routing history](https://en.wikipedia.org/wiki/Pin_matrix).

## Control Room (\`terminal\`)

**Musical idea:** a late-1970s / early-1980s control display rather than generic black-and-white “brutalism.” Monochrome display hierarchy, amber status indications, fixed-grid typography, and a telemetry cursor. The amber/green combination is an intentional historical synthesis, not a claim that every original VT100 was amber (many were green phosphor).

**Working palette:** charcoal \`#0e1713\`, display \`#101b16\`, soft phosphor \`#e0eccd\`, amber \`#ffbd61\`. The original emblem resembles a compressed control readout rather than a command prompt glyph.

Historical reference: [VT100](https://en.wikipedia.org/wiki/VT100).

## Non-negotiable constraints

1. Keep the six transport actions in one accessible row on small iPhones. Never hide code beneath ornament.
2. Syntax comes from the **highlight-layer**, because editable textarea glyphs are deliberately transparent.
3. Preserve values \`score\`, \`patch\`, \`terminal\` for saved preferences, query parameters, and all eight-layout tests.
4. All decorative marks must be inline original vector geometry, no remote fonts, external images, or network dependencies.
5. Color is functional: distinguish editor, project strip, transport, active navigation, Mix, Live, and keyboard focus. Every text-bearing surface needs useful contrast.
6. Cosmetic changes must never alter SuperCollider execution, sound production, editor scrolling, or the offline installation path.
