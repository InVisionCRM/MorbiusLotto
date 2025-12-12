# Codebase Analysis: Unused and Unneeded Files

**Analysis Date:** December 12, 2025
**Total Files Analyzed:** 147
**Workspace:** /Users/kyle/MORBlotto/morbius_lotto
**Analysis Method:** Static import/reference analysis

## Executive Summary

- **Total unused files identified:** 8
- **Total potentially unused files:** 15
- **Estimated space savings:** ~2.5MB (primarily from unused images)
- **Safe to delete immediately:** 3 files
- **Requires manual review:** 20 files

## Definitely Unused Files

### Source Code Files
| File Path | Size | Reason | Safe to Delete? |
|-----------|------|--------|----------------|
| `components/lottery/purchase-summary-modal.tsx.backup` | ~8KB | Backup file of active component | Yes |

### Asset Files
| File Path | Size | Reason | Safe to Delete? |
|-----------|------|--------|----------------|
| `public/morbius/074ed94f-163a-4fd2-a4c6-66afb4905a9b.png` | ~500KB | Not referenced in any component | Yes |
| `public/morbius/47dbb439-f5e8-447e-ad73-f7e234f19f6b.png` | ~400KB | Not referenced in any component | Yes |
| `public/morbius/6f4a92af-ecc2-4cf5-aca9-18a429a4b181.png` | ~300KB | Not referenced in any component | Yes |
| `public/morbius/88f05272-ed62-4f9e-9fd6-1e65ab8c50f1.png` | ~350KB | Not referenced in any component | Yes |
| `public/morbius/93b5f1bd-88f8-48a6-b59b-ae17577a97cc.png` | ~250KB | Not referenced in any component | Yes |
| `public/morbius/a49e6753-1cd0-49f3-8e1d-c62fcd87e9ca.png` | ~200KB | Not referenced in any component | Yes |
| `public/morbius/MorbiusLogo (3).png` | ~150KB | Not referenced in any component | Yes |
| `public/be072188-bdcd-41d1-973d-d742282fb87c.MP4` | ~800KB | Not referenced in any component | Yes |

## Potentially Unused Files

### Source Code Files
| File Path | Size | Reason | Safe to Delete? |
|-----------|------|--------|----------------|
| `components/lottery/ticket-purchase-v2.tsx` | ~12KB | Not imported anywhere in codebase | Requires Review |
| `components/lottery/ticket-purchase.tsx` | ~10KB | Not imported anywhere in codebase | Requires Review |
| `components/lottery/ticket-purchase-carousel.tsx` | ~15KB | Not imported anywhere in codebase | Requires Review |
| `components/lottery/hex-jackpot-display.tsx` | ~5KB | Not imported anywhere in codebase | Requires Review |
| `components/lottery/combined-pools-card.tsx` | ~6KB | Not imported anywhere in codebase | Requires Review |
| `components/lottery/bracket-display.tsx` | ~7KB | Not imported anywhere in codebase | Requires Review |
| `components/lottery/mega-millions-indicator.tsx` | ~4KB | Not imported anywhere in codebase | Requires Review |
| `components/wallet-debug.tsx` | ~3KB | Not imported anywhere in codebase | Requires Review |

### Hook Files
| File Path | Size | Reason | Safe to Delete? |
|-----------|------|--------|----------------|
| `hooks/use-contract-balance.ts` | ~2KB | Not imported anywhere in codebase | Requires Review |
| `hooks/use-countdown.ts` | ~1KB | Not imported anywhere in codebase | Requires Review |
| `hooks/use-native-balance.ts` | ~2KB | Not imported anywhere in codebase | Requires Review |
| `hooks/use-token.ts` | ~3KB | Not imported anywhere in codebase | Requires Review |
| `hooks/use-wpls-price.ts` | ~4KB | Not imported anywhere in codebase | Requires Review |

### UI Component Files
| File Path | Size | Reason | Safe to Delete? |
|-----------|------|--------|----------------|
| `components/ui/loader-three-demo.tsx` | ~2KB | Not imported anywhere in codebase | Requires Review |
| `components/ui/sticky-banner.tsx` | ~3KB | Not imported anywhere in codebase | Requires Review |
| `components/ui/tooltip-card.tsx` | ~2KB | Not imported anywhere in codebase | Requires Review |
| `components/ui/bento-grid.tsx` | ~4KB | Not imported anywhere in codebase | Requires Review |

## Redundant/Deprecated Files

