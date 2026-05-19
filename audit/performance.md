# MORBlotto Performance Audit

## TL;DR

The site ships **24 MB on first load** (22 MB of which is images), and the LCP element takes **11 seconds** to appear. The cause is not actually a slow LCP resource — Lighthouse measures the LCP loader as ~900 ms — it's the main thread getting blocked behind a huge image fan-out further down the page plus an 8 MB hero `<video preload="auto">` that the browser eagerly fetches because it's used for scroll-scrubbing. Layer in a 0% lazy-loaded marketing showcase that ships **4.5 MB PNGs to render 157×99 thumbnails**, two competing animation libraries, a dead `<link rel="preload">` that fetches a 147 KB JPEG that nothing on the page uses, no `next/image` optimization for any of it, and no `optimizePackageImports` in `next.config.ts` — and the page ends up with a Performance score of 0.67 even though the server responds in 30 ms.

Top wins are mechanical: replace raw `<img>` with `next/image` (or `<picture>` + WebP) in the marketing showcase, remove the dead preload, convert the hero video to a `<picture>` fallback (or set `preload="metadata"`), and add `optimizePackageImports` for `lucide-react`/`@tabler/icons-react`/`recharts`/`framer-motion`/`date-fns`. Those four together should reasonably move the report from 0.67 → ~0.85+, cut total page weight by ~70%, and eliminate ~10 s from LCP for users behind moderate networks.

---

## Lighthouse Snapshot (https://morbius.io/)

Source: `LIGHTHOUSE.MD` (~14.8k lines)

| Metric | Value | Score |
|---|---|---|
| Performance category | — | **0.67** |
| Best Practices category | — | 0.77 |
| First Contentful Paint | 0.6 s | 0.99 |
| **Largest Contentful Paint** | **11.0 s** | **0** |
| Speed Index | 2.9 s | 0.29 |
| Total Blocking Time | 70 ms | 0.99 |
| Time to Interactive | 12.2 s | 0.01 |
| Cumulative Layout Shift | 0.054 | 0.98 |
| Max Potential FID | 170 ms | 0.76 |
| Server response time | 30 ms | 1.0 |
| DOM size | 1,358 elements | 1.0 |
| Total byte weight | 23.9 MiB | 0.5 |
| Main-thread work breakdown | 2.5 s | 0 |
| JS execution time | 0.9 s | 1.0 |

Resource breakdown (244 requests total, 24.5 MB transfer):
- **Image**: 23 requests, **22.1 MB** (90% of all bytes)
- Script: 45 requests, 1.6 MB
- Font: 2 requests, 260 KB (cdnjs FontAwesome from ElevenLabs widget)
- Stylesheet: 4 requests, 69 KB
- Third-party: 157 requests, 910 KB

Biggest savings opportunities (from `*-insight` audits):

