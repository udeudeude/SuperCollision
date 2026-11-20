# SuperCollision Sounds: canonical development handoff

Updated 2026-11-19, Sounds iteration 2. **Scope is strictly Sounds-only.** Never edit `index.html`, main navigation, Live, Mix, shared offline infrastructure, or any other shared functionality without explicit user approval. The active app's Sounds interface may be embedded in `index.html`; treat it as frozen. Work on isolated `sounds.html`, `sounds-*.mjs`, `qa/sounds-*.mjs`, and the Sounds-only publisher. No competing audio-processing engine: all future editing, playback instruments, effects, buffers, loops and synthesis must run through SuperCollider, never an independent browser audio processor.

## Product contract

Five ways to enter the same offline-local IndexedDB library:

1. Create: user-written SuperCollider source.
2. Generate: artificial intelligence produces editable SuperCollider code; never execute code automatically; user-funded free OpenRouter models and personal Puter allowance.
3. Import: existing audio files from device.
4. Record: mic permission switch and press-to-record; release to save; red recording outline.
5. Discover: Openverse by default, Wikimedia Commons via Openverse, Freesound as specialist. License filtering must be prominent and combinable. Default commercial-use and modification allowed; support CC0 and attribution-not-required filters. Metadata must preserve source, creator, exact license, retrieval time and preview-vs-original distinction.

All processing/editing/building uses SuperCollider's existing runtime. Browser APIs only handle nonprocessing operations (capture, storage, previews, UI visualization and permissions). Default optional audio downloading to Wi-Fi; on iOS an unknown network type requires the user's explicit override. Never store provider credentials in the sound library or silently use paid models.

## Code created this iteration

- `sounds.html`: single Sounds library and six tabs (Library plus five acquisition methods), build `2026.11.19.11`.
- `sounds-page.mjs`: isolated tab navigation.
- `sounds-library.mjs`: microphone permission toggle, pointer/keyboard press-hold capture and import.
- `sounds-tools.mjs`: unified list for blobs and SuperCollider code; filter, search, favorites, rename, copy/edit code, export, delete and attribution copying.
- `sounds-store.mjs`: compatible IndexedDB store `supercollision-sounds-v1`, store `sounds`; non-destructive.
- `sounds-licenses.mjs`: conservative Creative Commons classifier and license selection for server/client search.
- `sounds-discover.mjs`: Openverse/Wikimedia/Freesound search, license filters, previews, pagination and explicit local download with a 50 MB cap. Freesound downloads compressed previews, not original-quality masters.
- `sounds-generate.mjs`: independent OpenRouter/Puter interface reusing pure `sound-designer-core.mjs` helpers; generates and saves native SuperCollider code without audition.
- `qa/sounds-licenses-test.mjs`: Node tests.
- `qa/sounds-browser-test.mjs`: Chromium tests for source storage, microphone capture, licensing, online import, and persistence.
- `.github/workflows/publish-sounds.yml`: dedicated Sounds-only tests and overlay to `pages-build`, leaving engine and main interface intact.

All diff paths from the previous checkpoint `0c159523edeb84f9ff6062fc78bc3b3ff06eea98` through `6bc7a6ccda490c3ba49570e592b2473372f7f699` were checked and confined to Sounds-specific files.

## Verification and known issues

