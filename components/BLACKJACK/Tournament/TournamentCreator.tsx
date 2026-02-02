'use client';

import React, { useState, useMemo } from 'react';
import { formatEther, parseEther } from 'viem';
import {
  PRIZE_PRESETS,
  TOURNAMENT_VALIDATION,
  TIME_LIMIT_LABELS,
  MAX_REBUYS_LABELS,
  PrizeDistributionType,
  TableTheme,
  RebuyConfig,
  CreateTournamentRequest,
  getExamplePrizeDistribution,
} from '@/lib/tournament-types';
import {
  BLACKJACK_IMAGE_BACKGROUNDS,
  BLACKJACK_VIDEO_BACKGROUNDS,
  BlackjackImageId,
  BlackjackVideoId,
} from '@/app/BLACKJACK/constants';

type TabId = 'basics' | 'rules' | 'prizes' | 'theme';

interface TournamentCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (params: CreateTournamentRequest) => Promise<{ tournamentId: string; pinCode?: string } | null>;
  isLoading: boolean;
  playerBalance: bigint;
}

export function TournamentCreator({
  isOpen,
  onClose,
  onCreate,
  isLoading,
  playerBalance,
}: TournamentCreatorProps) {
  const [activeTab, setActiveTab] = useState<TabId>('basics');
  const [error, setError] = useState<string | null>(null);
  const [createdTournament, setCreatedTournament] = useState<{ id: string; pinCode?: string } | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [buyInAmount, setBuyInAmount] = useState('1000'); // In MORBIUS
  const [isPrivate, setIsPrivate] = useState(false);
  const [startingChips, setStartingChips] = useState<number>(5000);
  const [maxHands, setMaxHands] = useState<number>(50);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number | null>(null);
  const [rebuyEnabled, setRebuyEnabled] = useState(false);
  const [maxRebuys, setMaxRebuys] = useState<number>(0);
  const [prizeDistributionType, setPrizeDistributionType] = useState<PrizeDistributionType>('top_10');
  const [themeKind, setThemeKind] = useState<'image' | 'video'>('image');
  const [themeId, setThemeId] = useState<string>('BigRich');

  // Computed values
  const buyInAmountWei = useMemo(() => {
    try {
      return parseEther(buyInAmount || '0');
    } catch {
      return 0n;
    }
  }, [buyInAmount]);

  const canAffordBuyIn = playerBalance >= buyInAmountWei;

  const selectedPreset = useMemo(
    () => PRIZE_PRESETS.find(p => p.id === prizeDistributionType),
    [prizeDistributionType]
  );

  // Example prize distribution preview
  const examplePrizePool = buyInAmountWei * 10n; // Simulate 10 players
  const prizePreview = useMemo(() => {
    if (!selectedPreset) return [];
    return getExamplePrizeDistribution(examplePrizePool, selectedPreset.percentages);
  }, [selectedPreset, examplePrizePool]);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'basics', label: 'Basics' },
    { id: 'rules', label: 'Rules' },
    { id: 'prizes', label: 'Prizes' },
    { id: 'theme', label: 'Theme' },
  ];

  const handleCreate = async () => {
    setError(null);

    // Validate name
    const trimmedName = name.trim();
    if (trimmedName.length < TOURNAMENT_VALIDATION.NAME_MIN_LENGTH) {
      setError(`Name must be at least ${TOURNAMENT_VALIDATION.NAME_MIN_LENGTH} characters`);
      setActiveTab('basics');
      return;
    }
    if (trimmedName.length > TOURNAMENT_VALIDATION.NAME_MAX_LENGTH) {
      setError(`Name must be at most ${TOURNAMENT_VALIDATION.NAME_MAX_LENGTH} characters`);
      setActiveTab('basics');
      return;
    }

    // Validate buy-in
    if (buyInAmountWei < TOURNAMENT_VALIDATION.BUY_IN_MIN) {
      setError('Minimum buy-in is 100 MORBIUS');
      setActiveTab('basics');
      return;
    }
    if (buyInAmountWei > TOURNAMENT_VALIDATION.BUY_IN_MAX) {
      setError('Maximum buy-in is 1,000,000 MORBIUS');
      setActiveTab('basics');
      return;
    }

    const params: CreateTournamentRequest = {
      name: trimmedName,
      buyInAmount: buyInAmountWei.toString(),
      startingChips,
      maxHands,
      timeLimitMinutes,
      rebuyConfig: {
        enabled: rebuyEnabled,
        maxRebuys: rebuyEnabled ? maxRebuys : 0,
      },
      tableTheme: {
        kind: themeKind,
        id: themeId,
      },
      isPrivate,
      prizeDistributionType,
    };

    const result = await onCreate(params);
    if (result) {
      setCreatedTournament({ id: result.tournamentId, pinCode: result.pinCode });
    }
  };

  const handleClose = () => {
    setCreatedTournament(null);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  // Show success screen if tournament was created
  if (createdTournament) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
        <div className="relative bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl border border-green-500/30 shadow-2xl shadow-green-500/20 max-w-md w-full mx-4 overflow-hidden">
          <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-4 text-center">
            <h2 className="text-2xl font-bold text-white">Tournament Created!</h2>
          </div>
          <div className="p-6 space-y-4 text-center">
            <div className="text-6xl">🎉</div>
            <p className="text-white text-lg font-semibold">{name}</p>
            {createdTournament.pinCode && (
              <div className="bg-gray-800 rounded-xl p-4 border border-yellow-500/30">
                <p className="text-gray-400 text-sm mb-2">Private Tournament PIN</p>
                <p className="text-4xl font-mono font-bold text-yellow-400 tracking-wider">
                  {createdTournament.pinCode}
                </p>
                <p className="text-gray-500 text-xs mt-2">Share this PIN with players you want to invite</p>
              </div>
            )}
            <button
              onClick={handleClose}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 text-white font-semibold transition-all"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl border border-purple-500/30 shadow-2xl shadow-purple-500/20 max-w-2xl w-full mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-cyan-600 p-4">
          <h2 className="text-2xl font-bold text-white text-center">Create Tournament</h2>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-cyan-400 border-b-2 border-cyan-400 bg-gray-800/50'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Basics Tab */}
          {activeTab === 'basics' && (
            <div className="space-y-6">
              {/* Name */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Tournament Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Tournament"
                  maxLength={TOURNAMENT_VALIDATION.NAME_MAX_LENGTH}
                  className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                />
                <p className="text-gray-500 text-xs mt-1">
                  {name.length}/{TOURNAMENT_VALIDATION.NAME_MAX_LENGTH} characters
                </p>
              </div>

              {/* Buy-in Amount */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Buy-in Amount (MORBIUS)
                </label>
                <input
                  type="number"
                  value={buyInAmount}
                  onChange={(e) => setBuyInAmount(e.target.value)}
                  min="100"
                  max="1000000"
                  className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                />
                <p className="text-gray-500 text-xs mt-1">
                  Min: 100 | Max: 1,000,000 MORBIUS
                </p>
              </div>

              {/* Private Toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-gray-800/50 border border-gray-700">
                <div>
                  <p className="text-white font-medium">Private Tournament</p>
                  <p className="text-gray-400 text-sm">Requires PIN to join</p>
                </div>
                <button
                  onClick={() => setIsPrivate(!isPrivate)}
                  className={`relative w-14 h-8 rounded-full transition-colors ${
                    isPrivate ? 'bg-purple-500' : 'bg-gray-600'
                  }`}
                >
                  <div
                    className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-transform ${
                      isPrivate ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* Rules Tab */}
          {activeTab === 'rules' && (
            <div className="space-y-6">
              {/* Starting Chips */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Starting Chips
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {TOURNAMENT_VALIDATION.STARTING_CHIPS_OPTIONS.map((chips) => (
                    <button
                      key={chips}
                      onClick={() => setStartingChips(chips)}
                      className={`py-3 rounded-xl font-medium transition-colors ${
                        startingChips === chips
                          ? 'bg-cyan-500 text-white'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {chips.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Max Hands */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Maximum Hands
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {TOURNAMENT_VALIDATION.MAX_HANDS_OPTIONS.map((hands) => (
                    <button
                      key={hands}
                      onClick={() => setMaxHands(hands)}
                      className={`py-3 rounded-xl font-medium transition-colors ${
                        maxHands === hands
                          ? 'bg-cyan-500 text-white'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {hands}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time Limit */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Time Limit
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {TOURNAMENT_VALIDATION.TIME_LIMIT_OPTIONS.map((limit) => (
                    <button
                      key={limit ?? 'none'}
                      onClick={() => setTimeLimitMinutes(limit)}
                      className={`py-3 rounded-xl font-medium text-sm transition-colors ${
                        timeLimitMinutes === limit
                          ? 'bg-cyan-500 text-white'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {TIME_LIMIT_LABELS[limit ?? 'null']}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rebuys */}
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-xl bg-gray-800/50 border border-gray-700">
                  <div>
                    <p className="text-white font-medium">Enable Rebuys</p>
                    <p className="text-gray-400 text-sm">Allow players to rebuy after busting</p>
                  </div>
                  <button
                    onClick={() => setRebuyEnabled(!rebuyEnabled)}
                    className={`relative w-14 h-8 rounded-full transition-colors ${
                      rebuyEnabled ? 'bg-green-500' : 'bg-gray-600'
                    }`}
                  >
                    <div
                      className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-transform ${
                        rebuyEnabled ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {rebuyEnabled && (
                  <div>
                    <label className="block text-gray-300 text-sm font-medium mb-2">
                      Max Rebuys per Player
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {TOURNAMENT_VALIDATION.MAX_REBUYS_OPTIONS.map((max) => (
                        <button
                          key={max}
                          onClick={() => setMaxRebuys(max)}
                          className={`py-3 rounded-xl font-medium transition-colors ${
                            maxRebuys === max
                              ? 'bg-green-500 text-white'
                              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                          }`}
                        >
                          {MAX_REBUYS_LABELS[max]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Prizes Tab */}
          {activeTab === 'prizes' && (
            <div className="space-y-6">
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-3">
                  Prize Distribution
                </label>
                <div className="space-y-2">
                  {PRIZE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => setPrizeDistributionType(preset.id)}
                      className={`w-full p-4 rounded-xl text-left transition-colors ${
                        prizeDistributionType === preset.id
                          ? 'bg-yellow-500/20 border-2 border-yellow-500'
                          : 'bg-gray-800 border border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-white font-medium">{preset.name}</span>
                        <span className="text-gray-400 text-sm">{preset.description}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Prize Preview */}
              {selectedPreset && (
                <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                  <h4 className="text-gray-300 text-sm font-medium mb-3">
                    Prize Preview (10 players example)
                  </h4>
                  <div className="space-y-2">
                    {prizePreview.slice(0, 5).map((prize) => (
                      <div key={prize.rank} className="flex justify-between text-sm">
                        <span className={`${
                          prize.rank === 1 ? 'text-yellow-400' :
                          prize.rank === 2 ? 'text-gray-300' :
                          prize.rank === 3 ? 'text-orange-400' :
                          'text-gray-500'
                        }`}>
                          {prize.rank === 1 ? '🥇' : prize.rank === 2 ? '🥈' : prize.rank === 3 ? '🥉' : `#${prize.rank}`} {prize.percentage}%
                        </span>
                        <span className="text-white">
                          {Number(formatEther(prize.amount)).toLocaleString()} MORBIUS
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-gray-500 text-xs mt-3">
                    * 84% of prize pool distributed, 16% to house
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Theme Tab */}
          {activeTab === 'theme' && (
            <div className="space-y-6">
              {/* Theme Type */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setThemeKind('image');
                    setThemeId(BLACKJACK_IMAGE_BACKGROUNDS[0].id);
                  }}
                  className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
                    themeKind === 'image'
                      ? 'bg-cyan-500 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  Image Themes
                </button>
                <button
                  onClick={() => {
                    setThemeKind('video');
                    setThemeId(BLACKJACK_VIDEO_BACKGROUNDS[0].id);
                  }}
                  className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
                    themeKind === 'video'
                      ? 'bg-cyan-500 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  Video Themes
                </button>
              </div>

              {/* Theme Grid */}
              {themeKind === 'image' && (
                <div className="grid grid-cols-3 gap-3">
                  {BLACKJACK_IMAGE_BACKGROUNDS.map((bg) => (
                    <button
                      key={bg.id}
                      onClick={() => setThemeId(bg.id)}
                      className={`relative aspect-video rounded-xl overflow-hidden border-2 transition-all ${
                        themeId === bg.id
                          ? 'border-cyan-500 ring-2 ring-cyan-500/50'
                          : 'border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <img
                        src={bg.src}
                        alt={bg.label}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-black/60 py-1 px-2">
                        <p className="text-white text-xs truncate">{bg.label}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {themeKind === 'video' && (
                <div className="grid grid-cols-3 gap-3">
                  {BLACKJACK_VIDEO_BACKGROUNDS.map((bg) => (
                    <button
                      key={bg.id}
                      onClick={() => setThemeId(bg.id)}
                      className={`relative aspect-video rounded-xl overflow-hidden border-2 transition-all ${
                        themeId === bg.id
                          ? 'border-cyan-500 ring-2 ring-cyan-500/50'
                          : 'border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <video
                        src={bg.src}
                        className="w-full h-full object-cover"
                        muted
                        loop
                        autoPlay
                        playsInline
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-black/60 py-1 px-2">
                        <p className="text-white text-xs truncate">{bg.label}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-900/50">
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={isLoading || !name.trim()}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                !isLoading && name.trim()
                  ? 'bg-gradient-to-r from-purple-500 to-cyan-500 hover:from-purple-400 hover:to-cyan-400 text-white shadow-lg shadow-purple-500/30'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating...
                </span>
              ) : (
                'Create Tournament'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TournamentCreator;