1. **Improve image delivery** — est savings **18,882 KiB**. Six PNGs in the `TableShowcaseDisplay` section are >2 MB each; dimensions on disk are ~2000×1300 but rendered dimensions are 157×99 or 535×290.
2. **Reduce unused JavaScript** — est savings **803 KiB**. Biggest offender is the ElevenLabs ConvAI widget (`unpkg.com/@elevenlabs/convai-widget-embed`, 418 KB transferred, 285 KB unused).
3. **LCP request discovery (score 0)** — LCP element has no `fetchpriority=high` and is not discoverable from initial HTML (it's a background-style div, not an `<img>`).
4. **Cache lifetimes** — only ~125 KB of wins, but Vercel Live feedback script has TTL of 60 s.
5. **Font display** — est savings **340 ms FCP**. Two FontAwesome fonts (loaded by the ElevenLabs widget) lack `font-display: swap`.

Note on the LCP element: Lighthouse identifies a 692×690 element with selector `div.relative > div.relative > section.relative > div.pointer-events-none` and a snippet beginning `<div class="pointer-events-none absolute inset-0 z-[1] bg-cover bg-center bg-no-repeat…">`. That snippet's full class list does not appear literally in the source, but path and bounding box correspond to the hero `<section>` in `components/home/hero-section.tsx`. The actual LCP "breakdown" totals only ~905 ms (TTFB 35 + loadDelay 313 + loadDuration 457 + render 101); the rest of the 11 s is the browser waiting because the main thread is blocked behind other downloads/scripts before the element paints.

---

## Severity legend

- **Critical** — blocks core flow / page unusable on a typical connection
- **High** — noticeable jank or >2 s impact on a key metric (LCP/INP/SI)
- **Medium** — moderate metric improvement (hundreds of ms or hundreds of KB)
- **Low** — polish

## Complexity legend

1. **C1** — config tweak / single-line change
2. **C2** — small targeted refactor in one file
3. **C3** — touches several files but mechanical
4. **C4** — requires design or architectural decision
5. **C5** — large architectural change

---

## Findings

### PERF-001 — Marketing showcase ships 18.5 MiB of full-resolution PNGs to render thumbnails

- **Severity**: Critical · **Complexity**: 2
- **Where**: `components/marketing/TableShowcaseDisplay.tsx:130, 151`; `components/marketing/PulseChainAiDisplay.tsx:126`; `public/Marketing /Tables/*`, `public/Marketing /Page View/*`, `public/BlackJack/BrandedTable/*`
- The audited home page downloads PNGs at native resolutions of 2000×1300+ to render 157×99 and 535×290 image elements. From Lighthouse's `image-delivery-insight`:
  - `LibertySwapTable.png` — 4.53 MB transferred, displayed at 157×99
  - `LibertyPage.png` — 3.29 MB at 535×289
  - `WickTable.png` — 3.06 MB at 157×103
  - `LBRTYpv.png` — 2.81 MB at 535×260
  - `WickPage.png` — 2.58 MB at 535×290
  - `Liberty.png` (BrandedTable) — 2.25 MB at 157×105
  - Estimated savings 18,882 KiB.
- These are rendered with **raw `<img>` tags**, not `next/image`. The Next image optimizer is bypassed, so no responsive `srcset` is generated, no WebP/AVIF, no width-based fetching.
- **Fix**: replace `<img>` with `<Image>` from `next/image` and supply explicit `width`/`height` matching display dimensions. As a follow-up, recompress sources to WebP (or generate AVIF) and downsize the source PNGs themselves — a 2382×1288 marketing asset for a 535-px-wide slot is wasteful even after Next image optimization runs.

### PERF-002 — Dead `<link rel="preload">` for a hero image that no element uses

- **Severity**: High · **Complexity**: 1
- **Where**: `app/layout.tsx:99-100`
- `app/layout.tsx` preloads `/morbius/Morbius-glass-chip-16x9.jpeg` (147 KB) on every page, but this asset is not referenced anywhere else in the codebase — `grep -rn 'Morbius-glass-chip' app components lib --include='*.{ts,tsx,css}'` returns only the two preload tags themselves.
- Hero now uses a `<video>` (`Morbiusio_Building_Entrance_Pan_scrub.mp4`); the comment "Preload hero background images so LCP isn't delayed by CSS discovery" is stale.
- Browsers warn about unused preloads in the console after ~3 s, and they are fetched with `Highest` priority, contending with real LCP resources.
- **Fix**: delete both lines, or repoint them at the actual hero `<video>` poster image once one exists.

### PERF-003 — Hero `<video preload="auto">` downloads ~8 MB before paint on every visit

- **Severity**: High · **Complexity**: 2
- **Where**: `components/home/hero-section.tsx:130-138`; `public/morbius/Morbiusio_Building_Entrance_Pan_scrub.mp4` (8.3 MB)
- The scroll-scrubbed desktop hero is implemented with `<video preload="auto">`. Browsers honor `auto` aggressively and will download the entire 8.3 MB scrub clip before allowing the page's main thread to finish its critical work — even though mobile clients never need it (the component branches on `matchMedia('(min-width: 768px)')`).
- The mobile path uses `Morbiusio_Building_Entrance_Pan.mp4` (4.8 MB) and calls `.play()` in an effect.
- Combined this is ~13 MB of media that the browser may download regardless of viewport.
- **Fix**: drop to `preload="metadata"` (sufficient to expose `duration` for the scrub logic) and render the appropriate source per-viewport (gate `<source>` tags or set `src` only after `mode` resolves). For desktop, also consider an SD scrub variant — many scrub UIs ship at 480p with imperceptible quality loss on a faded overlay.

### PERF-004 — LCP element is a background-style div, not discoverable from HTML

- **Severity**: High · **Complexity**: 2
- **Where**: `components/home/hero-section.tsx` (hero section root container)
- Lighthouse `lcp-discovery-insight`: `priorityHinted: false`, `requestDiscoverable: false`. The browser has to wait for CSS/JS to parse before it learns what the LCP resource is.
- Adding the LCP image as a real `<Image priority fetchPriority="high">` (or `<img fetchpriority="high">` with a `srcset`) would let the preload scanner pick it up at HTML parse time, shaving a chunk of the 11 s LCP.
- **Fix**: render the hero background as a `next/image` with `priority` and `fetchPriority="high"`, behind the video, so the page has *something* paintable while the video buffers.

### PERF-005 — `next.config.ts` missing `experimental.optimizePackageImports`

- **Severity**: High · **Complexity**: 1
- **Where**: `next.config.ts`
- Heavy "barrel" packages are imported throughout the app without tree-shaking help:
  - `@tabler/icons-react` — 32 named icons imported in `components/shared/GlobalMainNav.tsx:32-64` alone
  - `lucide-react` — used across the app
  - `framer-motion` and `motion/react` — imported in 80+ components (see PERF-006)
  - `recharts` — pulled into 10 chart components
  - `@radix-ui/*` — 16 separate packages
  - `date-fns` — `format`, `formatDistanceToNow` used in 3 spots
- Without `experimental.optimizePackageImports`, Next/Webpack tree-shaking is best-effort and these packages tend to leak unused exports.
- **Fix** (config tweak):
  ```ts
  experimental: {
    optimizePackageImports: [
      "@tabler/icons-react",
      "lucide-react",
      "framer-motion",
      "motion",
      "recharts",
      "date-fns",
      "@rainbow-me/rainbowkit",
    ],
  },
  ```

### PERF-006 — Both `framer-motion` and `motion` installed; both used

- **Severity**: High · **Complexity**: 3
- **Where**: `package.json:69-76`; `components/**` (many files)
- `framer-motion@^12.23.24` and `motion@^12.38.0` are both dependencies. `motion` is the rebranded successor to `framer-motion` (same author, same API). Both APIs are in active use:
  - `from 'framer-motion'`: 28+ files (e.g. `components/poker/PokerTable.tsx:5`, `components/home/tokenomics-section.tsx:4`)
  - `from 'motion/react'`: 10+ files (e.g. `components/ui/animated-beam.tsx:4`, `components/chat/ChatSidebar.tsx:5`)
- This ships two parallel motion runtimes. Bundle savings if consolidated: ~50–80 KB gzip.
- **Fix**: pick one — `motion` is the canonical path forward — and codemod all imports. The two libraries are API-compatible for `motion`/`AnimatePresence` so a regex replace covers most cases.

### PERF-007 — Stream.io video SDK (~1+ MB) loaded eagerly on every poker table

- **Severity**: High · **Complexity**: 2
- **Where**: `app/poker/[tableId]/page.tsx:48` (static `import { VoiceChatPanel }`); `components/poker/VoiceChatPanel.tsx:9-10`; `hooks/use-poker-voice.ts:4`
- `VoiceChatPanel` statically imports `@stream-io/video-react-sdk` + the entire `@stream-io/video-react-sdk/dist/css/styles.css`. Every user who opens a poker table downloads the voice SDK whether they use voice or not. The CSS in particular is heavy.
- Voice chat is opt-in; gating it behind a button is reasonable.
- **Fix**: convert `VoiceChatPanel` to `dynamic(() => import('@/components/poker/VoiceChatPanel'), { ssr: false })` and only render it once the user opens the voice tray. Defer the SDK import inside `use-poker-voice` similarly with `await import(...)`.

### PERF-008 — `html2canvas` AND `html-to-image` both installed

- **Severity**: Medium · **Complexity**: 2
- **Where**: `package.json:70-71`; `components/BLACKJACK/ShareButton.tsx:4`, `components/PLINKO/ShareButton.tsx:4` (html2canvas); `components/poker/tournament/PokerTournamentSharePanel.tsx:4` (html-to-image)
- Two libraries doing the same job — render a DOM subtree to a canvas/blob. Source comments in `share-overlay-presets.tsx:6-8` explicitly call out that `html2canvas` can't parse modern `oklch()` colors, which is exactly why `html-to-image` was added for the poker share path.
- `html2canvas@^1.4.1` is ~190 KB minified. Keep only one.
- **Fix**: migrate the two `ShareButton.tsx` files to `html-to-image` (it handles modern CSS and is smaller). Then remove the `html2canvas` + `@types/html2canvas` deps.

### PERF-009 — Unused/redundant dependencies in `package.json`

- **Severity**: Medium · **Complexity**: 1
- **Where**: `package.json`
- Searching all `tsx`/`ts` files for imports yields zero hits for:
  - `react-shaders@^0.0.4` — never imported anywhere
  - `claude@^0.1.1` — never imported anywhere (looks like an accidental install of a placeholder package)
  - `embla-carousel-react@^8.6.0`, `embla-carousel-wheel-gestures@^8.1.0` — never imported anywhere
- Together these inflate `node_modules` and risk being accidentally pulled into bundles by IDE auto-imports.
- **Fix**: `npm uninstall claude react-shaders embla-carousel-react embla-carousel-wheel-gestures`.

### PERF-010 — Game pages eagerly import their entire feature surface (no `next/dynamic`)

- **Severity**: High · **Complexity**: 3
- **Where**: `app/BLACKJACK/page.tsx:1-48` (42 top-level imports, 2,713 lines), `app/poker/[tableId]/page.tsx:1-50` (45 imports, 1,031 lines), `app/PLINKO/page.tsx:1-37` (28 imports, 766 lines), `app/keno/page.tsx` (22 imports), `app/lottery/page.tsx` (20 imports)
- Each game route is a single fat `'use client'` page that imports the matter-js physics engine, charts (recharts), tournament UIs, modals, dashboards, share buttons, voice chat (poker), and several wagmi hooks at the top of the module.
- For example `PLINKO/page.tsx` imports `PlinkoBoardShell` (which transitively imports `matter-js` ~120 KB gzipped) at the top, even though the intro screen renders for 2.5 s before the board is ever needed.
- **Fix**: pull heavy children behind `next/dynamic` with `{ ssr: false, loading: () => <LoadingTip /> }`:
  - PLINKO: `PlinkoBoardShell` (matter-js), `PlinkoTopPlayers`, `PlinkoRecentPlays`, `PlinkoRecentGames`, `PlinkoPlayerDashboard`, `RealTimeBetChart`
  - BLACKJACK: charts, tournament HUD/overlays, audio manager, share button
  - Poker: `VoiceChatPanel` (PERF-007), share panel, leaderboard
  - Lottery/Keno: dashboards, charts
  This unblocks initial paint and avoids paying for code paths the user hasn't navigated into.

### PERF-011 — Raw 8 MB game-tile PNGs used as splash backgrounds

- **Severity**: High · **Complexity**: 2
- **Where**: `app/PLINKO/page.tsx:57` (`Morbius_Plinko.png`, 7.3 MB); analogous `IntroScreen`/splash patterns in other game pages; `public/morbius/Morbius_Blackjack.png` (8.4 MB), `public/morbius/Morbius_Lottery.png` (7.9 MB), `public/morbius/Morbius_Poker.png` (7.7 MB), `public/morbius/Morbius_Keno.png` (7.7 MB)
- These are referenced inside an inline-style `background-image: url('/morbius/Morbius_Plinko.png')` block, so neither the Next image optimizer nor `next/image` is involved. The browser fetches the raw 7.3 MB PNG and uses it as a full-screen splash for ~2.5 s.
- `public/` is **343 MB** total; `TassHubTable.png` alone is **23.8 MB**.
- **Fix**: pre-compress these to 1920×1080 (or 1280×720) WebP/AVIF — should drop each from ~8 MB to ~150 KB. Use `next/image` for any element that doesn't strictly need a CSS background.

### PERF-012 — Analytics API routes have no `revalidate` or caching, served as dynamic

- **Severity**: Medium · **Complexity**: 2
- **Where**: `app/api/analytics/*/route.ts` (7 routes)
- None of `app/api/analytics/series`, `platform`, `top-players`, `global-metrics`, `recent-wins`, `live-presence`, `global` export `revalidate` or `dynamic`. The inner `fetch` to the Railway backend sets `next: { revalidate: 60 }` (good), but the proxy route itself runs per request and re-allocates JSON each time.
- For aggregate analytics that already tolerate 60 s staleness on the inner fetch, the route handler can also tolerate caching.
- **Fix**: add `export const revalidate = 60` to each analytics route (or `export const dynamic = 'force-static'` plus `revalidate`). Use Next 16 cache components with `cacheLife('seconds')` if you want per-route control.

### PERF-013 — Render-blocking CSS chunk of 44 KB

- **Severity**: Medium · **Complexity**: 2
- **Where**: Lighthouse `render-blocking-insight` flags `https://morbius.io/_next/static/css/10d51f8c71e3bb52.css` (44 KB transfer, 160 ms wasted).
- Also flagged: `9722456a4ad99fe0.css` (4.5 KB). Tailwind v4 generates a single global CSS bundle by default — with broad selector usage across components, the global sheet bloats.
- Lighthouse `unused-css-rules` indicates 18 KiB of CSS can be stripped.
- **Fix**: enable Tailwind v4's `safelist` audit, prune unused utilities; consider `loading="lazy"` on cosmetic-only sheets. Move ConvAI widget-specific CSS to its own chunk that loads with the widget script.

### PERF-014 — Raw `<link>` tag for Google Fonts (Montserrat) instead of `next/font`

- **Severity**: Medium · **Complexity**: 1
- **Where**: `app/layout.tsx:106-109`
- Montserrat is fetched via a raw stylesheet `<link>` plus two `preconnect` tags. `next/font/google` would:
  - Self-host the font (no Google round-trip after CSS download)
  - Auto-set `font-display: swap`
  - Generate a fallback `size-adjust` to mitigate CLS
- Lighthouse's `font-display-insight` estimates 340 ms FCP savings (though that's mostly the FontAwesome fonts loaded by ElevenLabs — see PERF-019).
- **Fix**: import `Montserrat` from `next/font/google` and apply via CSS variable in the body className. Delete the three `<link>` tags.

