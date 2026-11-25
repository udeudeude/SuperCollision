# Release versioning

`app-version.json` is SuperCollision's canonical public release identifier.

Every user-visible production release increments this version. Use the next minor version for substantial functionality or interface changes, and a patch version for smaller fixes. Purely internal experiments and test-only commits need not advance the public version.

Code, Sounds, the Instrument Bench (both entry points), and LibriVox must display the same version. Use the unobtrusive `v2.9` form in the interface; do not reinstate a separate BUILD badge or a competing standalone Sounds version. Asset cache query parameters are distinct from the public release identifier.

Run `node qa/release-version-test.mjs` before publication. Both production publication workflows execute that check. The test enforces consistency; the author of a release remains responsible for advancing `app-version.json` whenever a new visible release is prepared.
