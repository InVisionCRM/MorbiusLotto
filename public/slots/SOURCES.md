# public/slots/ — branded cabinet assets

Brand imagery for the three partner-token slot cabinets. These are partner
projects the platform already ships branded blackjack tables for
(`public/BlackJack/BrandedTable/`); their marks are used here the same way —
as partner branding, with permission context established by that arrangement.

| file | source | fetched |
| --- | --- | --- |
| `superstake-mark.png` | Cropped from `public/BlackJack/BrandedTable/SuperStake.png` (in-repo) | 2026-08-11 |
| `greenwick/wick-avatar.png` | Green Wick token logo — DexScreener CMS (`cdn.dexscreener.com/cms/images/3049f5d9…`), the token's listed logo for PulseChain WICK; project site greenwick.tiiny.site | 2026-08-11 |
| `superstake/ss-logo.png` | https://superstake.win/wp-content/uploads/2023/03/SuperStake-Logo-PNG.png (official site, downscaled) | 2026-08-11 |
| `superstake/hex-logo.png` | https://superstake.win/wp-content/uploads/2022/12/HEXagon.png (HEX mark as served by superstake.win, downscaled) | 2026-08-11 |
| `superstake/ss-backdrop.jpg` | https://superstake.win/wp-content/uploads/2023/10/eSSH2.jpg (official site art, downscaled) | 2026-08-11 |
| `superstake/ss-token.png` | SuperStake pSSH token logo — DexScreener CMS (`cdn.dexscreener.com/cms/images/253435bf…`) | 2026-08-11 |
| `*.json` | Machine definitions exported from the Reel Forge presets (in-repo) | 2026-08-11 |

Morbius cabinets use the in-repo official art (`public/morbius/`,
`public/vip-badges/`, `public/PokerChips/`) and need no external fetch.

Site palettes sampled for the cabinet pages:
- greenwick.tiiny.site — matrix terminal: `#00ff41` on black, `#ff3333` accents, Share Tech Mono.
- superstake.win — dark hex field, HEX gradient (`#ff00c7` → `#ff7a00` → `#ffd200`), purple/orange S-mark.

## Third-party reel art (added 2026-08-12)

All licence texts were read from the bundled `License.txt` / the asset's own
page before use — same standard as `public/sounds/SOURCES.md`.

### Kenney — Crosshair Pack v1.1 (CC0 1.0)
- Source: https://kenney.nl/assets/crosshair-pack (License.txt in the pack: Creative Commons Zero)
- Files: `greenwick/sym/cross-*.png` — Glow (2x) variants of crosshairs
  011, 036, 021, 026, 101, 063, 143, 108, tinted phosphor green / threat red
  in page CSS.

### Kenney — Puzzle Pack II (CC0 1.0)
- Source: https://kenney.nl/assets/puzzle-pack-2 (License.txt in the pack: Creative Commons Zero)
- File: `greenwick/sym/coin-gold.png` (`PNG/Coins/coin_06.png`) — the
  Continental coin.

### OpenGameArt — "Gems 4" by dannorder (CC0)
- Source: https://opengameart.org/content/gems-4 (licence field on the page: CC0)
- Files: `superstake/gems/gem-*.png` — eleven bevelled gems; the HEX ramp
  colours (pink / orange / yellow) on the high pays, cool colours on the lows.

### Brand art already in the repo
- `superstake/hex-logo.png` is now also the HEX Vault scatter symbol.
- Morbius Vault keeps its platform art (glass chips, VIP badges) — that art
  is first-party and already production quality.
