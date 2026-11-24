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

- **In review:** preserve the same Sounds Library audio element and playback object URL when favoriting, renaming or searching without removing the sound; regression coverage in `qa/sounds-browser-test.mjs`.
- **Next:** reconcile the LibriVox preview in pull request #25 with Sounds navigation and storage, including honest labeling of estimated phrase locations and explicit network consent. Avoid making parallel edits to its active branch.
- **Then:** remove outdated Build/version labels and misleading navigation hierarchies where they can be fixed without touching the frozen Code environment. Compare Sounds, Generate, Discover and the native Instrument Bench as one musical workflow.
- **Device gate:** first audible tone, latency, keyboard, and touch interactions on physical iPhone Safari must be verified separately; browser-based SuperCollider smoke is not equivalent to speaker output.
- **Follow-up:** performance-friendly auditioning of multiple saved clips and explicit handling of intentionally filtered-out/deleted playing media; do not load external audio without permission.

Scope: documents and Sounds Library only for the current proposal. Other simultaneous Code, Mix, offline and LibriVox work remains independently owned.
