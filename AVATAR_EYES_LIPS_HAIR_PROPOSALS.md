# Avatar Feature Proposals — Eyes, Lips & Hair

A spec for new **eye**, **lip**, and **hair** types, grounded in how the avatar creator
actually renders today. Every entry below maps to real primitives already in the codebase —
nothing here requires a new rendering engine. **Direction: "broad mix pack"** — a balance of
realistic, expressive, and a few legendary casino specials for the cosmetics shop.

> Scope: **spec / list only.** No code has been changed. This is the menu to greenlight from.

---

## How the current system works (the constraints every entry respects)

- **Canvas:** one shared SVG grid, **48 × 56 logical px** (`lib/avatar-viewbox.ts`). 1 SVG unit = 1 viewBox unit, so coordinates below are literal.
- **Eyes** — `components/avatar/preview/eyes-layer.tsx`, a `switch (eyeShape)`. Each eye is a stack of rounded `<rect>`s: a white (`#fffef8`), a top **lid-shade** rect, an optional lower **waterline** tint, a thin outline stroke, then `pupilGroup(px, py, w, h, glint)` which draws the iris rect (filled with `eyeColor`) + inner stroke + a white **glint** square. Left eye is drawn at `x = 14`, right eye at `x = 28`; whites sit at `y ≈ 22`, heights 2–4.
- **Lips** — `components/avatar/preview/lips-layer.tsx`, a `switch (lipShape)`. Rounded rects (upper lip darker, lower lip line) plus quadratic `<path>`s for smiles. Footprint: `x 20–28`, `y 32–34`.
- **Hair** — `hair-front-*` + `hair-back-*` variant files, driven by `hairStyle`. Built from `H` (hair fill), `hHi(mix,opacity)` / `hLo(mix,opacity)` shade helpers, a `puff()` blob helper, left/right **mirror** helpers, green **ties** (`#22c55e`), and **cap-highlight** sheens. Footprint: `x 7–41`, `y 2–32`.
- **Typing:** `eyeShape` / `lipShape` / `hairStyle` are plain `string` (`lib/avatar-payload.ts`) — **adding a value needs no TypeScript union change.**
- **Gating:** anything not listed in `FREE_VALUES` (`lib/cosmetics-catalog.ts`) requires a shop item. Tiers: `common / uncommon / rare / legendary`. "Tier" columns below are suggestions.
- **Don't reuse retired names:** `Full`→`Thin` and `Smirk`→`Smile` are auto-migrated away (`mergeV1AvatarPartial`); also avoid names in `REMOVED_EYE_SHAPES` / `REMOVED_HAIR_STYLES`. New names below sidestep these.

---

# 1 · Eyes

**Today (7):** `Round`, `Almond`, `Narrow`, `Wide` are polished (free). `Eye V1`, `Eye V3`, `Eye V4` are **placeholder-grade** — plain rects, no lid shading, off-center pupils — and are shop-locked, so players pay for the worst-looking ones.

**Recommendation:** retire/replace `Eye V1/V3/V4` with the polished set below (add them to `REMOVED_EYE_SHAPES` so existing configs fall back to `Round`).

### Realistic

| Name | Tier | Built from current primitives |
|------|------|-------------------------------|
| Hooded | free | `Almond` white (6×2 @ y22) + a hair-toned lid rect overhanging the top edge (≈ y21.4, h0.9) so the crease covers the upper iris. |
| Upturned (Fox) | common | `Almond` base drawn as a parallelogram `<path>` (outer corner raised ~1px) instead of a rect; pupil centered. Mirror flips per eye. |
| Downturned (Puppy) | common | Mirror of Upturned — outer corner dropped ~1px + a soft lower waterline tint for the "soft eyes" read. |
| Monolid | free | `Almond` white with the lid-shade rect **omitted** and a single smooth `rx` — no crease. |
| Deep-Set / Tired | common | `Narrow` base + an under-eye "bag" = thin rounded rect at y26 (`rgba(0,0,0,0.08)`) + lid lowered ~0.4px. |
| Close-Set / Wide-Set | free | Pure repositioning: shift each `renderEye` x-origin inward/outward by ~1.5px. Two cheap, distinct options. |

### Expressive

| Name | Tier | Built from current primitives |
|------|------|-------------------------------|
| Sparkle | uncommon | `Round` base; `pupilGroup` gets a **second** small white glint rect (bottom-opposite) for a dual catchlight. |
| Side-Eye | common | `Almond` base, pupil `px` shifted +1 (looking right) leaving more sclera on the inner side. Reads sly/skeptical. |
| Chill (Half-Closed) | free | White height cut to ~1.4 and the lid-shade rect drops to cover the top third. The "unbothered degen" look. |
| Anime Wide | uncommon | `Round` base scaled to 5×5 white, big 3.5×3.5 iris, dual glints, lowered glint opacity. Big and emotive at 48px. |
| Starstruck | rare | Replace the glint square with a tiny 4-point **star** `<path>`; brighten the iris. |
| Pixel 8-Bit | uncommon | Drop all `rx` to 0 and build the iris from 2×2 hard squares — retro voxel eye that nods to the on-chain aesthetic. |

