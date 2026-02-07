'use client';

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { formatEther, parseEther } from 'viem';
import { useWriteContract, usePublicClient } from 'wagmi';
import {
  PRIZE_PRESETS,
  TOURNAMENT_VALIDATION,
  FREEROLL_VALIDATION,
  TIME_LIMIT_LABELS,
  MAX_REBUYS_LABELS,
  PrizeDistributionType,
  TableTheme,
  RebuyConfig,
  CreateTournamentRequest,
  CreateFreerollRequest,
  FreerollMode,
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

const ESCROW_ZERO = '0x0000000000000000000000000000000000000000';
const isEscrowConfigured = TOURNAMENT_PRIZE_ESCROW_ADDRESS !== ESCROW_ZERO;
import { tournamentPrizeEscrowAbi } from '@/abi/tournament-prize-escrow';
import { tournamentIdToBytes32 } from '@/lib/tournament-id-bytes32';
import { ERC20_ABI } from '@/abi/erc20';

type TabId = 'basics' | 'rules' | 'prizes' | 'theme';
type FundingStep = 'idle' | 'approving' | 'approved' | 'depositing' | 'done';

interface TokenSearchResult {
  address: string;
  name: string;
  symbol: string;
  decimals: number | null;
  iconUrl: string | null;
}

interface SelectedToken {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoUrl: string | null;
}

interface TournamentCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (params: CreateTournamentRequest) => Promise<{ tournamentId: string; pinCode?: string } | null>;
  onCreateFreeroll?: (params: CreateFreerollRequest) => Promise<{ tournamentId: string; pinCode?: string } | null>;
  isLoading: boolean;
  playerBalance: bigint;
}

