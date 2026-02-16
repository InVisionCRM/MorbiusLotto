import Link from 'next/link';

/**
 * Custom 404 page. Must be a Server Component (no 'use client') to avoid
 * WagmiProviderNotFoundError during Next.js static prerender - client components
 * that use wagmi hooks can fail when /_not-found is prerendered.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 to-gray-950 text-white p-6">
      <h1 className="text-4xl font-bold mb-2">404</h1>
      <p className="text-gray-400 mb-6">Page not found</p>
      <Link
        href="/"
        className="px-6 py-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-white font-semibold transition-colors"
      >
        Return Home
      </Link>
    </div>
  );
}
