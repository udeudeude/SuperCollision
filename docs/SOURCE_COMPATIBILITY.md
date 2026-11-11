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

## Language catalog and editor completion

- The published class/method index is generated from the official SuperCollider `HelpSource/Classes/*.schelp` files. Entries link to their official documentation. This describes upstream classes, not a guarantee that every class or plugin is included in the browser synthesis runtime.
- Class names, summaries, categories, methods, and documented argument names come from those help files. Verified defaults and required flags are maintained separately for known signatures; no default or requirement is inferred from incomplete help prose.
- BROWSE supports searching by name, method, category and description; sorting by usefulness, alphabet, frequency in the active composition, recency, and category.
- Completion is a **productivity tool**, independently switchable under FILE > EDITOR even if Guided Learning is OFF. Suggestions appear in a row **below** the editor and never obscure its code. The source changes only when the user explicitly accepts a suggestion, inserts a method, or inserts a named argument.
- Context-sensitive completion uses known class methods (for example `SinOsc.ar`) and known server instance methods (for example `s.boot`). It does not invent a method receiver for unknown variables, such as `x.play`. Method guides distinguish verified defaults/required arguments from undocumented requirements.
- The language interpreter still receives the exact editor text chosen by RUN/SELECTED, never an instrumented or auto-completed substitute. Code inserted by the user remains ordinary exportable SuperCollider code.

## Sound Designer experiment

- SOUND is a separate lower-panel laboratory with OpenRouter and Puter provider adapters. There is **no developer-owned inference key**. The OpenRouter path uses the explicit `openrouter/free` router; Puter uses each user's own signed-in account allowance.
- OpenRouter uses a one-time user authorization code exchanged with a SHA-256 Proof Key for Code Exchange verifier, with a randomized `state` check. Personal keys live **only in browser session storage**, never the composition store or the repository. Users can disconnect from the session and revoke the key at OpenRouter. Manual personal-key entry is offered as a fallback for mobile standalone authentication.
- Puter is loaded only on demand; signing in must happen from a direct user click to satisfy popup policies. Its allowance report displays the actual response, rather than invented balances.
- No network inference, source upload, or audio evaluation runs automatically. Users must select GENERATE or REVISE. Optional transmission of the active composition is off by default. Only the user-supplied description, requested revisions, generated code, and explicitly opted-in reference composition are sent.
- The generated scratch buffer stays separate from source. COPY, AUDITION, and SAVE AS NEW COMPOSITION are explicit. SAVE creates a unique new composition and flushes the original unchanged. AUDITION runs raw generated language source on the **shared** SuperCollider server; STOP ALL AUDIO is intentionally global. These are trust-boundary user actions and should not be triggered automatically.
- User-created SuperCollider code is still passed without modification to RUN and SELECTED; no wrappers or instrumentation are injected. Generated one-shot sketches are requested with a 6-12 second self-freeing envelope, but model output cannot be trusted to comply without manual inspection.
- OpenRouter free limits and Puter personal monthly credits are controlled by each provider; no availability guarantee is implied by the local automated tests. Actual account sign-in and inference must be tested in a real user session.

## Sound Designer preflight and request controls (November 2026 refinement)

- Puter generation explicitly passes `fallback: false` to suppress automatic provider fallback when the first provider fails, in accordance with Puter's documented `ai.chat` options.
- OpenRouter and Puter generation receive a browser `AbortSignal`, with a user-visible CANCEL button and a 90-second timeout. Aborting a request does **not** guarantee that upstream model usage will be refunded or uncounted.
- When available, OpenRouter requests include `usage: { include: true }` and display returned token counts. Puter monthly allowances are shown in dollars using its documented microcent conversion (100,000,000 microcents per US dollar), with a note that its account allowance is shared across Puter apps.
- Responses marked as truncated (`finish_reason: length`) are not offered as complete synthesizers.
- Generated source is screened locally before audition. Unbalanced delimiters and certain obvious file, process, network, or server-reconfiguration commands disable AUDITION while leaving COPY and SAVE accessible. The screen is only a heuristic: it cannot make arbitrary SuperCollider source safe, confirm its amplitude, or guarantee a clean shutdown. Sound Designer never runs generated code automatically.

