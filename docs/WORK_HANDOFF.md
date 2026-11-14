# SuperCollision Lab: live handoff record

**Checkpoint by completed operation, not elapsed minutes. Work credits may expire exceptionally quickly.** Start with browser-only tasks, beginning with creation of the separate Cloudflare Pages lab project. After each consequential browser-only action (especially an external setting or deployment), record the confirmed result and any required next action in this handoff and push once. For code-only work, commit coherent milestones rather than every edit. Never defer the first useful commit or status record until the end. Avoid repetitive administration that wastes Work usage. No credentials in this file. No credentials here; mark unverified items UNVERIFIED.

## Known-good separation (14 November 2026)

- Production Cloudflare Pages app: https://supercollision.pages.dev/
- Production source branch: `main`.
- Production compiled deployment branch: `pages-build`.
- Laboratory source branch: `feature/offline-safe-foundation`.
- Laboratory compiled deployment branch: `lab-build`, initially copied from `pages-build` to retain WebAssembly runtime.
- Laboratory publication workflow: `.github/workflows/publish-lab.yml`, only pushes `lab-build`. GitHub run 43630559536 succeeded; later runs may be newer. Subsequent commits to docs do not trigger lab redeployment.
- Draft source pull request (do NOT merge yet): https://github.com/udeudeude/SuperCollision/pull/1
- Experimental Cloudflare site address: **NOT YET CREATED OR VERIFIED**.
- Laboratory browser and iPhone behavior: **UNVERIFIED**.
- The experimental branch has a conservative offline download policy module and tests, but **no enabled service worker and no offline launch guarantee**.

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
- Experimental publishing workflow has been added on `feature/offline-safe-foundation`; it overlays root-level frontend files only and retains lab WebAssembly binaries.
- The experimental web manifest may label the app differently for Home Screen identification.
- This setup remains unverified until workflow and deployment are inspected.

## Experimental browser acceptance gates

1. Open experimental URL. Confirm code editor appears in default layout.
2. Confirm required cross-origin isolation headers.
3. Boot interpreter and synthesizer; run a known sine-wave sound on iPhone after user gesture, and verify STOP.
4. Confirm test-app File > Save as, Save to Files (.scd), and WAV export when recording.
5. Ensure production website still functions. Never alter production to pass the lab tests.
6. Only then enable and test incremental offline caching, avoiding automatic transfer of large runtime files.
7. Airplane Mode tests: active tab, reopened app, and after iPhone restart. If iPhone unavailable to Work, mark device tests UNVERIFIED.

## Cellular policy and storage constraints

- Default conservatively: avoid automatic downloads larger than an ordinary text-only website unless user approves. Proposed guard: 1 MB aggregate session ceiling. A pure policy helper now checks remaining budget; actual network interception and transfer accounting are **NOT YET IMPLEMENTED**.
- iOS browsers cannot reliably identify Wi-Fi vs cellular; unknown connection must be treated cautiously. Do not claim a guaranteed Wi-Fi detector.
- Current published static site has approximately 8.1 MB of stored assets; runtime modules and language catalog each exceed 1 MB.
- User explicitly wants recording, samples, and compositions offline, plus user-mediated Files > On My iPhone exports. Continuous write access to an arbitrary Files folder is not generally available in iOS Safari.
- Browser storage alone must not be described as a permanent backup.

## Next tasks suitable for ordinary ChatGPT/GitHub tools

- Audit all runtime network fetches and document the size/triggering behavior.
- Test laboratory workflow and its status in GitHub Actions.
- Implement experimental service worker and offline test harness, keeping deployment opt-in until tested.
- Add IndexedDB working storage with migration from existing localStorage; add backup recovery tests.
- Improve user-mediated Files exports; do not compromise current saving behavior.

## Recoverability

**Checkpoint after each consequential browser-only operation**, even if it is the first thing Work does. For code-only work, commit/push coherent completed milestones, not each keystroke. Keep the handoff current after an external configuration change, a significant milestone, or a blocker. Record verified commit, actual deployment URL, exact settings completed, tests actually run/results, blocker, and next concrete action. GitHub is the canonical state, not Work's temporary computer. If abruptly stopped, the latest browser-only configuration should be intelligible without the Work transcript. If unexpectedly cut off, the next session should start by reading this document and GitHub status, without needing the previous Work session transcript.

Never merge `feature/offline-safe-foundation` to `main` or push to `pages-build` without explicit user authorization after comprehensive testing.
