# SuperCollision Lab: live handoff record

**Checkpoint by completed operation, not elapsed minutes. Work credits may expire exceptionally quickly.** Start with browser-only tasks, beginning with creation of the separate Cloudflare Pages lab project. After each consequential browser-only action (especially an external setting or deployment), record the confirmed result and any required next action in this handoff and push once. For code-only work, commit coherent milestones rather than every edit. Never defer the first useful commit or status record until the end. Avoid repetitive administration that wastes Work usage. Never write credentials into this file; mark unverified items UNVERIFIED.

## Known-good separation (14 November 2026)

- Production Cloudflare Pages app: https://supercollision.pages.dev/
- Production source branch: `main`.
- Production compiled deployment branch: `pages-build`.
- Laboratory source branch: `feature/offline-safe-foundation`.
- Laboratory compiled deployment branch: `lab-build`, initially copied from `pages-build` to retain WebAssembly runtime.
- Laboratory publication workflow: `.github/workflows/publish-lab.yml`, only pushes `lab-build`. Latest confirmed complete browser-tested run: https://github.com/udeudeude/SuperCollision/actions/runs/43631530605 (SUCCESS, 14 November 2026). Documentation-only commits do not trigger lab redeployment.
- Draft source pull request (do NOT merge yet): https://github.com/udeudeude/SuperCollision/pull/1
- Experimental Cloudflare preview address: **https://lab-build.supercollision.pages.dev/**. User screenshot on iPhone Safari (14 November 2026, approximately 5:15 PM local) verifies that the code editor visibly loads at this address. Audio boot, offline installation, and iPhone Airplane Mode remain UNVERIFIED.
- Laboratory iPhone Safari initial page load: **VISUALLY VERIFIED BY USER SCREENSHOT**; engine/audio and offline functionality still UNVERIFIED.
- **Experiment implemented and browser-verified:** opt-in 8.0 MB offline package, safe service worker caching, manual permission for first-time engine download, no automatic 1.5 MB catalog download. The first experimental website visit has no offline guarantee until the user explicitly installs an offline package.
- The browser test verified no large startup downloads, no engine download after declined consent, full offline-pack installation, offline reload, and cached WebAssembly engine assets in Chromium. **Real iPhone Safari results remain UNVERIFIED**.
- Most recent experimental source version in published lab manifest: `2b1d9c6fddecaf1b189f09930f5f61a3f8c9809e`. Lab deployment branch `lab-build` at `3d1586e3dfe5912225d28d2ca93e1fb7b817b4de` after passing tests.

## Offline POWER regression and fix — 15 November 2026

- Real iPhone Safari user screenshot at about 9:45 AM local time, with Airplane Mode active on `https://lab-build.supercollision.pages.dev/`, showed the code editor available offline but engine failed: status `Runtime unavailable: Load failed` and console `Load failed`.
- Root cause strongly supported by source: POWER performed unconditional `fetch(...,{method:'HEAD',cache:'no-store'})` against runtime JavaScript files. The service worker only intercepted GET. HEAD probes failed without internet even though the engine modules were stored locally.
- Removed these optional network-only HEAD preflight probes on experimental source branch. Actual JavaScript module imports now check runtime availability, using the offline cache when disconnected.
- Extended Chromium test to install the offline pack, go offline, reload, press POWER, reject any HEAD requests and verify it proceeds to language/audio initialization without `Runtime unavailable`.
- **Passed:** https://github.com/udeudeude/SuperCollision/actions/runs/43726379544 on 15 November 2026. Log: `Offline POWER reached SuperCollider initialization: Initializing language and audio server.` Note this **does not yet prove an actual sound plays**; real iPhone verification still required.
- Published `lab-build` manifest source version `0d663611fb84ef1f00551b338a0b4c56fe020aae`, 37 files, 8,052,140 bytes. `main` and `pages-build` unchanged after publish.
- **Next iPhone test:** While on Wi-Fi, reload the lab preview page (do not clear site data); File > Storage > Make available offline, explicitly approve the updated package (~8 MB); test editor reload and POWER/RUN/STOP in Airplane Mode with Wi-Fi also off. Existing offline copy must be updated to pick up fix. Then retry after closing Safari and phone restart.
- If offline POWER still fails, capture full expanded console text and report whether browser security/worker failures occur. Do not claim fully functional offline synthesis until actual audio is heard and STOP verified.