### PERF-015 — Hand-rolled font CSS variables that contain empty strings

- **Severity**: Low · **Complexity**: 1
- **Where**: `app/layout.tsx:14-22`
- `const geistSans = { variable: "--font-geist-sans", className: "" }` — these dummies replicate the API of `next/font` but supply no font face. The body sets `className={`${geistSans.variable} ${geistMono.variable}`}` which produces literal `undefined`-like CSS variables.
- This appears to be vestigial from a prior `next/font` integration that was removed. Anything that styled itself with `var(--font-geist-sans)` is now silently falling back.
- **Fix**: either restore `next/font/google` (e.g. `import { Geist, Geist_Mono } from 'next/font/google'`) or drop the dummies and the className references.

### PERF-016 — `ChatSidebar` mounted globally in root layout, fully client

- **Severity**: Medium · **Complexity**: 2
- **Where**: `app/layout.tsx:122`; `components/chat/ChatSidebar.tsx` (223 lines, `'use client'`)
- The sidebar imports `motion/react` and `lucide-react` and renders on every route, including game pages where users rarely use it. Even though closed, the bundle cost is paid on first load.
- **Fix**: dynamic-import the sidebar with `ssr: false` and gate the WebSocket connection inside `ChatPanel` behind `open === true`. Saves ~30 KB on first paint plus the WS handshake.

