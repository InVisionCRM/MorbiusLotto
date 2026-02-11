'use client';

import React, { useState, useRef, useEffect } from 'react';

interface TournamentPinEntryProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (pin: string) => Promise<boolean>;
  isLoading: boolean;
  tournamentName?: string;
}

export function TournamentPinEntry({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
  tournamentName,
}: TournamentPinEntryProps) {
  const [pin, setPin] = useState(['', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Focus first input on open
  useEffect(() => {
    if (isOpen) {
      setPin(['', '', '', '']);
      setError(null);
      setTimeout(() => {
        inputRefs[0].current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1);

    const newPin = [...pin];
    newPin[index] = digit;
    setPin(newPin);
    setError(null);

    // Auto-focus next input
    if (digit && index < 3) {
      inputRefs[index + 1].current?.focus();
    }

    // Auto-submit when all digits entered
    if (digit && index === 3 && newPin.every(d => d)) {
      handleSubmit(newPin.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      // Move to previous input on backspace when empty
      inputRefs[index - 1].current?.focus();
    } else if (e.key === 'Enter') {
      const fullPin = pin.join('');
      if (fullPin.length === 4) {
        handleSubmit(fullPin);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pastedData.length === 4) {
      const newPin = pastedData.split('');
      setPin(newPin);
      handleSubmit(pastedData);
    }
  };

  const handleSubmit = async (fullPin: string) => {
    if (fullPin.length !== 4) {
      setError('Please enter a 4-digit PIN');
      return;
    }

    const success = await onSubmit(fullPin);
    if (!success) {
      setError('Invalid PIN code');
      setPin(['', '', '', '']);
      inputRefs[0].current?.focus();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl border border-purple-500/30 shadow-2xl shadow-purple-500/20 max-w-sm w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-4 text-center">
          <h2 className="text-xl font-bold text-white">Enter PIN</h2>
          {tournamentName && (
            <p className="text-purple-100 text-sm mt-1">{tournamentName}</p>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <p className="text-gray-400 text-center text-sm">
            This is a private tournament. Enter the 4-digit PIN to join.
          </p>

          {/* PIN Input */}
          <div className="flex justify-center gap-3" onPaste={handlePaste}>
            {pin.map((digit, index) => (
              <input
                title={`PIN digit ${index + 1}`}
                placeholder="0"
                key={index}
                ref={inputRefs[index]}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                disabled={isLoading}
                className={`w-14 h-16 text-center text-2xl font-bold rounded-xl bg-gray-800 border-2 transition-colors focus:outline-none ${
                  error
                    ? 'border-red-500 text-red-400'
                    : digit
                    ? 'border-purple-500 text-white'
                    : 'border-gray-700 text-white focus:border-purple-500'
                }`}
              />
            ))}
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-400 text-center text-sm">{error}</p>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex justify-center">
              <svg className="animate-spin h-6 w-6 text-purple-400" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-semibold transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => handleSubmit(pin.join(''))}
              disabled={isLoading || pin.join('').length !== 4}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                !isLoading && pin.join('').length === 4
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              Join
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TournamentPinEntry;
