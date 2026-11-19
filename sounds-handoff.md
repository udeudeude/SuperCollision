# SuperCollision Sounds: canonical development handoff

Updated 2026-11-19, local evening. **Scope is strictly Sounds-only.** Never edit `index.html`, main navigation, Live, Mix, shared offline infrastructure, or any other shared functionality without explicit user approval. The active app's Sounds interface may be embedded in `index.html`; treat it as frozen. Work on isolated `sounds.html`, `sounds-*.mjs`, `qa/sounds-*.mjs`, and the Sounds-only publisher. No competing audio-processing engine: all future editing, playback instruments, effects, buffers, loops and synthesis must run through SuperCollider, never an independent browser audio processor.

## Product contract

Five ways to enter the same offline-local IndexedDB library:

1. Create: user-written SuperCollider source.
2. Generate: artificial intelligence produces editable SuperCollider code; never execute code automatically; user-funded free OpenRouter models and personal Puter allowance.
3. Import: existing audio files from device.
4. Record: mic permission switch and press-to-record; release to save; red recording outline.
5. Discover: Openverse by default, Wikimedia Commons via Openverse, Freesound as specialist. License filtering must be prominent and combinable. Default commercial-use and modification allowed; support CC0 and attribution-not-required filters. Metadata must preserve source, creator, exact license, retrieval time and preview-vs-original distinction.

All processing/editing/building uses SuperCollider's existing runtime. Browser APIs only handle nonprocessing operations (capture, storage, previews, UI visualization and permissions). Default optional audio downloading to Wi-Fi; on iOS an unknown network type requires the user's explicit override. Never store provider credentials in the sound library or silently use paid models.

## Code created this iteration

- `sounds.html`: single Sounds library and six tabs (Library plus five acquisition methods), build `2026.11.19.10`.
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

- GitHub Node syntax and license tests passed in the Sounds workflow run `44640397628`; browser installation and browser checks were in progress when this handoff was authored. Reinspect workflow, job steps, logs and `pages-build` before describing deployment as verified. Link: https://github.com/udeudeude/SuperCollision/actions/runs/44640397628
- Before this iteration, `pages-build` did **not** contain `sounds.html` or the Sounds scripts even though prior replies linked to it. The dedicated workflow is intended to correct this; confirm actual publication.
- Openverse/Freesound preview audio may be blocked by production's `Cross-Origin-Embedder-Policy: require-corp`. Add `crossOrigin='anonymous'` to remote audio elements before setting src, then test actual providers. Not all sources support browser-origin audio downloads; retain explicit manual import fallback.
- Freesound API's `url` property may point to an API endpoint rather than the public sound page. Prefer its canonical public page URL based on username and sound ID.
- Search results may arrive after source-selection changes; cancel the pending controller on tab/source changes.
- Generated code provider switch, real microphone permissions on iOS, remote provider cross-origin behavior and WebAssembly audition were not device-tested. Do not claim otherwise.
- Published main offline manifest does not include standalone Sounds files, and browser-installed Home Screen storage may be separate from Safari. **Do not modify shared offline manifest/service worker without user approval.**
- Browser recorder uses MediaRecorder capture and AudioContext solely for the volume meter, not processing; all eventual sound editing must use SuperCollider.
- Cloudflare Pages production branch is `pages-build`; `publish-ui.yml` copies a fixed set of root files and does not copy Sounds. Do not alter that shared workflow; use the Sounds-only publisher.
- Avoid many small root commits; the existing global publish workflow triggers on every root `*.mjs` or `*.html` change, consuming Actions time. Bundle coherent changes. Consider moving internal Sounds scripts into a `sounds/` folder in a future safe migration so updates do not trigger the global publish workflow.

## Immediate priorities

1. Examine results of Sounds Actions workflow and fix browser test / publication failures.
2. Fix the verified architectural issues above, then test search, preview, local save and attribution on real remote endpoints and iOS where possible.
3. Add code source export and a recovery/backup path for complete sound library, non-destructively.
4. Test SuperCollider's native buffer loading with real imported and recorded files in a Sounds-only host without modifying main editor. Do not build a separate audio engine.
5. Build actual SuperCollider-based waveform/sample editor and instrument mapper. Preserve original data and editable code.
6. Bring Sounds offline support to the main application's release process only after user authorizes required shared-infrastructure changes.

Each iteration: examine current GitHub/main, pick high-value steps, make several changes, run regressions, self-critique, commit, verify deployment and update this handoff.