## Sound Designer: recoverable drafts, model comparison, and manual repair

- Successful generation results are checkpointed to `sessionStorage` only, with up to **five** versions per browser tab/session. On reload, the user's latest generated code, explanation, and original sound description reappear without calling an artificial-intelligence provider. The user can browse earlier versions and restore one for COPY, AUDITION, SAVE, or further refinement. Browsing and restoring consume no user quota.
- SOUND offers an explicit FIND AVAILABLE FREE MODELS action. It queries OpenRouter's public model catalog on demand; only models with a `:free` suffix, zero prompt and completion prices, text input and output, and sufficient context are offered. The default remains `openrouter/free`. Every generation request is independently validated to reject a nonfree model. Catalog lookup itself does not submit a model inference request.
- The USE LAST CONSOLE ERROR control reads a bounded excerpt of the most recent visible SuperCollider error and inserts it into the editable revision field. **It does not transmit the error** until the user explicitly presses REVISE. This is useful for manually guided debugging without an automatic, quota-consuming repair loop.
- Drafts are not uploaded to SuperCollision and are not permanent. Browser session storage can be purged by the browser; users must choose SAVE AS NEW COMPOSITION to keep an instrument long term. CLEAR DRAFTS deletes local unsaved session versions only after confirmation and never deletes saved compositions.

## Timing-priority OSC bridge (November 2026)

- The browser's SuperCollider language-to-audio and audio-to-language OSC callbacks **forward their original messages first**. Optional LIVE Code and PERFORMANCE observers are called after forwarding, with separately guarded error boundaries. Independent performance-mix control replies are sent afterward, as distinct messages.
- Original OSC data and scheduling timestamps are not rewritten, delayed for visualization, or dropped. On the language-to-audio boundary, the original byte-copy behavior is preserved to prevent mutation of recycled backing buffers. An observer exception must not block the original message or the other observer.
- The console batches ordinary output into at most one DOM update per animation frame instead of replacing and scrolling its complete text for every log chunk. Error status and the LEARN debugging suggestion are still processed immediately.
- `SCOscBridge.diagnostics()` provides original-message counts and observer exception counts to aid debugging, without printing or monitoring on every note.
- The unit test `qa/osc-priority-test.mjs` asserts forwarding precedence, order, buffer copying, control reply sequencing, and observer isolation across a 2,000-message burst. The WebAssembly browser test checks that the actual running audio-language bridge is active. This **reduces overhead and visualizer-induced forwarding latency**, but cannot guarantee sample-accurate scheduling or eliminate device-level audio underruns. Compositions themselves should use timestamped bundles or SuperCollider's `Pbind`/pattern scheduling when tight timing matters.

## November 2026: Free-model truncation refinement

- Real iPhone Safari testing confirmed OpenRouter user authorization works. The initial `openrouter/free` bagpipe generation failed with `finish_reason: length`: a model exhausted its 3,500 completion-token allowance before producing a complete instrument.
- SOUND defaults to the publicly listed `cohere/north-mini-code:free` coding model, with the random free-model router kept as an explicit alternative. Because the preferred model is a `:free` variant, it remains restricted to no-cost inference. It may become unavailable, in which case the user can select another verified `:free` variant or the free router. There is no automatic second request.
- OpenRouter now sends `max_completion_tokens: 8192` instead of deprecated `max_tokens: 3500`, and a longer 240-second cancellation timeout allows slow free providers time to produce code. This is a cap, not a requirement to consume all tokens.
- A response with `finish_reason: length` is accepted only if a complete fenced SuperCollider code block has already closed and its delimiters are balanced. Truncated optional explanation is permitted; incomplete instrument code is not saved or auditioned.
- The generative prompt prioritizes a compact 30–90-line, self-contained synth and closes the code fence before commentary. If the selected free model still runs out of tokens before finishing, the app reports its identity and an actionable suggestion to choose another free coding model; it does not blame the user's description or silently spend another free request.
- GENERATE does not require booting SuperCollider; POWER is needed for AUDITION only. Avoid simultaneous cold boot and model generation on memory-constrained phones.
