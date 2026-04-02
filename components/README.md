# Components Inventory and Unused Master List

This file tracks component reachability and cleanup candidates across `components/`.

## Audit snapshot

- Scope: `components/**/*.ts(x)|js(x)` (runtime code files)
- Total component files scanned: `348`
- Reachable/used: `249`
- Unused candidates: `99`
- Method: static import graph reachability from runtime entrypoints (`app/`, `hooks/`, `lib/`), including alias imports (`@/components/...`) and relative imports.

## High-confidence unused master list

These files are currently unreachable from active app entrypoints.

### BIG-WHEEL
- `components/BIG-WHEEL/BettingPanel.tsx`
- `components/BIG-WHEEL/BigWheelGame.tsx`
- `components/BIG-WHEEL/CustomApprovalModal.tsx`
- `components/BIG-WHEEL/Footer.tsx`
- `components/BIG-WHEEL/HowToPlayModal.tsx`
- `components/BIG-WHEEL/MainNav.tsx`
- `components/BIG-WHEEL/PayoutTableModal.tsx`
- `components/BIG-WHEEL/SlotMachine.tsx`
- `components/BIG-WHEEL/SwapModal.tsx`
- `components/BIG-WHEEL/WinHistoryModal.tsx`

### blackjack-multi (lowercase legacy set)
- `components/blackjack-multi/BJMultiActionButtons.tsx`
- `components/blackjack-multi/BJMultiBettingPanel.tsx`
- `components/blackjack-multi/BJMultiDealer.tsx`
- `components/blackjack-multi/BJMultiSeat.tsx`

### BLACKJACK
- `components/BLACKJACK/BlackjackTopPlayersCarousel.tsx`
- `components/BLACKJACK/BlackjackTopPlayersLayouts.tsx`
- `components/BLACKJACK/BlackjackTopPlayersOverlay.tsx`
- `components/BLACKJACK/GameHistoryLayouts.tsx`
- `components/BLACKJACK/HistoryStrip.tsx`

### admin
- `components/admin/AdminStakingTab.tsx`

### animate-ui
- `components/animate-ui/components/community/share-button.tsx`

### auth
- `components/auth/SignaturePrompt.tsx`

### chat
- `components/chat/GlobalChat.tsx`
- `components/chat/PlayerStatsModal.tsx`

### contracts
- `components/contracts/keno-interface.tsx`
- `components/contracts/lottery-interface.tsx`

### CryptoKeno
- `components/CryptoKeno/keno-stats-display.tsx`

### demos / showcase
- `components/cards-demo-1.tsx`
- `components/cards-demo-2.tsx`
- `components/cards-demo-3.tsx`
- `components/expandable-card-demo-grid.tsx`
- `components/expandable-card-demo-standard.tsx`
- `components/hero-parallax-demo.tsx`
- `components/multi-step-loader-demo.tsx`

### Meme-Generator
- `components/Meme-Generator/LayerEditor.tsx`
- `components/Meme-Generator/MemeSelector.tsx`

### home
- `components/home/aces-parallax-section.tsx`
- `components/home/blackjack-promo-card.tsx`
- `components/home/blackjack-section.tsx`
- `components/home/blackjack-tournaments-card.tsx`
- `components/home/buy-morbius-modal.tsx`
- `components/home/disclaimer-modal.tsx`
- `components/home/header.tsx`
- `components/home/latest-burns.tsx`
- `components/home/latest-wins.tsx`
- `components/home/RoadMap.tsx`

