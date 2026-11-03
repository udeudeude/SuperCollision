# Live Code: source-to-sound activity

Version 1.5 adds an **observational** bridge between SuperCollider code and the sounds running in `scsynth`. It does not inject instructions into compositions, rewrite SynthDefs, or change the audio engine.

## What the cues mean

- **Amber (●):** the actual synthesis server acknowledged a named synth with `/n_go`. Its corresponding SynthDef definition and signal-producing lines are marked. The mark disappears when the server reports `/n_end` (or when the user stops the performance).
- **Blue (✦):** the language sent an OSC `/s_new` request to create a synth. The corresponding source trigger briefly flashes. A blue flash **does not prove** that the server successfully created the synth.
- The compact console bar shows a confirmed synth count and recent trigger count. These are **node/activity** indicators, not sound-pressure or loudness measurements.
- Only uniquely identifiable trigger callsites are marked. If multiple candidate `Synth` calls create the same instrument, the app does not pretend to know which statement caused a particular event.
- A sound-generating definition (for example `SynthDef(\mourningDrone, {...})`) can have many concurrent active instances. Its source is highlighted while at least one server-confirmed instance is active.

## How it works

1. Code submitted via RUN or PART is indexed for named `SynthDef`, `Synth`, and `Pbind` references, with limited anonymous `{}.play` support.
2. The existing SuperCollider WASM bridge is observed without modifying the OSC messages:
   - Language to server: `/s_new` (including asynchronous completion OSC embedded in `/d_recv` or `/d_load`).
   - Server to language: `/n_go`, `/n_end`, `/n_off`, and `/n_on`.
3. An OSC decoder processes single messages, bundles, recognized argument types and guarded completion blobs. The observer does not interfere with forwarding to the audio server.
4. A source map retains composition identity and a text snapshot. If the user switches to another composition or edits the source so the recorded ranges no longer match, the app suppresses source highlights rather than showing incorrect line numbers.
5. Drawing is limited to the visible editor viewport, using the editor's measured line height and current scroll position. The markers follow pinch zoom and line-number movement.
6. Activity tracking is on by default, with an opt-out in FILE. None of the tracking data is sent to an external service.

## Boundaries

- The system knows when synth nodes are *reported running*, not whether their signal is audible. A synth can be silent, muted, or feeding a bus rather than the speakers. The output may contain reverberation even after the initiating synth has ended.
- Source mapping is best-effort. Dynamically generated SynthDefs, indirect instrument names, unnamed server nodes, unknown event dispatch paths, and ambiguous duplicate callsites may not produce an accurate source highlight.
- A Routine or Pattern can trigger many synths. Node creation is visible, but a Routine's own exact program-counter location is **not** tracked yet.
- Notification messages require server notification registration. SuperCollider typically enables this through `Server.notify` and its boot process.
- No automatic scrolling is forced during a performance. Users can scroll and edit normally.
- `CmdPeriod.run` initiates a stop. The local display also clears its tracked nodes in response to this explicit stop action.
- No WebAudio/OSAudio engine modifications, sample-level tracing or remote processing are performed.

## Testing

`node qa/live-activity-test.mjs`: deterministic tests for OSC messages/bundles, nested SynthDef completion messages, source indexing, named/anonymous synth mapping, node transitions, and suppression of incorrect highlights.

`node qa/layout-check.mjs`: Chromium tests covering all eight design treatments, responsive editor geometry, zoom/gutter alignment, and browser integration tests for blue request -> amber server confirmation -> no mark after `/n_end`.

## Manual acceptance test on an iPhone

1. Open SuperCollision and confirm **INSTRUMENT / 1.5**.
2. From FILE select **Create Living Code demonstration**, then POWER (if needed) and RUN.
3. The long drone definition should become amber once its synth starts. Bell notes should flash blue at the unique `Synth(\scBell ...)` callsite and remain amber only while their short synths exist.
4. Tap STOP. Active markings should clear. Test another composition and verify that switching projects doesn't highlight unrelated source.
5. If sound plays without activity, check whether `/notify` messages are reaching the bridge or whether the sound was started using an instrument name that can't be unambiguously mapped.

Official SuperCollider reference: https://docs.supercollider.online/Reference/Server-Command-Reference.html
