# MORBIUS Sound Sources & Licensing Manifest

This directory holds audio assets for the MORBIUS casino platform. Most in-game
sound is **generated at runtime** by the procedural synth engine in
`public/sound-lab.html`, or **baked to WAV** from that same engine. Those assets
are 100% original and carry no third-party licensing obligations. This file
governs the *externally sourced* samples a team member may add (layer C of the
Sound Lab).

Currency in all copy is **MORBIUS**. This is a play-money / demo studio.

---

## 1. Policy — what may be bundled

**Only bundle audio you are legally clear to ship.** In practice that means:

- **CC0 / Public Domain** — preferred. No attribution required, but we log it
  anyway (below) for provenance.
- **CC-BY (and similar attribution licenses)** — allowed **only if** the author
  and source are recorded in the manifest table and surfaced in-app
  (the Sound Lab "Attribution" panel does this automatically for loaded samples).
- **Anything else** (CC-BY-SA, CC-BY-NC, "royalty-free with restrictions",
  unknown, or "I found it on the internet") — **do not bundle.** When in doubt,
  synthesize it with a procedural pack instead.

**Never** commit copyrighted audio, ripped game/casino sounds, or a deliberate
reproduction of a specific famous jingle. Procedural packs exist precisely so we
never need to.

> Procedural voices and baked-WAV exports from the Sound Lab are original works
> authored by this project. They require **no attribution** and have **no usage
> restrictions**. Prefer them; reach for external samples only when you need real
> recorded fidelity (e.g. a genuine coin-drop or mechanical reel clunk).

---

## 2. Curated CC0 / royalty-free source list

These are reputable places to find license-clean game audio. Always confirm the
license **on the individual asset's page** — a site hosting CC0 content can also
host content under other licenses.

| Source | URL | License notes |
| --- | --- | --- |
| Kenney game assets | https://kenney.nl/assets?q=audio | CC0. Large packs of UI, casino, and interface SFX. Safe to bundle; logging still encouraged. |
| Freesound.org | https://freesound.org/search/?f=license:%22Creative+Commons+0%22 | Mixed licenses. **Filter to "Creative Commons 0"** for CC0. CC-BY results require attribution — record the author. |
| OpenGameArt.org | https://opengameart.org/art-search-advanced?field_art_licenses_tid%5B%5D=4 | Mixed licenses. **Filter to CC0** (license facet). Verify per asset. |
| Sonniss GDC Game Audio Bundle | https://sonniss.com/gameaudiogdc | Royalty-free for commercial use per the bundle license — read the included license PDF; not CC0, so keep the license text with the files. |

Search hints for slot/casino coverage: `coin`, `reel`, `slot`, `jackpot`,
`chime`, `arcade`, `UI click`, `whoosh`, `bell`, `cash register`.

---

## 3. Manifest — log every externally sourced sample here

Add one row per file you place in `public/sounds/`. The example row below is a
**placeholder** showing the required format — it does not describe a real file.
Replace or delete it once real assets are added. **Do not** claim any specific
real-world file is CC0 without verifying it on the source page first.

| file | event | source URL | author | license | date added |
| --- | --- | --- | --- | --- | --- |
| _example-placeholder.wav_ | coin-rollup | https://example.org/ASSET_PAGE | AUTHOR_NAME | CC0 | YYYY-MM-DD |

Column meaning:

- **file** — filename as stored in `public/sounds/`.
- **event** — the Sound Lab event id it maps to (e.g. `spin-start`, `win-mega`,
  `jackpot-grand`). See the event taxonomy in `public/sound-lab.html`.
- **source URL** — the asset's own page (not just the site homepage).
- **author** — creator handle/name (required for CC-BY, courtesy for CC0).
- **license** — CC0 / CC-BY / Public Domain / (bundle-specific royalty-free).
- **date added** — ISO date the file was committed.

---

## 4. Procedural packs need no attribution

The Sound Lab ships four procedural packs — **Synth**, **Arcade**, **Casino**,
**Cyber** — that voice every casino event from an original WebAudio synth engine
(`renderVoicesToPCM` + a small original WAV encoder). Switching packs re-voices
the whole library; the "Export sound block" button emits each event as either a
procedural `{pack, params}` voice-array or, if a sample was loaded, a
`{sampleRef, license, source}` reference.

Because those voices and their baked WAVs are generated here, **no external
license, credit, or manifest row is needed for them.** This manifest only exists
to keep the layer-C external samples honest and traceable.
