# App Routes Notes

This file tracks high-level App Router route status for cleanup work under `app/`.

## Removed routes (cleanup pass)

The following route pages were intentionally removed because they are not in use:

- `app/Layout/page.tsx`
- `app/donate/page.tsx`
- `app/BIG-WHEEL/page.tsx`
- `app/lottery-purchase-showcase/page.tsx`
- `app/keno-dashboard/page.tsx`
- `app/plinko-simulator/page.tsx`
- `app/plinko-stats/page.tsx`
- `app/plinko-verifier/page.tsx`
- `app/plinko-dashboard/page.tsx`
- `app/poker/designer/page.tsx`
- `app/poker/demo/page.tsx`
- `app/BIG-WHEEL/`
## Follow-up cleanup applied

- Updated navigation and route maps to stop linking to removed routes.
- Replaced dead links with active destinations or existing in-page modal flows.
- Removed obsolete redirects for removed routes in `next.config.ts`.

## Next suggested route-level cleanup


- Continue orphan detection for route-specific components/hooks no longer referenced by active routes.
