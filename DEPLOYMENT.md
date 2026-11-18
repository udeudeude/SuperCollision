# SuperCollision production deployment

## One production website

Production: https://supercollision.pages.dev/ (Cloudflare Pages project `supercollision`).

- GitHub source: `main`.
- Compiled deployment: `pages-build`, configured as the Cloudflare production branch.
- The WebAssembly runtime is committed to `pages-build`. Small frontend releases **must preserve it**.
- The historical `lab-build` preview was used to develop and test offline functionality. Its GitHub branch and the experimental source branch were retired after the user confirmed data migration. There was never a separate Cloudflare Pages project; any previously deployed preview alias is obsolete.

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

The user confirmed the unified production app works on iPhone and that wanted Lab compositions/recordings were backed up or transferred before experimental GitHub branches were retired.

Safari and installed Home Screen applications can use separate browser storage. Preserve the app's explicit user-initiated Files backups and Wi-Fi-first, consent-required download policy for large resources. Never clear website data merely to update the application.

Historical Lab previews may still exist as immutable Cloudflare deployments or aliases; they are no longer a development or production target. Do not delete or reconfigure the existing `supercollision` Cloudflare Pages production project.