### PERF-017 — `'use client'` density: ~76% of components (276 of 363) are client components

- **Severity**: Medium · **Complexity**: 5
- **Where**: across `components/**`
- Almost every component is `'use client'`, which means React Server Component benefits (zero-JS rendering for marketing copy, layout, tokenomics text) are not being captured. Even pure-text sections like `components/home/tokenomics-section.tsx` are client components because they pull in `framer-motion`.
- **Fix** (long arc): split each interactive page into a thin RSC shell that imports an `Animated*` client child only where animation/state is required. Replace decorative `motion` use with CSS transitions/keyframes for unanimated-by-default elements. This is architectural and best done one section at a time.

### PERF-018 — Wallet config eagerly registers 8 wallet connectors

- **Severity**: Medium · **Complexity**: 3
- **Where**: `lib/wagmi-config.ts:4-13, 41-...`
- All 8 wallet connectors (`metaMaskWallet`, `coinbaseWallet`, `trustWallet`, `rabbyWallet`, `okxWallet`, `walletConnectWallet`, `injectedWallet`, `rainbowWallet`) are statically imported and registered in `connectorsForWallets`. RainbowKit bundles each connector's dialog assets eagerly.
- **Fix**: keep this for now — RainbowKit doesn't trivially support lazy connectors — but consider moving non-popular wallets (Trust, OKX, Rabby) behind a "More wallets" group that lazily resolves at click time using `dynamic()` of a smaller `extraConnectors` config.

