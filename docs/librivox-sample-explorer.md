# LibriVox Sample Explorer: isolated SuperCollision Sounds feature

Status: design and technical contract (2026-11-23). This branch is intentionally **not** wired into production `sounds.html`, `index.html`, or the separately evolving Sounds Instrument Bench.

## Placement

Sounds > Recordings & Samples > Discover > **LibriVox**.

The user should see a sound-discovery instrument, not a conventional audiobook catalog. Search, audition, locate words, trim a sample, save it, and return to Sounds without losing work. Keep the Code page untouched.

## Search and favorites

- One prominent search field. Search catalog by title and author; show clearly named author, reader, language, and genre filters wherever underlying data supports them.
- Readers are attached to individual sections, not necessarily entire books. A book with several readers must show correct per-chapter credits.
- Favorite **authors**, **readers**, **books**, **passages**, and **extracted samples** independently, using stable catalog identifiers where provided; names are display labels, not identity keys.
- First-class acceptance cases: author George MacDonald and reader Peter Yearsley. A favorite reader is a browse/filter action, not only an inert bookmark.
- Do not imply LibriVox provides full-text phrase search or arbitrary voice-quality search. These require separate indexes.

## Text-guided phrase location

1. Open a recording and associate it with matching source text (prefer the exact edition and chapter; inspect book text-source links and suitable public-domain editions; allow correction where needed).
2. Searching a phrase returns every occurrence with surrounding text, preserving original text and highlighting the match.
3. Select an occurrence to jump near the corresponding point in **that chapter's** audio. A first estimate is the phrase's fraction of the relevant chapter text multiplied by chapter duration. Visibly label this **Approximate**, not synchronized. Do not misleadingly use the fraction of an entire novel to seek a single chapter.
4. Show the text and audio controls together; scrolling the text must not disrupt playback or selection. Provide jump back/forward, play/pause, and audio region handles.
5. When the user identifies an actual timestamp, store a local text/audio anchor for that book edition + recording section. Interpolate between verified anchors to improve later estimates. Distinguish estimates from verified positions.
6. If the source text is mismatched, chapter mapping fails, or no text exists, report this and offer manual reading/navigation, not false precision.
7. Once selected, save a non-destructive region and its original work, author, reader, chapter, source URL, attribution, license and timing metadata to the existing Sounds storage format. Never silently replace the original recording.

## Implementation boundaries

- Own new feature modules, such as `librivox-*.mjs`, an isolated preview, and dedicated tests. Avoid edits to `index.html`, `sounds.html`, `sounds-bench-preview.html`, and `sounds-bench-*.mjs` until integration.
- Reuse existing sample store and native sample-region workflow **at integration time**, rather than creating a second permanent sample collection.
- **Reader search parity with LibriVox's own website is a requirement**, not a nice-to-have. The website's general and advanced searches both support reader name, and reader pages enumerate that person's recordings (e.g. Peter Yearsley: https://librivox.org/reader/167). The public audiobooks API does not document a reader search parameter, so investigate catalog search integration, reader-page indexing or a responsibly cached independent reader index. Never silently substitute a partial reader filter for comprehensive search. Use stable reader IDs and correct section-level credits.
- Use LibriVox's documented catalog feed and per-section metadata (request `extended=1` when needed). The audiobooks API supports author/title/genre queries, but its search parameters do not match the full website's search features.
- As of 2026-09-26, LibriVox limits feed requests to at most 500 items. Avoid bulk crawling on each page open, and respect its server load. Prefer cached, incremental indexes if broad reader searching is implemented.
- Verify cross-origin browser access and audio decoding/range support on a real deployed preview, especially iPhone Safari. An HTML audio element playing a remote file does **not** guarantee downloadable/croppable bytes are accessible to browser JavaScript. Provide a safe fallback and label any unavailable extraction.
- Do not fetch optional audio or large text automatically over cellular. Streaming previews initiated by a user should be clear, and offline acquisition should respect the project's Wi-Fi-first policy.
- Treat LibriVox audio as United States public domain, while preserving bibliographic provenance and accounting for jurisdictions or associated texts with different rights.

## Delivery and collision prevention

1. Implement and test text matching, estimated seeking, anchor correction, and favorites as pure/reusable modules on this branch.
2. Build an independently testable LibriVox search + text + player preview that proves catalog connectivity, exact reader attribution, source-text matching, and mobile interactions. Verify production-relevant network permissions, error cases and accessibility.
3. Add clip extraction and write via the existing Sounds library abstraction when that integration contract stabilizes.
4. Only after the Sounds redesign's current branch has landed, rebase this isolated feature, add the **LibriVox** discovery entry point to Sounds, run full checks, and merge. Coordinate with the Sounds thread before touching shared files.

## Release gates

- Author MacDonald finds actual works; reader Yearsley is favoritable and retrievable, with section-level attribution correct.
- Search multiple text occurrences, jump approximately within the correct chapter, correct an anchor and observe improved estimates.
- Mobile layout keeps the target sentence and nearby audio controls visible without page zoom or accidental loss of selection.
- Audio audition and clip boundaries do not inadvertently start/stop another Sounds instrument.
- Favorites persist across reloads and can be exported/restored in the existing Sounds backup once integrated.
- Network and decoding failures are explicit. No fabricated playability, coverage, exact-sync claims, or successful clip saves.
- The main Code page remains unchanged; current Sounds work continues independently.

## References

- LibriVox API: https://librivox.org/api/info
- 2026 catalog rate-limit announcement: https://librivox.org/2026/09/16/librivox-api-update/
- Project Gutenberg catalog guidance: https://www.gutenberg.org/ebooks/offline_catalogs.html
