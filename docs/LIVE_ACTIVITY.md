# Live Code: source-to-sound activity

Version 1.9 combines **observational** synth-lifecycle tracking with conservative execution checkpoints for identifiable `Routine` and `Task` statements. The saved compositions, synth definitions and audio engine remain unchanged. The evaluated language code may contain temporary checkpoint print statements while Live Code is enabled.

## What the cues mean

- **Amber (●):** the actual synthesis server acknowledged a named synth with `/n_go`. Its corresponding SynthDef definition and signal-producing lines are marked. The mark disappears when the server reports `/n_end` (or when the user stops the performance).
- **Blue (✦):** the language sent an OSC `/s_new` request to create a synth. The corresponding source trigger briefly flashes. A blue flash **does not prove** that the server successfully created the synth.
- A compact **LIVE inset at the editor's bottom-right** shows synth counts and triggers, individual named-instrument counts (active/total), elapsed or most recent note lifetime, and Routine checkpoint lines. It can collapse to a small status strip. These are activity indicators, not sound-pressure or loudness measurements.
- Only uniquely identifiable trigger callsites are marked. If multiple candidate `Synth` calls create the same instrument, the app does not pretend to know which statement caused a particular event.
- A sound-generating definition (for example `SynthDef(\mourningDrone, {...})`) can have many concurrent active instances. Its source is highlighted while at least one server-confirmed instance is active.

## How it works

1. Code submitted via RUN or SELECTED is indexed for named `SynthDef`, `Synth`, and `Pbind` references, with limited anonymous `{}.play` support.
2. The existing SuperCollider WASM bridge is observed without modifying the OSC messages:
   - Language to server: `/s_new` **and SuperCollider's compact numeric synth-start command IDs 9 and 59** (including starts inside timed bundles or asynchronous completion OSC embedded in `/d_recv` or `/d_load`).
   - Server to language: `/n_go`, `/n_end`, `/n_off`, and `/n_on`.
3. An OSC decoder processes single messages, bundles, recognized argument types and guarded completion blobs. The observer does not interfere with forwarding to the audio server.
4. A source map retains composition identity and a text snapshot. If the user switches to another composition or edits the source so the recorded ranges no longer match, the app suppresses source highlights rather than showing incorrect line numbers.
5. Drawing is limited to the visible editor viewport, using the editor's measured line height and current scroll position. The markers follow pinch zoom and line-number movement.
6. A conservative Routine/Task source scanner inserts checkpoint `postln` calls immediately before independent statement lines that create synths, begin loops, or issue standalone waits. It does not insert them before `var` declarations, shift source line numbers, or modify the composition stored in the editor. When SuperCollider actually executes a checkpoint, the language output is intercepted and the relevant source line is marked violet. Unknown or complex constructs are left uninstrumented.
7. Activity tracking is on by default, with an opt-out in FILE. None of the tracking data is sent to an external service.

## Boundaries

- The system knows when synth nodes are *reported running*, not whether their signal is audible. A synth can be silent, muted, or feeding a bus rather than the speakers. The output may contain reverberation even after the initiating synth has ended.
- Source mapping is best-effort. Dynamically generated SynthDefs, indirect instrument names, unnamed server nodes, unknown event dispatch paths, and ambiguous duplicate callsites may not produce an accurate source highlight.
- Routine tracking shows **actually executed checkpoints**, not an unrestricted program counter. Standalone synth calls, waits, and recognized loop statements can be followed; arbitrary expressions, nested one-line statements, indirect calls, Patterns, and dynamic code are not fully instrumented. While a Routine is waiting, the last executed wait line remains marked. If no checkpoint arrives for 15 seconds the position is labeled LAST, and it disappears after 45 seconds. This avoids pretending an idle or finished Routine is certainly executing.
- The number after WAIT is the value passed to SuperCollider's clock, which may denote seconds or beats, depending on the clock. The UI does not claim an exact remaining countdown.
- Notification messages require server notification registration. SuperCollider typically enables this through `Server.notify` and its boot process.
- No automatic scrolling is forced during a performance. Users can scroll and edit normally.
- `CmdPeriod.run` initiates a stop. The local display also clears its tracked nodes in response to this explicit stop action.
- Checkpoints add harmless `postln` calls to the executed language code, but can impose some overhead in fast loops. In unusual syntaxes they might change behavior; the scanner is intentionally restricted to independent statement lines. Disable Live code tracking from FILE to evaluate the original code without these checkpoints.
- No WebAudio/OSAudio engine modifications, sample-level tracing or remote processing are performed.

## Testing

`node qa/live-activity-test.mjs`: deterministic tests for OSC messages/bundles, nested SynthDef completion messages, source indexing, named/anonymous synth mapping, node transitions, and suppression of incorrect highlights.

`node qa/layout-check.mjs`: Chromium tests covering all eight design treatments, responsive editor geometry, zoom/gutter alignment, and browser integration tests for blue request -> amber server confirmation -> no mark after `/n_end`.

## Manual acceptance test on an iPhone

1. Open SuperCollision and confirm **INSTRUMENT / 1.9**.
2. From FILE select **Create Living Code demonstration**, then POWER (if needed) and RUN.
3. The long drone definition should become amber once its synth starts. Bell notes should flash blue at the unique `Synth(\scBell ...)` callsite and remain amber only while their short synths exist. Open the bottom-right LIVE inset to examine individual instrument counts and note lifetimes. If the Routine executes traced standalone statements, its observed line and WAIT state appear below the instrument rows.
4. Tap STOP. Active markings should clear. Test another composition and verify that switching projects doesn't highlight unrelated source.
5. If sound plays without activity, check whether `/notify` messages are reaching the bridge or whether the sound was started using an instrument name that can't be unambiguously mapped.

Official SuperCollider reference: https://docs.supercollider.online/Reference/Server-Command-Reference.html

## Fixed in 1.6

The first version of this feature missed real synths started using SuperCollider's compact integer-addressed OSC command. Actual WebAssembly engine traces showed byte-prefix `00 00 00 09` (command number 9) followed by synth name, node ID and placement. The server responded with `/n_go`, but the original observer incorrectly treated the outgoing packet as unknown. The decoder now recognizes commands 9 and 59 as `/s_new`, so real instrument instances are eligible for source highlighting. The original Living Code Demonstration also used `s.sync` outside a Routine. This was corrected, and the app upgrades only untouched saved copies of the example, leaving user-modified code intact.

## Automated verification added in 1.9

- Pure-node regression tests cover the immutable source transform, checkpoint line mapping, `var` protection, routine status progression, stale pointers, per-instrument node counts and measured lifetimes.
- Chromium checks the floating inset is inside the editor in all eight themes and at 320, 390, and 430 CSS pixels, and that source-highlighting and Routine indicators render in the correct coordinate system.
- The actual SuperCollider WebAssembly test boots the language and synthesis engine, evaluates a real clock-driven Routine with inserted checkpoints and checks that its observed WAIT line appears in the inset while music plays. The last successful test is associated with the project's GitHub Actions runs.
