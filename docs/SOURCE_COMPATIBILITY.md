# SuperCollision source compatibility contract

SuperCollision must run the same SuperCollider language code that a user saves or exports as a .scd file.

## Invariants

1. The exact source selected by RUN or SELECTED is passed to the official SuperCollider language interpreter. This includes ordinary SynthDef, Synth, Routine, Pattern, score and event code. No tracing statements, wrapper functions, automatic SynthDefs, or hidden sample generators are injected.
2. The source shown in the editor and exported to .scd remains user code. Interface state, timeline observations, control adjustments and recordings are held separately.
3. With all performance controls at their defaults, SuperCollision sends no extra amplitude or parameter messages to the synthesis server. Observational monitoring may inspect original OSC packets but must not alter them.
4. If the user moves a mixer control, the application may send an independent OSC message to an existing synthesizer node to change only a parameter that the original definition explicitly exposes. This is an intentional user-directed variation, not a silent alteration to code playback. RESET MIX restores default amplitude control state.
5. Synth lifetimes and event timelines derive from language-to-server creation requests and actual server-to-language lifecycle acknowledgments. A creation request alone is not treated as a confirmed sounding node.
6. Where source mapping is ambiguous, show the live event without claiming an exact source line. Do not invent a Routine program counter or timing prediction. The old temporary Routine checkpoint injection is retired.
7. POWER starts the default audio server separately from the submitted composition. RUN is enabled only after the server is confirmed ready. No source is injected or wrapped. The starter oscillator should sound on its first RUN without manually evaluating `s.boot`.
8. The WebAssembly implementation uses official SuperCollider components. Environmental differences can affect audio hardware, external plugins, disk paths, input/output channels, and timing. The IDE cannot guarantee that third-party plugins absent from the browser will run. For supported ordinary code, playback semantics must remain those of SuperCollider.

## Live performance controls

- An instrument's mute, solo and amplitude multiplier are enabled only if a numeric `amp` input is present in the code's named SynthDef. Otherwise controls are disabled rather than pretending to control an inaccessible signal.
- Solo is withheld when an active synth cannot be muted safely by its `amp` control. No node-pausing or graph reordering is substituted for true mixing.
- Parameters other than `amp` may be adjusted only when found explicitly in the source SynthDef argument list.
- Source code may itself change an instrument's `amp` using `/n_set`. The mixer observes that instruction and preserves the original value for subsequent gain adjustments.
- Overlapping notes appear as separate rectangles in the timeline, but stable instrument colors identify their common SynthDef.
- Each timeline rectangle can navigate to an unambiguous source location when such a mapping is available.

## Regression tests

- `node qa/performance-test.mjs` verifies exact source, unchanged outgoing OSC, confirmed events, note duration, solo/mute/gain/parameter commands, refusal of incompatible controls, and composition separation.
- `node qa/layout-check.mjs` verifies the view and navigation on eight designs and three mobile widths.
- `node qa/runtime-activity.mjs` boots actual WebAssembly SuperCollider, produces a real synth, and requires the timeline to show the resulting server-confirmed note.

## Guided learning and audition

- Guided mode suggests up to three optional lessons based on unquoted, uncommented source. Opening LEARN is always user-directed; nothing interrupts playback.
- Reference mode explains selected code without proactive suggestions. OFF removes the teaching view and releases its preview audio context.
- The first predict-and-listen exercise supports only literal, zero-phase `SinOsc.ar` expressions with numeric frequency and amplitude. Nonliteral expressions receive an explanation but no fabricated audio comparison.
- Experiment audio is a brief, volume-limited, independent Web Audio sine oscillator. It is **not** a rerun or modification of the SuperCollider synthesis graph. No experiment is submitted to the SuperCollider interpreter, and no running synth is stopped or changed.
- The original and modified expressions are displayed together. The learner predicts pitch direction before auditioning. `RUN`, `SELECTED`, saved compositions, and exported source retain their original semantics.
