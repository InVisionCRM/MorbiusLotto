'use client';

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 to-gray-950 text-white p-6">
      <h1 className="text-3xl font-bold mb-2">You're Offline</h1>
      <p className="text-gray-400 mb-6 text-center max-w-sm">
        Morbius needs an internet connection for live gameplay. Please reconnect and try again.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="px-6 py-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-white font-semibold transition-colors"
      >
        Retry
      </button>
    </div>
  );
}