### lottery
- `components/lottery/all-tickets-accordion.tsx`
- `components/lottery/ball-draw-simulator/BallDrawSimulator.tsx`
- `components/lottery/bento-grid-lottery.tsx`
- `components/lottery/bracket-display.tsx`
- `components/lottery/free-ticket-badge.tsx`
- `components/lottery/header.tsx`
- `components/lottery/locked-round-countdown.tsx`
- `components/lottery/lottery-ticket.tsx`
- `components/lottery/modals/ball-draw-modal.tsx`
- `components/lottery/modals/how-to-play-modal.tsx`
- `components/lottery/modals/multi-claim-modal.tsx`
- `components/lottery/modals/previous-rounds-brackets-modal.tsx`
- `components/lottery/modals/round-history-modal.tsx`
- `components/lottery/modals/switch-modal.tsx`
- `components/lottery/modals/your-results-modal.tsx`
- `components/lottery/morbius-movement-feed.tsx`
- `components/lottery/player-stats-modal.tsx`
- `components/lottery/player-tickets-modal.tsx`
- `components/lottery/purchase-summary-modal.tsx`
- `components/lottery/round-finalized-transactions.tsx`
- `components/lottery/round-history.tsx`
- `components/lottery/round-timer.tsx`
- `components/lottery/ticket-purchase-accordion.tsx`
- `components/lottery/ticket-purchase-builder.tsx`

### Parallax
- `components/Parallax/CardFanSection.tsx`

### PLINKO
- `components/PLINKO/Controls.tsx`
- `components/PLINKO/PlinkoGameConfigurable.tsx`
- `components/PLINKO/ScoreDisplay.tsx`
- `components/PLINKO/SettingsNav.tsx`

### poker
- `components/avatar/CharacterCreatorMobile.tsx`
- `components/avatar/ColorSwatch.tsx`
- `components/poker/PokerTutorialOverlay.tsx`
- `components/poker/tournament/PokerTournamentLeaderboard.tsx`

### shared
- `components/shared/player-purchase-history.tsx`

### ui (see also `components/ui/README.md`)
- `components/ui/checkbox.tsx`
- `components/ui/confetti.tsx`
- `components/ui/glowing-stars.tsx`
- `components/ui/hero-parallax.tsx`
- `components/ui/infinite-moving-cards.tsx`
- `components/ui/iphone.tsx`
- `components/ui/meteors.tsx`
- `components/ui/multi-step-loader.tsx`
- `components/ui/pixel-image.tsx`
- `components/ui/ripple-button.tsx`
- `components/ui/scroll-area.tsx`
- `components/ui/sheet.tsx`
- `components/ui/skeleton.tsx`
- `components/ui/tooltip.tsx`

### misc
- `components/wallet-debug.tsx`

## Orphan clusters to clean in order

1. Route-removed game stacks: `BIG-WHEEL`, `Meme-Generator`
2. Legacy duplicate stack: `components/blackjack-multi/*` (vs active `components/BLACKJACK/multi/*`)
3. Dead lottery subtree: `components/lottery/*` + related `components/contracts/*`
4. Demo-only components and showcase utilities
5. Shared UI leftovers after route-level cleanup

## Notes

- This is static-reachability based; always re-check before deleting if a file is currently being edited in branch work.
- Some files may be intentionally parked for near-term reintroduction; mark those as "kept intentionally" before deletion.

## Cleanup progress

### Completed: Safe batch 1

Deleted:

- `components/BIG-WHEEL/BettingPanel.tsx`
- `components/BIG-WHEEL/BigWheelGame.tsx`
- `components/BIG-WHEEL/CustomApprovalModal.tsx`
- `components/BIG-WHEEL/HowToPlayModal.tsx`
- `components/BIG-WHEEL/MainNav.tsx`
- `components/BIG-WHEEL/PayoutTableModal.tsx`
- `components/BIG-WHEEL/SlotMachine.tsx`
- `components/BIG-WHEEL/SwapModal.tsx`
- `components/BIG-WHEEL/WinHistoryModal.tsx`
- `components/Meme-Generator/LayerEditor.tsx`
- `components/Meme-Generator/MemeSelector.tsx`
- `components/cards-demo-1.tsx`
- `components/cards-demo-2.tsx`
- `components/cards-demo-3.tsx`
- `components/expandable-card-demo-grid.tsx`
- `components/expandable-card-demo-standard.tsx`
- `components/hero-parallax-demo.tsx`
- `components/multi-step-loader-demo.tsx`
- `components/Parallax/CardFanSection.tsx`
- `components/wallet-debug.tsx`

