# SuperCollision prototype 0.1

This first milestone is a mobile-browser audio and editing diagnostic, **not** a SuperCollider runtime. The Play button generates a 440 Hz sine tone through Web Audio; it does not evaluate the code editor.

## Testing

1. Serve `index.html` over HTTPS, for example with GitHub Pages configured to deploy the root of the default branch.
2. Open on an iPhone and tap **Play test tone**. Verify sound and Stop.
3. Edit the scratchpad, reload, and confirm text persists.
4. Report the browser/device and any errors shown in Diagnostics.

## Compatibility milestone

The intended product must execute existing SuperCollider code, not silently substitute a partial language or approximate synthesizer. Before adopting code from sc-web, audit its execution mechanism, transitive licenses, and required services. Keep AGPL-3.0 obligations intact for any reused sc-web code. The current diagnostic contains no copied sc-web code.

## Next engineering step

Identify sc-web's actual execution engine and its browser/runtime dependencies, then port that engine and build a minimal true SuperCollider evaluation test. Do not label Web Audio diagnostic output as SuperCollider execution.

## Findings from the upstream WASM documentation

The actual runtime is the official SuperCollider WebAssembly port (sclang and scsynth), not an independently implemented interpreter. The upstream README_WASM.md documents the OSC bridge and its limitations. The sc-web frontend calls `bootInterpreter`, `runCode`, `sendOsc`, and `scsynth.boot`.

**Critical hosting requirement:** scsynth uses pthreads / SharedArrayBuffer and therefore needs cross-origin isolation via `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Ordinary GitHub Pages does not permit custom response headers. A suitable static host with configurable headers, or a carefully tested isolation service worker, is required before this can be advertised as functional on Pages.

**Runtime artifacts:** obtain matching sclang/scsynth JS, WASM and any .data/worker/worklet sidecars from the upstream SuperCollider WebAssembly CI or reproducible build. Place them under `runtime/` preserving expected relative paths. Merely copying JS loaders is not sufficient.

**Licensing:** sc-web is AGPL-3.0; upstream SuperCollider core is GPL-3.0 and its WASM bindings AGPL-3.0. Preserve upstream notices and use AGPL-3.0 for derivative frontend code; verify license compatibility and source-offer obligations when bundling binaries. Do not presume an -or-later grant.

**Current milestone:** mobile Web Audio hardware test, local scratchpad, .scd import/export, WASM bootstrap wiring and actionable diagnostics. Actual SC execution remains blocked by binary acquisition and cross-origin-isolated hosting.
