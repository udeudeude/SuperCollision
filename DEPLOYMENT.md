# SuperCollision deployment

## What is automated

The GitHub Actions workflow **Prepare SuperCollision WebAssembly site** downloads a recent official SuperCollider WebAssembly CI artifact, verifies that both `sclang.js` and `scsynth.js` and a WASM binary exist, and packages a static site as the **supercollision-static-site** workflow artifact.

The action is intentionally separate from GitHub Pages: ordinary GitHub Pages cannot set the cross-origin isolation response headers required by threaded `scsynth`. The `_headers` file is recognized by Cloudflare Pages and similar static hosts, **not** by GitHub Pages.

## Deployment

1. Open the GitHub repository Actions tab, choose **Prepare SuperCollision WebAssembly site**, and run it (or inspect its automatic run). A green workflow is required before continuing.
2. Download the `supercollision-static-site` artifact and unzip it.
3. Upload the extracted site files to a **Cloudflare Pages** project via Direct Upload. Ensure the files, including `index.html`, `runtime/`, and `_headers`, are at the deployment root.
4. Verify the response headers COOP and COEP and test on the iPhone using **Check / boot engine**, then **Evaluate code**.

If the official upstream CI artifacts have expired or their archive layout changes, the workflow will fail explicitly instead of publishing an empty or fake engine. In that case build the official `webeditor` target from the SuperCollider `develop` branch with Emscripten 4.0.18 (see their `.github/workflows/build_wasm.yml`) and package its `wasm-dist` output.

## Compatibility

SuperCollision uses the upstream SuperCollider language and synthesis engines, not a custom language. Some browser-specific limitations remain in upstream, including filesystem and OSC network limitations. Source licenses: SuperCollider GPL-3.0, WASM bindings AGPL-3.0, sc-web AGPL-3.0. Preserve notices when distributing upstream binaries.

## Status

The repository has a tested Web Audio diagnostic, a persistent editor with .scd import/export, and a runtime bootstrap. The actual binary deployment and end-to-end playback have **not** been verified. A successful workflow and a hosted test are required to claim a working SuperCollider runtime.
