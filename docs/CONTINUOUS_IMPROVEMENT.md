# SuperCollision: continuous improvement charter

This is a durable decision record for small, independent, testable improvements. It is not permission to redeploy the app every hour or to churn features for activity's sake.

## Product principles

1. **Musical immediacy.** Hearing, shaping, making, finding and understanding sounds take priority over account setup, diagnostic panels and interface ornament.
2. **Sound design judgment.** Reject merely serviceable work. Reduce confusion, visual competition, and unnecessary choices. Preserve successful interaction patterns.
3. **One instrument, not disconnected utilities.** Code is the central compositional environment. Sounds is the collection and acquisition workspace; a source such as LibriVox is a discovery method, not an unrelated application.
4. **Truthful behavior.** Distinguish actual SuperCollider synthesis from browser preview audio, editable source from generated source, and estimated text-to-time position from verified timing. Never silently discard user edits.
5. **Continuity.** Navigating, filtering, favoriting or renaming should not interrupt an ongoing audition unless the sound is explicitly removed or changed. Audio source objects and license provenance are user data.
6. **Native mobile behavior.** Touch targets, keyboard, editor visibility, scrolling, physical iPhone audio, accessibility and offline state are release concerns, not follow-up decoration.
7. **Conservative integration.** Preserve Code, live audio engine, user data, stored schemas, licensing, permissions and default Wi-Fi-only downloads. No image generation without explicit request.
8. **Evidence over appearance.** Inspect current main, branches, active pull requests and workflows; reproduce a specific failure; test the exact commit; be clear about what has *not* been verified.

## Hourly operating loop

1. Read GitHub's current main and active work before touching code. Do not duplicate open pull requests.
2. Choose one high-value defect or coherent improvement. Prefer removal of a real interruption, ambiguity or failure over cosmetic restyling.
3. Work on an isolated branch; retain exact upstream state, and never overwrite a collaborator's branch.
4. Add a regression test that fails on the old behavior where feasible; run syntax and relevant browser/native checks. A remote workflow is not a physical-device test.
5. Keep changes unmerged until verified. Do not bypass frozen Code and deployment safety gates.
6. Update the backlog with what was finished, what still needs real-device verification, and the next most valuable problem. A blocked run should create no meaningless commit.

## Prioritized backlog (2026-11-24)

- **Combined review:** the isolated `sounds/cohesive-integration-20261124` branch combines the LibriVox explorer (#25), consent-first preview and Sounds link (#34), Library playback continuity (#30), draft-safe Generate (#31), microphone release (#32), and visible Import results (#33). Preserve original branches until this combined candidate is tested.
- **Immediate verification:** test the combined implementation with Sounds browser acceptance and actual compiled SuperCollider runtime, plus LibriVox mobile search, consent, region selection, extraction and navigation tests. Passing tests on independent branches are not sufficient.
- **Interface review:** LibriVox discovery is now reachable from Sounds, but still uses a separate page. Assess a unified workspace instead of duplicating acquisition interfaces.
- **Device gate:** verify on physical iPhone Safari: recording, microphone release, editor keyboard, saved playback continuity, network consent, reader filters, extraction, storage and audio output.
- **Release gate:** the isolated atomic-publisher proposal stages Sounds and LibriVox together, refreshes the opt-in offline asset index, runs both browser suites plus the compiled runtime smoke, and coordinates with the main UI publisher without cancellation. Validate this release workflow on its own pull request before including it in integration #35. Cloudflare preview failures and physical iPhone Safari testing remain open; do not merge or publish automatically.
- **Further:** examine performance-friendly auditioning of multiple sounds and intentional removal of a playing filtered row.

Scope: Sounds and LibriVox interface files, regression tests and this charter. No changes to the Code page, sound engine, stored schema or offline/cellular download default.
