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
- Experimental Cloudflare site address: **NOT YET CREATED OR VERIFIED**.
- Laboratory browser and iPhone behavior: **UNVERIFIED**.
- **Experiment implemented and browser-verified:** opt-in 8.0 MB offline package, safe service worker caching, manual permission for first-time engine download, no automatic 1.5 MB catalog download. The first experimental website visit has no offline guarantee until the user explicitly installs an offline package.
- The browser test verified no large startup downloads, no engine download after declined consent, full offline-pack installation, offline reload, and cached WebAssembly engine assets in Chromium. **Real iPhone Safari results remain UNVERIFIED**.
- Most recent experimental source version in published lab manifest: `2b1d9c6fddecaf1b189f09930f5f61a3f8c9809e`. Lab deployment branch `lab-build` at `3d1586e3dfe5912225d28d2ca93e1fb7b817b4de` after passing tests.

## Work browser checkpoint — 14 November 2026

- Read this handoff on `feature/offline-safe-foundation`, then opened https://dash.cloudflare.com/ in Cloud Browser.
- Cloudflare redirected to https://dash.cloudflare.com/login. This browser is signed out; existing project configuration could not be inspected.
- No Cloudflare settings changed, no lab project created, and no deployment tests performed. Production and deployment branches remain untouched.
- **Next action:** user signs in using Cloud Browser within this conversation on chatgpt.com and asks Work to continue. Do not send credentials in chat. Resume by inspecting existing production settings read-only, then create the separate lab project with the settings below. Commit its actual address and configuration here immediately after creation, before testing.

## First Work-only action (highest priority)

Using Cloudflare account browser access, create a **NEW** Cloudflare Pages project named `supercollision-lab` if available, connected to GitHub repository `udeudeude/SuperCollision`, deployment/production branch `lab-build`, NOT `pages-build` or `main`.

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
- Add IndexedDB working storage with migration from existing localStorage; add backup recovery tests.
- Improve user-mediated Files exports; do not compromise current saving behavior.

## Recoverability

**Checkpoint after each consequential browser-only operation**, even if it is the first thing Work does. For code-only work, commit/push coherent completed milestones, not each keystroke. Keep the handoff current after an external configuration change, a significant milestone, or a blocker. Record verified commit, actual deployment URL, exact settings completed, tests actually run/results, blocker, and next concrete action. GitHub is the canonical state, not Work's temporary computer. If abruptly stopped, the latest browser-only configuration should be intelligible without the Work transcript. If unexpectedly cut off, the next session should start by reading this document and GitHub status, without needing the previous Work session transcript.

Never merge `feature/offline-safe-foundation` to `main` or push to `pages-build` without explicit user authorization after comprehensive testing.
