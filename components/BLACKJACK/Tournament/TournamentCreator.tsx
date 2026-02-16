'use client';

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { formatEther, parseEther } from 'viem';
import { useAccount, useWriteContract, usePublicClient } from 'wagmi';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Theme } from '@/lib/theme';

const ESCROW_ZERO = '0x0000000000000000000000000000000000000000';
const isEscrowConfigured = TOURNAMENT_PRIZE_ESCROW_ADDRESS !== ESCROW_ZERO;
import { tournamentPrizeEscrowAbi } from '@/abi/tournament-prize-escrow';
import { tournamentIdToBytes32 } from '@/lib/tournament-id-bytes32';
import { ERC20_ABI } from '@/abi/erc20';

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

  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  // Wizard: 1=Basics, 2=When & Rules, 3=Prizes & Entry, 4=Options, 5=Review
  const [wizardStep, setWizardStep] = useState(1);
  const TOTAL_WIZARD_STEPS = 5;

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
  // Elimination mode
  const [eliminationIntervalType, setEliminationIntervalType] = useState<'time' | 'hands'>('time');
  const [eliminationIntervalValue, setEliminationIntervalValue] = useState<number>(10);
  const [eliminationPercentage, setEliminationPercentage] = useState<number>(20);
  const [resetChipsAfterRound, setResetChipsAfterRound] = useState(false);
  const [eliminationRoundsMin, setEliminationRoundsMin] = useState<number>(1);
  const [eliminationRoundsMax, setEliminationRoundsMax] = useState<number>(10);
  // Freeroll player limits
  const [minPlayersFreeroll, setMinPlayersFreeroll] = useState<number>(2);
  const [maxPlayersFreeroll, setMaxPlayersFreeroll] = useState<number>(100);
  const [maxPlayersUnlimited, setMaxPlayersUnlimited] = useState<boolean>(false);

  // Custom image upload state
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Creator fee (0-5%)
  const [creatorFeePercent, setCreatorFeePercent] = useState(0);

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
      return BigInt(0);
    }
  }, [buyInAmount]);

  const canAffordBuyIn = playerBalance >= buyInAmountWei;

  const selectedPreset = useMemo(
    () => PRIZE_PRESETS.find(p => p.id === prizeDistributionType),
    [prizeDistributionType]
  );

  // Example prize distribution preview
  const examplePrizePool = buyInAmountWei * BigInt(10); // Simulate 10 players
  const totalFeePercent = 16 + creatorFeePercent; // platform fee (16 default) + creator fee
  const prizePreview = useMemo(() => {
    if (!selectedPreset) return [];
    return getExamplePrizeDistribution(examplePrizePool, selectedPreset.percentages, totalFeePercent);
  }, [selectedPreset, examplePrizePool, totalFeePercent]);

  const handleCreate = async () => {
    setError(null);

    const trimmedName = name.trim();
    if (trimmedName.length < TOURNAMENT_VALIDATION.NAME_MIN_LENGTH) {
      setError(`Name must be at least ${TOURNAMENT_VALIDATION.NAME_MIN_LENGTH} characters`);
      return;
    }
    if (trimmedName.length > TOURNAMENT_VALIDATION.NAME_MAX_LENGTH) {
      setError(`Name must be at most ${TOURNAMENT_VALIDATION.NAME_MAX_LENGTH} characters`);
      return;
    }

    if (tournamentType === 'freeroll' && onCreateFreeroll) {
      const regOpens = fromDatetimeLocal(registrationOpensAt);
      const startAt = fromDatetimeLocal(scheduledStartAt);
      if (!regOpens || !startAt) {
        setError('Set Registration start and Game start date/time in the Timing section.');
        return;
      }
      if (durationMinutes < FREEROLL_VALIDATION.DURATION_MIN_MINUTES || durationMinutes > FREEROLL_VALIDATION.DURATION_MAX_MINUTES) {
        setError(`Tournament time limit (duration) must be ${FREEROLL_VALIDATION.DURATION_MIN_MINUTES}–${FREEROLL_VALIDATION.DURATION_MAX_MINUTES} minutes`);
        return;
      }
      if (freerollMode === 'elimination') {
        if (eliminationRoundsMin > eliminationRoundsMax) {
          setError('Elimination rounds min cannot exceed max');
          return;
        }
        const pct = Math.min(FREEROLL_VALIDATION.ELIMINATION_PERCENTAGE_MAX, Math.max(FREEROLL_VALIDATION.ELIMINATION_PERCENTAGE_MIN, eliminationPercentage));
        const interval =
          eliminationIntervalType === 'time'
            ? Math.min(FREEROLL_VALIDATION.ELIMINATION_INTERVAL_MAX_MINUTES, Math.max(FREEROLL_VALIDATION.ELIMINATION_INTERVAL_MIN_MINUTES, eliminationIntervalValue))
            : Math.min(FREEROLL_VALIDATION.ELIMINATION_INTERVAL_MAX_HANDS, Math.max(FREEROLL_VALIDATION.ELIMINATION_INTERVAL_MIN_HANDS, eliminationIntervalValue));
        if (interval < 1) {
          setError('Elimination interval must be at least 1');
          return;
        }
      }
      const minP = Math.min(FREEROLL_VALIDATION.MIN_PLAYERS_MAX, Math.max(FREEROLL_VALIDATION.MIN_PLAYERS_MIN, minPlayersFreeroll));
      const maxP = maxPlayersUnlimited ? null : Math.min(FREEROLL_VALIDATION.MAX_PLAYERS_MAX, Math.max(FREEROLL_VALIDATION.MAX_PLAYERS_MIN, maxPlayersFreeroll));
      if (maxP != null && minP > maxP) {
        setError('Min players cannot exceed max players');
        return;
      }
      const resolvedTableTheme: TableTheme = themeKind === 'video'
        ? (BLACKJACK_VIDEO_BACKGROUNDS.find((b) => b.id === themeId)
          ? { kind: 'video', id: themeId }
          : { kind: 'video', id: BLACKJACK_VIDEO_BACKGROUNDS[0].id })
        : (BLACKJACK_IMAGE_BACKGROUNDS.find((b) => b.id === themeId)
          ? { kind: 'image', id: themeId }
          : { kind: 'image', id: BLACKJACK_IMAGE_BACKGROUNDS[0].id });

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
        tableTheme: resolvedTableTheme,
        isPrivate,
        minPlayers: minP,
        maxPlayers: maxP,
        customImage: customImage || undefined,
        pinCode: isPrivate && manualPin.trim() ? manualPin.trim() : undefined,
      };
      if (freerollMode === 'elimination') {
        freerollParams.eliminationConfig = {
          intervalType: eliminationIntervalType,
          intervalValue: eliminationIntervalType === 'time'
            ? Math.min(FREEROLL_VALIDATION.ELIMINATION_INTERVAL_MAX_MINUTES, Math.max(FREEROLL_VALIDATION.ELIMINATION_INTERVAL_MIN_MINUTES, eliminationIntervalValue))
            : Math.min(FREEROLL_VALIDATION.ELIMINATION_INTERVAL_MAX_HANDS, Math.max(FREEROLL_VALIDATION.ELIMINATION_INTERVAL_MIN_HANDS, eliminationIntervalValue)),
          eliminationPercentage: Math.min(FREEROLL_VALIDATION.ELIMINATION_PERCENTAGE_MAX, Math.max(FREEROLL_VALIDATION.ELIMINATION_PERCENTAGE_MIN, eliminationPercentage)),
          resetChipsAfterRound,
          eliminationRoundsMin: Math.min(FREEROLL_VALIDATION.ELIMINATION_ROUNDS_MAX, Math.max(FREEROLL_VALIDATION.ELIMINATION_ROUNDS_MIN, eliminationRoundsMin)),
          eliminationRoundsMax: Math.min(FREEROLL_VALIDATION.ELIMINATION_ROUNDS_MAX, Math.max(FREEROLL_VALIDATION.ELIMINATION_ROUNDS_MIN, eliminationRoundsMax)),
        };
      }
      const result = await onCreateFreeroll(freerollParams);
      if (result) {
        setCreatedTournament({ id: result.tournamentId, pinCode: result.pinCode });
      }
      return;
    }

    // Resolve table theme: ensure id exists for current kind (user may have switched steps and id could be stale)
    const resolvedTableTheme: TableTheme = (() => {
      if (themeKind === 'video') {
        const found = BLACKJACK_VIDEO_BACKGROUNDS.find((b) => b.id === themeId);
        return { kind: 'video', id: found ? found.id : BLACKJACK_VIDEO_BACKGROUNDS[0].id };
      }
      const found = BLACKJACK_IMAGE_BACKGROUNDS.find((b) => b.id === themeId);
      return { kind: 'image', id: found ? found.id : BLACKJACK_IMAGE_BACKGROUNDS[0].id };
    })();

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
      tableTheme: resolvedTableTheme,
      isPrivate,
      prizeDistributionType,
      customImage: customImage || undefined,
      pinCode: isPrivate && manualPin.trim() ? manualPin.trim() : undefined,
      creatorFeePercent: creatorFeePercent > 0 ? creatorFeePercent : undefined,
    };
    if (prizeType === 'custom' && prizeTokenAddress.trim() && prizeAmountHuman.trim()) {
      const dec = Math.min(18, Math.max(0, prizeTokenDecimals));
      const prizeAmountWei = BigInt(prizeAmountHuman.replace(/\D/g, '') || '0') * BigInt(10 ** dec);
      if (prizeAmountWei > BigInt(0)) {
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

  // Reset wizard when opening
  useEffect(() => {
    if (isOpen && !createdTournament) setWizardStep(1);
  }, [isOpen, createdTournament]);

  /** Preset: Start freeroll in 1 min (for testing). */
  const applyStartInOneMinute = useCallback(() => {
    const now = new Date();
    const reg = new Date(now.getTime() - 2 * 60 * 1000); // registration "opened" 2 min ago
    const start = new Date(now.getTime() + 1 * 60 * 1000); // game start in 1 min
    setRegistrationOpensAt(toDatetimeLocal(reg.toISOString()));
    setScheduledStartAt(toDatetimeLocal(start.toISOString()));
    setDurationMinutes(15);
  }, []);

  if (!isOpen) return null;

  const handleApproveToken = async () => {
    if (!createdTournament || !prizeTokenAddress.trim() || fundingAmountWei <= BigInt(0)) return;
    const escrow = TOURNAMENT_PRIZE_ESCROW_ADDRESS;
    if (!isEscrowConfigured || escrow === ESCROW_ZERO) {
      setFundingError('Prize escrow contract not set. Add NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS to your .env.');
      return;
    }
    if (!address) {
      setFundingError('Please connect your wallet.');
      return;
    }
    setFundingError(null);
    setFundingStep('approving');
    try {
      const token = prizeTokenAddress.trim() as `0x${string}`;
      const pulseChain = {
        id: 369,
        name: 'PulseChain',
        nativeCurrency: { name: 'Pulse', symbol: 'PLS', decimals: 18 },
        rpcUrls: { default: { http: ['https://rpc.pulsechain.com'] } }
      };
      const hash = await writeContractAsync({
        address: token,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [escrow, fundingAmountWei],
        account: address,
        chain: pulseChain,
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
    if (!createdTournament || !prizeTokenAddress.trim() || fundingAmountWei <= BigInt(0)) return;
    const escrow = TOURNAMENT_PRIZE_ESCROW_ADDRESS;
    if (!isEscrowConfigured || escrow === ESCROW_ZERO) return;
    setFundingError(null);
    setFundingStep('depositing');
    try {
      // Ensure we get the connected user's wallet address dynamically.
      // Import { useAccount } from 'wagmi' at the top of the file if it's not already imported.
      // At the top level of your component (not inside a function), ensure you have:
      //   const { address } = useAccount();

      const token = prizeTokenAddress.trim() as `0x${string}`;
      const idBytes32 = tournamentIdToBytes32(createdTournament.id);

      if (!address) {
        setFundingError('Please connect your wallet.');
        setFundingStep('approved');
        return;
      }

      // PulseChain config for Viem/Wagmi calls (not always required, but explicit here)
      const pulseChain = {
        id: 369,
        name: 'PulseChain',
        nativeCurrency: { name: 'Pulse', symbol: 'PLS', decimals: 18 },
        rpcUrls: { default: { http: ['https://rpc.pulsechain.com'] } }
      };

      await writeContractAsync({
        address: escrow as `0x${string}`,
        abi: tournamentPrizeEscrowAbi,
        functionName: 'depositPrizePool',
        args: [idBytes32, token, fundingAmountWei],
        // Provide the connected address; hooks always get latest wallet
        account: address,
        chain: pulseChain,
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
        <div className="relative rounded-2xl border border-green-500/30 shadow-2xl shadow-green-500/20 max-w-md w-full mx-4 overflow-hidden" style={Theme.panel.base}>
          <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-4 text-center">
            <h2 className="text-2xl font-bold text-white">Tournament Created!</h2>
          </div>
          <div className="p-6 space-y-4 text-center">
            <div className="text-6xl">🎉</div>
            <p className="text-white text-lg font-semibold">{name}</p>

            {/* Two-step funding UI */}
            {(needsFunding || funded) && (
              <div className="rounded-xl p-4 text-left space-y-4" style={Theme.panel.base}>
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
              <div className="rounded-xl p-4 border border-yellow-500/30" style={Theme.panel.base}>
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
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 border-cyan-500/30 overflow-hidden" style={Theme.panel.base}>
        <DialogHeader className="p-4 pb-0 border-b border-gray-700 bg-gradient-to-r from-purple-600 to-cyan-600">
          <DialogTitle className="text-xl font-bold text-white text-center">Create Tournament</DialogTitle>
          <div className="flex justify-center gap-1.5 pt-3 pb-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setWizardStep(s)}
                className={`h-2 rounded-full transition-all ${
                  wizardStep === s ? 'w-6 bg-white' : 'w-2 bg-white/40 hover:bg-white/60'
                }`}
                aria-label={`Step ${s}`}
              />
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-red-400 text-sm mb-4">
              {error}
            </div>
          )}

          {/* Step 1: Basics */}
          {wizardStep === 1 && (
            <section className="space-y-6 max-w-lg mx-auto">
              <h3 className="text-lg font-semibold text-cyan-300">What kind of tournament?</h3>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setTournamentType('buyin')}
                  className={`flex-1 py-4 rounded-xl font-medium transition-colors border-2 ${
                    tournamentType === 'buyin'
                      ? 'bg-cyan-500/20 border-cyan-500 text-white'
                      : 'bg-gray-800/50 border-gray-600 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  <span className="block text-lg">Buy-in</span>
                  <span className="text-xs opacity-80">Players pay to enter</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTournamentType('freeroll')}
                  className={`flex-1 py-4 rounded-xl font-medium transition-colors border-2 ${
                    tournamentType === 'freeroll'
                      ? 'bg-cyan-500/20 border-cyan-500 text-white'
                      : 'bg-gray-800/50 border-gray-600 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  <span className="block text-lg">Freeroll</span>
                  <span className="text-xs opacity-80">Free to join, scheduled start</span>
                </button>
              </div>

              <div>
                <label className="block text-gray-300 font-medium mb-2">Tournament name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Friday Night Blitz"
                  maxLength={TOURNAMENT_VALIDATION.NAME_MAX_LENGTH}
                  className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                />
                <p className="text-gray-500 text-xs mt-1">{name.length}/{TOURNAMENT_VALIDATION.NAME_MAX_LENGTH}</p>
              </div>
            </section>
          )}

          {/* Step 2: When & Rules */}
          {wizardStep === 2 && (
            <section className="space-y-6 max-w-lg mx-auto">
              <h3 className="text-lg font-semibold text-cyan-300">
                {tournamentType === 'freeroll' ? 'When does it run?' : 'Time limit & rules'}
              </h3>

              {tournamentType === 'freeroll' ? (
                <>
                  <div>
                    <label className="block text-gray-400 text-xs mb-2">Quick presets</label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={applyStartInOneMinute}
                        className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-cyan-600 text-gray-300 hover:text-white text-sm font-medium transition-colors border border-gray-600"
                      >
                        Start in 1 min (test)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const now = new Date();
                          const reg = new Date(now.getTime());
                          const start = new Date(now.getTime() + 30 * 60 * 1000);
                          setRegistrationOpensAt(toDatetimeLocal(reg.toISOString()));
                          setScheduledStartAt(toDatetimeLocal(start.toISOString()));
                          setDurationMinutes(60);
                        }}
                        className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-cyan-600 text-gray-300 hover:text-white text-sm font-medium transition-colors border border-gray-600"
                      >
                        Start in 30 min
                      </button>
                    </div>
                  </div>
                  <div>
                    <label id="registration-opens-label" className="block text-gray-300 text-sm font-medium mb-1">Registration opens</label>
                    <input
                      id="registration-opens-input"
                      type="datetime-local"
                      value={registrationOpensAt}
                      onChange={(e) => setRegistrationOpensAt(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm"
                      aria-labelledby="registration-opens-label"
                    />
                  </div>
                  <div>
                    <label id="scheduled-start-label" className="block text-gray-300 text-sm font-medium mb-1">Game start</label>
                    <input
                      id="scheduled-start-input"
                      type="datetime-local"
                      value={scheduledStartAt}
                      onChange={(e) => setScheduledStartAt(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm"
                      aria-labelledby="scheduled-start-label"
                    />
                  </div>
                  <div>
                    <label id="duration-minutes-label" className="block text-gray-300 text-sm font-medium mb-1">Duration (minutes)</label>
                    <input
                      id="duration-minutes-input"
                      type="number"
                      min={FREEROLL_VALIDATION.DURATION_MIN_MINUTES}
                      max={FREEROLL_VALIDATION.DURATION_MAX_MINUTES}
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 60)}
                      className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm"
                      aria-labelledby="duration-minutes-label"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">Time limit</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {TOURNAMENT_VALIDATION.TIME_LIMIT_OPTIONS.map((limit) => (
                      <button
                        key={limit ?? 'none'}
                        type="button"
                        onClick={() => setTimeLimitMinutes(limit)}
                        className={`py-3 rounded-xl font-medium text-sm transition-colors ${
                          timeLimitMinutes === limit ? 'bg-cyan-500 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                        }`}
                      >
                        {TIME_LIMIT_LABELS[limit ?? 'null']}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">Starting chips</label>
                <div className="grid grid-cols-4 gap-2">
                  {TOURNAMENT_VALIDATION.STARTING_CHIPS_OPTIONS.map((chips) => (
                    <button
                      key={chips}
                      onClick={() => setStartingChips(chips)}
                      className={`py-3 rounded-xl font-medium transition-colors ${
                        startingChips === chips ? 'bg-cyan-500 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {chips.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">Max hands per player</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1"
                    max="200"
                    value={maxHands}
                    onChange={(e) => handleMaxHandsSlider(parseInt(e.target.value, 10))}
                    className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    aria-label="Max hands per player"
                  />
                  <span className="text-white font-medium w-12">{maxHands}</span>
                </div>
              </div>
            </section>
          )}

          {/* Step 3: Prizes & Entry */}
          {wizardStep === 3 && (
            <section className="space-y-6 max-w-lg mx-auto">
              <h3 className="text-lg font-semibold text-cyan-300">Prizes & entry</h3>

              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">Prize distribution</label>
                <p className="text-gray-500 text-xs mb-2">How the prize pool is split among top finishers.</p>
                <div className="space-y-2">
                  {PRIZE_PRESETS.filter((p) => p.id !== 'custom').map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => setPrizeDistributionType(preset.id)}
                      className={`w-full p-3 rounded-xl text-left transition-colors border ${
                        prizeDistributionType === preset.id
                          ? 'bg-cyan-500/20 border-cyan-500'
                          : 'bg-gray-800/50 border-gray-600 hover:border-gray-500'
                      }`}
                    >
                      <span className="text-white font-medium">{preset.name}</span>
                      <span className="text-gray-400 text-xs block mt-0.5">{preset.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {tournamentType === 'buyin' && (
                <div>
                  <label id="buy-in-amount-label" htmlFor="buy-in-amount-input" className="block text-gray-300 text-sm font-medium mb-1">Buy-in (MORBIUS)</label>
                  <input
                    id="buy-in-amount-input"
                    type="number"
                    value={buyInAmount}
                    onChange={(e) => setBuyInAmount(e.target.value)}
                    min="0"
                    step="1"
                    className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-cyan-500"
                    aria-labelledby="buy-in-amount-label"
                  />
                  <p className="text-gray-500 text-xs mt-1">0 = freeroll (no buy-in)</p>
                </div>
              )}

              {tournamentType === 'freeroll' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="min-players-freeroll" className="block text-gray-300 text-sm mb-1">Min players</label>
                    <input
                      id="min-players-freeroll"
                      type="number"
                      min={FREEROLL_VALIDATION.MIN_PLAYERS_MIN}
                      max={FREEROLL_VALIDATION.MIN_PLAYERS_MAX}
                      value={minPlayersFreeroll}
                      onChange={(e) => setMinPlayersFreeroll(parseInt(e.target.value, 10) || 2)}
                      className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-300 text-sm mb-1">Max players</label>
                    <div className="flex gap-2 items-center">
                      <input
                        id="max-players-freeroll"
                        type="number"
                        min={FREEROLL_VALIDATION.MAX_PLAYERS_MIN}
                        max={FREEROLL_VALIDATION.MAX_PLAYERS_MAX}
                        value={maxPlayersFreeroll}
                        disabled={maxPlayersUnlimited}
                        onChange={(e) => setMaxPlayersFreeroll(parseInt(e.target.value, 10) || 2)}
                        className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm disabled:opacity-50"
                        title="Max players (or check Unlimited)"
                      />
                      <label className="flex items-center gap-1.5 whitespace-nowrap text-gray-400 text-xs">
                        <input
                          type="checkbox"
                          checked={maxPlayersUnlimited}
                          onChange={(e) => setMaxPlayersUnlimited(e.target.checked)}
                          className="rounded border-gray-600"
                          aria-label="Unlimited max players"
                        />
                        Unlimited
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Step 4: Options */}
          {wizardStep === 4 && (
            <section className="space-y-6 max-w-lg mx-auto">
              <h3 className="text-lg font-semibold text-cyan-300">Options</h3>

              <div className="flex items-center justify-between p-4 rounded-xl border border-gray-700" style={Theme.panel.base}>
                <div>
                  <p className="text-white font-medium">Private tournament</p>
                  <p className="text-gray-400 text-sm">Requires PIN to join</p>
                </div>
                <button
                  onClick={() => setIsPrivate(!isPrivate)}
                  className={`relative w-14 h-8 rounded-full transition-colors ${isPrivate ? 'bg-purple-500' : 'bg-gray-600'}`}
                >
                  <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-transform ${isPrivate ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
              </div>
              {isPrivate && (
                <div>
                  <label className="block text-gray-300 text-sm mb-1">PIN (optional)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={12}
                    value={manualPin}
                    onChange={(e) => setManualPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 1234"
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm"
                  />
                </div>
              )}

              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">Card image (optional)</label>
                {imagePreview ? (
                  <div className="relative inline-block max-w-[200px]">
                    <div className="aspect-[3/2] max-h-28 rounded-lg overflow-hidden border-2 border-cyan-500/50">
                      <img src={imagePreview} alt="Card preview" className="w-full h-full object-cover" />
                    </div>
                    <button onClick={handleRemoveImage} className="absolute top-1 right-1 p-1.5 rounded-full bg-red-500/80 hover:bg-red-500 text-white">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button onClick={() => fileInputRef.current?.click()} className="w-32 h-20 rounded-lg border-2 border-dashed border-gray-600 hover:border-cyan-500/50 bg-gray-800/50 flex flex-col items-center justify-center gap-1">
                      <span className="text-gray-500 text-xs">Upload</span>
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" aria-label="Upload card image" />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">Table theme</label>
                <div className="flex gap-2 mb-2">
                  <button type="button" onClick={() => { setThemeKind('image'); setThemeId(BLACKJACK_IMAGE_BACKGROUNDS[0].id); }} className={`flex-1 py-2 rounded-lg text-sm font-medium ${themeKind === 'image' ? 'bg-cyan-500 text-white' : 'bg-gray-800 text-gray-400'}`}>Image</button>
                  <button type="button" onClick={() => { setThemeKind('video'); setThemeId(BLACKJACK_VIDEO_BACKGROUNDS[0].id); }} className={`flex-1 py-2 rounded-lg text-sm font-medium ${themeKind === 'video' ? 'bg-cyan-500 text-white' : 'bg-gray-800 text-gray-400'}`}>Video</button>
                </div>
                <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                  {themeKind === 'image' && BLACKJACK_IMAGE_BACKGROUNDS.map((bg) => (
                    <button key={bg.id} type="button" onClick={() => setThemeId(bg.id)} className={`relative aspect-video rounded-lg overflow-hidden border-2 ${themeId === bg.id ? 'border-cyan-500' : 'border-gray-600'}`}>
                      <img src={bg.src} alt={bg.label} className="w-full h-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 px-1"><p className="text-white text-xs truncate">{bg.label}</p></div>
                    </button>
                  ))}
                  {themeKind === 'video' && BLACKJACK_VIDEO_BACKGROUNDS.map((bg) => (
                    <button key={bg.id} type="button" onClick={() => setThemeId(bg.id)} className={`relative aspect-video rounded-lg overflow-hidden border-2 ${themeId === bg.id ? 'border-cyan-500' : 'border-gray-600'}`}>
                      <video src={bg.src} className="w-full h-full object-cover" muted loop autoPlay playsInline />
                      <div className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 px-1"><p className="text-white text-xs truncate">{bg.label}</p></div>
                    </button>
                  ))}
                </div>
              </div>

              {tournamentType === 'freeroll' && (
                <div className="space-y-4 p-4 rounded-xl border border-cyan-500/20" style={Theme.panel.base}>
                  <h4 className="text-sm font-semibold text-cyan-400">Freeroll options</h4>
                  <div>
                    <label className="block text-gray-400 text-xs mb-1">Mode</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setFreerollMode('standard_chip_count')} className={`flex-1 py-2 rounded-lg text-sm font-medium ${freerollMode === 'standard_chip_count' ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300'}`}>Chip count</button>
                      <button type="button" onClick={() => setFreerollMode('elimination')} className={`flex-1 py-2 rounded-lg text-sm font-medium ${freerollMode === 'elimination' ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300'}`}>Elimination</button>
                    </div>
                  </div>
                  {freerollMode === 'elimination' && (
                    <div className="space-y-3 text-sm">
                      <div>
                        <label className="block text-gray-400 text-xs mb-1">Trigger</label>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setEliminationIntervalType('time')} className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${eliminationIntervalType === 'time' ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300'}`}>Every N min</button>
                          <button type="button" onClick={() => setEliminationIntervalType('hands')} className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${eliminationIntervalType === 'hands' ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300'}`}>Every N hands</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-gray-400 text-xs mb-1">{eliminationIntervalType === 'time' ? 'Interval (min)' : 'Interval (hands)'}</label>
                          <input type="number" min={1} value={eliminationIntervalValue} onChange={(e) => setEliminationIntervalValue(parseInt(e.target.value, 10) || 1)} className="w-full px-2 py-1.5 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm" aria-label="Elimination interval" />
                        </div>
                        <div>
                          <label className="block text-gray-400 text-xs mb-1">Bottom % out</label>
                          <input type="number" min={5} max={50} value={eliminationPercentage} onChange={(e) => setEliminationPercentage(parseInt(e.target.value, 10) || 20)} className="w-full px-2 py-1.5 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm" aria-label="Bottom percent eliminated" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-xs">Reset chips after round</span>
                        <button type="button" onClick={() => setResetChipsAfterRound(!resetChipsAfterRound)} className={`relative w-10 h-5 rounded-full ${resetChipsAfterRound ? 'bg-cyan-500' : 'bg-gray-600'}`}><div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${resetChipsAfterRound ? 'translate-x-5' : 'translate-x-1'}`} /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="number" min={1} max={50} value={eliminationRoundsMin} onChange={(e) => setEliminationRoundsMin(parseInt(e.target.value, 10) || 1)} className="w-full px-2 py-1.5 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm" placeholder="Rounds min" aria-label="Elimination rounds minimum" />
                        <input type="number" min={1} max={50} value={eliminationRoundsMax} onChange={(e) => setEliminationRoundsMax(parseInt(e.target.value, 10) || 10)} className="w-full px-2 py-1.5 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm" placeholder="Rounds max" aria-label="Elimination rounds maximum" />
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-sm">Re-entry window</span>
                    <button type="button" onClick={() => setReentryEnabled(!reentryEnabled)} className={`relative w-12 h-6 rounded-full ${reentryEnabled ? 'bg-cyan-500' : 'bg-gray-600'}`}><div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${reentryEnabled ? 'translate-x-7' : 'translate-x-1'}`} /></button>
                  </div>
                  {reentryEnabled && <input type="number" min={1} max={60} value={reentryWindowMinutes} onChange={(e) => setReentryWindowMinutes(parseInt(e.target.value, 10) || 5)} className="w-full px-2 py-1.5 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm" aria-label="Re-entry window minutes" />}
                  <div>
                    <label className="block text-gray-400 text-xs mb-1">Action timer (sec)</label>
                    <select value={actionTimerSeconds ?? ''} onChange={(e) => setActionTimerSeconds(e.target.value === '' ? null : parseInt(e.target.value, 10))} className="w-full px-2 py-1.5 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm" aria-label="Action timer seconds">
                      <option value="">None</option><option value="10">10</option><option value="15">15</option>
                    </select>
                  </div>
                </div>
              )}

              {tournamentType === 'buyin' && (
                <>
                  <div className="flex items-center justify-between p-4 rounded-xl border border-gray-700" style={Theme.panel.base}>
                    <div><p className="text-white font-medium">Rebuys</p><p className="text-gray-400 text-xs">Buy back in after busting</p></div>
                    <button onClick={() => setRebuyEnabled(!rebuyEnabled)} className={`relative w-12 h-6 rounded-full ${rebuyEnabled ? 'bg-green-500' : 'bg-gray-600'}`}><div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${rebuyEnabled ? 'translate-x-6' : 'translate-x-1'}`} /></button>
                  </div>
                  {rebuyEnabled && (
                    <div className="grid grid-cols-4 gap-2">
                      {TOURNAMENT_VALIDATION.MAX_REBUYS_OPTIONS.map((max) => (
                        <button key={max} onClick={() => setMaxRebuys(max)} className={`py-2 rounded-lg text-sm font-medium ${maxRebuys === max ? 'bg-green-500 text-white' : 'bg-gray-800 text-gray-400'}`}>{MAX_REBUYS_LABELS[max]}</button>
                      ))}
                    </div>
                  )}
                  <div>
                    <label className="block text-gray-300 text-sm mb-1">Creator fee: {creatorFeePercent}%</label>
                    <input type="range" min="0" max="5" step="1" value={creatorFeePercent} onChange={(e) => setCreatorFeePercent(parseInt(e.target.value, 10))} className="w-full h-2 bg-gray-700 rounded-lg accent-purple-500" aria-label="Creator fee percent" />
                  </div>
                  <div>
                    <label className="block text-gray-300 text-sm font-medium mb-1">Prize source</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setPrizeType('platform')} className={`flex-1 py-2 rounded-lg text-sm font-medium ${prizeType === 'platform' ? 'bg-cyan-500 text-white' : 'bg-gray-800 text-gray-400'}`}>Platform (MORBIUS)</button>
                      <button type="button" onClick={() => setPrizeType('custom')} className={`flex-1 py-2 rounded-lg text-sm font-medium ${prizeType === 'custom' ? 'bg-cyan-500 text-white' : 'bg-gray-800 text-gray-400'}`}>Custom token</button>
                    </div>
                  </div>
                  {prizeType === 'custom' && (
                    <div className="space-y-2 p-3 rounded-lg border border-gray-700" style={Theme.panel.base}>
                      {selectedToken ? (
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-900">
                          <span className="text-white text-sm truncate">{selectedToken.symbol}</span>
                          <button onClick={handleClearToken} className="ml-auto text-gray-400 hover:text-white">Clear</button>
                        </div>
                      ) : (
                        <div ref={tokenDropdownRef}>
                          <input type="text" value={tokenQuery} onChange={(e) => handleTokenQueryChange(e.target.value)} placeholder="Search or paste token address" className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm" />
                          {tokenSearchResults.length > 0 && (
                            <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-gray-600 bg-gray-800">
                              {tokenSearchResults.map((r) => (
                                <button key={r.address} type="button" onClick={() => handleSelectToken(r)} className="w-full px-3 py-2 text-left text-sm hover:bg-gray-700 flex items-center gap-2">
                                  <span className="text-white truncate">{r.symbol}</span><span className="text-gray-500 text-xs">{r.name}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <input type="text" value={prizeAmountHuman} onChange={(e) => setPrizeAmountHuman(e.target.value)} placeholder="Prize amount" className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm" />
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* Step 5: Review */}
          {wizardStep === 5 && (
            <section className="space-y-4 max-w-lg mx-auto">
              <h3 className="text-lg font-semibold text-cyan-300">Review</h3>
              <div className="rounded-xl border border-gray-700 p-4 space-y-3 text-sm" style={Theme.panel.base}>
                <p><span className="text-gray-500">Name:</span> <span className="text-white font-medium">{name || '—'}</span></p>
                <p><span className="text-gray-500">Type:</span> <span className="text-white">{tournamentType === 'buyin' ? 'Buy-in' : 'Freeroll'}</span></p>
                {tournamentType === 'freeroll' && (
                  <p><span className="text-gray-500">Start:</span> <span className="text-white">{scheduledStartAt ? new Date(fromDatetimeLocal(scheduledStartAt)).toLocaleString() : '—'}</span></p>
                )}
                <p><span className="text-gray-500">Chips:</span> <span className="text-white">{startingChips.toLocaleString()}</span> · <span className="text-gray-500">Max hands:</span> <span className="text-white">{maxHands}</span></p>
                <p><span className="text-gray-500">Prizes:</span> <span className="text-white">{PRIZE_PRESETS.find(p => p.id === prizeDistributionType)?.name ?? prizeDistributionType}</span></p>
                {tournamentType === 'buyin' && <p><span className="text-gray-500">Buy-in:</span> <span className="text-white">{buyInAmount} MORBIUS</span></p>}
                {tournamentType === 'freeroll' && <p><span className="text-gray-500">Players:</span> <span className="text-white">{minPlayersFreeroll} – {maxPlayersUnlimited ? '∞' : maxPlayersFreeroll}</span></p>}
                <p><span className="text-gray-500">Private:</span> <span className="text-white">{isPrivate ? 'Yes' : 'No'}</span></p>
                <p><span className="text-gray-500">Table:</span> <span className="text-white">{themeKind === 'video' ? (BLACKJACK_VIDEO_BACKGROUNDS.find(b => b.id === themeId)?.label ?? themeId) : (BLACKJACK_IMAGE_BACKGROUNDS.find(b => b.id === themeId)?.label ?? themeId)}</span></p>
              </div>
              <p className="text-gray-500 text-xs">Use the steps above to change anything, then click Create below.</p>
            </section>
          )}

        </div>

        <DialogFooter className="p-4 border-t border-gray-700 flex-row gap-3" style={Theme.panel.base}>
          <button type="button" onClick={handleClose} className="py-3 px-4 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-medium transition-colors">
            Cancel
          </button>
          {wizardStep > 1 && (
            <button type="button" onClick={() => { setWizardStep((s) => s - 1); setError(null); }} className="py-3 px-4 rounded-xl bg-gray-600 hover:bg-gray-500 text-white font-medium transition-colors">
              Back
            </button>
          )}
          {wizardStep < TOTAL_WIZARD_STEPS ? (
            <button type="button" onClick={() => { setWizardStep((s) => s + 1); setError(null); }} disabled={wizardStep === 1 && !name.trim()} className="flex-1 py-3 rounded-xl font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              Next
            </button>
          ) : (
            <button type="button" onClick={handleCreate} disabled={isLoading || !name.trim()} className={`flex-1 py-3 rounded-xl font-semibold transition-all ${!isLoading && name.trim() ? 'bg-gradient-to-r from-purple-500 to-cyan-500 hover:from-purple-400 hover:to-cyan-400 text-white shadow-lg shadow-purple-500/30' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}>
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                  Creating...
                </span>
              ) : (
                'Create Tournament'
              )}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TournamentCreator;