function toDatetimeLocal(iso: string): string {
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day}T${h}:${min}`;
  } catch {
    return '';
  }
}

function fromDatetimeLocal(local: string): string {
  if (!local) return '';
  return new Date(local).toISOString();
}

export function TournamentCreator({
  isOpen,
  onClose,
  onCreate,
  onCreateFreeroll,
  isLoading,
  playerBalance,
}: TournamentCreatorProps) {
  const [activeTab, setActiveTab] = useState<TabId>('basics');
  const [error, setError] = useState<string | null>(null);
  const [createdTournament, setCreatedTournament] = useState<{ id: string; pinCode?: string } | null>(null);
  const [fundingStep, setFundingStep] = useState<FundingStep>('idle');
  const [approvalTxHash, setApprovalTxHash] = useState<string | null>(null);
  const [fundingError, setFundingError] = useState<string | null>(null);

  // Token search state
  const [tokenQuery, setTokenQuery] = useState('');
  const [tokenSearchResults, setTokenSearchResults] = useState<TokenSearchResult[]>([]);
  const [tokenSearching, setTokenSearching] = useState(false);
  const [selectedToken, setSelectedToken] = useState<SelectedToken | null>(null);
  const tokenSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenDropdownRef = useRef<HTMLDivElement>(null);

  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  // Tournament type: buy-in or freeroll
  const [tournamentType, setTournamentType] = useState<'buyin' | 'freeroll'>('buyin');

  // Form state
  const [name, setName] = useState('');
  const [buyInAmount, setBuyInAmount] = useState('1000'); // In MORBIUS
  const [isPrivate, setIsPrivate] = useState(false);
  const [manualPin, setManualPin] = useState('');
  const [startingChips, setStartingChips] = useState<number>(5000);
  const [maxHands, setMaxHands] = useState<number>(50);
  const [maxHandsInput, setMaxHandsInput] = useState<string>('50');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number | null>(null);
  const [rebuyEnabled, setRebuyEnabled] = useState(false);
  const [maxRebuys, setMaxRebuys] = useState<number>(0);
  const [prizeDistributionType, setPrizeDistributionType] = useState<PrizeDistributionType>('top_10');
  const [themeKind, setThemeKind] = useState<'image' | 'video'>('image');
  const [themeId, setThemeId] = useState<string>('BigRich');

  // Freeroll-specific state
  const [scheduledStartAt, setScheduledStartAt] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 30);
    return toDatetimeLocal(d.toISOString());
  });
  const [registrationOpensAt, setRegistrationOpensAt] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 5);
    return toDatetimeLocal(d.toISOString());
  });
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [freerollMode, setFreerollMode] = useState<FreerollMode>('standard_chip_count');
  const [reentryEnabled, setReentryEnabled] = useState(false);
  const [reentryWindowMinutes, setReentryWindowMinutes] = useState<number>(5);
  const [actionTimerSeconds, setActionTimerSeconds] = useState<number | null>(null);

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

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tokenDropdownRef.current && !tokenDropdownRef.current.contains(e.target as Node)) {
        setTokenSearchResults([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced token search
  const handleTokenQueryChange = useCallback((query: string) => {
    setTokenQuery(query);
    if (tokenSearchTimeout.current) clearTimeout(tokenSearchTimeout.current);
    if (!query.trim() || query.trim().length < 2) {
      setTokenSearchResults([]);
      setTokenSearching(false);
      return;
    }
    setTokenSearching(true);
    tokenSearchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://api.scan.pulsechain.com/api/v2/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        const items = (data.items || [])
          .filter((item: any) => item.type === 'token')
          .slice(0, 8)
          .map((item: any) => ({
            address: item.address,
            name: item.name || 'Unknown',
            symbol: item.symbol || '???',
            decimals: item.token_type === 'ERC-20' ? (item.exchange_rate ? null : null) : null,
            iconUrl: item.icon_url || null,
          }));
        setTokenSearchResults(items);
      } catch {
        setTokenSearchResults([]);
      } finally {
        setTokenSearching(false);
      }
    }, 400);
  }, []);

  // Fetch token details (decimals + logo) after selection
  const fetchTokenDetails = useCallback(async (address: string, name: string, symbol: string) => {
    let decimals = 18;
    let logoUrl: string | null = null;
    try {
      const res = await fetch(`https://api.scan.pulsechain.com/api/v2/tokens/${address}`);
      const data = await res.json();
      if (data.decimals != null) decimals = Number(data.decimals);
      if (data.name) name = data.name;
      if (data.symbol) symbol = data.symbol;
      if (data.icon_url) logoUrl = data.icon_url;
    } catch { /* use defaults */ }

    // Try DexScreener for logo if scan didn't have one
    if (!logoUrl) {
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
        const data = await res.json();
        const img = data.pairs?.[0]?.info?.imageUrl;
        if (img) logoUrl = img;
      } catch { /* no logo */ }
    }

    setSelectedToken({ address, name, symbol, decimals, logoUrl });
    setPrizeTokenAddress(address);
    setPrizeTokenDecimals(decimals);
    setTokenQuery('');
    setTokenSearchResults([]);
  }, []);

  // Handle selecting a token from search results
  const handleSelectToken = useCallback((result: TokenSearchResult) => {
    fetchTokenDetails(result.address, result.name, result.symbol);
  }, [fetchTokenDetails]);

  // Handle pasting a raw address (no search result) — fetch its details
  const handleRawAddressSubmit = useCallback(() => {
    const addr = tokenQuery.trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      fetchTokenDetails(addr, 'Unknown Token', '???');
    }
  }, [tokenQuery, fetchTokenDetails]);

  // Clear selected token
  const handleClearToken = useCallback(() => {
    setSelectedToken(null);
    setPrizeTokenAddress('');
    setPrizeTokenDecimals(18);
    setTokenQuery('');
  }, []);

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

    if (tournamentType === 'freeroll' && onCreateFreeroll) {
      const regOpens = fromDatetimeLocal(registrationOpensAt);
      const startAt = fromDatetimeLocal(scheduledStartAt);
      if (!regOpens || !startAt) {
        setError('Set registration opens and scheduled start date/time');
        setActiveTab('basics');
        return;
      }
      if (durationMinutes < FREEROLL_VALIDATION.DURATION_MIN_MINUTES || durationMinutes > FREEROLL_VALIDATION.DURATION_MAX_MINUTES) {
        setError(`Duration must be ${FREEROLL_VALIDATION.DURATION_MIN_MINUTES}–${FREEROLL_VALIDATION.DURATION_MAX_MINUTES} minutes`);
        setActiveTab('basics');
        return;
      }
      const freerollParams: CreateFreerollRequest = {
        name: trimmedName,
        freerollMode,
        scheduledStartAt: startAt,
        registrationOpensAt: regOpens,
        durationMinutes,
        startingChips,
        maxHands,
        prizeDistributionType,
        reentryConfig: { enabled: reentryEnabled, windowMinutes: reentryEnabled ? reentryWindowMinutes : 0 },
        actionTimerSeconds,
        tableTheme: { kind: themeKind, id: themeId },
        isPrivate,
        maxPlayers: undefined,
        customImage: customImage || undefined,
        pinCode: isPrivate && manualPin.trim() ? manualPin.trim() : undefined,
      };
      const result = await onCreateFreeroll(freerollParams);
      if (result) {
        setCreatedTournament({ id: result.tournamentId, pinCode: result.pinCode });
      }
      return;
    }

    // Buy-in validation
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
      pinCode: isPrivate && manualPin.trim() ? manualPin.trim() : undefined,
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

  // Funding helpers
  const fundingAmountWei = useMemo(() => {
    const dec = Math.min(18, Math.max(0, prizeTokenDecimals));
    return BigInt(prizeAmountHuman.replace(/\D/g, '') || '0') * BigInt(10 ** dec);
  }, [prizeAmountHuman, prizeTokenDecimals]);

  if (!isOpen) return null;

  const handleApproveToken = async () => {
    if (!createdTournament || !prizeTokenAddress.trim() || fundingAmountWei <= 0n) return;
    const escrow = TOURNAMENT_PRIZE_ESCROW_ADDRESS;
    if (!isEscrowConfigured || escrow === ESCROW_ZERO) {
      setFundingError('Prize escrow contract not set. Add NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS to your .env.');
      return;
    }
    setFundingError(null);
    setFundingStep('approving');
    try {
      const token = prizeTokenAddress.trim() as `0x${string}`;
      const hash = await writeContractAsync({
        address: token,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [escrow, fundingAmountWei],
      });
      if (publicClient && hash) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      setApprovalTxHash(hash);
      setFundingStep('approved');
    } catch (e) {
      setFundingError(e instanceof Error ? e.message : 'Approval failed');
      setFundingStep('idle');
    }
  };

  const handleDepositToEscrow = async () => {
    if (!createdTournament || !prizeTokenAddress.trim() || fundingAmountWei <= 0n) return;
    const escrow = TOURNAMENT_PRIZE_ESCROW_ADDRESS;
    if (!isEscrowConfigured || escrow === ESCROW_ZERO) return;
    setFundingError(null);
    setFundingStep('depositing');
    try {
      const token = prizeTokenAddress.trim() as `0x${string}`;
      const idBytes32 = tournamentIdToBytes32(createdTournament.id);
      await writeContractAsync({
        address: escrow as `0x${string}`,
        abi: tournamentPrizeEscrowAbi,
        functionName: 'depositPrizePool',
        args: [idBytes32, token, fundingAmountWei],
      });
      setFundingStep('done');
    } catch (e) {
      setFundingError(e instanceof Error ? e.message : 'Deposit failed');
      setFundingStep('approved'); // revert to approved so they can retry deposit
    }
  };

  // Show success screen if tournament was created
  if (createdTournament) {
    const needsFunding = prizeType === 'custom' && prizeTokenAddress.trim() && prizeAmountHuman.trim() && fundingStep !== 'done';
    const funded = fundingStep === 'done';
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

            {/* Two-step funding UI */}
            {(needsFunding || funded) && (
              <div className="bg-gray-800 rounded-xl p-4 border border-cyan-500/30 text-left space-y-4">
                {/* Token info header */}
                <div className="flex items-center gap-3">
                  {selectedToken?.logoUrl && (
                    <img src={selectedToken.logoUrl} alt="" className="w-8 h-8 rounded-full" />
                  )}
                  <div>
                    <p className="text-white text-sm font-medium">
                      {prizeAmountHuman} {selectedToken?.symbol || 'tokens'}
                    </p>
                    <p className="text-gray-500 text-xs font-mono">
                      {prizeTokenAddress.slice(0, 6)}...{prizeTokenAddress.slice(-4)}
                    </p>
                  </div>
                </div>

                {!isEscrowConfigured ? (
                  <p className="text-amber-400 text-xs">
                    Prize escrow is not configured. Set <code className="bg-gray-700 px-1 rounded">NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS</code> in your environment.
                  </p>
                ) : (
                  <>
                    <p className="text-gray-500 text-xs">
                      Tokens are sent to the prize escrow contract which holds them until the tournament ends and pays winners.
                    </p>

                    {fundingError && (
                      <p className="text-red-400 text-xs">{fundingError}</p>
                    )}

                    {/* Step 1: Approve */}
                    <div className="flex items-center gap-3">
                      <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${
                        fundingStep === 'approved' || fundingStep === 'depositing' || funded
                          ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-300'
                      }`}>
                        {fundingStep === 'approved' || fundingStep === 'depositing' || funded ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : '1'}
                      </div>
                      <div className="flex-1">
                        {fundingStep === 'idle' && (
                          <button
                            onClick={handleApproveToken}
                            disabled={!isEscrowConfigured}
                            className="w-full py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-medium disabled:opacity-50 hover:from-cyan-500 hover:to-blue-500 transition-all"
                          >
                            Approve Token
                          </button>
                        )}
                        {fundingStep === 'approving' && (
                          <div className="flex items-center gap-2 py-2">
                            <svg className="animate-spin h-4 w-4 text-cyan-400" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            <span className="text-cyan-300 text-sm">Confirm in wallet...</span>
                          </div>
                        )}
                        {(fundingStep === 'approved' || fundingStep === 'depositing' || funded) && (
                          <div>
                            <span className="text-green-400 text-sm font-medium">Approved</span>
                            {approvalTxHash && (
                              <p className="text-gray-500 text-xs font-mono mt-0.5">
                                tx: {approvalTxHash.slice(0, 10)}...{approvalTxHash.slice(-6)}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Step 2: Deposit */}
                    <div className="flex items-center gap-3">
                      <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${
                        funded ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-300'
                      }`}>
                        {funded ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : '2'}
                      </div>
                      <div className="flex-1">
                        {fundingStep === 'approved' && (
                          <button
                            onClick={handleDepositToEscrow}
                            className="w-full py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 text-white text-sm font-medium hover:from-emerald-500 hover:to-green-500 transition-all"
                          >
                            Deposit to Escrow
                          </button>
                        )}
                        {fundingStep === 'depositing' && (
                          <div className="flex items-center gap-2 py-2">
                            <svg className="animate-spin h-4 w-4 text-emerald-400" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            <span className="text-emerald-300 text-sm">Confirm in wallet...</span>
                          </div>
                        )}
                        {funded && (
                          <span className="text-green-400 text-sm font-medium">Funded</span>
                        )}
                        {(fundingStep === 'idle' || fundingStep === 'approving') && (
                          <span className="text-gray-500 text-sm">Deposit to Escrow</span>
                        )}
                      </div>
                    </div>
                  </>
                )}
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
              {/* Tournament type: Buy-in or Freeroll */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-1">
                  Tournament type
                </label>
                <p className="text-gray-500 text-xs mb-2">
                  Buy-in tournaments require MORBIUS to enter. Freerolls are free to join with scheduled start times.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTournamentType('buyin')}
                    className={`flex-1 py-2.5 rounded-xl font-medium transition-colors ${
                      tournamentType === 'buyin'
                        ? 'bg-cyan-500 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    Buy-in
                  </button>
                  <button
                    type="button"
                    onClick={() => setTournamentType('freeroll')}
                    className={`flex-1 py-2.5 rounded-xl font-medium transition-colors ${
                      tournamentType === 'freeroll'
                        ? 'bg-cyan-500 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    Freeroll
                  </button>
                </div>
              </div>

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

              {/* Freeroll-only: schedule */}
              {tournamentType === 'freeroll' && (
                <div className="space-y-4 p-4 rounded-xl bg-gray-800/50 border border-cyan-500/20">
                  <p className="text-cyan-300 text-sm font-medium">Schedule</p>
                  <p className="text-gray-500 text-xs">Set when players can register, when the tournament begins, and how long it runs.</p>
                  <div>
                    <label className="block text-gray-400 text-xs mb-1">Registration opens — players can sign up starting at this time</label>
                    <input
                      type="datetime-local"
                      value={registrationOpensAt}
                      onChange={(e) => setRegistrationOpensAt(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-xs mb-1">Tournament starts — gameplay begins at this time, registration closes</label>
                    <input
                      type="datetime-local"
                      value={scheduledStartAt}
                      onChange={(e) => setScheduledStartAt(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-xs mb-1">Duration (minutes) — how long the tournament runs after it starts</label>
                    <input
                      type="number"
                      min={FREEROLL_VALIDATION.DURATION_MIN_MINUTES}
                      max={FREEROLL_VALIDATION.DURATION_MAX_MINUTES}
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 60)}
                      className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-xs mb-1">Mode</label>
                    <p className="text-gray-500 text-xs mb-2">
                      Chip count: highest chip total at the end wins. Elimination: bottom players are removed in rounds until a winner remains.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setFreerollMode('standard_chip_count')}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                          freerollMode === 'standard_chip_count' ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300'
                        }`}
                      >
                        Chip count
                      </button>
                      <button
                        type="button"
                        onClick={() => setFreerollMode('elimination')}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                          freerollMode === 'elimination' ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300'
                        }`}
                      >
                        Elimination
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-gray-400 text-sm">Re-entry window</span>
                      <p className="text-gray-500 text-xs">Allow eliminated players to rejoin within a time window after tournament start</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReentryEnabled(!reentryEnabled)}
                      className={`relative w-12 h-6 rounded-full transition-colors ${reentryEnabled ? 'bg-cyan-500' : 'bg-gray-600'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${reentryEnabled ? 'translate-x-7' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  {reentryEnabled && (
                    <div>
                      <label className="block text-gray-400 text-xs mb-1">Re-entry window (minutes) — how long after the start eliminated players can re-enter</label>
                      <input
                        type="number"
                        min={1}
                        max={FREEROLL_VALIDATION.REENTRY_WINDOW_MAX_MINUTES}
                        value={reentryWindowMinutes}
                        onChange={(e) => setReentryWindowMinutes(parseInt(e.target.value, 10) || 5)}
                        className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-gray-400 text-xs mb-1">Action timer (seconds) — time each player has to act per hand. None = no time pressure.</label>
                    <select
                      value={actionTimerSeconds ?? ''}
                      onChange={(e) => setActionTimerSeconds(e.target.value === '' ? null : parseInt(e.target.value, 10))}
                      className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm"
                    >
                      <option value="">None</option>
                      <option value="10">10</option>
                      <option value="15">15</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Buy-in Amount (only for buy-in tournaments) */}
              {tournamentType === 'buyin' && (
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1">
                    Buy-in Amount (MORBIUS)
                  </label>
                  <p className="text-gray-500 text-xs mb-2">
                    The amount each player pays to enter. All buy-ins go into the prize pool.
                  </p>
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
              )}

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

              {/* Manual PIN (optional) when private */}
              {isPrivate && (
                <div className="p-4 rounded-xl bg-gray-800/50 border border-gray-700">
                  <label className="block text-gray-300 text-sm font-medium mb-2">PIN (optional)</label>
                  <p className="text-gray-500 text-xs mb-2">Set your own 4–12 digit code, or leave blank for auto-generated</p>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={12}
                    value={manualPin}
                    onChange={(e) => setManualPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 1234"
                    className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  />
                </div>
              )}

              {/* Custom Tournament Image Upload (compact) */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Tournament Card Image
                </label>
                <p className="text-gray-500 text-xs mb-2">
                  Optional (3:2 recommended, max 2MB)
                </p>

                {imagePreview ? (
                  <div className="relative inline-block max-w-[200px]">
                    <div className="aspect-[3/2] max-h-28 rounded-lg overflow-hidden border-2 border-cyan-500/50">
                      <img
                        src={imagePreview}
                        alt="Tournament card preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <button
                      onClick={handleRemoveImage}
                      className="absolute top-1 right-1 p-1.5 rounded-full bg-red-500/80 hover:bg-red-500 text-white transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-32 h-20 rounded-lg border-2 border-dashed border-gray-600 hover:border-cyan-500/50 bg-gray-800/50 hover:bg-gray-800 transition-colors flex flex-col items-center justify-center gap-1 shrink-0"
                    >
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-gray-500 text-xs">Upload</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <p className="text-gray-500 text-xs">or leave empty for default</p>
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
                <label className="block text-gray-300 text-sm font-medium mb-1">
                  Starting Chips
                </label>
                <p className="text-gray-500 text-xs mb-2">
                  How many chips each player begins with. More chips means longer games with more strategic depth.
                </p>
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
                <label className="block text-gray-300 text-sm font-medium mb-1">
                  Maximum Hands
                </label>
                <p className="text-gray-500 text-xs mb-2">
                  The max number of hands each player can play. Once reached, their score is final. Lower = quicker games.
                </p>
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
                <label className="block text-gray-300 text-sm font-medium mb-1">
                  Time Limit
                </label>
                <p className="text-gray-500 text-xs mb-2">
                  How long the tournament stays open. When time runs out, rankings are finalized. &quot;No Limit&quot; means it ends only when all hands are played.
                </p>
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
                    <p className="text-gray-400 text-sm">Allow players to buy back in after losing all chips. Each rebuy costs the same as the original buy-in and adds to the prize pool.</p>
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
                    <label className="block text-gray-300 text-sm font-medium mb-1">
                      Max Rebuys per Player
                    </label>
                    <p className="text-gray-500 text-xs mb-2">
                      Limit how many times a player can rebuy. &quot;Unlimited&quot; means no cap.
                    </p>
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
                <label className="block text-gray-300 text-sm font-medium mb-1">
                  Prize source
                </label>
                <p className="text-gray-500 text-xs mb-2">
                  Platform: prizes are paid from MORBIUS buy-ins. Custom token: you fund the prize pool with any PRC-20 token of your choice.
                </p>
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
                    {/* Selected token display */}
                    {selectedToken ? (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-900 border border-cyan-500/30">
                        {selectedToken.logoUrl && (
                          <img src={selectedToken.logoUrl} alt="" className="w-8 h-8 rounded-full" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">
                            {selectedToken.name} ({selectedToken.symbol})
                          </p>
                          <p className="text-gray-500 text-xs font-mono">
                            {selectedToken.address.slice(0, 10)}...{selectedToken.address.slice(-6)}
                          </p>
                          <p className="text-gray-600 text-xs">{selectedToken.decimals} decimals</p>
                        </div>
                        <button
                          onClick={handleClearToken}
                          className="p-1.5 rounded-full hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      /* Token search input */
                      <div className="relative" ref={tokenDropdownRef}>
                        <label className="block text-gray-400 text-xs mb-1">Search token or paste address</label>
                        <div className="relative">
                          <input
                            type="text"
                            value={tokenQuery}
                            onChange={(e) => handleTokenQueryChange(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleRawAddressSubmit();
                              }
                            }}
                            placeholder="Search by name or paste 0x address..."
                            className="w-full px-3 py-2 pr-8 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-cyan-500"
                          />
                          {tokenSearching && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2">
                              <svg className="animate-spin h-4 w-4 text-gray-400" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            </div>
                          )}
                        </div>
                        {/* Search results dropdown */}
                        {tokenSearchResults.length > 0 && (
                          <div className="absolute z-10 mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                            {tokenSearchResults.map((result) => (
                              <button
                                key={result.address}
                                onClick={() => handleSelectToken(result)}
                                className="w-full px-3 py-2.5 text-left hover:bg-gray-700 transition-colors flex items-center gap-3 border-b border-gray-700/50 last:border-0"
                              >
                                {result.iconUrl ? (
                                  <img src={result.iconUrl} alt="" className="w-6 h-6 rounded-full shrink-0" />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-gray-600 shrink-0" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="text-white text-sm truncate">{result.name}</p>
                                  <p className="text-gray-500 text-xs">
                                    {result.symbol} &middot; {result.address.slice(0, 6)}...{result.address.slice(-4)}
                                  </p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                        {/* Hint for raw address */}
                        {tokenQuery.trim().startsWith('0x') && tokenQuery.trim().length === 42 && tokenSearchResults.length === 0 && !tokenSearching && (
                          <button
                            onClick={handleRawAddressSubmit}
                            className="mt-1 w-full px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-cyan-300 text-xs text-left transition-colors"
                          >
                            Use this address: {tokenQuery.trim().slice(0, 10)}...{tokenQuery.trim().slice(-6)}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Prize amount */}
                    <div>
                      <label className="block text-gray-400 text-xs mb-1">
                        Prize amount{selectedToken ? ` (${selectedToken.symbol})` : ''}
                      </label>
                      <input
                        type="text"
                        value={prizeAmountHuman}
                        onChange={(e) => setPrizeAmountHuman(e.target.value)}
                        placeholder="e.g. 1000000"
                        className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <p className="text-gray-500 text-xs">
                      After creating, you will fund the prize pool by approving and depositing this token to the escrow.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-gray-300 text-sm font-medium mb-1">
                  Prize Distribution
                </label>
                <p className="text-gray-500 text-xs mb-3">
                  Choose how the prize pool is split among top finishers. 84% of the pool goes to winners, 16% to the house.
                </p>
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
              <p className="text-gray-500 text-xs">
                Pick the table background players will see during the tournament. This is purely cosmetic.
              </p>
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
