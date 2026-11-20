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
