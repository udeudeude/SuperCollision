# SuperCollision Lab: live handoff record

**Checkpoint by completed operation, not elapsed minutes. Work credits may expire exceptionally quickly.** Start with browser-only tasks, beginning with creation of the separate Cloudflare Pages lab project. After each consequential browser-only action (especially an external setting or deployment), record the confirmed result and any required next action in this handoff and push once. For code-only work, commit coherent milestones rather than every edit. Never defer the first useful commit or status record until the end. Avoid repetitive administration that wastes Work usage. Never write credentials into this file; mark unverified items UNVERIFIED.

## Known-good separation (14 November 2026)

- Production Cloudflare Pages app: https://supercollision.pages.dev/
- Production source branch: `main`.
- Production compiled deployment branch: `pages-build`.
- Laboratory source branch: `feature/offline-safe-foundation`.
- Laboratory compiled deployment branch: `lab-build`, initially copied from `pages-build` to retain WebAssembly runtime.
- Laboratory publication workflow: `.github/workflows/publish-lab.yml`, only pushes `lab-build`. Latest confirmed full Chromium browser-tested lab publication: https://github.com/udeudeude/SuperCollision/actions/runs/44139413394 (SUCCESS, 17 November 2026). Documentation-only commits do not trigger lab redeployment.
- Draft source pull request (do NOT merge yet): https://github.com/udeudeude/SuperCollision/pull/1
- Experimental Cloudflare preview address: **https://lab-build.supercollision.pages.dev/**. User screenshots verified page loads online and initial in-session audio works offline. **Offline Safari reload and cold reopening are now user-confirmed PASSING as of 17 November 2026; standalone Home Screen app now loads and can play offline, but the first cold audio server boot occasionally stalls as of 17 November 2026.**
- Laboratory iPhone initial page load and in-session offline synthesis: **USER VERIFIED**; full offline reload and closing/reopening Safari **NOW USER-CONFIRMED WORKING**; standalone Home Screen boot/play works on a second attempt, but first cold audio server boot has an intermittent stall under investigation.
- **Experiment implemented and browser-verified:** opt-in 8.0 MB offline package, safe service worker caching, manual permission for first-time engine download, no automatic 1.5 MB catalog download. The first experimental website visit has no offline guarantee until the user explicitly installs an offline package.
- The browser test verified no large startup downloads, no engine download after declined consent, full offline-pack installation, offline reload, and cached WebAssembly engine assets in Chromium. **Real iPhone Safari results remain UNVERIFIED**.
- Latest tested lab offline manifest source version: `82a98dedf12757abb53e375fad97a649dcd45aab`, 37 files, 8,055,700 bytes. Lab deployment branch is independent of production.

## 17 November 2026: cold-start audio recovery hardening and trusted POWER gesture

- The source revealed an independent failure path: `requestServerBoot` could leave RUN disabled indefinitely if no success/failure marker arrived; a second POWER tap would silently do nothing.
- Added a 45-second startup watchdog with a console message recording the audio boot stage and the audio context's state. If the synthesized boot promise is still pending, it requests a close/reopen rather than starting overlapping servers; if not pending, POWER offers an explicit manual retry. Success/failure markers cancel the watchdog.
- Another concrete issue: `lab-offline.mjs` intercepted every POWER click (even with a verified local offline pack) and replayed it using synthetic `.click()` after an asynchronous storage lookup, which could lose Safari's transient user activation needed for audio. It now checks saved-package status ahead of time and lets the ORIGINAL trusted tap reach the engine. If no verified offline pack is known, any large runtime download still requires synchronous affirmative consent on the actual tap; approval is remembered only for this tab session. Thus Wi-Fi-only opt-in policy remains intact.
- Strengthened automated browser test: actual **AUDIO SERVER READY** marker must appear and RUN must become enabled; reaching only `Initializing language and audio server` is not sufficient. For a separate simulated Home Screen storage profile, the test verifies the first offline cold launch uses a **trusted POWER click** and reaches RUN enabled. No large assets auto-download, offline restart and the existing storage suite continue passing.
- **PASS and published to experimental lab only:** https://github.com/udeudeude/SuperCollision/actions/runs/44139413394. Key log lines: `Offline SuperCollider RUN enabled after audio boot`, `Isolated Home Screen-style cold offline audio RUN enabled`. Lab offline manifest version `a92ff8548433a4a6ce507c8c085aff18c8b10af9`, 37 files / 8,079,438 bytes. Production `main` and `pages-build` unchanged.
- This is a **plausible fix and improved recovery**, not proof that the user's first cold Home Screen launch is reliable. Needed real-device follow-up: open the Home Screen lab while online to receive changed small HTML/JavaScript (no explicit ~8 MB download necessary), then Airplane Mode with Wi-Fi off, fully close/reopen the standalone app, press POWER and RUN. If startup stalls again, leave app open 45 seconds; report the status and console boot-stage/audio-context message. Do not clear website data or delete the Home Screen icon; local compositions/backups are separate from Safari.