### PERF-019 — ElevenLabs ConvAI widget loads FontAwesome (260 KB of fonts) and 418 KB of unused JS

- **Severity**: Medium · **Complexity**: 2
- **Where**: `components/shared/ElevenLabsWidget.tsx:7-8`; loaded conditionally via `ElevenLabsWidgetGate`
- The widget itself is gated nicely (PERF-loaded with `requestIdleCallback` + first-interaction fallback) — that part is good. But once it loads it pulls:
  - `https://unpkg.com/@elevenlabs/convai-widget-embed@0.11.2/dist/index.js` — 418 KB transferred, 285 KB unused
  - Two FontAwesome WOFF2 files from `cdnjs.cloudflare.com` (~260 KB)
  - The widget loads on every non-game route including the home page
- **Fix**: hold the widget until first user interaction with the bottom-right corner (intersection observer on a placeholder div), OR vendor only the icons you actually use. Also add `<link rel="preconnect" href="https://unpkg.com">` and `https://cdnjs.cloudflare.com` since they're confirmed third-party origins.

### PERF-020 — Service worker precaches the entire build manifest

- **Severity**: Medium · **Complexity**: 3
- **Where**: `app/sw.ts:23-28`; `lib/serwist-precache-manifest.ts`
- Serwist's `__SW_MANIFEST` precaches the full build output. For a casino with 30+ route bundles (poker, blackjack, plinko, keno, lottery, roulette, admin, branding, claim, claim-fees, swap, creators, etc.), a returning user can find the SW thrashing on install/update — fetching megabytes the user doesn't currently care about.
- **Fix**: write a `manifestTransforms` filter (similar to the existing `encodeHashInPrecacheUrls`) that excludes chunks for games the current user hasn't visited (track first-visit in localStorage and only precache the home route + visited games). Keep the precache list under ~2 MB.