### Legendary (casino specials)

| Name | Tier | Built from current primitives |
|------|------|-------------------------------|
| Laser Eyes | legendary | Normal eye + a horizontal red beam (gradient rect/line) extending to the canvas edge, with a 2–3 layer opacity "glow." Iris forced red. The crypto-twitter classic. |
| Neon Cyber | legendary | Iris = neon fill + a thin horizontal **scanline** rect + an outer glow ring; cyan glint. |
| Dollar Eyes | legendary | Iris green (`#16A34A`); glint square swapped for a tiny `$` glyph (`<text>` or path). |
| Heterochromia | rare | Left eye uses `eyeColor`, right eye a **second** color. *Needs one new field (`eyeColor2`) or a fixed pairing — flag for wiring.* |
| Royal Flush | legendary | Glints shaped as suit pips (♠ ♥ ♦ ♣) via tiny paths — a different suit per eye. |
| Lucky 7s | legendary | Iris bears a tiny red **7** glyph in place of the glint. |
| Diamond Eyes | legendary | Iris = a rotated square (rhombus) with two facet lines + a bright glint = cut gem. |

---

# 2 · Lips

**Today (2):** only `Thin` and `Smile`. This is the single most underbuilt area — huge, cheap upside.

### Realistic

| Name | Tier | Built from current primitives |
|------|------|-------------------------------|
| Neutral Rest | free | The existing `default` branch promoted to a real option: two close rounded rects (upper `rgba(90,30,40)`, lower darker) + faint center line. |
| Full Pout | common | Taller lip rects (h≈1.6) + a center **gloss** highlight rect + a short philtrum dip `<path>` above. |
| Slight Frown | free | Invert the `Smile` quad downward: `M 20.2 33 Q 24 34.4 27.8 33`. |
| Parted | common | Upper rect + gap + lower rect, with a dark "interior" rect between and a faint top-teeth hint. |
| Pursed / Kiss | uncommon | Small centered rounded rect (w≈3) + gloss highlight + two short pucker lines at the corners. |

### Expressive

| Name | Tier | Built from current primitives |
|------|------|-------------------------------|
| Big Grin | free | `Smile` base with a taller white **teeth** rect (h≈1.6), 2–3 vertical tooth-gap lines, and corner shadows. |
| Open Laugh | uncommon | Dark interior ellipse + top-teeth rect + a red **tongue** rect at the bottom. |
| Sly Smirk | common | Asymmetric quad — one corner raised via an offset control point. (New name; legacy `Smirk` is migrated to `Smile`.) |
| Tongue Out | uncommon | `Smile` + a red rounded **tongue** rect hanging below y34 with a center crease line. |
| Gritted | common | Wide white teeth rect with many vertical gap lines + flat lip lines top and bottom = clench. |
| Whistle / "O" | free | Reuse the `surprised` emotion mouth as a selectable shape: small rounded square + inner shadow. |

### Legendary (casino specials)

| Name | Tier | Built from current primitives |
|------|------|-------------------------------|
| Gold Grill | legendary | `Big Grin` teeth rect filled gold (`#FFD700`) + vertical facet lines + a diagonal shine rect. |
| Diamond Grill | legendary | Gold grill + a row of tiny white **gem** squares, each with a glint. |
| Gold Tooth Smirk | rare | `Sly Smirk` with one gold tooth rect among the whites. |
| Money Mouth | legendary | `Smile` + a green cash rect (with `$`) peeking between the lips. |
| Vampire Fangs | rare | `Big Grin` + two small white **triangle** fang paths at the corners. |
| Neon Gloss | legendary | `Full Pout` with a saturated neon lip fill + an extra bright gloss streak (works with the dark themes). |

---

# 3 · Hair

**Today:** the picker exposes 14 styles, but the **renderer already supports more than it shows.**

### ✅ Free wins — already drawn, just not in the picker

These cases already exist in `hair-front-short-variants.tsx` / `hair-front-dreadlocks-variants.tsx`. Adding the names to `PICKER_HAIR_STYLES` (and de-duping `Dreads Fade` vs `Fade`) surfaces them at near-zero cost — **verify each renders cleanly first.**

| Name(s) | Where it already lives |
|---------|------------------------|
| Spiky | `hair-front-short-variants` (`case 'Spiky'`) |
| Fade | `hair-front-short-variants` (`case 'Fade'`) |
| Mullet | `hair-front-remaining-variants` (`case 'Mullet'`) |
| Dreadlocks V1 – V10 | `hair-front-dreadlocks-variants` |
| Locks V1 – V10 | `hair-front-dreadlocks-variants` |

