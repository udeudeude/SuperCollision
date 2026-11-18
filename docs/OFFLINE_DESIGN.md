# Offline-first development, staged safely

Status (14 November 2026): working opt-in offline pack and tests on the **isolated lab branch only**. GitHub Actions run 43631530605 passed Chromium offline reload and asset tests. Production is unchanged. The separate Cloudflare lab project and iPhone Safari tests are still outstanding.

## Existing functionality found in main

- Compositions are currently stored in localStorage, not a durable Files folder.
- File menu already exports .scd files and a JSON backup.
- Audio recording already exports a WAV file via browser download.
- Production has a manifest and no service worker. Experimental lab registers `lab-sw.js` only after user chooses **Make available offline** from File > Storage.
- Runtime binaries are compiled separately. The lab only caches them after explicit user approval, using a generated 8.0 MB manifest; no automatic large transfer on normal startup.

## Cellular download policy

The user's default preference is to avoid downloads larger than a normal text-only webpage when not on Wi-Fi. Use 1,000,000 bytes as a **provisional aggregate optional-download session budget** on unknown or cellular connections. A standalone policy module accepts consumed bytes, but comprehensive transfer measurement and enforcement are not yet connected. The laboratory instead proactively gates its known large downloads (engine, full language catalog and complete offline pack). A production implementation must track actual transferred bytes, avoid automatic large downloads, and offer explicit overrides. On iOS, browser network APIs cannot reliably distinguish Wi-Fi from cellular. Treat unknown connectivity conservatively. Service-worker registration, navigation, HTTP caching, and the initial app load can still incur network transfers, so never promise zero large cellular transfers.

## Files integration

iOS browsers can export .scd, .wav, and JSON files through user-mediated Save to Files. They cannot generally continuously write to a selected On My iPhone folder. Browser storage must not be presented as a durable substitute for Files backups.

## Safe implementation sequence

1. **Done:** Inventory runtime and create a manifest of 36 files (8,044,853 bytes). Cross-origin isolation works in local Chromium tests; actual Cloudflare deployment remains to test.
2. **Partly done:** Browser tests pass in Chromium, including offline reload. Real iPhone tests after app termination and phone restart remain.
3. **Done in lab:** Implement transactional, versioned, explicitly approved download of full offline pack. Runtime binaries are never preloaded without user consent.
4. Add explicit offline-resource download controls and aggregate download budget accounting.
5. Add IndexedDB working storage and a reliable export/restore path, with migration from localStorage.
6. **Experimental browser verification passed:** Offline loading is now available for the lab after opt-in. Do not enable it on production until Cloudflare and iPhone Safari checks pass.

## Rollback

The production main branch is unchanged by this branch. Do not merge until the offline build passes existing and new checks.