### PERF-021 — Tournament fetch issues 1+N RPC calls per row

- **Severity**: Medium · **Complexity**: 3
- **Where**: `server/src/services/tournament.service.ts:2018-2031`
- ```
  await Promise.all(list.map(async (item) => {
    if (!item.prize_token_address) return;
    const pool = await getEscrowPoolStatus(item.id);
    ...
  }));
  ```
- This runs `getEscrowPoolStatus` (a chain RPC call) once per tournament in the list. With ~50 active custom-token tournaments, the user waits on 50 sequential-ish (Promise.all parallel but bandwidth-limited) PulseChain RPCs.
- **Fix**: implement a multicall (`multicall3` aggregate3) helper that fetches all escrow pool statuses in one RPC, or cache per-tournament pool status in Postgres and only refresh on settlement events.

### PERF-022 — Build forcibly disables Turbopack ("we use webpack")

- **Severity**: Low · **Complexity**: 4
- **Where**: `next.config.ts:19-20`; `package.json:8`
- `npm run dev` uses Turbopack but `npm run build` uses webpack. Bundle differences between them (especially around tree-shaking and module concatenation) explain a chunk of the unused-JS findings. Production builds will continue to ship more code than dev appears to.
- **Fix**: medium-term, migrate the webpack-only IgnorePlugin tweaks to Turbopack's filter rules so both dev and build agree. Saves the disparity between what developers see locally and what users get.

### PERF-023 — No `images.formats` or remote pattern for `public/` assets in next.config

- **Severity**: Medium · **Complexity**: 1
- **Where**: `next.config.ts:21-29`
- The only `remotePatterns` entry is for `morbiuslotto-production.up.railway.app/uploads/**`. No `formats: ['image/avif', 'image/webp']` is specified, so Next defaults are used (which is fine for AVIF in 15+, but should be made explicit). No `deviceSizes`/`imageSizes` tuning — relevant because most images here are either banner-width or thumbnail.
- **Fix**:
  ```ts
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [320, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [64, 128, 256, 384],
    remotePatterns: [...],
  },
  ```