- **Verified** dedicated Sounds workflow run [44641246513](https://github.com/udeudeude/SuperCollision/actions/runs/44641246513): Node syntax, combined-license tests and Playwright/Google Chrome browser acceptance tests **all passed**. Sounds-only overlay to `pages-build` succeeded. The compiled SuperCollider engine and main application were preserved.
- **Verified** `pages-build` blobs match `main` for `sounds.html`, `sounds-discover.mjs`, `sounds-generate.mjs`, `sounds-tools.mjs` and `index.html` (unchanged across branches). Standalone Sounds build is `2026.11.19.10`. Production deployment workflow [44641247027](https://github.com/udeudeude/SuperCollision/actions/runs/44641247027) completed successfully, though the externally hosted Cloudflare URL could not be fetched by the available browser, and the real iPhone remains untested.
- An early browser run found a timing-related assertion; it was corrected. Another run identified and fixed a shell path-validation bug in the isolated publishing workflow. The full workflow then passed. Its concurrency group is separate from the main publisher to prevent the existing main workflow from cancelling Sounds-specific work.
- Openverse/Freesound preview audio may be blocked by production's `Cross-Origin-Embedder-Policy: require-corp`. Add `crossOrigin='anonymous'` to remote audio elements before setting src, then test actual providers. Not all sources support browser-origin audio downloads; retain explicit manual import fallback.
- Freesound API's `url` property may point to an API endpoint rather than the public sound page. Prefer its canonical public page URL based on username and sound ID.
- Search results may arrive after source-selection changes; cancel the pending controller on tab/source changes.
- Generated code provider switch, real microphone permissions on iOS, remote provider cross-origin behavior and WebAssembly audition were not device-tested. Do not claim otherwise.
- Published main offline manifest does not include standalone Sounds files, and browser-installed Home Screen storage may be separate from Safari. **Do not modify shared offline manifest/service worker without user approval.**
- Browser recorder uses MediaRecorder capture and AudioContext solely for the volume meter, not processing; all eventual sound editing must use SuperCollider.
- Cloudflare Pages production branch is `pages-build`; `publish-ui.yml` copies a fixed set of root files and does not copy Sounds. Do not alter that shared workflow; use the Sounds-only publisher.
- Avoid many small root commits; the existing global publish workflow triggers on every root `*.mjs` or `*.html` change, consuming Actions time. Bundle coherent changes. Consider moving internal Sounds scripts into a `sounds/` folder in a future safe migration so updates do not trigger the global publish workflow.

## Sounds iteration 2: archive, restoration, source export, discovery consistency

On the Sounds-only feature branch `sounds/backup-discover-20261119-r2`:
- `sounds-backup.mjs`: binary-safe `.scsounds` archive (versioned UTF-8 JSON manifest, original Blob bytes, bounded manifest, strict length and duplicate validation). Preserves names, source code, license attribution and metadata; no audio transformations.
- `sounds-backup-ui.mjs`: one-click full library export and offline backup import. Restore skips existing sound IDs and prompts before changes; `saveSoundsBatch` uses one IndexedDB readwrite transaction with `add` so existing items cannot be overwritten even under a racing update.
- `sounds-tools.mjs`: export saved SuperCollider code as plain `.scd` without changing it.
- `sounds-discover.mjs`: abort in-flight requests and clear stale results after collection, query, or license-filter changes.
- `sounds.html`: backup/recovery interface in Library, incremented to build `2026.11.19.11`; main page is still untouched.
- `qa/sounds-backup-test.mjs`: archive round-trip, binary-byte preservation, corrupt/truncated data and duplicate ID coverage.
- `qa/sounds-browser-test.mjs`: .scd export, full export/delete/restore, duplicate-safe restore and stale-result invalidation.
- `.github/workflows/publish-sounds.yml`: runs backup tests before publishing.

**Verification state:** PR [#3](https://github.com/udeudeude/SuperCollision/pull/3) was squash-merged to `main` as `1b58d72aca2b646d65ed3c29c5bbb5910ad55eb9`. The `pages-build` branch now matches `main` byte-for-byte (blob SHA) for `sounds.html`, new archive modules, Sounds store, tools, discovery, and the unchanged `index.html`. Because the isolated Sounds publishing workflow gates its overlay on syntax, Node unit tests and browser acceptance, publication strongly indicates those gates completed, but their individual logs were not available through the connector this iteration. The live Cloudflare URL could not be fetched here. No external API, real iPhone, or native SuperCollider runtime test has been completed in this iteration. Backup archive is not compressed or encrypted; users must store it outside browser storage, and large libraries still depend on available device storage. The format has strict file framing but no per-recording cryptographic checksum.

**Next:** Investigate native SuperCollider buffer loading in isolated host; improve Freesound filtering/pagination and remote provider behavior; test iPhone recording and restore; potentially add integrity checks and a larger-library export strategy. Do not touch `index.html` or the shared offline manifest.

## Immediate priorities

1. Examine results of Sounds Actions workflow and fix browser test / publication failures.
2. Fix the verified architectural issues above, then test search, preview, local save and attribution on real remote endpoints and iOS where possible.
3. Add code source export and a recovery/backup path for complete sound library, non-destructively.
4. Test SuperCollider's native buffer loading with real imported and recorded files in a Sounds-only host without modifying main editor. Do not build a separate audio engine.
5. Build actual SuperCollider-based waveform/sample editor and instrument mapper. Preserve original data and editable code.
6. Bring Sounds offline support to the main application's release process only after user authorizes required shared-infrastructure changes.

Each iteration: examine current GitHub/main, pick high-value steps, make several changes, run regressions, self-critique, commit, verify deployment and update this handoff.


## Sounds iteration 3: provider correctness, archive integrity, preview lifecycle

Working branch: `sounds/discovery-integrity-20261119-r3`. The only intended changes are `sounds.html`, Sounds-only modules, Sounds-only tests and publisher, and this handoff. The main editor, `index.html`, shared runtime, and offline infrastructure are frozen.

- `sounds-backup.mjs` now exports **version 2** archives. Each unchanged audio Blob gets a streaming CRC32 to detect accidental corruption; backups are still uncompressed and unencrypted. Import verifies every checksum before the existing atomic add-only database transaction. Version 1 backups remain readable and must not be overwritten.
- `sounds-backup-ui.mjs` awaits checksum generation on export and explains integrity validation before restore. The checksum is **not cryptographic authentication**; tampering by someone who recomputes the checksum is not detected. Large library backups remain bounded by available device storage and export limits.
- `sounds-discover-core.mjs` supplies testable provider specifics: Openverse duration values are **milliseconds**; Freesound's durations are seconds; the Openverse Wikimedia Commons source slug is **`wikimedia_audio`**; Freesound now gets server-side license filters when applicable; error pages returning `text/html` or `application/json` are rejected instead of being saved as sounds.
- `sounds-page.mjs` emits a view-change event. Discover aborts pending searches on leaving the tab and pauses all active audio previews. Page exit aborts pending search requests.
- `qa/sounds-discover-test.mjs` adds provider normalization and content-type unit tests, and `qa/sounds-browser-test.mjs` checks real browser request construction through mocked Openverse/Freesound endpoints. `qa/sounds-backup-test.mjs` covers v2 corruption detection and v1 import.
- `.github/workflows/publish-sounds.yml` now tests discovery helpers before publisher overlay. `sounds.html` is build **2026.11.19.12** with new module cache versions.

**Verification:** changes were checked for confined diff paths and committed to the Sounds feature branch. The publisher's full browser tests and promotion must be checked after merging. No claims of live source API, cross-origin behavior, physical iPhone, or native SuperCollider buffer loading: those require separate verification.

**Next priorities:** (1) Inspect publish workflow and verify same Sounds blobs on `pages-build`. (2) Probe native SuperCollider virtual filesystem / buffer operations in a dedicated Sounds-only runtime harness, without replacing the SuperCollider audio engine. (3) Live remote provider verification and iPhone microphone / restore tests, subject to access. (4) Test large file archive and quota/failure cases, and add progress indicators for slow exports. (5) Only with user approval, connect standalone Sounds into the frozen main-page interface and shared offline precache.


### Iteration 3 post-merge verification and engine investigation

- [PR #4](https://github.com/udeudeude/SuperCollision/pull/4) squash-merged to `main` as `e5053f1078ac03c6d980592f2f2b18194ade7e5d`. After the merge, the `pages-build` branch was re-read and verified to contain byte-identical blobs for the updated `sounds.html`, `sounds-backup.mjs`, `sounds-backup-ui.mjs`, `sounds-discover.mjs`, `sounds-discover-core.mjs` and `sounds-page.mjs`. The unchanged `index.html` had the same blob SHA `8fb09e74d0ce655994b8091f09b5ae8782063b91` on both branches. This verifies publication branch overlay but not a live phone/browser deployment; Actions run logs were not available to inspect. The Sounds publisher gates the overlay on Node and browser tests, so publication strongly suggests that they passed.
- Inspected the existing `index.html` boot path and compiled `pages-build/runtime/scsynth/scsynth.js`: the app separately boots `ScLang` and `ScSynth`, routes Open Sound Control messages in both directions, and requires cross-origin isolation. The compiled synthesis module **does not expose `Module.FS` as an exported interface** in static inspection. Do not assume writing files into the language module virtual filesystem will make them readable to the synthesis module.
- Native SuperCollider transport candidate: allocate a SuperCollider buffer using `/b_alloc`, then transfer interleaved sample data in bounded `/b_setn` messages, and use `PlayBuf` plus `BufRateScale` in an ordinary SuperCollider `SynthDef`. Official SuperCollider documentation specifies these commands and a common 1633-float limit per message in UDP transports. Investigate an isolated Sounds-only harness, bounded chunk transmission/backpressure, multichannel, and sample-rate fidelity before exposing editing or sample playback. Browser decoding only to ingest file bytes is not an alternate effects engine.
- Do **not** modify `index.html`, the shared runtime or offline infrastructure to implement this. First prove the transport and boot lifecycle inside a standalone Sounds-only host.


## Sounds iteration 4: isolated native sample-buffer transport experiment

Feature branch: `sounds/native-buffer-r4`. Scope limited to Sounds-only files and the Sounds-only publishing workflow. Main editor and `index.html` remain untouched.

- `sounds-buffer.mjs`: bounded Open Sound Control binary encoding and a native SuperCollider buffer uploader. Issues `/b_alloc`, transfers interleaved mono/stereo floats with `/b_setn` in 384-float packets, acknowledges groups using `/sync` and `/synced`, and frees a partly allocated buffer if the upload fails or is cancelled. Transfers include limits, progress and timeouts. This protocol never uses a browser oscillator, effects engine or sample player.
- `sounds-lab.html` and `sounds-lab.mjs`: experimental **separate** engine host using the existing SuperCollider language/synthesis WebAssembly modules. Lists existing audio from the unified library, decodes a selected file solely for native buffer ingestion, uploads to `scsynth`, and requests native `SynthDef` / `PlayBuf` playback from `sclang`. Supports stop and cancellation, with accessible progress/status. Does not change original audio or the library.
- `sounds.html`: links to the laboratory from the standalone Library tab, build 2026.11.19.13.
- `qa/sounds-buffer-test.mjs`: wire type tags, multichannel interleave, packet boundaries, progress/completion, cancellation and error cleanup checks.
- `qa/sounds-browser-test.mjs`: smoke coverage for the lab opening on the same origin and seeing existing local audio without engine startup.
- `.github/workflows/publish-sounds.yml`: test a pull request's actual head commit before merging; do not publish pull-request builds. After main-branch tests pass, overlay `sounds-lab.html` and Sounds-only scripts onto `pages-build`, without touching shared runtime files.

**Important limitations:** The lab is a prototype, not verified native playback yet. Automated tests can validate message framing, error handling and browser initialization; they cannot establish correct real-device audio without booting the compiled SuperCollider modules in the intended cross-origin-isolated production host. The uploader is limited to 1,200,000 float samples and mono/stereo. The default SuperCollider synthesis server's buffer capacity is assumed to include buffer 700, which must be checked on real boot. `AudioContext.decodeAudioData` is used solely to decode and, as browsers may do, resample during ingestion to the server output sample rate. There are no independent browser effects. The original stored audio is preserved. After verification, instrument editing and loop control must remain SuperCollider-based. The main page and offline precache remain frozen.

**Immediate next:** Watch new pull-request checks, fix any failures, merge if green and verify the published Sounds blobs against `main`. Then live-test sample transfer with the compiled runtime and iPhone audio unlock, refine buffer backpressure and server capacity handling. Do not describe the laboratory as working on a real iPhone until tested.

### Iteration 4 post-merge verification

- [PR #5](https://github.com/udeudeude/SuperCollision/pull/5) squash-merged into `main` as `311d939ec0db6ae38f6b7f85474e3f6001fa1aa5`.
- Pull request Sounds-only Actions run [44662747713](https://github.com/udeudeude/SuperCollision/actions/runs/44662747713) completed **successfully**. Node syntax checks, licensing/discovery/archive/native-buffer unit tests and Chromium browser acceptance passed. Initial browser test run failed because a `<select><option>` element was attached but not considered visible by Playwright; assertion was corrected to wait for `state:'attached'` and rerun green.
- The `pages-build` branch was fetched after merge: blob SHAs match `main` for `sounds.html`, `sounds-lab.html`, `sounds-lab.mjs` and `sounds-buffer.mjs`. `index.html` remains the same blob SHA `8fb09e74d0ce655994b8091f09b5ae8782063b91` in both branches. This confirms publication branch content; it does **not** prove that the external hosting edge has served the changes or that physical iPhone/native audio works.
- Next iteration priority is to test SuperCollider engine startup and buffer playback through the hosted laboratory under cross-origin isolation, then diagnose iPhone audio unlock. Do not confuse pure transport test success with working audio output. Add sample-region selection / editing only through native SuperCollider after successful baseline verification.


## Sounds iteration 5: native SuperCollider readback and real-runtime diagnostics

Working branch: `sounds/native-verification-r5`. Confined to standalone Sounds files, Sounds-only quality checks, publishing workflow and this handoff. The main editor `index.html`, existing main navigation, shared WebAssembly runtime and offline features remain frozen.

- `sounds-buffer.mjs` now requires **native scsynth /b_getn readback verification** of first/middle/last frames after transfer. Transfer only reports ready when actual server-owned samples match the submitted data. No browser-based synthesis or processing was added. Replies respect ArrayBuffer view offsets; asynchronous /sync and /b_getn waits respond promptly to AbortSignal and clean up pending requests. Errors cause best-effort native buffer release and synchronization.
- `sounds-lab.mjs` reports verified server sample values; replacing or stopping a sample frees only its associated laboratory synth, not the entire root node group. The engine boot button can retry timed-out startup without reloading; duplicate synthesis boot calls are suppressed. A clear warning explains that browser decode may resample to the engine output rate, leaving the original file untouched.
- `qa/sounds-buffer-test.mjs` adds mock-server sample roundtrip, corruption rejection, cancellation, cleanup and typed-array slice tests. `qa/sounds-runtime-smoke.mjs` is an isolated integration test served with COOP/COEP headers: Chrome loads **real** compiled sclang/scsynth assets from `pages-build`, writes a short local test WAV into the Sounds library, boots the modules, checks native /b_getn readback and requests a PlayBuf audition. It is not a speaker-output, iPhone or user-device test.
- `.github/workflows/publish-sounds.yml` checks the new test's syntax and runs the actual compiled-runtime smoke in a **nonblocking diagnostic step**. This deliberate choice allows inspection of runtime failures without blocking unrelated Sounds library fixes; a green workflow does NOT by itself establish that the experimental runtime smoke passed. Review its step result explicitly and gate on it only once stable. The existing buffer and library acceptance tests remain mandatory.
- `sounds.html` build `2026.11.19.14`; `sounds-lab.html` experimental revision 02. No main-page integration.

**Validation and publication outstanding at preparation:** Open the PR, inspect the isolated workflow's individual steps and native WebAssembly diagnostic log, correct any problems found, merge after mandatory tests pass, verify `pages-build` blob SHA parity. If the diagnostic smoke fails, report it explicitly. The Cloudflare-hosted page and real iPhone output are not independently verifiable through this environment. Next priority after reliable engine boot is native sample region, loop and rate controls using PlayBuf and preserved original audio, then wider live-provider and device testing.


### Iteration 5 real native SuperCollider validation

Compiled-runtime integration was **actually tested** in GitHub Actions [44669913394](https://github.com/udeudeude/SuperCollision/actions/runs/44669913394), job 136068146243. The log says: "Native engine smoke passed: real sclang/scsynth boot, sample readback, PlayBuf audition request and Stop." This is **genuine WebAssembly boot and scsynth-owned buffer readback in Chrome**, not merely a mock Open Sound Control transport. It still **does not verify audible output through a speaker, iPhone audio unlock, or real-device performance**.

Crucial runtime finding: the compiled `scsynth.getAudioContext()` returns a **numeric handle** rather than an actual Web Audio AudioContext in Chrome. The previous lab incorrectly called `.resume()` and `.decodeAudioData()` on that number, so live native loading failed despite successful engine startup. Fixed in isolated `sounds-lab.mjs`: a one-shot constructor observer captures the real AudioContext created by scsynth and restores the original constructor immediately; an `OfflineAudioContext` is used only for **decoding input data**, with native server sample-rate validation, never for alternate playback or sound processing. SuperCollider remains the sole audio synthesis/playback engine. The tests detected and then verified the correction.

After the proven Chrome smoke succeeded, the Sounds-only pull-request workflow was tightened so real native runtime smoke is now **mandatory**, not a nonblocking diagnostic. Mandatory tests also include JavaScript syntax, licensing, discovery, original-blob backup/restore, buffer roundtrip/corruption/cancellation, and Chromium library regression. The workflow checks out the compiled runtime from `pages-build` only as test data and never alters shared runtime. The exact published revision and main/production blob parity must still be rechecked after merging PR #6.

Next work: add SuperCollider-controlled sample start/end, looping, speed and envelope once playback is audibly verified; add robust production/iPhone audio unlock checks; investigate safer handling of native output context construction across browsers; preserve original samples and the main-page freeze.

### Iteration 5 merged and published verification

- PR [#6](https://github.com/udeudeude/SuperCollision/pull/6) squash-merged into `main` as `ec474324fdf33dd9ffb5a20eedbfd2cfed665de8`.
- **Mandatory** Sounds-only PR workflow [44670113027](https://github.com/udeudeude/SuperCollision/actions/runs/44670113027) passed every step. Its actual compiled WebAssembly browser smoke passed: native sclang/scsynth boot, server-owned audio buffer upload and /b_getn verification, PlayBuf audition request, player-only Stop.
- Main Sounds-only publishing workflow [44670223574](https://github.com/udeudeude/SuperCollision/actions/runs/44670223574) passed its mandatory Node/Chromium tests and overlaid only Sounds files into `pages-build`.
- Verified byte-identical `main` / `pages-build` blobs for `sounds.html`, `sounds-lab.html`, `sounds-lab.mjs`, `sounds-buffer.mjs`. Verified `index.html` unchanged with matching blob SHA `8fb09e74d0ce655994b8091f09b5ae8782063b91` on both branches. This is **verified production-branch publication**, but the external Cloudflare website remained inaccessible from available inspection tools. A real iPhone/audio-speaker test is still required.
- The separate general interface publishing workflow failed, but the dedicated Sounds publisher **passed**. Do not modify shared CI to address this without authorization.
- Next highest value: real iPhone unlock and audible playback; proper native PlayBuf-based region/loop/rate controls; non-destructive sample-based instrument editor and code export; live provider testing.

## Sounds iteration 6: native region editing and loop audition

Feature branch `sounds/native-regions-r6`, PR [#7](https://github.com/udeudeude/SuperCollision/pull/7). Only Sounds-specific files, tests, isolated Sounds publishing workflow, and this handoff may change. The main page, shared runtime, Live, Mix, and offline infrastructure are strictly frozen.

- `sounds-sampler.mjs`: four native SuperCollider synthesizers: mono/stereo one-shot playback with `PlayBuf` and bounded start/finish and automatic release, plus mono/stereo regional looping with `BufRd`/`Phasor`. All four use `BufRateScale`, amplitude limits, and an envelope responsive to native gate release on Stop. Browser code only validates controls and creates SuperCollider source.
- `sounds-lab.html` / `sounds-lab.mjs`: accessible sliders for percentage region boundaries, 0.25–2× speed and 0–0.5 amplitude, plus loop checkbox and region-time readout after sample loading. Changing controls takes effect on next Play. New selection invalidates the previous sample's playback entitlement, upload disables sample selection, and deleted library entries invalidate loaded state. Original sample remains unmodified. Loop seam is not yet crossfaded, so some loops may click.
- `sounds.html`: visible route into native region laboratory; isolated Sounds build 2026.11.19.15.
- `qa/sounds-sampler-test.mjs`: validates instrument definitions, argument sanitation and one-percent boundary precision. Updated Sounds browser acceptance test exercises region ordering, and real compiled-runtime smoke requests both trimmed one-shot and loop through native SuperCollider. The Sounds-only workflow now gates on sampler helper tests as well.
- Tests must be examined after PR branch's latest commit. Previous PR attempt failed a *test expectation* when Stop switched from immediate free to native gate release. This assertion was corrected. No green claims until the latest complete Actions run is checked. Actual speaker and iPhone audio remain untested.

**Next:** Inspect PR #7's final workflow, especially the compiled engine smoke and any SynthDef diagnostic errors. Fix failures, merge after green, confirm production Sounds file parity. Then validate real iPhone playback; investigate loop-boundary crossfades, sample-waveform region gestures through a read-only visualization, and reusable sample-instrument definitions. Never change `index.html` without explicit permission.

### Iteration 7 integration recovery (2026-11-20)

- Earlier PR #7 native region checks passed in workflow 44675652859, including compiled SuperCollider smoke. Branch diverged after a separate Sounds-only navigation improvement on main, so region work was ported onto `sounds/native-regions-rebased-20261120` without discarding the updated Sounds navigation.
- Standalone Sounds keeps Library as the primary destination; Create, Generate, Import, Record and Discover form a distinct Acquire a Sound group. Browser regression asserts this separation.
- Build 2026.11.20.2. This port requires its own full workflow run before merge. Actual speaker/iPhone output remains unverified. Main editor, shared navigation, Live, Mix and offline systems remain untouched.
- Next: inspect rebased PR compiled engine smoke, merge if green, confirm `pages-build` parity. Follow with native loop-boundary smoothing, waveform visualization, sample-instrument export, live providers and iPhone audio verification.

### Iteration 7 publication verification (2026-11-20)

- [PR #8](https://github.com/udeudeude/SuperCollision/pull/8) passed its dedicated mandatory Sounds workflow [run 44682395347](https://github.com/udeudeude/SuperCollision/actions/runs/44682395347). Workflow job steps verified JavaScript/native sampler validation, Chromium library regression including Library/Acquire hierarchy, and actual compiled SuperCollider WebAssembly browser smoke including sample upload/readback, one-shot/loop requests and Stop. Do **not** interpret these as real speaker output.
- PR #8 squash merged to `main` as `e536c217aeb982acacab3ecb3510c6bc9b2a7142`; obsolete diverged PR #7 was closed with explanatory comment.
- Re-read `main` and `pages-build` after publishing: exact matching Git blob SHA for `sounds.html` (`c280f5d`), `sounds-lab.html` (`796178b`), `sounds-lab.mjs` (`b331646`), and `sounds-sampler.mjs` (`a93c063`). Previous Sounds modules also matched; unchanged `index.html` was verified to have SHA `8fb09e74d0ce655994b8091f09b5ae8782063b91` on both branches. The direct external page was inaccessible to the available inspection tool, and a physical iPhone remains untested.
- This publication combines build `2026.11.20.2` (Library visibly separated from five acquisitions) with the new native sample-region laboratory. No index.html, shared navigation/runtime/offline infrastructure, Live, or Mix modification.

**Outstanding priority backlog:** (1) Physical iPhone microphone permission, native context unlock, actual audible output and playback/stop. (2) Native SuperCollider loop-boundary crossfade to reduce discontinuities. (3) Read-only waveform visualization with accessible region selection; keep all audio processing inside SuperCollider. (4) Reusable native sample-instrument construction, code export and reliable buffer lifecycle. (5) Live Openverse/Wikimedia/Freesound tests, attribution and license edge cases; safe Wi-Fi-only download defaults. (6) Consider standalone Sounds-to-main navigation integration only after user explicitly authorizes changing frozen index.html.

## Sounds iteration 8 (2026-11-20): SuperCollider loop seams and visual region selection

Feature branch `sounds/crossfade-waveform-r8-20261120`, scoped exclusively to Sounds-only modules, HTML, tests, publishing workflow and this Sounds handoff. Main `index.html`, navigation, Live, Mix, shared runtime, offline infrastructure and stored library bytes remain unchanged.

- `sounds-sampler.mjs` loop SynthDefs now use **two native SuperCollider BufRd readheads**, a 12 ms (speed-corrected) capped fade region, equal-power sine/cosine seam blend and a phase reset at `low + fadeFrames`. The incoming readhead ends at the identical sample position as the main head resumes after wrap, reducing discontinuities at both seam entrance and reset. One-shot PlayBuf definitions and the native gate-release Stop remain unchanged.
- `sounds-waveform.mjs` summarizes mono/stereo peaks for UI only; no browser mixing, effects, synthesis or playback. `sounds-lab.mjs` draws the read-only waveform and highlights the region, with horizontal mouse/touch drag selection and the existing accessible start/end sliders. Peaking happens after successfully loading an original audio Blob into a verified native buffer; waveform is cleared on selection changes, failed loads and library deletion.
- `sounds-lab.html` adds visual region selection, updated loop behavior help text and asset cache version. `sounds.html` builds as 2026.11.20.3.
- Added `qa/sounds-waveform-test.mjs` and extended native sampler, browser, and real compiled-engine smoke tests. Dedicated Sounds workflow validates the new unit test.
- **Verification pending**: inspect PR checks (especially actual compiled SuperCollider SynthDef compilation and waveform gesture smoke), fix any issues, merge only after green, and inspect Sounds-only `main`/`pages-build` file blob parity. Do not infer audible speaker output from command acceptance; physical iPhone playback remains unverified.
- **Follow-up**: add source-exportable standalone sample instrument, test live provider cross-origin behavior, improve large-library recovery, and do physical phone audio/microphone tests. Main-page integration remains blocked until user authorizes shared `index.html` changes.

### Iteration 8 tested, merged and published (2026-11-20)

- [PR #9](https://github.com/udeudeude/SuperCollision/pull/9) passed the dedicated mandatory Sounds workflow [run 44689773098](https://github.com/udeudeude/SuperCollision/actions/runs/44689773098): all Sounds unit tests, standalone Chromium regression, and actual compiled sclang/scsynth boot, upload/readback, waveform gesture, one-shot/loop and Stop commands **passed**. An earlier native smoke failed because the test tried to drag a waveform outside the browser viewport; the test now scrolls it into view first and passed. This was a test harness issue, not a native audio failure.
- Merged to `main` as `8b3450670b8f88fc26d959c30ec1a072e22acee7`. Independently fetched `main` and `pages-build`: exact matching Git blob SHA for `sounds.html`, `sounds-lab.html`, `sounds-lab.mjs`, `sounds-sampler.mjs`, and new `sounds-waveform.mjs`. Unchanged `index.html` is still exactly `8fb09e74d0ce655994b8091f09b5ae8782063b91` on both branches. This verifies production-branch publication of build **2026.11.20.3**, not an external Cloudflare fetch or iPhone output.
- The new waveform is a browser-side **read-only visualization**. Actual loop crossfade and playback remain completely inside native SuperCollider `SynthDef` instruments. Original recordings and downloads are unmodified. Live speaker output, quality of long-running loop seams and iPhone interaction require physical testing.
- **Next:** prioritize reusable SuperCollider sample-instrument source/preset export with safe buffer lifecycle and original-audio reference; test Safari/VoiceOver waveform gestures and native audio unlock on iPhone; test real Openverse/Wikimedia/Freesound cross-origin delivery and attribution; preserve strict Wi-Fi-only defaults. No shared `index.html` or offline-manifest edits without explicit user approval.
