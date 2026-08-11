# MORBIUS Sound Sources & Licensing Manifest

This directory holds audio assets for the MORBIUS casino platform. Most in-game
sound is **generated at runtime** by the procedural synth engine in
`public/sound-lab.html`, or **baked to WAV** from that same engine. Those assets
are 100% original and carry no third-party licensing obligations. This file
governs the *externally sourced* samples a team member may add (layer C of the
Sound Lab).

> **Exception worth knowing: the win sounds are samples now.** Wins across the
> whole floor are recorded audio (§3.1), not oscillators. The synthesised
> versions still exist in each game's audio module, but only as the fallback for
> when a sample has not downloaded yet. Everything else — cards, chips, dice,
> pegs, ticks — is still generated.

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

Add one row per file you place in `public/sounds/`. **Do not** claim any specific
real-world file is CC0 without verifying it on the source page first.

### 3.1 Win stings — `public/sounds/wins/`

Thirty samples backing the layered win sting (`lib/win-sounds.ts`, played by
`lib/win-audio.ts`). Every one was confirmed CC0 **on its own Freesound page**,
not merely filtered for in search — the search facet is a starting point, and
this manifest records the per-asset check.

Ten are wired into the shipped recipes; the rest are the alternatives offered by
`/win-sound-lab.html`, kept so the sting can be re-voiced without another
sourcing round. The `event` column says which.

CC0 requires no attribution. Authors are credited anyway, per the policy above.

| file | event | source URL | author | license | date added |
| --- | --- | --- | --- | --- | --- |
| `impact-brass-hit.mp3` | library (unused) | https://freesound.org/people/germona/sounds/653604/ | germona | CC0 | 2026-08-10 |
| `impact-orchestral-hit.mp3` | win-big (impact) | https://freesound.org/people/Rizzard/sounds/559391/ | Rizzard | CC0 | 2026-08-10 |
| `impact-riser-hit.mp3` | library (unused) | https://freesound.org/people/AudioPapkin/sounds/511863/ | AudioPapkin | CC0 | 2026-08-10 |
| `impact-soft-cinematic-impact.mp3` | win-huge (impact) | https://freesound.org/people/Rizzard/sounds/560156/ | Rizzard | CC0 | 2026-08-10 |
| `body-achievement-jingle.mp3` | library (unused) | https://freesound.org/people/CogFireStudios/sounds/619840/ | CogFireStudios | CC0 | 2026-08-10 |
| `body-bonus-points.mp3` | library (unused) | https://freesound.org/people/Joao_Janz/sounds/482653/ | Joao_Janz | CC0 | 2026-08-10 |
| `body-collect.mp3` | win-small (body) | https://freesound.org/people/Wagna/sounds/325805/ | Wagna | CC0 | 2026-08-10 |
| `body-game-reward.mp3` | library (unused) | https://freesound.org/people/IENBA/sounds/656643/ | IENBA | CC0 | 2026-08-10 |
| `body-game-success-fanfare.mp3` | library (unused) | https://freesound.org/people/el_boss/sounds/677859/ | el_boss | CC0 | 2026-08-10 |
| `body-glockenspiel-treasure.mp3` | library (unused) | https://freesound.org/people/FunWithSound/sounds/456965/ | FunWithSound | CC0 | 2026-08-10 |
| `body-level-win.mp3` | library (unused) | https://freesound.org/people/Tuudurt/sounds/258142/ | Tuudurt | CC0 | 2026-08-10 |
| `body-magic-win-success-2.mp3` | library (unused) | https://freesound.org/people/MLaudio/sounds/615100/ | MLaudio | CC0 | 2026-08-10 |
| `body-magic-win-success.mp3` | library (unused) | https://freesound.org/people/MLaudio/sounds/615099/ | MLaudio | CC0 | 2026-08-10 |
| `body-mission-complete.mp3` | library (unused) | https://freesound.org/people/Beetlemuse/sounds/528958/ | Beetlemuse | CC0 | 2026-08-10 |
| `body-success-fanfare-trumpets.mp3` | win-huge (body) | https://freesound.org/people/FunWithSound/sounds/456966/ | FunWithSound | CC0 | 2026-08-10 |
| `body-tada-fanfare-a.mp3` | win-big (body) | https://freesound.org/people/plasterbrain/sounds/397355/ | plasterbrain | CC0 | 2026-08-10 |
| `body-triumph-jingle.mp3` | library (unused) | https://freesound.org/people/lightbulbafagd/sounds/518750/ | lightbulbafagd | CC0 | 2026-08-10 |
| `body-victory-sting.mp3` | library (unused) | https://freesound.org/people/xkeril/sounds/706753/ | xkeril | CC0 | 2026-08-10 |
| `body-win-brass.mp3` | library (unused) | https://freesound.org/people/Fupicat/sounds/521639/ | Fupicat | CC0 | 2026-08-10 |
| `body-win-spacey.mp3` | library (unused) | https://freesound.org/people/GameAudio/sounds/220184/ | GameAudio | CC0 | 2026-08-10 |
| `tail-achievement-chimes.mp3` | win-huge (tail) | https://freesound.org/people/LaurenPonder/sounds/635665/ | LaurenPonder | CC0 | 2026-08-10 |
| `tail-achievement-sparkle.mp3` | win-big (tail) | https://freesound.org/people/SkySpeira/sounds/715067/ | SkySpeira | CC0 | 2026-08-10 |
| `tail-magic-sparkle.mp3` | library (unused) | https://freesound.org/people/MLaudio/sounds/511485/ | MLaudio | CC0 | 2026-08-10 |
| `tail-sparkling-star.mp3` | library (unused) | https://freesound.org/people/LilMati/sounds/462092/ | LilMati | CC0 | 2026-08-10 |
| `tail-success-bell.mp3` | library (unused) | https://freesound.org/people/MLaudio/sounds/511484/ | MLaudio | CC0 | 2026-08-10 |
| `tail-victory-chime.mp3` | win-small (tail) | https://freesound.org/people/1bob/sounds/717771/ | 1bob | CC0 | 2026-08-10 |
| `coins-badge-coin-win.mp3` | win-big (coins) | https://freesound.org/people/steaq/sounds/387232/ | steaq | CC0 | 2026-08-10 |
| `coins-casino-hit-big-money.mp3` | library (unused) | https://freesound.org/people/modusmogulus/sounds/787908/ | modusmogulus | CC0 | 2026-08-10 |
| `coins-money-handful.mp3` | library (unused) | https://freesound.org/people/rolandseer/sounds/443334/ | rolandseer | CC0 | 2026-08-10 |
| `coins-slot-machine-payout.mp3` | win-huge (coins) | https://freesound.org/people/jack126guy/sounds/361346/ | jack126guy | CC0 | 2026-08-10 |

Files are the Freesound HQ previews (VBR MP3, 44.1/48 kHz stereo), which are
served without an account and are already the right weight for the web. Each one
carries a measured `norm` in `lib/win-sounds.ts` that trims it to a common
loudness; that figure is derived from the file, so **re-download means
re-measure**.

### 3.2 Everything else

| file | event | source URL | author | license | date added |
| --- | --- | --- | --- | --- | --- |
| _none logged yet_ | | | | | |

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
