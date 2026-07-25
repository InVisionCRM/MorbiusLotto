import { defaultCache } from "@serwist/next/worker";
import { NetworkOnly } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Morbius PWA Service Worker (Serwist-managed)
 *
 * defaultCache provides stale-while-revalidate for static assets and
 * network-first for navigations. Serwist auto-generates the precache
 * manifest from the Next.js build output.
 *
 * DO NOT add runtime caching for /api/* or /ws* routes. This is a
 * casino app — serving stale balances or game results would be dangerous.
 */

/**
 * Third-party web3 infrastructure that must ALWAYS hit the network and never
 * be cached/expired by the SW.
 *
 * defaultCache ends with a catch-all rule — `matcher: ({ sameOrigin }) =>
 * !sameOrigin` — that funnels EVERY cross-origin GET into a single NetworkFirst
 * cache capped at `maxEntries: 32`. When the WalletConnect / Reown AppKit
 * "All Wallets" list opens it fires a burst of 40+ cross-origin requests at a
 * time (the paginated wallet list + one icon per wallet). Routing that burst
 * through a 32-entry cache + ExpirationPlugin stalls every request past the cap
 * under concurrency — so the modal renders ~the first 15-20 wallets and then
 * spins forever, with no console/network error (the requests are owned by the
 * SW and just sit "pending"). Caching third-party RPC responses would also be
 * unsafe here. NetworkOnly bypasses all of it.
 *
 * This only manifests in production builds — the SW is disabled in dev
 * (`disable` in next.config.ts), which is why it doesn't repro under `npm run dev`.
 */
const WEB3_INFRA_HOST_SUFFIXES = [
  "web3modal.org", // api.web3modal.org — wallet explorer list + icons
  "walletconnect.org", // relay.walletconnect.org + pulse.walletconnect.org analytics
  "walletconnect.com", // explorer-api.walletconnect.com (legacy) + relay
  "reown.com",
  "pulsechain.com", // scan.pulsechain.com / api.scan.pulsechain.com
  "g4mm4.io", // rpc-pulsechain.g4mm4.io — primary RPC ("gamma")
  "pulsechainstats.com", // rpc.pulsechainstats.com — backup RPC
];

function isWeb3Infra(url: URL): boolean {
  const host = url.hostname;
  return WEB3_INFRA_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Web3 infra rule MUST come before defaultCache: Serwist uses the first
  // matching route, and defaultCache's cross-origin catch-all would otherwise
  // swallow these requests into the 32-entry "cross-origin" NetworkFirst cache.
  runtimeCaching: [
    {
      matcher: ({ url }: { url: URL }) => isWeb3Infra(url),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