## 17 November 2026: real iPhone post-restart offline acceptance and first-boot stall

- **Real-device test after iPhone restart, Airplane Mode enabled, Wi-Fi off** (user screenshot around 12:17 local): SuperCollision launched from Home Screen icon, loaded a saved composition, language initialized (`Welcome to SuperCollider 3.15.0-dev`, `-> localhost`), but remained at **STARTING AUDIO SERVER · RUN unlocks when ready** and RUN was disabled. The precise waiting duration was not provided.
- User then opened the laboratory website in Safari while still offline; POWER, RUN, and sound playback all worked. User returned to the Home Screen app, fully closed and reopened it while still offline; this time POWER/RUN and playback also worked. Only after these successful tests did the user disable Airplane Mode.
- Thus **Safari offline restart and Home Screen offline launch/playback on the second attempt are user-confirmed**, but **first Home Screen cold boot is intermittently stuck**. This is not an offline cache failure. Do NOT mark uninterrupted first-try boot reliable or assume audio engine startup issue solved.
- Source investigation: `requestServerBoot()` sets `serverBootRequested=true` and disables RUN until the language prints the success or failure marker. If neither arrives, there is no timeout and subsequent POWER taps silently do nothing. This is a recoverability problem independently of the underlying startup stall.
- WebKit reports intermittent AudioContext suspension and failed resumes on iPhone, including standalone web apps (https://bugs.webkit.org/show_bug.cgi?id=291892, https://bugs.webkit.org/show_bug.cgi?id=263627); these are plausible related platform issues, not confirmed as this project's exact cause.
- Keep experimental-only changes isolated to `feature/offline-safe-foundation` and published lab branch. Preserve separate Safari/Home Screen local storage, Files backups, and manual Wi-Fi consent for large downloads.

## 17 November 2026: tentative Home Screen offline success

- After the new standalone-specific offline setup was published, the user reported **"Seemed to work!"** following the requested Home Screen offline test. Treat this as **encouraging user-reported provisional success**, not as definitive verification of every step (cold app restart, actual audible POWER/RUN/STOP, persistence after phone restart), since no individual outcomes were specified.
- Earlier Safari offline reload, Safari close/reopen, and manually re-entering the URL offline were already user-confirmed working.
- Next useful acceptance check, without resetting app data: with Airplane Mode enabled and Wi-Fi off, fully close the Home Screen app, relaunch via its icon, confirm editor loads and POWER/RUN produces audible synthesis, and STOP silences it. Later test once after restarting the iPhone. Retain separate Safari/Home Screen Files backups and Wi-Fi-only opt-in for large downloads.
- Do not claim Home Screen cold start or device restart fully verified until explicit user confirmation; do not modify production branches.

## 17 November 2026: Safari offline confirmed; Home Screen storage isolated

- **New real iPhone result:** user reports offline reload in Safari succeeds, fully closing and reopening Safari succeeds, and completely closing the page then pasting the URL into Safari while offline succeeds. This supersedes earlier Safari reload failure entries. **Home Screen-installed web app still fails offline** (exact error message not yet captured).
- Authoritative Apple WebKit documentation confirms standalone Home Screen web apps run with separate website data, including Cache Storage and localStorage. Apple WebKit 17.2 documentation states no local storage other than initial login cookies is transferred from Safari into a newly installed Home Screen app. Therefore, Safari's already-installed offline pack and locally saved compositions must not be assumed present in the Home Screen app. Relevant Apple: https://webkit.org/blog/14787/webkit-features-in-safari-17-2/ and https://developer.apple.com/videos/play/wwdc2023/10120/.
- Existing lab manifest already has `display: "standalone"` and suitable start/scope; no manifest identity change is needed (avoid changing web app identity and stranding user storage).
- Added a **standalone-only, nonblocking setup prompt** on an online Home Screen launch when that app's own saved pack is absent. The prompt explicitly states Safari and Home Screen store compositions/offline files separately. A **Save offline files** button calls the original opt-in, verified package installation; an explicit ~8 MB Wi-Fi/cellular consent is still required, and no large resources are fetched automatically. **Later** dismisses for the session. STORAGE menu also shows the separated-storage message in standalone mode.
- Browser test with separate persistent browser profile simulating `navigator.standalone=true`: verifies no automatic runtime/catalog download on launch, distinct empty Cache Storage, user-initiated opt-in installation, offline reload, and full offline browser-process restart in the standalone profile.
- **PASS and published to experimental lab only:** https://github.com/udeudeude/SuperCollision/actions/runs/44128452345 (17 November 2026). Log: `Isolated Home Screen-style setup and offline cold restart passed`. Lab pack manifest version `9924237d60c1b9c88d5814ce69edf269085aa6d6`, 37 files, 8,077,247 bytes. Source test suite also passed earlier Safari redirect/Chromium cold restart. Production main/pages-build unchanged.
- **Device acceptance NOT YET VERIFIED.** Next user action: while connected to Wi-Fi, open the **Home Screen icon itself** (not Safari). If banner appears, choose Save offline files and approve only on Wi-Fi. Otherwise use FILE > STORAGE > Make available offline **inside the Home Screen app**. Then Airplane Mode with Wi-Fi off, close and reopen Home Screen app, press PWR/RUN, confirm audio. Do not delete Home Screen icon, clear website data, or treat Safari's compositions as shared. If standalone app does not open even while online, ask for screenshot; if it opens online but fails after installing pack, request FILE > STORAGE > Check offline readiness run *inside the Home Screen app*.
- To move compositions between Safari and Home Screen app, user manually exports Backup all compositions to Files in Safari and Restore backup within Home Screen app. The app does not silently synchronize the two sandboxes. Audio recordings also require explicit Files backups.

## 16 November 2026: iPhone Safari redirect discovery and adjustable workbench

- User provided real Safari Airplane Mode screenshot with the explicit error: `Response served by service worker has redirections`. Earlier online readiness showed service worker active, page controlled, saved package found, essential cached files 11/11, and isolation yes. Thus cached-file presence was not the blocker: redirected cached navigation was rejected by Safari. The screenshot also showed the editor's long `EVALUATED L1-758...` message clipped, and console history not following new output as desired.
- Fixed `lab-sw.js` to convert redirected HTML responses into clean 200 responses, retaining required cross-origin isolation headers and stripping invalid transport headers. Applies both to new packages and legacy saved redirected HTML: the goal is a *small service-worker-only update*, not automatic redownloading of the ~8 MB engine.
- When online, an already-installed service worker now checks for a new small `lab-sw.js` script. No large optional resources are downloaded automatically.
- Engine status can now be swiped horizontally or tapped for a full wrapping modal message.
- Console automatically follows new output until the user manually scrolls away; a visible `Latest output` control resumes following, and scrolling back to the bottom also resumes. The scrollable element is the console PANEL, not the inner `pre` alone.
- Added an accessible draggable editor/console divider, shown in CONSOLE view only. Touch/pointer dragging changes the proportions, double-tap resets, arrow keys work, and the ratio persists in localStorage across reloads. Other lower-panel types remain unchanged pending device feedback.
- **Browser test passed and published:** https://github.com/udeudeude/SuperCollision/actions/runs/43975891638. Chromium verifies intentional `/index.html` redirects are normalized while preserving isolation, a simulated legacy redirect can be served offline, editor and engine initialize offline, and browser cold restart passes; also tests status dialog, console follow control and resized/persisted divider. Lab manifest version: `b90afa220376b548797534248b3d80e9f7daf83c`, 37 files / 8,073,173 bytes.
- Production `main` and `pages-build` unchanged after publishing. **Real Safari Airplane Mode reload and cold restart still require retesting; do not claim fixed on-device.**
- Next user test: while on Wi-Fi reload `https://lab-build.supercollision.pages.dev/` to acquire updated small service worker; no need to clear website data or proactively download 8 MB. Then Airplane Mode with Wi-Fi separately off, reload, try closing/reopening Safari. If offline works, test PWR/RUN/STOP. Separately tap truncated console-bar status for full text, and drag the grip visible in CONSOLE view. Preserve compositions by exporting to Files.
- If Safari still reports redirects, inspect which response URL is rejected; consider normalizing *all* navigation responses and confirming service-worker activation. Do not purge caches or user files without a safe backup.

## iPhone File menu visibility and offline diagnostic fix — 15 November 2026

- User iPhone screenshots show FILE > STORAGE expanded with controls below the menu scroll boundary, requiring undiscoverable scrolling. Tapping **Check offline readiness** closed FILE without showing any result.
- Root causes confirmed in source: the File drawer had a fixed maximum height and did not scroll its selected category into view. The shared File click handler closed the drawer for every button except a small allowlist, including **Check offline readiness**; an asynchronously shown `alert()` could be suppressed by Safari.
- Fixed all File subsections with an automatic focused category view and an explicit **All FILE sections** back button. Active section gets the available iPhone viewport height; unrelated sections are hidden while focused. True HTML `hidden` controls (including recovery actions) now stay hidden.
- The readiness check now writes a persistent inline report in FILE > STORAGE, checking the worker, controller, stored package, essential cached files, and isolation using only local Cache Storage. The diagnostic no longer calls `alert()` and never downloads resources.
- Mobile Chromium browser test confirms focused STORAGE controls fit, the back button restores categories, the diagnostic remains visible after tap, and zero network requests are made by the diagnostic. Successful lab publishing test: https://github.com/udeudeude/SuperCollision/actions/runs/43733951957.
- Added a further experimental change to fetch only small, root-level scripts/styles from the network when online, falling back to cached versions when offline. Large synthesis runtime and the 1.5 MB catalog remain opt-in. Combined Chromium tests **PASSED**: https://github.com/udeudeude/SuperCollision/actions/runs/43734172484. This published lab source version `244c4a505c89ebc52a549e39ce4f42ab39a0c98a` (37 files, 8,060,914 bytes).
- Current iPhone offline reload/reopen failure remains **UNRESOLVED**. The next practical test is to reload on Wi-Fi and tap Check offline readiness, then send a screenshot of the inline report. Do not clear browsing/site data or delete compositions.

## Follow-up: WebKit cache readback diagnostics — 15 November 2026

- Lab service worker and offline UI now use standard URL string keys for Cache API reads/writes (instead of raw URL objects), prioritize cached navigation when offline, and tolerate eviction of nonessential entries.
- Critical finding from Linux Playwright WebKit (NOT actual iPhone Safari): the browser accepted a package installation and left named CacheStorage containers, but their entries were unreadable even before the offline reload. This causes an offline navigation error. Playwright has a documented WebKit cache-persistence issue; these findings cannot be assumed to reproduce Apple's shipping Safari precisely.
- **Correctness safeguard implemented:** after writing a new offline pack, the service worker independently reads the cache/essential files back before declaring success; it restores the previous cache pointer and deletes the incomplete new pack if validation fails. The UI also independently rechecks status before showing success. The new WebKit diagnostic now correctly reports installation failure rather than falsely announcing success.
- Separate diagnostic workflow: `qa/lab-webkit-restart-test.mjs` and `.github/workflows/lab-webkit-restart.yml`; most recent WebKit result `43728983279` failed as expected with: `Offline package was written but could not be verified. Previous saved copy retained.` This is an informative platform diagnostic, not a production blocker.
- Chromium publication gate **PASSED**: https://github.com/udeudeude/SuperCollision/actions/runs/43728979858. Verified package install/readback, offline reload, shutdown/restart with persistent profile, cache-entry eviction resilience, engine initialization. Production branches `main` and `pages-build` remain unchanged after publication.
- **NEXT USER ACTION (Wi-Fi only):** Open/reload lab, select File > Storage > **Check offline readiness**, send a screenshot of that diagnostic. Do not clear website data, and do not reinstall the ~8 MB pack until necessary. Also distinguish a Safari "cannot connect" screen from a loaded editor whose POWER/RUN fails. Once diagnostic is understood, deliberately approve any large new offline download on Wi-Fi.
- Offline restart on user's actual iPhone is still **UNRESOLVED**. Do not call the application reliably offline-first until the user can reload and reopen Safari without connectivity.

## Offline reload/cold start failure report and hardening — 15 November 2026

- **Important correction:** user reported that the previously successful offline playback **does not survive reloading the page or completely closing and reopening Safari**. This supersedes the earlier broad statement that the instrument was fully usable offline. Offline audio in an already-running page worked; reliable offline restart on the user's actual iPhone is **NOT VERIFIED and currently reported as failing**.
- Exact symptom after reopening (native Safari offline error vs app shell opens without audio) remains **UNDETERMINED**. Ask for a screenshot or a precise distinction before claiming a root cause.
- Read Apple WebKit guidance: service workers can be terminated between page visits, and Cache Storage can be evicted. No browser-only solution can guarantee storage persistence across all iPhone circumstances.
- Experimental lab service worker now prepares the cached navigation before attempting network access, bypasses that attempt when the worker reports offline, and no longer invalidates the entire saved package if a nonessential entry is evicted. This is robustness hardening, **not an established iPhone fix**.
- Added File > Storage > **Check offline readiness**, a network-free check of worker registration, page controller, essential cached files, and cross-origin isolation.
- Added Chromium persistent-profile test: register and install the offline copy, reload offline, completely close Chromium, reopen using the same on-disk profile while still offline, check editor and engine initialization, then delete a noncritical cached icon and confirm the application still loads.
- GitHub Actions run https://github.com/udeudeude/SuperCollision/actions/runs/43728266000 **PASSED** for experimental lab publication with new checks. A separate WebKit-based test is in progress or should be checked via `.github/workflows/lab-webkit-restart.yml`; WebKit on Linux is not a substitute for Safari on the user's iPhone.
- Remain on experimental `feature/offline-safe-foundation` / `lab-build` only. The working production site must not be modified.
- Next user test **only on Wi-Fi**: back up any irreplaceable compositions via Files, reload the lab to get the changed service worker, choose Make available offline and approve the approximately 8 MB update, then use Check offline readiness. Try Airplane Mode reload and complete Safari restart. Do not clear website data.
- If still failing, capture what Safari shows on reload and whether the entire page fails or only engine/audio. This directly determines whether to investigate worker/scope/cache persistence or cached page headers and WebAssembly initialization.

## iPhone offline synthesis success — 15 November 2026

- After installing the updated offline package and following the Airplane Mode retest instructions, the user reported **"Worked!"**. This is user-reported confirmation of the immediate offline editor/POWER/RUN/STOP test, including audible synthesis as requested in the test steps, not a separately instrumented device measurement.
- The earlier offline POWER failure is therefore resolved on the user's iPhone in the tested session. The experimental preview remains the test environment; production remains unchanged.
- Remaining device resilience tests: reopen the application after fully closing Safari and after an iPhone restart, both offline; verify existing compositions remain accessible; test Save to Files and audio exports as user-mediated backups. Do not claim these tests have passed until user verifies them.
- Never tell the user to clear browser website data or delete the offline pack as a routine update step, since that can endanger locally saved compositions.

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
