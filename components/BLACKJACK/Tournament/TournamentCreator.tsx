'use client';

import React, { useState, useMemo, useRef } from 'react';
import { formatEther, parseEther } from 'viem';
import { useWriteContract } from 'wagmi';
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
  DEFAULT_TOUR_CARDS,
} from '@/lib/tournament-types';
import {
  BLACKJACK_IMAGE_BACKGROUNDS,
  BLACKJACK_VIDEO_BACKGROUNDS,
  BlackjackImageId,
  BlackjackVideoId,
} from '@/app/BLACKJACK/constants';
import { TOURNAMENT_PRIZE_ESCROW_ADDRESS } from '@/lib/contracts';
import { tournamentPrizeEscrowAbi } from '@/abi/tournament-prize-escrow';
import { tournamentIdToBytes32 } from '@/lib/tournament-id-bytes32';
import { ERC20_ABI } from '@/abi/erc20';

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
  const [funded, setFunded] = useState(false);
  const [fundingError, setFundingError] = useState<string | null>(null);
  const [fundingPending, setFundingPending] = useState(false);

  const { writeContractAsync: writeApprove } = useWriteContract();
  const { writeContractAsync: writeDeposit } = useWriteContract();

  // Form state
  const [name, setName] = useState('');
  const [buyInAmount, setBuyInAmount] = useState('1000'); // In MORBIUS
  const [isPrivate, setIsPrivate] = useState(false);
  const [startingChips, setStartingChips] = useState<number>(5000);
  const [maxHands, setMaxHands] = useState<number>(50);
  const [maxHandsInput, setMaxHandsInput] = useState<string>('50');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number | null>(null);
  const [rebuyEnabled, setRebuyEnabled] = useState(false);
  const [maxRebuys, setMaxRebuys] = useState<number>(0);
  const [prizeDistributionType, setPrizeDistributionType] = useState<PrizeDistributionType>('top_10');
  const [themeKind, setThemeKind] = useState<'image' | 'video'>('image');
  const [themeId, setThemeId] = useState<string>('BigRich');

  // Custom image upload state
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Custom prize token (when prize type is 'custom')
  const [prizeType, setPrizeType] = useState<'platform' | 'custom'>('platform');
  const [prizeTokenAddress, setPrizeTokenAddress] = useState('');
  const [prizeAmountHuman, setPrizeAmountHuman] = useState('');
  const [prizeTokenDecimals, setPrizeTokenDecimals] = useState<number>(18);

  // Handle max hands slider change
  const handleMaxHandsSlider = (value: number) => {
    setMaxHands(value);
    setMaxHandsInput(value.toString());
  };

  // Handle max hands direct input
  const handleMaxHandsInput = (value: string) => {
    setMaxHandsInput(value);
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 1 && num <= 200) {
      setMaxHands(num);
    }
  };

  // Handle max hands input blur (validate and clamp)
  const handleMaxHandsBlur = () => {
    const num = parseInt(maxHandsInput, 10);
    if (isNaN(num) || num < 1) {
      setMaxHands(1);
      setMaxHandsInput('1');
    } else if (num > 200) {
      setMaxHands(200);
      setMaxHandsInput('200');
    } else {
      setMaxHands(num);
      setMaxHandsInput(num.toString());
    }
  };

  // Handle image upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be smaller than 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setCustomImage(dataUrl);
      setImagePreview(dataUrl);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  // Remove custom image
  const handleRemoveImage = () => {
    setCustomImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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
      customImage: customImage || undefined,
    };
    if (prizeType === 'custom' && prizeTokenAddress.trim() && prizeAmountHuman.trim()) {
      const dec = Math.min(18, Math.max(0, prizeTokenDecimals));
      const prizeAmountWei = BigInt(prizeAmountHuman.replace(/\D/g, '') || '0') * BigInt(10 ** dec);
      if (prizeAmountWei > 0n) {
        params.prizeTokenAddress = prizeTokenAddress.trim();
        params.prizeAmount = prizeAmountWei.toString();
        params.prizeTokenDecimals = dec;
      }
    }

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

  const handleFundPrizePool = async () => {
    if (!createdTournament || prizeType !== 'custom' || !prizeTokenAddress.trim() || !prizeAmountHuman.trim()) return;
    const dec = Math.min(18, Math.max(0, prizeTokenDecimals));
    const amountWei = BigInt(prizeAmountHuman.replace(/\D/g, '') || '0') * BigInt(10 ** dec);
    if (amountWei <= 0n) return;
    setFundingError(null);
    setFundingPending(true);
    try {
      const token = prizeTokenAddress.trim() as `0x${string}`;
      const escrow = TOURNAMENT_PRIZE_ESCROW_ADDRESS;
      if (escrow === '0x0000000000000000000000000000000000000000') {
        setFundingError('Escrow not configured');
        return;
      }
      await writeApprove({
        address: token,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [escrow, amountWei],
      });
      const idBytes32 = tournamentIdToBytes32(createdTournament.id);
      await writeDeposit({
        address: escrow,
        abi: tournamentPrizeEscrowAbi,
        functionName: 'depositPrizePool',
        args: [idBytes32, token, amountWei],
      });
      setFunded(true);
    } catch (e) {
      setFundingError(e instanceof Error ? e.message : 'Funding failed');
    } finally {
      setFundingPending(false);
    }
  };

  // Show success screen if tournament was created
  if (createdTournament) {
    const needsFunding = prizeType === 'custom' && prizeTokenAddress.trim() && prizeAmountHuman.trim() && !funded;
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
            {needsFunding && (
              <div className="bg-gray-800 rounded-xl p-4 border border-cyan-500/30 text-left">
                <p className="text-cyan-300 text-sm font-medium mb-2">Fund prize pool</p>
                <p className="text-gray-400 text-xs mb-3">
                  Approve and deposit your token to the escrow so prizes can be paid out.
                </p>
                {fundingError && (
                  <p className="text-red-400 text-xs mb-2">{fundingError}</p>
                )}
                <button
                  onClick={handleFundPrizePool}
                  disabled={fundingPending}
                  className="w-full py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-medium disabled:opacity-50"
                >
                  {fundingPending ? 'Confirm in wallet...' : 'Fund prize pool'}
                </button>
              </div>
            )}
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

              {/* Custom Tournament Image Upload */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Tournament Card Image
                </label>
                <p className="text-gray-500 text-xs mb-3">
                  Upload a custom image for your tournament (3:2 aspect ratio recommended, max 2MB)
                </p>

                {imagePreview ? (
                  <div className="relative">
                    <div className="aspect-[3/2] rounded-xl overflow-hidden border-2 border-cyan-500/50">
                      <img
                        src={imagePreview}
                        alt="Tournament card preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <button
                      onClick={handleRemoveImage}
                      className="absolute top-2 right-2 p-2 rounded-full bg-red-500/80 hover:bg-red-500 text-white transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full aspect-[3/2] rounded-xl border-2 border-dashed border-gray-600 hover:border-cyan-500/50 bg-gray-800/50 hover:bg-gray-800 transition-colors flex flex-col items-center justify-center gap-2"
                    >
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-gray-400 text-sm">Click to upload image</span>
                      <span className="text-gray-500 text-xs">or leave empty for a random default</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    {/* Show default card preview */}
                    <div className="text-center">
                      <p className="text-gray-500 text-xs mb-2">Default cards (assigned randomly):</p>
                      <div className="flex gap-2 justify-center">
                        {DEFAULT_TOUR_CARDS.slice(0, 3).map((src, i) => (
                          <div key={i} className="w-16 aspect-[3/2] rounded overflow-hidden border border-gray-700">
                            <img src={src} alt={`Default card ${i + 1}`} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
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

              {/* Max Hands - Slider + Direct Input */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Maximum Hands
                </label>
                <div className="space-y-3">
                  {/* Slider */}
                  <div className="relative">
                    <input
                      type="range"
                      min="1"
                      max="200"
                      value={maxHands}
                      onChange={(e) => handleMaxHandsSlider(parseInt(e.target.value, 10))}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>1</span>
                      <span>50</span>
                      <span>100</span>
                      <span>150</span>
                      <span>200</span>
                    </div>
                  </div>
                  {/* Direct Input */}
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="1"
                      max="200"
                      value={maxHandsInput}
                      onChange={(e) => handleMaxHandsInput(e.target.value)}
                      onBlur={handleMaxHandsBlur}
                      className="w-24 px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-center focus:outline-none focus:border-cyan-500"
                    />
                    <span className="text-gray-400 text-sm">hands (1-200)</span>
                  </div>
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
              {/* Prize source: platform vs custom token */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Prize source
                </label>
                <div className="flex gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => setPrizeType('platform')}
                    className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
                      prizeType === 'platform' ? 'bg-cyan-500 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    Platform (MORBIUS from buy-ins)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrizeType('custom')}
                    className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
                      prizeType === 'custom' ? 'bg-cyan-500 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    Custom token
                  </button>
                </div>
                {prizeType === 'custom' && (
                  <div className="space-y-3 p-4 rounded-xl bg-gray-800/50 border border-gray-700">
                    <div>
                      <label className="block text-gray-400 text-xs mb-1">Token contract address</label>
                      <input
                        type="text"
                        value={prizeTokenAddress}
                        onChange={(e) => setPrizeTokenAddress(e.target.value)}
                        placeholder="0x..."
                        className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm font-mono focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-gray-400 text-xs mb-1">Prize amount (human)</label>
                        <input
                          type="text"
                          value={prizeAmountHuman}
                          onChange={(e) => setPrizeAmountHuman(e.target.value)}
                          placeholder="e.g. 1000000"
                          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-400 text-xs mb-1">Decimals</label>
                        <input
                          type="number"
                          min={0}
                          max={18}
                          value={prizeTokenDecimals}
                          onChange={(e) => setPrizeTokenDecimals(Number(e.target.value) || 18)}
                          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </div>
                    <p className="text-gray-500 text-xs">
                      After creating, you will fund the prize pool by approving and depositing this token to the escrow.
                    </p>
                  </div>
                )}
              </div>

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
