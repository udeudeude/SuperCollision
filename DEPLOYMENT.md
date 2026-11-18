# SuperCollision production deployment

## One production website

Production: https://supercollision.pages.dev/ (Cloudflare Pages project `supercollision`).

- GitHub source: `main`.
- Compiled deployment: `pages-build`, configured as the Cloudflare production branch.
- The WebAssembly runtime is committed to `pages-build`. Small frontend releases **must preserve it**.
- The historical `lab-build` preview was used to develop and test offline functionality. It is a branch preview of the same Cloudflare Pages project, not a second project.

## Tested routine updates

The `.github/workflows/publish-ui.yml` workflow runs when the source on `main` changes. It checks out the existing production build and overlays the updated frontend, preserving `runtime/sclang` and `runtime/scsynth`. It then:

1. Rebuilds the optional language catalog from upstream documentation.
2. Regenerates the application icons.
3. Generates `lab-offline-assets.json` with `scripts/build_offline_manifest.py`, validating every required runtime file and its size.
4. Verifies the no-unapproved-large-download policy.
5. Runs Chromium browser regression tests that install the full offline pack and verify offline reload, audio-server readiness, and standalone-style cold reopening.
6. Only after tests pass, commits the compiled result to `pages-build`, triggering the production Cloudflare Pages deployment.

The offline files retain their historical internal `lab-*` filenames to avoid unnecessary rewrites of working service-worker, cache, and storage logic. They are production features, not an independent application.

## Full runtime builds

`.github/workflows/prepare-site.yml` compiles the official SuperCollider WebAssembly runtime and uploads a complete static build artifact; it now includes the same offline files and manifest. Running it is expensive and normally unnecessary for frontend changes.

## Cloudflare Pages settings

Use the existing Git-connected **Pages** project, not a new Worker.

- Repository: `udeudeude/SuperCollision`
- Project: `supercollision`
- Production branch: `pages-build`
- Framework preset: `None`
- Build command: `test -f runtime/sclang/sclang.js && test -f runtime/scsynth/scsynth.js`
- Build output directory: `.`
- Root directory: repository root (blank)

`_headers` supplies cross-origin isolation headers required by the audio runtime. Do not alter the production branch setting or delete the project while cleaning up the lab preview.

## iPhone acceptance and data preservation

The main address and the former lab preview are **different origins with separate browser storage**. Safari and installed Home Screen web apps may also have separate storage.

Before deleting a lab icon, branch, or preview deployment:

1. In each lab installation holding irreplaceable work, export **FILE → STORAGE → Backup all compositions** and any recordings to the iPhone Files app.
2. Open the main website, install its approximately 8 MB offline pack only with explicit consent on Wi-Fi, and test POWER, RUN, STOP, offline reload, and Home Screen cold reopening.
3. Restore laboratory compositions into the appropriate main installation from the Files backup; verify the contents.
4. Retire old lab deployments only after the user confirms main-site success and the required exports.

Do not clear website data as an update mechanism. The main application's existing origin and installed Home Screen identity should remain stable.