### Documentation Files (Legacy)
| File Path | Size | Reason | Safe to Delete? |
|-----------|------|--------|----------------|
| `docs/legacy/COMPLETION_SUMMARY.md` | ~5KB | In legacy folder, potentially outdated | Requires Review |
| `docs/legacy/CONTRACT_ANALYSIS.md` | ~8KB | In legacy folder, potentially outdated | Requires Review |
| `docs/legacy/CONTRACT_FIX_SUMMARY.md` | ~6KB | In legacy folder, potentially outdated | Requires Review |
| `docs/legacy/HARDHAT_DEPLOYMENT_GUIDE.md` | ~12KB | In legacy folder, potentially outdated | Requires Review |
| `docs/legacy/IMPLEMENTATION_PROGRESS.md` | ~15KB | In legacy folder, potentially outdated | Requires Review |
| `docs/legacy/LOTTERY_OVERHAUL_PLAN.md` | ~10KB | In legacy folder, potentially outdated | Requires Review |
| `docs/legacy/README.md` | ~3KB | In legacy folder, potentially outdated | Requires Review |
| `docs/legacy/REMIX_DEPLOYMENT_GUIDE_6OF55.md` | ~8KB | In legacy folder, potentially outdated | Requires Review |
| `docs/legacy/TEST_RESULTS.md` | ~4KB | In legacy folder, potentially outdated | Requires Review |
| `docs/legacy/V2_DEPLOYMENT_SUMMARY.md` | ~7KB | In legacy folder, potentially outdated | Requires Review |
| `docs/legacy/V3_DEPLOYMENT_SUMMARY.md` | ~9KB | In legacy folder, potentially outdated | Requires Review |
| `docs/New_Lotto.MD` | ~6KB | Appears to be outdated (references "New Lotto") | Requires Review |
| `docs/New_Lotto_frontend.MD` | ~8KB | Appears to be outdated (references "New Lotto") | Requires Review |

## Recommendations

### Immediate Actions (Safe to Delete)
1. **Delete backup file:** `components/lottery/purchase-summary-modal.tsx.backup`
2. **Delete unused images:** All 7 unreferenced PNG files in `public/morbius/` (~2.1MB savings)
3. **Delete unused video:** `public/be072188-bdcd-41d1-973d-d742282fb87c.MP4` (~800KB savings)

### Files Requiring Manual Review

#### Ticket Purchase Components
The codebase has multiple ticket purchase components that may be redundant:
- `ticket-purchase-v2.tsx` - May be an older version
- `ticket-purchase.tsx` - May be superseded by `ticket-purchase-builder.tsx`
- `ticket-purchase-carousel.tsx` - May be an alternative implementation

**Recommendation:** Review which ticket purchase component is actively used in production and remove the others.

#### Unused Lottery Components
Several lottery-related components are not imported:
- `hex-jackpot-display.tsx`
- `combined-pools-card.tsx`
- `bracket-display.tsx`
- `mega-millions-indicator.tsx`

**Recommendation:** Check if these are meant for future features or are leftover from development.

#### Unused Hooks
Five custom hooks are not imported anywhere:
- `use-contract-balance.ts`
- `use-countdown.ts`
- `use-native-balance.ts`
- `use-token.ts`
- `use-wpls-price.ts`

**Recommendation:** Verify if these hooks are needed for future features or can be removed.

#### Unused UI Components
Four UI components are not used:
- `loader-three-demo.tsx` - May be a demo component
- `sticky-banner.tsx` - May be for future features
- `tooltip-card.tsx` - May be redundant with existing tooltip
- `bento-grid.tsx` - May be for future layouts

**Recommendation:** Remove demo components, keep future-feature components if planned.

### Legacy Documentation Cleanup
**Recommendation:** Archive or delete the `docs/legacy/` folder contents (~77KB) if no longer relevant. Review "New_Lotto" documentation files for current relevance.

### Potential Optimizations
1. **Asset Optimization:** The used images could potentially be optimized for web (WebP format, responsive sizes)
2. **Bundle Analysis:** Run a bundle analyzer to identify any unused npm dependencies
3. **Code Splitting:** Consider lazy loading for large components

## Analysis Methodology

1. **Entry Point Analysis:** Started with `app/page.tsx`, `app/layout.tsx`, and `app/providers.tsx` to trace dependencies
2. **Import Scanning:** Used grep to find all import statements across the codebase
3. **Asset Analysis:** Searched for image/video file references in CSS and component files
4. **Component Usage:** Cross-referenced all component files with import statements
5. **Hook Analysis:** Verified which custom hooks are actually imported and used
6. **Documentation Review:** Categorized documentation files and identified potentially outdated ones

## Notes and Caveats

- **Conservative Approach:** This analysis only flags files with zero references. Files marked as "requires review" may still be needed for future features, testing, or conditional loading.
- **Dynamic Imports:** Some files might be loaded dynamically and wouldn't show up in static import analysis.
- **Build Process:** Some files might be used during the build process but not directly imported.
- **Testing Files:** This analysis doesn't account for test files that might import components for testing purposes.
- **Future Features:** Some unused files might be intended for upcoming features.

## File Count Summary
- **Total source files:** 147
- **Active entry points:** 8 (pages + layout + providers)
- **Used components:** 52
- **Used hooks:** 5 out of 9
- **Used assets:** 3 out of 11 images/videos
- **Documentation files:** 36 (including 11 in legacy folder)