### PERF-024 — `serverActions` size limit, `compress`, and headers not configured

- **Severity**: Low · **Complexity**: 1
- **Where**: `next.config.ts`
- `compress` defaults to `true` but the document latency insight confirms compression is on (good). Still missing:
  - `poweredByHeader: false` (security + ~bytes per response)
  - `compiler.removeConsole` for production (a quick win — the codebase has plentiful `console.log`/`console.error` in client components that ship to users)
- **Fix**:
  ```ts
  poweredByHeader: false,
  compiler: { removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false },
  ```

### PERF-025 — `IntroScreen` components add 2.5 s artificial delay before content

- **Severity**: Low · **Complexity**: 1
- **Where**: `app/PLINKO/page.tsx:43-100`; similar patterns elsewhere
- Each game page has an intro splash that runs for a fixed 2,500 ms with `setTimeout`. While arguably brand polish, on slow connections this is on top of an already-slow LCP. The localStorage gating helps repeat visitors, but on first paint it still costs.
- **Fix**: reduce to 1,000 ms, or drop entirely once the page is interactive (resolve as soon as `PlinkoBoardShell` mounts).

---

## Cross-cutting observations

- **Image strategy is the dominant problem.** 22.1 MB of 24.5 MB total transfer is images. PERF-001/PERF-011 are responsible for ~90% of total page weight. Even if every JS finding is fixed, the byte budget stays painful until raw `<img>` and `background-image:` to-multi-MB-PNGs are replaced with optimized formats at the right resolution.
- **`next/image` is used inconsistently.** 31 components use `next/image`; 37 use raw `<img>`. The home page mixes both inside the same render path (`HomePageClient.tsx:89` uses `Image` for the fixed bg; child components use raw `<img>` for marketing tiles). Standardize on `next/image` everywhere unless there's a documented reason not to.
- **Client-component density wastes RSC.** 76% client component density is a sign that "use client" got applied at the top of subtrees that don't need state. PERF-017 is C5 but each game page can be pulled apart incrementally.
- **No `optimizePackageImports` despite the dependency profile screaming for it.** PERF-005 is one config line that touches all of: tabler-icons, lucide, motion, framer-motion, recharts, date-fns, radix.
- **Two-of-each-kind dependencies.** `motion` + `framer-motion`, `html2canvas` + `html-to-image`. Both happened because of a partial migration. Finish the migration.
- **Service worker is precaching too much** (PERF-020) on a site this large. Casino games are session-based — users go to one game and stay; aggressively precaching every other game's bundle is counter-productive.
- **Hooks look reasonable.** Sampled `use-blackjack-contract.ts` and `use-tournament.ts` (41 KB each) — both use proper `enabled:` gates on `useReadContract` and parallel reads. Not flagging as findings.

---

## Things that look fine

- **Server response time (30 ms)** — the document itself ships fast; nothing to do.
- **CLS (0.054)** — well under the 0.1 threshold.
- **TBT (70 ms)** — main-thread responsiveness post-load is good.
- **Modern HTTP** — Lighthouse confirms HTTP/2 everywhere it cares about.
- **Duplicated JavaScript** — Lighthouse score 1, no duplicate modules in bundles.
- **`compress`** — text compression is on (gzip/brotli).
- **DOM size (1,358 elements)** — under the 1,500 warning threshold.
- **`enabled:` gates in hooks** — sampled `use-blackjack-contract.ts` and the contract reads are properly gated on `isValidAddress` / `!!address` — no idle RPC traffic on cold loads.
- **ElevenLabs widget loading strategy** — gated behind `requestIdleCallback` + first-interaction. The widget *itself* is heavy (PERF-019) but the loading discipline is right.
- **Service worker correctly excludes `/api/*` and `/ws*` runtime caching** (per the comment in `app/sw.ts`). Right call for a casino app.
- **`canvas-confetti`** used directly (not via wrapper) per the README note — small and animation-frame-driven, no concern.
- **`@vercel/analytics`** loads via `next/script` strategy by default — no synchronous third-party script tags found in `app/layout.tsx`.