Skipped due to local modifications in current branch:

- `components/BIG-WHEEL/Footer.tsx`

### Completed: Safe batch 2

Deleted:

- `components/blackjack-multi/BJMultiActionButtons.tsx`
- `components/blackjack-multi/BJMultiBettingPanel.tsx`
- `components/blackjack-multi/BJMultiDealer.tsx`
- `components/blackjack-multi/BJMultiSeat.tsx`
- `components/chat/PlayerStatsModal.tsx`
- `components/contracts/keno-interface.tsx`
- `components/contracts/lottery-interface.tsx`
- `components/CryptoKeno/keno-stats-display.tsx`
- `components/home/aces-parallax-section.tsx`
- `components/home/blackjack-promo-card.tsx`
- `components/home/blackjack-section.tsx`
- `components/home/blackjack-tournaments-card.tsx`
- `components/home/buy-morbius-modal.tsx`
- `components/home/disclaimer-modal.tsx`
- `components/home/latest-burns.tsx`
- `components/home/latest-wins.tsx`
- `components/admin/AdminStakingTab.tsx`
- `components/animate-ui/components/community/share-button.tsx`
- `components/shared/player-purchase-history.tsx`

### Completed: Safe batch 3

Deleted:

- `components/auth/SignaturePrompt.tsx`
- `components/lottery/all-tickets-accordion.tsx`
- `components/lottery/ball-draw-simulator/BallDrawSimulator.tsx`
- `components/lottery/bracket-display.tsx`
- `components/lottery/free-ticket-badge.tsx`
- `components/lottery/locked-round-countdown.tsx`
- `components/lottery/lottery-ticket.tsx`
- `components/lottery/modals/ball-draw-modal.tsx`
- `components/lottery/modals/how-to-play-modal.tsx`
- `components/lottery/modals/multi-claim-modal.tsx`
- `components/lottery/modals/previous-rounds-brackets-modal.tsx`
- `components/lottery/modals/round-history-modal.tsx`
- `components/lottery/modals/switch-modal.tsx`
- `components/lottery/modals/your-results-modal.tsx`
- `components/lottery/morbius-movement-feed.tsx`
- `components/lottery/player-stats-modal.tsx`
- `components/lottery/player-tickets-modal.tsx`
- `components/lottery/purchase-summary-modal.tsx`
- `components/lottery/round-finalized-transactions.tsx`
- `components/lottery/round-history.tsx`
- `components/lottery/round-timer.tsx`
- `components/lottery/ticket-purchase-accordion.tsx`
- `components/lottery/ticket-purchase-builder.tsx`
- `components/ui/checkbox.tsx`
- `components/ui/glowing-stars.tsx`
- `components/ui/hero-parallax.tsx`
- `components/ui/meteors.tsx`
- `components/ui/multi-step-loader.tsx`
- `components/ui/pixel-image.tsx`
- `components/ui/ripple-button.tsx`
- `components/ui/scroll-area.tsx`
- `components/ui/skeleton.tsx`
- `components/ui/tooltip.tsx`
- `components/poker/PokerTutorialOverlay.tsx`
- `components/poker/tournament/PokerTournamentLeaderboard.tsx`
- `components/PLINKO/Controls.tsx`
- `components/PLINKO/PlinkoGameConfigurable.tsx`
- `components/PLINKO/ScoreDisplay.tsx`
- `components/PLINKO/SettingsNav.tsx`

Skipped due to local modifications in current branch:

- `components/chat/GlobalChat.tsx`
- `components/lottery/bento-grid-lottery.tsx`
- `components/lottery/header.tsx`

### Completed: Keno-specific verification cleanup

Deleted after targeted usage verification:

- `components/CryptoKeno/keno-ticket.tsx`
- `components/CryptoKeno/keno-ticket-barcode.tsx`