> Also note: **galaxy / rainbow / tiger / zebra / leopard / camo / checkerboard hair is already possible** via `hairColor` pattern fills (`url(#galaxy)` etc. in `PICKER_HAIR_COLORS`) — no new *style* needed, just colors. Don't rebuild these as styles.

### Realistic (new)

| Name | Tier | Built from current primitives |
|------|------|-------------------------------|
| Slick Back | free | Crown band rect (x9 y11 w30 h5) + horizontal `hHi` streak rects flowing back (like `Long Wavy`'s sheen) + no side locks. |
| Side Part | free | Crown band + an off-center diagonal part line (thin `hLo` rect) + asymmetric volume (one side ~1px taller). |
| Caesar / Crew | common | `Buzz` base + a small forward fringe rect at the hairline (y15). |
| Pompadour | uncommon | Crown band + a raised front-volume rounded path lifting at the forehead (y8–12) + `hHi` sheen. |
| Quiff | uncommon | Pompadour with a softer, swept-up front and a single highlight streak. |
| Man Bun / Top Knot | uncommon | Slick-back base + a `puff` circle bun at top-center (y6–9) + a tie rect. |
| Updo / Bun | common | Pulled-back crown (no front fringe) + a `puff` bun at top-back + a few `hLo` strands. |
| Cornrows | rare | A row of vertical thin `H` rects across the crown with `hLo` gaps between — mirror-symmetric. |
| Braids (Double) | rare | `Pigtails` skeleton, but the tails become stacked alternating `hHi`/`hLo` "knot" rects = braid texture. |
| Bangs / Fringe | common | Any base + a row of short rects hanging over the forehead (y15–18). Note: overlaps the eyebrow paths — tune to sit just above. |

### Expressive (new)

| Name | Tier | Built from current primitives |
|------|------|-------------------------------|
| Emo Swoop | uncommon | Asymmetric long fringe `<path>` sweeping across one eye (x12–22, y14–24), flat fill + a bright `hHi` edge. |
| Space Buns | common | Two `puff` circles at the top corners (x16 / x32, y6) + ties. |
| Hime Cut | rare | `Long Straight` base + blunt cheek-length side panels (rects to y26) + a blunt fringe. |
| Wild Spikes | uncommon | `Spiky` taken taller and asymmetric — anime-style chunks via additional triangle paths. |

### Legendary (casino specials)

| Name | Tier | Built from current primitives |
|------|------|-------------------------------|
| Flame Top | legendary | `Mohawk`/`Spiky` silhouette filled with a red→orange→yellow vertical gradient (`<linearGradient>` def) + optional flicker animation (the `animated-bubblegum` layer is the existing pattern for motion). |
| Neon Mohawk | legendary | `Mohawk` base + an outer glow (duplicate path, blurred/bright stroke) + a neon `H`. |
| Liberty Spikes (Gold) | legendary | `Spiky` with taller spikes, gold fill + shine rects. |
| Money Dreads | rare | Dreadlocks variant with `H` forced green (`#16A34A`) + small band/`$` accents on the locks. |
| Diamond-Stud Locks | legendary | Dreadlocks + tiny white **gem** squares with glints spaced along the locks. |

---

# 4 · Bonus — Eyebrows (currently fixed)

Eyebrows are **hard-coded** today: a single soft arched `<path>` per side in `eyes-layer.tsx`
(`M13.9 18.7 Q17 17.05 20.2 18.4`). Making them selectable is a quick personality multiplier.

Suggested `eyebrowShape` set — each is just a different `d` string + `strokeWidth`:
**Arched** (current), **Flat**, **Thick**, **Thin**, **Angry** (angled down-toward-nose),
**Raised** (one higher — pairs with `Side-Eye`), **Unibrow**, **Slit** (a shaved gap).

> Caveat: unlike eyes/lips/hair, eyebrows are **not** a config field yet — this one needs a new
`eyebrowShape` field + picker entry + `FREE_VALUES` line, so it's slightly more wiring.

---

# How to wire any of these in (for when you greenlight)

For each approved **eye / lip / hair** value (these are already config fields):

1. **Name** → add to the matching array in `lib/avatar-editor-options.ts`
   (`PICKER_EYE_SHAPES` / `PICKER_LIP_SHAPES` / `PICKER_HAIR_STYLES`).
2. **Render** → add a `case` to the matching switch:
   `eyes-layer.tsx` · `lips-layer.tsx` · `hair-front-*` (+ `hair-back-*` for long styles).
3. **Gating** → if it should be free, add it to `FREE_VALUES` in **both** `lib/cosmetics-catalog.ts`
   and `server/src/lib/cosmetics-catalog.ts`; otherwise add an `ITEM_CATALOG` shop entry with a tier/price.
4. No TypeScript union change needed — the fields are `string`.

**Lowest-effort, highest-impact order:** (1) surface the free-win hair styles already in the renderer,
(2) build out **Lips** (only 2 exist — biggest visible gain), (3) replace the placeholder `Eye V1/V3/V4`
with the realistic eye set, (4) layer in the legendary casino specials for the shop.
