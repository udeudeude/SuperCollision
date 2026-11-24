# Sounds and LibriVox: reach-first interaction design (v0.6.0)

## Governing asymmetry
**The top is easier to see; the bottom is easier to reach.** Do not treat these
as interchangeable. This instruction outranks visual symmetry or habitual
desktop layout patterns.

## What musicians need to do
1. **Recognize** where they are, which original or instrument is selected, and
   whether the sound engine is ready, playing, or in error.
2. **Hear first.** Audition saved audio independently of a SuperCollider buffer
   transfer. Compare the original to the instrument without conflating them.
3. **Understand cause and effect.** Keep runnable source, waveform, envelope,
   frequency, sample boundaries, and true recorded amplitude in the viewing
   area. A visualization must be derived from actual sound/code, not invented.
4. **Act comfortably.** Put Run, Stop, Record, Select, Generate, Search, Make,
   Save, Locate, Extract, and Back within bottom thumb reach.
5. **Recover safely.** Cancel ongoing transfers, retry errors, return from tools,
   preserve creations and original files. Never suggest a recording is corrupt
   because the SuperCollider server failed to acknowledge buffer allocation.

## Implementation
- Sounds: three bottom navigation tabs; a contextual action dock directly above.
  The title, engine state, selected sound and editor/waveform are higher up.
- Saved recordings: an actual local waveform from bounded browser audio
  decoding, scrubbable by pointer or arrow keys, plus a native audio player
  in the lower dock. Playback is only initiated by the user. Waveform drawing
  is skipped for long or unsupported files rather than showing fake data.
- Sample instruments: Make when not loaded, Play/Stop/Save once loaded.
  Acquisition methods are available from the dock, not as a top-of-screen menu.
- Library: Search and filter within reach; actual sound collection remains
  scrollable, with destructive operations in secondary menus.
- Acquisition tools: The existing record, import, code submit, generate, and
  search controls are moved, not duplicated. A modal return action is at
  the bottom, not the top.
- LibriVox: results and visible chapter text occupy the main area; search
  controls remain reachable at the bottom. The chapter player remains present
  while the lower tool panel switches between Listen, Locate and Extract.
  Download permission remains explicit and near the extraction action.
- During code typing, temporarily reclaim the action/navigation dock's space
  for the editor. It returns when the code editor loses focus.

## Research informing decisions
- Apple's *Designing for iOS*: people more comfortably reach the middle and
  lower part of the display; keep tasks focused and secondary actions available.
  https://developer.apple.com/design/human-interface-guidelines/designing-for-ios
- Apple's *Toolbars*: distinguish navigation from actions, avoid overcrowding,
  make primary action singular and understandable.
  https://developer.apple.com/design/human-interface-guidelines/toolbars
- Nielsen Norman Group, *Mobile Website and Application Usability*:
  navigation, touch target placement, forms, overlays, feedback and search.
  https://www.nngroup.com/reports/mobile-website-and-application-usability/
- Ableton Live 12 *Clip View*: actual waveform, sample boundaries and
  envelopes are working representations rather than decorative media.
  https://www.ableton.com/en/manual/clip-view/

## Guardrails
- Never alter the main Code page, shared sound store schema, or original audio.
- No automatic recording playback, cloud/audio downloads, or generated-code
  execution. Preserve the explicit Wi-Fi/connection consent.
- The dedicated browser audio element is only an audition of the saved original,
  not an alternate sample synthesizer. Native SuperCollider owns instruments.
- Changes to existing controls must preserve their identity and event handlers.
- Maintain visible v0.6.0 on both playtest surfaces.
- Do not claim actual iPhone, microphone, playback, or provider verification
  from static and simulated tests alone.

## Device verification needed
1. iPhone portrait and landscape; Safari toolbar, keyboard, and safe area.
2. Microphone: permission, hold-to-record, release, saved file and playback.
3. Recordings: waveform corresponds to original; seek/keyboard works; large
   recordings omit waveform without losing playback.
4. Make Instrument: native server startup, buffer acknowledgement, cancel and
   recovery, waveform region control, Play/Stop/Save.
5. LibriVox: author/reader/title search, bookmarks, phrase location, chapter
   listening, download consent, extraction, audio handoff and offline failure.
6. Code: edit with keyboard visible, graphical controls highlight and scroll
   to changed code, Run and save remain available when editing ends.

## Next prioritized design work
- Improve visual distinctions between unmodified originals, transformed
  instruments, and executable code using a compact persistent provenance trail.
- Add a genuinely informative live level display while recording, when signal
  metering is available, without fabricating loudness measurements.
- Verify touch reachability, reading space and theming on actual small iPhones.
- Resolve native SuperCollider sample-buffer acknowledgement failures using
  evidence from the actual runtime, independently of the interface.

## v0.6.1 follow-up: recording legibility and native transport
- Added a microphone-input display with **real audio samples**, a measured
  root-mean-square input level expressed in decibels and an elapsed timer.
  This is a recording monitor, not an imaginary display or alternate synth.
- Record continues to require a deliberate hold, now labelled visibly
  **RECORDING · RELEASE TO SAVE**. Saving still preserves the original and
  releases the microphone; an audio-player audition remains independent of
  SuperCollider.
- Added a **STOP** button beside the main instrument playback action, using
  the established Code-page sequence (`CmdPeriod.run`, `/clearSched`,
  `/g_freeAll`) on this Sounds page's own native engine.
- The monitor accepts WebKit's audio-context implementation. Where browser
  live monitoring is unavailable, recording can still proceed, with an
  accurate explanation instead of an empty or misleading signal.
- Synchronised LibriVox's links and embedded page request to the Sounds
  version. Kept library data, original recordings, the main Code page,
  engine wrappers and download permissions unchanged.
- Automated tests confirm the microphone hold/release/save sequence under
  simulated browser conditions. Actual microphone sound, device latency,
  screen geometry and underlying SuperCollider buffer failures still require
  evidence from real iPhone testing.
