# Stream promo videos

Short (6 s, 16:9, silent) background clips for the stream promo pop-ups and the intermission loop
(`view.html` + `promos.json`). Generated on 2026-11-11 with Grok Imagine (Grok Bot's GenerateVideo tool),
text-to-video, 720p, then re-encoded to 640 px wide (`.mp4` H.264 and `.webm` VP9; the stream uses WebM).

The clips deliberately contain **no text or logos** (AI-rendered text garbles). All words, URLs and the
Morbius purple branding are drawn on top by the stream compositor from `promos.json`.

| File | Topic | Prompt summary |
|---|---|---|
| brand | $Morbius on #PulseChain brand spot | violet energy pulse over a dark blockchain grid |
| scan | scan.morbius.io token analyzer | holographic crypto charts, purple neon |
| nokyc | NO KYC | padlock opening and dissolving into violet particles |
| community | community / "players love it" (generic, no quotes or ratings) | friends cheering at a neon poker table |
| sponsor | sponsorship opportunities | arena with blank glowing purple billboards |
| game-blackjack | Blackjack | dealer flips ace + king |
| game-plinko | Plinko | ball bouncing down a neon peg board |
| game-crash | Crash | rocket with a rising purple trail |
| game-mines | Mines | tiles flipping to gems, one bomb |
| game-roulette | Roulette | spinning wheel, ball settling |
| game-dice | Dice | glowing dice tumbling |
| game-keno | Keno | lottery balls in a glowing sphere |
| game-baccarat | Baccarat | dealer paddles cards at a high-roller table |
| game-craps | Craps | dice thrown down a craps table |

Games without their own clip are listed on the text-only "More on Morbius" card. Game list taken from
`components/home/games-section.tsx`.

## Cash-stream promo card (view.html `#cashPromo`)

| File | Source |
|---|---|
| poker-tile-art.webp | `public/home2/tiles/poker.webp` (the homepage POKER tile), cropped to the table/cards above its painted title |
| m-mark.png | `public/home2/m-mark.png` (the M mark in the homepage tiles' "Exclusive" ribbon) |
| pulsechain-logo.png | `public/Pulse Branding/Logo/ball.png`, resized |
| poppins-600/700/800/900.woff2 | Poppins (Google Fonts, SIL Open Font License), latin subset; the homepage's font, bundled so the stream renderer never falls back to a system font |
| qr-morbius-poker.svg | QR for https://morbius.io/poker (version 2, ECC M), generated with the `qrcode` package; shown only with STREAM_CASH_PROMO_QR=1 |
