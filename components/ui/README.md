# UI Components Inventory

This file tracks `components/ui` usage and cleanup decisions.

## Cleanup pass completed

Removed as unused (no static imports found in app/components/hooks/lib/server):

- `components/ui/animated-modal.tsx`
- `components/ui/animated-tooltip.tsx`
- `components/ui/background-boxes.tsx`
- `components/ui/background-gradient-animation.tsx`
- `components/ui/carousel.tsx`
- `components/ui/colourful-text.tsx`
- `components/ui/dock.tsx`
- `components/ui/floating-dock.tsx`
- `components/ui/light-rays.tsx`
- `components/ui/loader-three-demo.tsx`
- `components/ui/moving-border.tsx`
- `components/ui/navigation-menu.tsx`
- `components/ui/ripple.tsx`
- `components/ui/social-clock.tsx`
- `components/ui/spotlight-new.tsx`
- `components/ui/stateful-button.tsx`
- `components/ui/sticky-banner.tsx`
- `components/ui/system-time.tsx`
- `components/ui/tooltip-card.tsx`
- `components/ui/3d-card.tsx`
- `components/ui/3d-marquee.tsx`

## Kept for now

- `components/ui/infinite-moving-cards.tsx` (detected as currently modified in local branch; skipped to avoid removing active work)
- `components/ui/confetti.tsx` (delete request was rejected)
- `components/ui/iphone.tsx` (delete request was rejected)

## Verification notes

- No broken imports were found after removals for the deleted file set.
- Keep this file updated whenever `components/ui` files are added, removed, or repurposed.