## Composition recovery milestone — 14 November 2026

- Built `lab-composition-vault.mjs`, an experimental IndexedDB snapshot mirror. Existing `localStorage` compositions and Save to Files remain intact.
- Lab File > Storage displays the backup state and, if snapshots diverge, offers **Recover extra local copy** (merge as separately named compositions, never overwrite current ones) or **Keep current compositions** (explicitly replace the extra copy after confirmation). No automatic destructive restoration.
- Browser test verifies initial mirror, updated composition persistence, simulated differing localStorage content, non-destructive recovery, continued offline cache installation and offline reload.
- **SUCCESS:** GitHub Actions publish run https://github.com/udeudeude/SuperCollision/actions/runs/43648014674. `lab-build` now contains the recovery module and refreshed offline manifest, 37 files / 8,052,055 bytes.
- Also changed navigation policy in laboratory service worker: network-first for online page navigations, falling back to the complete cached offline copy on failed network requests.
- Production branches `main` and `pages-build` unchanged as verified after publication.
- **iPhone behavior not yet tested for this milestone.** The user's previously downloaded offline pack is an older version; test the original Airplane Mode behavior first, then on Wi-Fi opt in to updating the offline pack through File > Storage > Make available offline. Browser caching may continue showing the old interface until the app is updated. Do not advise clearing website data because that can delete stored compositions.
- This IndexedDB mirror is NOT a durable Files backup: iOS may evict both databases together; recording files are not mirrored by this feature.

## iPhone offline installation checkpoint — 14 November 2026, about 5:16 PM local

- User-supplied iPhone Safari screenshot at `https://lab-build.supercollision.pages.dev/` displays the modal: "Offline copy saved. You can now test in Airplane Mode. Export important compositions and recordings to Files as backups."
- The File > Storage > Make available offline command is visible behind the success modal. **The client reports successful cache installation**, but offline reload, actual synthesizer output, and reopening after restart are still **UNVERIFIED**.
- Immediate next user test: Airplane Mode with Wi-Fi separately disabled, reload the preview, confirm editor appears; then POWER, RUN the default `SinOsc`, STOP. Report outcomes before calling offline iPhone functionality verified.

## Preview address discovered without another Cloudflare project — 14 November 2026

- User opened `https://lab-build.supercollision.pages.dev/` in Safari on iPhone, and supplied a screenshot showing SuperCollision's editor and controls, version 2.7. The preview address is a separate origin from production.
- The existing Cloudflare Pages project evidently serves an experimental branch preview. The user has NOT created a second Cloudflare Pages project; **do not attempt to create one merely to establish the lab URL**.
- `lab-build` contains the experimental `index.html` with `<title>SuperCollision Lab`; the visible `header h1` remains SuperCollision intentionally.
- Next immediate user device checks: File > Storage > Make available offline, on Wi-Fi only and after accepting the ~8 MB transfer. Confirm successful installation, then test Airplane Mode reload; subsequently test POWER, RUN, STOP, and export/restore.
- Preview Cloudflare settings (headers, deployment protection, preview-on-push behavior) remain **UNVERIFIED**; do not assume automatic updates or production deployment independence beyond distinct origin.

## Work browser checkpoint — 14 November 2026

- Read this handoff on `feature/offline-safe-foundation`, then opened https://dash.cloudflare.com/ in Cloud Browser.
- Cloudflare redirected to https://dash.cloudflare.com/login. This browser is signed out; existing project configuration could not be inspected.
- No Cloudflare settings changed, no lab project created, and no deployment tests performed. Production and deployment branches remain untouched.
- **Superseded:** user found the existing branch preview address on their iPhone without signing into Cloud Browser. No Cloudflare account browser setup is currently required. Do not spend Work credits retrying Cloudflare authentication for this purpose.

## First Work-only action (highest priority)

**Historical fallback only; no longer necessary for obtaining a lab URL.** Cloudflare already serves https://lab-build.supercollision.pages.dev/ as a branch-preview origin. Do not spend Work credits creating another project unless later testing proves this preview inadequate. If truly necessary, create a NEW Pages project named `supercollision-lab` connected to `lab-build`, never `pages-build` or `main`.

