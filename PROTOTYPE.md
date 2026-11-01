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
