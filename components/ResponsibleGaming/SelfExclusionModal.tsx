'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { getWebSocketUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient } from '@/lib/websocket-client';

type DurationType = '24h' | '7d' | '30d' | '6m' | '1y' | 'permanent';

interface ExclusionStatus {
  isExcluded: boolean;
  exclusionType: 'timeout' | 'permanent' | null;
  expiresAt: string | null;
  durationLabel: string | null;
  createdAt: string | null;
}

interface SelfExclusionModalProps {
  isOpen: boolean;
  onClose: () => void;
  wsClient?: BlackjackWebSocketClient | null;
}

const DURATION_OPTIONS: { value: DurationType; label: string; description: string }[] = [
  { value: '24h', label: '24 Hours', description: 'Take a short break' },
  { value: '7d', label: '7 Days', description: 'One week cooling-off' },
  { value: '30d', label: '30 Days', description: 'One month break' },
  { value: '6m', label: '6 Months', description: 'Extended break' },
  { value: '1y', label: '1 Year', description: 'Long-term break' },
  { value: 'permanent', label: 'Permanent', description: 'Irreversible self-exclusion' },
];

export function SelfExclusionModal({ isOpen, onClose, wsClient: externalClient }: SelfExclusionModalProps) {
  const { address } = useAccount();
  const [status, setStatus] = useState<ExclusionStatus | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<DurationType | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmStep, setConfirmStep] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [internalClient, setInternalClient] = useState<BlackjackWebSocketClient | null>(null);

  const client = externalClient || internalClient;

  // Create internal WebSocket client if none provided
  useEffect(() => {
    if (!isOpen || !address || externalClient) return;

    const wsUrl = getWebSocketUrlOptional();
    if (!wsUrl) {
      setError('WebSocket server not configured. Responsible gaming is unavailable.');
      setInternalClient(null);
      return;
    }

    setError(null);
    const ws = new BlackjackWebSocketClient(wsUrl, address);
    ws.connect()
      .then(() => setInternalClient(ws))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to connect'));

    return () => {
      ws.disconnect();
      setInternalClient(null);
    };
  }, [isOpen, address, externalClient]);

  // Fetch current status when modal opens
  useEffect(() => {
    if (!isOpen || !client?.isConnected() || !address) return;

    const fetchStatus = async () => {
      try {
        setLoading(true);
        const result = await client.checkExclusionStatus();
        setStatus(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to check status');
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [isOpen, client, address]);

  const handleSetExclusion = async () => {
    if (!client?.isConnected() || !selectedDuration) return;

    // For permanent exclusion, require confirmation text
    if (selectedDuration === 'permanent' && confirmText !== 'PERMANENTLY EXCLUDE') {
      setError('Please type "PERMANENTLY EXCLUDE" to confirm');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await client.setExclusion(selectedDuration, reason || undefined);

      if (result.success) {
        setStatus({
          isExcluded: result.isExcluded,
          exclusionType: result.exclusionType,
          expiresAt: result.expiresAt,
          durationLabel: result.durationLabel,
          createdAt: new Date().toISOString()
        });
        setConfirmStep(false);
        setSelectedDuration(null);
        setConfirmText('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set exclusion');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  const getTimeRemaining = (expiresAt: string | null) => {
    if (!expiresAt) return 'Permanent';
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diff = expiry.getTime() - now.getTime();

    if (diff <= 0) return 'Expired';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ${hours}h remaining`;
    return `${hours} hour${hours > 1 ? 's' : ''} remaining`;
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-lg rounded-2xl overflow-hidden border border-amber-500/30 shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{
          background: 'linear-gradient(145deg, rgb(30, 25, 20), rgb(40, 35, 30))',
          boxShadow: '0 0 40px rgba(245, 158, 11, 0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b border-amber-500/20"
          style={{ background: 'linear-gradient(to right, rgba(245, 158, 11, 0.15), transparent)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-amber-300 font-semibold text-lg">Responsible Gaming</h2>
              <p className="text-white/50 text-xs">Self-exclusion & cooling-off periods</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800/80 border border-amber-500/20 text-white/70 hover:text-white flex items-center justify-center transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {!address && (
            <div className="text-center py-8 text-white/50">
              <p>Please connect your wallet to manage responsible gaming settings.</p>
            </div>
          )}

          {address && loading && !status && (
            <div className="text-center py-8">
              <div className="inline-block w-6 h-6 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
              <p className="text-white/50 text-sm mt-2">Loading...</p>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Current Status */}
          {address && status && (
            <div className={`p-4 rounded-xl ${
              status.isExcluded
                ? 'bg-red-500/10 border border-red-500/20'
                : 'bg-emerald-500/10 border border-emerald-500/20'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${status.isExcluded ? 'bg-red-400' : 'bg-emerald-400'}`} />
                <span className={`font-medium ${status.isExcluded ? 'text-red-400' : 'text-emerald-400'}`}>
                  {status.isExcluded ? 'Currently Excluded' : 'Account Active'}
                </span>
              </div>
              {status.isExcluded && (
                <div className="text-sm text-white/70 space-y-1">
                  <p>Type: <span className="text-white">{status.exclusionType === 'permanent' ? 'Permanent Self-Exclusion' : `Temporary (${status.durationLabel})`}</span></p>
                  {status.expiresAt && (
                    <p>Expires: <span className="text-white">{formatDate(status.expiresAt)}</span></p>
                  )}
                  <p className="text-amber-400 font-medium mt-2">
                    {getTimeRemaining(status.expiresAt)}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Set Exclusion (only if not already excluded) */}
          {address && status && !status.isExcluded && !confirmStep && (
            <>
              <div>
                <h3 className="text-white font-medium mb-3">Take a Break</h3>
                <p className="text-white/60 text-sm mb-4">
                  Choose a cooling-off period. During this time, you will not be able to play any games.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {DURATION_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setSelectedDuration(option.value)}
                      className={`p-3 rounded-xl text-left transition ${
                        selectedDuration === option.value
                          ? option.value === 'permanent'
                            ? 'bg-red-500/20 border-2 border-red-500/50'
                            : 'bg-amber-500/20 border-2 border-amber-500/50'
                          : 'bg-black/30 border border-white/10 hover:border-white/20'
                      }`}
                    >
                      <p className={`font-medium ${
                        selectedDuration === option.value
                          ? option.value === 'permanent' ? 'text-red-400' : 'text-amber-400'
                          : 'text-white'
                      }`}>
                        {option.label}
                      </p>
                      <p className="text-white/50 text-xs">{option.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {selectedDuration && (
                <div>
                  <label className="block text-white/70 text-sm mb-2">
                    Reason (optional)
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why are you taking a break?"
                    className="w-full p-3 rounded-xl bg-black/30 border border-white/10 text-white placeholder-white/30 text-sm resize-none focus:border-amber-500/50 focus:outline-none"
                    rows={2}
                  />
                </div>
              )}

              {selectedDuration && (
                <button
                  onClick={() => setConfirmStep(true)}
                  disabled={loading}
                  className={`w-full py-3 rounded-xl font-medium transition ${
                    selectedDuration === 'permanent'
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-amber-500 hover:bg-amber-600 text-black'
                  } disabled:opacity-50`}
                >
                  {selectedDuration === 'permanent' ? 'Permanently Exclude Account' : 'Start Cooling-Off Period'}
                </button>
              )}
            </>
          )}

          {/* Confirmation Step */}
          {address && confirmStep && selectedDuration && (
            <div className="space-y-4">
              <div className={`p-4 rounded-xl ${
                selectedDuration === 'permanent'
                  ? 'bg-red-500/20 border border-red-500/30'
                  : 'bg-amber-500/20 border border-amber-500/30'
              }`}>
                <h3 className={`font-bold mb-2 ${selectedDuration === 'permanent' ? 'text-red-400' : 'text-amber-400'}`}>
                  {selectedDuration === 'permanent' ? 'Warning: Permanent Self-Exclusion' : 'Confirm Cooling-Off Period'}
                </h3>
                <p className="text-white/80 text-sm">
                  {selectedDuration === 'permanent' ? (
                    <>
                      This action is <strong>irreversible</strong>. Your account will be permanently excluded from all games.
                      You will never be able to play again with this wallet address.
                    </>
                  ) : (
                    <>
                      You are about to start a <strong>{DURATION_OPTIONS.find(o => o.value === selectedDuration)?.label}</strong> cooling-off period.
                      During this time, you cannot play any games. This cannot be cancelled early.
                    </>
                  )}
                </p>
              </div>

              {selectedDuration === 'permanent' && (
                <div>
                  <label className="block text-white/70 text-sm mb-2">
                    Type <span className="text-red-400 font-mono">PERMANENTLY EXCLUDE</span> to confirm:
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="PERMANENTLY EXCLUDE"
                    className="w-full p-3 rounded-xl bg-black/30 border border-red-500/30 text-white placeholder-white/30 text-sm focus:border-red-500/50 focus:outline-none font-mono"
                  />
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setConfirmStep(false);
                    setConfirmText('');
                  }}
                  className="flex-1 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSetExclusion}
                  disabled={loading || (selectedDuration === 'permanent' && confirmText !== 'PERMANENTLY EXCLUDE')}
                  className={`flex-1 py-3 rounded-xl font-medium transition disabled:opacity-50 ${
                    selectedDuration === 'permanent'
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-amber-500 hover:bg-amber-600 text-black'
                  }`}
                >
                  {loading ? 'Processing...' : 'Confirm'}
                </button>
              </div>
            </div>
          )}

          {/* Help Resources */}
          <div className="pt-4 border-t border-white/10">
            <h4 className="text-white/70 text-sm font-medium mb-2">Need Help?</h4>
            <p className="text-white/50 text-xs mb-2">
              If you or someone you know has a gambling problem, help is available:
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href="https://www.ncpgambling.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 rounded-full bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition"
              >
                NCPG (US)
              </a>
              <a
                href="https://www.gamblersanonymous.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 rounded-full bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition"
              >
                Gamblers Anonymous
              </a>
              <a
                href="https://www.begambleaware.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 rounded-full bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition"
              >
                BeGambleAware (UK)
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
