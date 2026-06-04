import { ApiController } from '@reown/appkit-controllers'

/**
 * Workaround: force AppKit's "All Wallets" list to load every page.
 *
 * AppKit lazy-loads the wallet list one page at a time via an
 * IntersectionObserver on a `#local-paginator` sentinel (see
 * @reown/appkit-scaffold-ui's w3m-all-wallets-list). In our runtime that
 * observer never fires — verified on production: the grid scrolls, the observer
 * object exists, the sentinel scrolls into view, yet no `getWallets?page=2`
 * request is ever made, so the list is permanently stuck on the first page
 * (~37 of 88+). The identical AppKit code paginates correctly on other sites,
 * so the trigger is environmental and not fixable from our side.
 *
 * Instead of relying on the observer, we drive pagination from AppKit's own
 * controller state (same singleton the modal renders from): whenever
 * `ApiController.state.count` exceeds the number of wallets loaded, fetch the
 * next page. `fetchWalletsByPage` appends + dedupes
 * (`uniqueBy([...state.wallets, ...data])`) and advances `state.page`, so this
 * walks every page until the full list is in state — exactly what the observer
 * was supposed to do. Verified at the network layer: with this in place the
 * page 2/3 fetches fire (they never did before).
 *
 * `count` is only set once the All Wallets list runs its first fetch, so the
 * extra pages load only when the user actually opens All Wallets, and at most
 * once per session (the `pumping` guard).
 */
let pumping = false

async function pumpWallets(): Promise<void> {
  if (pumping) return
  pumping = true
  try {
    // 25 is a safe backstop well beyond any real wallet count.
    for (let i = 0; i < 25; i++) {
      const { count, wallets, page } = ApiController.state
      if (!count || wallets.length >= count) break
      const before = wallets.length
      await ApiController.fetchWalletsByPage({ page: page + 1 })
      // Stop if a page added nothing (e.g. chain-filtered total < reported
      // count) so we never spin fetching empty pages.
      if (ApiController.state.wallets.length <= before) break
    }
  } finally {
    pumping = false
  }
}

if (typeof window !== 'undefined') {
  ApiController.subscribeKey('count', () => void pumpWallets())
  ApiController.subscribeKey('wallets', () => void pumpWallets())
}
