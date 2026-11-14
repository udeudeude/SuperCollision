# Offline-first development, staged safely

Status: design and standalone policy module only. **Not enabled on the deployed application.**

## Existing functionality found in main

- Compositions are currently stored in localStorage, not a durable Files folder.
- File menu already exports .scd files and a JSON backup.
- Audio recording already exports a WAV file via browser download.
- The app has a web manifest, but the current deployment build does not install a service worker.
- Runtime binaries are compiled separately; never precache them without size and startup testing.

## Cellular download policy

The user's default preference is to avoid downloads larger than a normal text-only webpage when not on Wi-Fi. Use 1,000,000 bytes as a **provisional per-resource ceiling**, not a guarantee or a session-wide budget. A production implementation must track aggregate transfer size, avoid automatic large downloads, and offer explicit overrides. On iOS, browser network APIs cannot reliably distinguish Wi-Fi from cellular. Treat unknown connectivity conservatively. Service-worker registration, navigation, HTTP caching, and the initial app load can still incur network transfers, so never promise zero large cellular transfers.

## Files integration

iOS browsers can export .scd, .wav, and JSON files through user-mediated Save to Files. They cannot generally continuously write to a selected On My iPhone folder. Browser storage must not be presented as a durable substitute for Files backups.

## Safe implementation sequence

1. Inventory all runtime assets and their transfer sizes; check cross-origin isolation and WebAssembly fetch paths.
2. Add automated tests for the download policy and offline reload; test iOS after full browser termination and phone restart.
3. Implement versioned, opt-in, small-shell caching in a separate branch. Do not cache audio, compiled runtimes, or models automatically.
4. Add explicit offline-resource download controls and aggregate download budget accounting.
5. Add IndexedDB working storage and a reliable export/restore path, with migration from localStorage.
6. Enable offline loading only after browser and iPhone validation. Never silently switch production to a new service worker.

## Rollback

The production main branch is unchanged by this branch. Do not merge until the offline build passes existing and new checks.