- Project type: Pages, Git-connected.
- Framework preset: None.
- Root directory: repository root.
- Build command: `test -f runtime/sclang/sclang.js && test -f runtime/scsynth/scsynth.js`.
- Build output directory: `.`.
- Do not change, delete, redeploy, or reconnect the production Cloudflare project `supercollision`.
- If the requested project name is taken, choose a clearly different lab name and record the actual URL.
- Check that `_headers` delivers required COOP/COEP/CORP headers, browser is cross-origin isolated, and compiled engine can be loaded.
- Report if the Cloudflare Git integration does not build after GitHub Actions updates `lab-build`. Use a separate deployment hook for the lab only if needed, never the production hook.

## Already prepared for that action

- Branch `lab-build` exists and includes a compiled engine.
- Experimental publishing workflow on `feature/offline-safe-foundation` overlays root-level frontend files, retains lab WebAssembly binaries, generates `lab-offline-assets.json`, and runs syntax, policy, and Chromium offline tests before publishing.
- The experimental web manifest may label the app differently for Home Screen identification.
- GitHub build and automated Chromium offline tests are verified; actual Cloudflare lab deployment remains unverified until Work creates the project and inspects it.

## Experimental browser acceptance gates

1. Open experimental URL. Confirm code editor appears in default layout.
2. Confirm required cross-origin isolation headers.
3. Boot interpreter and synthesizer; run a known sine-wave sound on iPhone after user gesture, and verify STOP.
4. Confirm test-app File > Save as, Save to Files (.scd), and WAV export when recording.
5. Ensure production website still functions. Never alter production to pass the lab tests.
6. In File > Storage, select **Make available offline**. Confirm the approximately 8 MB package only when on Wi-Fi or intentionally approving cellular transfer. Verify download progress and success. Initial opt-in and offline reload already pass in Chromium; they remain unverified on iPhone.
7. Airplane Mode tests: active tab, reopened app, and after iPhone restart. If iPhone unavailable to Work, mark device tests UNVERIFIED.

## Cellular policy and storage constraints

- Default conservatively: avoid automatic downloads larger than an ordinary text-only website unless user approves. Prototype intercepts the known large paths: the approximately 6.2 MB engine now requires consent on first POWER, and the 1.5 MB catalog requires consent on opening the full catalog. The entire approximately 8.0 MB offline package requires explicit approval. A separate pure policy helper checks a 1 MB aggregate allowance; **universal session-level transfer measurement/enforcement is not yet implemented**.
- iOS browsers cannot reliably identify Wi-Fi vs cellular; unknown connection must be treated cautiously. Do not claim a guaranteed Wi-Fi detector.
- Browser-tested lab offline manifest contains 36 files totaling 8,044,853 uncompressed bytes. Runtime modules and language catalog are the biggest files.
- User explicitly wants recording, samples, and compositions offline, plus user-mediated Files > On My iPhone exports. Continuous write access to an arbitrary Files folder is not generally available in iOS Safari.
- Browser storage alone must not be described as a permanent backup.

## Next tasks suitable for ordinary ChatGPT/GitHub tools

- Audit all runtime network fetches and document the size/triggering behavior.
- Laboratory publishing and automated Chromium offline reload verified in successful GitHub Actions run 43631530605. Continue testing only when new changes warrant it.
- Experimental service worker, download controls, and Chromium offline test harness implemented and passed. Validate deployed Cloudflare and real iPhone Safari before calling the feature production-ready.
- **Implemented non-destructive IndexedDB mirror and recovery controls for compositions**, browser-tested. A full transition from localStorage to IndexedDB and persistence for audio recordings remain future tasks; user Files backups are still essential.
- Improve user-mediated Files exports; do not compromise current saving behavior.

## Recoverability

**Checkpoint after each consequential browser-only operation**, even if it is the first thing Work does. For code-only work, commit/push coherent completed milestones, not each keystroke. Keep the handoff current after an external configuration change, a significant milestone, or a blocker. Record verified commit, actual deployment URL, exact settings completed, tests actually run/results, blocker, and next concrete action. GitHub is the canonical state, not Work's temporary computer. If abruptly stopped, the latest browser-only configuration should be intelligible without the Work transcript. If unexpectedly cut off, the next session should start by reading this document and GitHub status, without needing the previous Work session transcript.

Never merge `feature/offline-safe-foundation` to `main` or push to `pages-build` without explicit user authorization after comprehensive testing.
