'use client';

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { formatEther, parseEther, parseUnits } from 'viem';
import { pulsechain } from 'viem/chains';
import { useConnectModal } from '@rainbow-me/rainbowkit';
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
  getMinPlayersFromPrizeDistribution,
  TIME_LIMIT_LABELS,
  PrizeDistributionType,
  TableTheme,
  CreateTournamentRequest,
  CreateFreerollRequest,
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
import { useTokenPriceUsd } from '@/hooks/use-token-price-usd';
import { TokenWithLogo } from '@/components/Creators/TokenWithLogo';
import { ConfirmActionCard } from '@/components/shared/ConfirmActionCard';
import { Prc20TokenPicker, type SelectedPrc20Token } from '@/components/shared/Prc20TokenPicker';

const ESCROW_ZERO = '0x0000000000000000000000000000000000000000';
const isEscrowConfigured = (TOURNAMENT_PRIZE_ESCROW_ADDRESS as string) !== ESCROW_ZERO;
import { tournamentPrizeEscrowV2Abi } from '@/abi/tournament-prize-escrow-v2';
import { tournamentIdToBytes32 } from '@/lib/tournament-id-bytes32';
import { ERC20_ABI } from '@/abi/erc20';
import { useGasParams } from '@/lib/tx-gas';

type FundingStep = 'idle' | 'approving' | 'approved' | 'depositing' | 'done';

export interface BlackjackTournamentCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (params: CreateTournamentRequest) => Promise<{ tournamentId: string; pinCode?: string; onChainTournamentId?: number } | null>;
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

export function BlackjackTournamentCreator({
  isOpen,
  onClose,
  onCreate,
  onCreateFreeroll,
  isLoading,
  playerBalance,
}: BlackjackTournamentCreatorProps) {
  const [error, setError] = useState<string | null>(null);
  const [createdTournament, setCreatedTournament] = useState<{ id: string; pinCode?: string; onChainTournamentId?: number } | null>(null);
  const [fundingStep, setFundingStep] = useState<FundingStep>('idle');
  const [showConfirm, setShowConfirm] = useState(false);
  const [approvalTxHash, setApprovalTxHash] = useState<string | null>(null);
  const [fundingError, setFundingError] = useState<string | null>(null);

  // Token picker state — picker owns search/debounce internally; we just hold the resolved selection.
  const [selectedToken, setSelectedToken] = useState<SelectedPrc20Token | null>(null);

  const handleTokenChange = useCallback((token: SelectedPrc20Token | null) => {
    setSelectedToken(token);
    if (token) {
      setPrizeTokenAddress(token.address);
      setPrizeTokenDecimals(token.decimals);
    } else {
      setPrizeTokenAddress('');
      setPrizeTokenDecimals(18);
    }
  }, []);

  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const getGas = useGasParams();

  // Wizard: 1=Basics, 2=When & Rules, 3=Prizes & Entry, 4=Options, 5=Review
  const [wizardStep, setWizardStep] = useState(1);
  const TOTAL_WIZARD_STEPS = 5;
  const WIZARD_TABS: { step: number; label: string; short: string }[] = [
    { step: 1, label: 'Basics', short: 'Basics' },
    { step: 2, label: 'Schedule & rules', short: 'Schedule' },
    { step: 3, label: 'Prizes & entry', short: 'Prizes' },
    { step: 4, label: 'Options', short: 'Options' },
    { step: 5, label: 'Review', short: 'Review' },
  ];

  // Tournament type: buy-in or freeroll
  const [tournamentType, setTournamentType] = useState<'buyin' | 'freeroll'>('buyin');

  // Form state
  const [name, setName] = useState('');
  const [buyInAmount, setBuyInAmount] = useState('1000'); // In MORBIUS
  const [isPrivate, setIsPrivate] = useState(false);
  const [manualPin, setManualPin] = useState('');
  const startingChips = 5000;
  const maxHands = 25;
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number | null>(null);
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
  // Freeroll player limits
  const [maxPlayersFreeroll, setMaxPlayersFreeroll] = useState<number>(100);
  const [maxPlayersUnlimited, setMaxPlayersUnlimited] = useState<boolean>(false);
  const minPlayersFreeroll = getMinPlayersFromPrizeDistribution(prizeDistributionType);

  // Custom image upload state
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Custom prize token (when prize type is 'custom')
  const [prizeType, setPrizeType] = useState<'platform' | 'custom'>('platform');
  const [prizeTokenAddress, setPrizeTokenAddress] = useState('');
  const [prizeAmountHuman, setPrizeAmountHuman] = useState('');
  const [prizeTokenDecimals, setPrizeTokenDecimals] = useState<number>(18);

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
  // Computed values
  const buyInAmountWei = useMemo(() => {
    try {
      return parseEther(buyInAmount || '0');
    } catch {
      return BigInt(0);
    }
  }, [buyInAmount]);

  const canAffordBuyIn = playerBalance >= buyInAmountWei;

  // USD value for custom prize (DexScreener)
  const prizeTokenPriceUsd = useTokenPriceUsd(prizeType === 'custom' && prizeTokenAddress ? prizeTokenAddress : null);
  const prizeAmountWeiForReview = useMemo(() => {
    if (prizeType !== 'custom' || !prizeAmountHuman.trim()) return 0n;
    const dec = Math.min(18, Math.max(0, prizeTokenDecimals));
    try {
      return parseUnits(prizeAmountHuman.trim(), dec);
    } catch {
      return 0n;
    }
  }, [prizeType, prizeAmountHuman, prizeTokenDecimals]);
  const prizeUsdValue = useMemo(() => {
    if (prizeAmountWeiForReview === 0n || prizeTokenPriceUsd == null) return null;
    const dec = prizeTokenDecimals;
    const human = Number(prizeAmountWeiForReview) / 10 ** dec;
    return human * prizeTokenPriceUsd;
  }, [prizeAmountWeiForReview, prizeTokenPriceUsd, prizeTokenDecimals]);

  const selectedPreset = useMemo(
    () => PRIZE_PRESETS.find(p => p.id === prizeDistributionType),
    [prizeDistributionType]
  );

  // Example prize distribution preview (3% protocol + 2% creator = 5%)
  const examplePrizePool = buyInAmountWei * BigInt(10); // Simulate 10 players
  const totalFeePercent = 5;
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
      const minP = getMinPlayersFromPrizeDistribution(prizeDistributionType);
      const maxP = maxPlayersUnlimited ? null : Math.min(FREEROLL_VALIDATION.MAX_PLAYERS_MAX, Math.max(FREEROLL_VALIDATION.MAX_PLAYERS_MIN, maxPlayersFreeroll));
      if (maxP != null && minP > maxP) {
        setError('Min players cannot exceed max players');
        return;
      }
      if (prizeType === 'custom') {
        if (!selectedToken || !prizeTokenAddress.trim()) {
          setError('Select a custom token for the prize pool.');
          return;
        }
        if (!prizeAmountHuman.trim() || prizeAmountWeiForReview <= 0n) {
          setError('Enter a valid prize amount.');
          return;
        }
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
        scheduledStartAt: startAt,
        registrationOpensAt: regOpens,
        durationMinutes,
        startingChips,
        maxHands,
        prizeDistributionType,
        tableTheme: resolvedTableTheme,
        isPrivate,
        maxPlayers: maxP,
        customImage: customImage || undefined,
        pinCode: isPrivate && manualPin.trim() ? manualPin.trim() : undefined,
      };
      if (prizeType === 'custom' && selectedToken && prizeTokenAddress.trim() && prizeAmountHuman.trim()) {
        const dec = Math.min(18, Math.max(0, prizeTokenDecimals));
        if (prizeAmountWeiForReview > 0n) {
          freerollParams.prizeTokenAddress = prizeTokenAddress.trim();
          freerollParams.prizeAmount = prizeAmountWeiForReview.toString();
          freerollParams.prizeTokenDecimals = dec;
        }
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
      tableTheme: resolvedTableTheme,
      isPrivate,
      prizeDistributionType,
      customImage: customImage || undefined,
      pinCode: isPrivate && manualPin.trim() ? manualPin.trim() : undefined,
    };
    if (prizeType === 'custom' && prizeTokenAddress.trim() && prizeAmountHuman.trim()) {
      const dec = Math.min(18, Math.max(0, prizeTokenDecimals));
      if (prizeAmountWeiForReview > 0n) {
        params.prizeTokenAddress = prizeTokenAddress.trim();
        params.prizeAmount = prizeAmountWeiForReview.toString();
        params.prizeTokenDecimals = dec;
      }
    }

    const result = await onCreate(params);
    if (result) {
      setCreatedTournament({ id: result.tournamentId, pinCode: result.pinCode, onChainTournamentId: result.onChainTournamentId });
    }
  };

  const handleClose = () => {
    setCreatedTournament(null);
    setError(null);
    onClose();
  };

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

  // Confirmation card rows
  const confirmRows = (() => {
    const rows: import('@/components/shared/ConfirmActionCard').ConfirmActionRow[] = [];
    rows.push({ label: 'Tournament', value: name || '—', accent: 'white' });
    rows.push({ label: 'Type', value: tournamentType === 'buyin' ? 'Buy-in' : 'Freeroll', accent: 'cyan' });
    if (tournamentType === 'buyin') {
      rows.push({ label: 'Buy-in', value: `${buyInAmount} MORBIUS`, accent: 'yellow' });
    }
    if (tournamentType === 'freeroll' && scheduledStartAt) {
      rows.push({ label: 'Start', value: new Date(fromDatetimeLocal(scheduledStartAt)).toLocaleString(), accent: 'white' });
      rows.push({ label: 'Duration', value: `${durationMinutes} min`, accent: 'white' });
    }
    rows.push({ label: 'Starting Chips', value: startingChips.toLocaleString(), accent: 'green' });
    rows.push({ label: 'Max Hands', value: maxHands, accent: 'white' });
    if (timeLimitMinutes !== null && tournamentType === 'buyin') {
      rows.push({ label: 'Time Limit', value: TIME_LIMIT_LABELS[timeLimitMinutes] ?? `${timeLimitMinutes}m`, accent: 'white' });
    }
    rows.push({ label: 'Prize Distribution', value: PRIZE_PRESETS.find(p => p.id === prizeDistributionType)?.name ?? prizeDistributionType, accent: 'cyan' });
    if (prizeType === 'custom' && prizeAmountHuman && selectedToken) {
      rows.push({
        label: 'Prize Pool',
        value: `${prizeAmountHuman} ${selectedToken.symbol}${prizeUsdValue != null ? ` (≈$${prizeUsdValue >= 1 ? prizeUsdValue.toLocaleString(undefined, { maximumFractionDigits: 2 }) : prizeUsdValue.toFixed(4)})` : ''}`,
        accent: 'yellow',
      });
    }
    rows.push({ label: 'Private', value: isPrivate ? 'Yes (PIN required)' : 'No', accent: 'white' });
    rows.push({
      label: 'Table Theme',
      value: themeKind === 'video'
        ? (BLACKJACK_VIDEO_BACKGROUNDS.find(b => b.id === themeId)?.label ?? themeId)
        : (BLACKJACK_IMAGE_BACKGROUNDS.find(b => b.id === themeId)?.label ?? themeId),
      accent: 'white',
    });
    return rows;
  })();

  const handleApproveToken = async () => {
    if (!createdTournament || !prizeTokenAddress.trim() || prizeAmountWeiForReview <= 0n) return;
    // Custom token always uses V2 (bytes32) escrow
    const escrow = TOURNAMENT_PRIZE_ESCROW_ADDRESS;
    if (!isEscrowConfigured || (escrow as string) === ESCROW_ZERO) {
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
      const hash = await writeContractAsync({
        address: token,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [escrow, prizeAmountWeiForReview],
        account: address,
        chain: pulsechain,
        ...getGas(),
      });
      setApprovalTxHash(hash);
      if (publicClient && hash) {
        try {
          await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
        } catch {
          // Tx was broadcast; if wait times out or RPC fails, still proceed so user can deposit
        }
      }
      setFundingStep('approved');
    } catch (e) {
      setFundingError(e instanceof Error ? e.message : 'Approval failed');
      setFundingStep('idle');
    }
  };

  const handleDepositToEscrow = async () => {
    if (!createdTournament || !prizeTokenAddress.trim() || prizeAmountWeiForReview <= 0n) return;
    // Custom token always uses V2 (bytes32) escrow
    const escrow = TOURNAMENT_PRIZE_ESCROW_ADDRESS;
    if (!isEscrowConfigured || (escrow as string) === ESCROW_ZERO) {
      setFundingError('Prize escrow contract not set. Add NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS to your .env.');
      setFundingStep('approved');
      return;
    }
    setFundingError(null);
    setFundingStep('depositing');
    try {
      const token = prizeTokenAddress.trim() as `0x${string}`;

      if (!address) {
        setFundingError('Please connect your wallet.');
        setFundingStep('approved');
        return;
      }

      const idBytes32 = tournamentIdToBytes32(createdTournament.id);
      const hash = await writeContractAsync({
        address: escrow as `0x${string}`,
        abi: tournamentPrizeEscrowV2Abi,
        functionName: 'depositPrizePool',
        args: [idBytes32, token, prizeAmountWeiForReview],
        account: address,
        chain: pulsechain,
        ...getGas(),
      });
      if (publicClient && hash) {
        try {
          await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
        } catch {
          // Tx was broadcast; proceed
        }
      }

      setFundingStep('done');
    } catch (e) {
      setFundingError(e instanceof Error ? e.message : 'Deposit failed');
      setFundingStep('approved');
    }
  };

  // Show success screen if tournament was created
  if (createdTournament) {
    const needsFunding = prizeType === 'custom' && prizeTokenAddress.trim() && prizeAmountHuman.trim() && fundingStep !== 'done';
    const funded = fundingStep === 'done';
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
        <div className="relative rounded-2xl max-w-md w-full mx-4 overflow-hidden" style={{ ...Theme.panel.base, border: `1px solid ${Theme.cyan.rgba.border}` }}>
          <div className={`p-4 text-center ${Theme.cyan.gradient.button}`}>
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
                  <p className="text-cyan-400 text-xs">
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
                          ? 'bg-cyan-500 text-white' : 'bg-gray-700 text-gray-300'
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
                          <div className="flex flex-col gap-2 py-2">
                            <div className="flex items-center gap-2">
                              <svg className="animate-spin h-4 w-4 text-cyan-400 shrink-0" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              <span className="text-cyan-300 text-sm">Confirm in wallet...</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setFundingStep('approved')}
                              className="text-xs text-cyan-400/80 hover:text-cyan-300 hover:"
                            >
                              Already approved? Proceed to deposit
                            </button>
                          </div>
                        )}
                        {(fundingStep === 'approved' || fundingStep === 'depositing' || funded) && (
                          <div>
                            <span className="text-cyan-400 text-sm font-medium">Approved</span>
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
                        funded ? 'bg-cyan-500 text-white' : 'bg-gray-700 text-gray-300'
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
                            className={`w-full py-2 rounded-lg ${Theme.cyan.gradient.button} ${Theme.cyan.gradient.buttonHover} text-white text-sm font-medium transition-all`}
                          >
                            Deposit to Escrow
                          </button>
                        )}
                        {fundingStep === 'depositing' && (
                          <div className="flex items-center gap-2 py-2">
                            <svg className={`animate-spin h-4 w-4 ${Theme.cyan.text.primary} shrink-0`} viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            <span className="text-cyan-300 text-sm">Confirming deposit...</span>
                          </div>
                        )}
                        {funded && (
                          <span className="text-cyan-400 text-sm font-medium">Funded</span>
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
              <div className="rounded-xl p-4 border border-cyan-500/30" style={Theme.panel.base}>
                <p className="text-gray-400 text-sm mb-2">Private Tournament PIN</p>
                <p className={`text-4xl font-mono font-bold ${Theme.cyan.text.primary} tracking-wider`}>
                  {createdTournament.pinCode}
                </p>
                <p className="text-gray-500 text-xs mt-2">Share this PIN with players you want to invite</p>
              </div>
            )}
            <button
              onClick={handleClose}
              className={`w-full py-3 rounded-xl ${Theme.cyan.gradient.button} ${Theme.cyan.gradient.buttonHover} text-white font-semibold transition-all`}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!address) {
    return (
      <Dialog modal={false} open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <DialogContent
          className="max-w-md gap-0 border-cyan-500/30 p-0 overflow-hidden sm:max-w-md"
          style={Theme.panel.base}
        >
          <DialogHeader className={`p-4 pb-3 border-b border-cyan-500/20 text-center sm:text-center ${Theme.cyan.gradient.button}`}>
            <DialogTitle className="text-lg font-bold text-white">Connect your wallet</DialogTitle>
          </DialogHeader>
          <div className="p-6 space-y-4">
            <p className="text-sm text-gray-400 text-center leading-relaxed">
              Tournament creation uses your wallet for on-chain registration and prize funding. Connect first, then configure your event.
            </p>
            <button
              type="button"
              onClick={() => openConnectModal?.()}
              className={`w-full py-3 rounded-xl ${Theme.cyan.gradient.button} ${Theme.cyan.gradient.buttonHover} text-white font-semibold transition-all`}
            >
              Connect wallet
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
    {showConfirm && (
      <ConfirmActionCard
        title="Create Tournament"
        subtitle="Review details before submitting"
        rows={confirmRows}
        onBack={() => setShowConfirm(false)}
        onConfirm={() => { setShowConfirm(false); handleCreate(); }}
        confirmLabel={tournamentType === 'buyin' && prizeType === 'custom' ? 'Create & Fund' : 'Create Tournament'}
        isLoading={isLoading}
        warning={!canAffordBuyIn && buyInAmountWei > 0n && tournamentType === 'buyin' ? "Your balance is below the buy-in — you won't be able to join your own tournament." : undefined}
      />
    )}
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-xl sm:max-w-2xl max-h-[90vh] sm:max-h-[85vh] flex flex-col gap-0 p-0 border-cyan-500/30 overflow-hidden min-h-0" style={Theme.panel.base}>
        <DialogHeader className={`p-3 pb-0 border-b border-cyan-500/20 shrink-0 ${Theme.cyan.gradient.button}`}>
          <DialogTitle className="text-lg font-bold text-white text-center">Create Blackjack Tournament</DialogTitle>
          <div
            className="flex gap-1 pt-2 pb-2 -mx-1 px-1 overflow-x-auto overflow-y-hidden [scrollbar-width:thin] [scrollbar-color:rgba(34,211,238,0.35)_transparent]"
            role="tablist"
            aria-label="Tournament setup steps"
          >
            {WIZARD_TABS.map(({ step, label, short }) => (
              <button
                key={step}
                type="button"
                role="tab"
                aria-selected={wizardStep === step}
                onClick={() => {
                  setWizardStep(step);
                  setError(null);
                }}
                className={`shrink-0 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium border transition-colors whitespace-nowrap ${
                  wizardStep === step
                    ? 'bg-cyan-500/25 border-cyan-500/50 text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                    : 'border-white/10 text-gray-300 hover:text-white hover:bg-white/10 hover:border-cyan-500/20'
                }`}
              >
                <span className="sm:hidden">{short}</span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-red-400 text-sm mb-4">
              {error}
            </div>
          )}

          {/* Step 1: Basics */}
          {wizardStep === 1 && (
            <section className="space-y-4 max-w-lg mx-auto">
              <h3 className="text-lg font-semibold text-cyan-300">What kind of tournament?</h3>
              <p className="text-gray-400 text-sm">Choose buy-in (players pay to enter) or freeroll (free to join, scheduled start).</p>
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
                <p className="text-gray-500 text-xs mb-1">Give your tournament a memorable name (3–50 characters).</p>
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
            <section className="space-y-4 max-w-lg mx-auto">
              <h3 className="text-lg font-semibold text-cyan-300">
                {tournamentType === 'freeroll' ? 'When does it run?' : 'Time limit & rules'}
              </h3>
              <p className="text-gray-400 text-sm">
                {tournamentType === 'freeroll'
                  ? 'Set when registration opens and when the game starts. Players join during registration and play begins at the scheduled time.'
                  : 'Optional time limit per player. No limit = players can take their time.'}
              </p>

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
                    <p className="text-gray-500 text-xs mb-1.5">Total length of the tournament from game start to end. The tournament ends automatically after this many minutes.</p>
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

              <p className="text-gray-500 text-sm">Each player gets 5,000 chips and up to 25 hands. Higher chip count at the end wins.</p>
            </section>
          )}

          {/* Step 3: Prizes & Entry */}
          {wizardStep === 3 && (
            <section className="space-y-4 max-w-lg mx-auto">
              <h3 className="text-lg font-semibold text-cyan-300">Prizes & entry</h3>
              <p className="text-gray-400 text-sm">Configure how prizes are split and the entry cost (buy-in tournaments only).</p>

              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">Prize distribution</label>
                <p className="text-gray-500 text-xs mb-2">How the prize pool is split among top finishers. More places = more winners.</p>
                <div className="space-y-2">
                  {PRIZE_PRESETS.map((preset) => (
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
                  <p className="text-gray-500 text-xs mb-1">Amount each player pays to enter. Use Platform (MORBIUS) or a custom token in Options.</p>
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
                  <p className="text-gray-500 text-xs mt-1">0 = freeroll (no buy-in). Your balance: {formatEther(playerBalance)} MORBIUS</p>
                  {!canAffordBuyIn && buyInAmountWei > 0n && (
                    <p className="text-yellow-500 text-xs mt-1">Your balance is below the buy-in — you won&apos;t be able to join your own tournament.</p>
                  )}
                </div>
              )}

              {tournamentType === 'freeroll' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-300 text-sm mb-1">Min players</label>
                    <div className="w-full px-3 py-2 rounded-lg bg-gray-800/50 border border-gray-600 text-gray-400 text-sm">
                      {minPlayersFreeroll} (from prize distribution)
                    </div>
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
            <section className="space-y-4 max-w-lg mx-auto">
              <h3 className="text-base font-semibold text-cyan-300">Options</h3>

              {/* Visibility & Branding: Private + Card image in one compact row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-700 p-3 flex items-center justify-between gap-3" style={Theme.panel.base}>
                  <div className="min-w-0">
                    <p className="text-white font-medium text-sm">Private</p>
                    <p className="text-gray-400 text-xs truncate">PIN required to join</p>
                  </div>
                  <button
                    onClick={() => setIsPrivate(!isPrivate)}
                    className={`relative w-12 h-6 rounded-full shrink-0 transition-colors ${isPrivate ? 'bg-cyan-500' : 'bg-gray-600'}`}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${isPrivate ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                <div className="rounded-xl border border-gray-700 p-3" style={Theme.panel.base}>
                  <p className="text-white font-medium text-sm mb-2">Card image</p>
                  {imagePreview ? (
                    <div className="relative inline-block">
                      <div className="aspect-[3/2] w-24 h-16 rounded-lg overflow-hidden border border-cyan-500/50">
                        <img src={imagePreview} alt="Card preview" className="w-full h-full object-cover" />
                      </div>
                      <button onClick={handleRemoveImage} className="absolute -top-1 -right-1 p-1 rounded-full bg-red-500/90 hover:bg-red-500 text-white" aria-label="Remove image">
                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => fileInputRef.current?.click()} className="w-24 h-16 rounded-lg border-2 border-dashed border-gray-600 hover:border-cyan-500/50 bg-gray-800/50 flex flex-col items-center justify-center gap-0.5">
                      <span className="text-gray-500 text-[10px]">Upload</span>
                    </button>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" aria-label="Upload card image" />
                </div>
              </div>
              {isPrivate && (
                <div>
                  <label className="block text-gray-300 text-xs mb-1">PIN (optional)</label>
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

              {/* Table theme: constrained scrollable grid */}
              <div className="rounded-xl border border-gray-700 p-3" style={Theme.panel.base}>
                <label className="block text-gray-300 text-sm font-medium mb-2">Table theme</label>
                <div className="flex gap-1.5 mb-2">
                  <button type="button" onClick={() => { setThemeKind('image'); setThemeId(BLACKJACK_IMAGE_BACKGROUNDS[0].id); }} className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${themeKind === 'image' ? 'bg-cyan-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-300'}`}>Image</button>
                  <button type="button" onClick={() => { setThemeKind('video'); setThemeId(BLACKJACK_VIDEO_BACKGROUNDS[0].id); }} className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${themeKind === 'video' ? 'bg-cyan-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-300'}`}>Video</button>
                </div>
                <div className="h-36 overflow-y-auto overflow-x-hidden rounded-lg border border-gray-700/80 bg-black/30">
                  <div className="grid grid-cols-4 gap-1.5 p-1.5">
                    {themeKind === 'image' && BLACKJACK_IMAGE_BACKGROUNDS.map((bg) => (
                      <button key={bg.id} type="button" onClick={() => setThemeId(bg.id)} className={`relative aspect-video rounded overflow-hidden border-2 shrink-0 ${themeId === bg.id ? 'border-cyan-500 ring-1 ring-cyan-500/50' : 'border-gray-600 hover:border-gray-500'}`}>
                        <img src={bg.src} alt={bg.label} className="w-full h-full object-cover" />
                        <div className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 px-1"><p className="text-white text-[10px] truncate">{bg.label}</p></div>
                      </button>
                    ))}
                    {themeKind === 'video' && BLACKJACK_VIDEO_BACKGROUNDS.map((bg) => (
                      <button key={bg.id} type="button" onClick={() => setThemeId(bg.id)} className={`relative aspect-video rounded overflow-hidden border-2 shrink-0 ${themeId === bg.id ? 'border-cyan-500 ring-1 ring-cyan-500/50' : 'border-gray-600 hover:border-gray-500'}`}>
                        <img src={BLACKJACK_IMAGE_BACKGROUNDS[0].src} alt={bg.label} className="w-full h-full object-cover" />
                        <div className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 px-1"><p className="text-white text-[10px] truncate">{bg.label}</p></div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {(tournamentType === 'buyin' || tournamentType === 'freeroll') && (
                <>
                  <div className="rounded-xl border border-gray-700 p-3" style={Theme.panel.base}>
                    <label className="block text-gray-300 text-sm font-medium mb-1.5">Prize source</label>
                    <p className="text-gray-500 text-xs mb-2">
                      {tournamentType === 'buyin'
                        ? 'Platform: MORBIUS from buy-ins. Custom: fund with any ERC-20.'
                        : 'Platform: chip-count only. Custom: fund with any ERC-20.'}
                    </p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setPrizeType('platform')} className={`flex-1 py-2 rounded-lg text-xs font-medium ${prizeType === 'platform' ? 'bg-cyan-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-300'}`}>Platform (MORBIUS)</button>
                      <button type="button" onClick={() => setPrizeType('custom')} className={`flex-1 py-2 rounded-lg text-xs font-medium ${prizeType === 'custom' ? 'bg-cyan-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-300'}`}>Custom token</button>
                    </div>
                  </div>
                  {prizeType === 'custom' && (
                    <div className="space-y-2 p-3 rounded-xl border border-gray-700" style={Theme.panel.base}>
                      <p className="text-gray-400 text-xs">Search by name/symbol or paste a token contract address. You&apos;ll fund the prize pool after creating.</p>
                      <Prc20TokenPicker value={selectedToken} onChange={handleTokenChange} />
                      <div>
                        <label className="block text-gray-400 text-xs mb-1">Prize amount (total pool)</label>
                        <input type="text" value={prizeAmountHuman} onChange={(e) => setPrizeAmountHuman(e.target.value)} placeholder="e.g. 1000" className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm" />
                        {prizeAmountHuman && selectedToken && prizeUsdValue != null && (
                          <p className="text-cyan-400 text-xs mt-1">≈ ${prizeUsdValue >= 1 ? prizeUsdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : prizeUsdValue >= 0.01 ? prizeUsdValue.toFixed(2) : prizeUsdValue.toFixed(4)} USD</p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* Step 5: Review */}
          {wizardStep === 5 && (
            <section className="space-y-3 max-w-lg mx-auto">
              <h3 className="text-lg font-semibold text-cyan-300">Review</h3>
              <p className="text-gray-400 text-sm">Confirm your tournament settings before creating. You can go back to any step to make changes.</p>
              <div className="rounded-xl border border-gray-700 p-4 space-y-3 text-sm" style={Theme.panel.base}>
                <p><span className="text-gray-500">Name:</span> <span className="text-white font-medium">{name || '—'}</span></p>
                <p><span className="text-gray-500">Type:</span> <span className="text-white">{tournamentType === 'buyin' ? 'Buy-in' : 'Freeroll'}</span></p>
                {tournamentType === 'freeroll' && (
                  <p><span className="text-gray-500">Start:</span> <span className="text-white">{scheduledStartAt ? new Date(fromDatetimeLocal(scheduledStartAt)).toLocaleString() : '—'}</span></p>
                )}
                <p><span className="text-gray-500">Chips:</span> <span className="text-white">{startingChips.toLocaleString()}</span> · <span className="text-gray-500">Max hands:</span> <span className="text-white">{maxHands}</span></p>
                <p><span className="text-gray-500">Prizes:</span> <span className="text-white">{PRIZE_PRESETS.find(p => p.id === prizeDistributionType)?.name ?? prizeDistributionType}</span></p>
                {tournamentType === 'buyin' && (
                  <>
                    <p>
                      <span className="text-gray-500">Buy-in:</span>{' '}
                      <span className="text-white">{buyInAmount} MORBIUS</span>
                    </p>
                    {prizeType === 'custom' && (
                      <p>
                        <span className="text-gray-500">Prize pool:</span>{' '}
                        <span className="inline-flex items-center gap-2 flex-wrap">
                          <span className="text-white">{prizeAmountHuman || '0'} {selectedToken?.symbol ?? 'tokens'}</span>
                          <TokenWithLogo address={prizeTokenAddress || null} logoSize="sm" />
                          {prizeUsdValue != null && (
                            <span className="text-cyan-400 font-medium">
                              (≈ {prizeUsdValue >= 1 ? `$${prizeUsdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : prizeUsdValue >= 0.01 ? `$${prizeUsdValue.toFixed(2)}` : `$${prizeUsdValue.toFixed(4)}`})
                            </span>
                          )}
                        </span>
                      </p>
                    )}
                  </>
                )}
                {tournamentType === 'freeroll' && (
                  <>
                    <p><span className="text-gray-500">Players:</span> <span className="text-white">{minPlayersFreeroll} – {maxPlayersUnlimited ? '∞' : maxPlayersFreeroll}</span></p>
                    {prizeType === 'custom' && (
                      <p>
                        <span className="text-gray-500">Prize pool:</span>{' '}
                        <span className="inline-flex items-center gap-2 flex-wrap">
                          <span className="text-white">{prizeAmountHuman || '0'} {selectedToken?.symbol ?? 'tokens'}</span>
                          <TokenWithLogo address={prizeTokenAddress || null} logoSize="sm" />
                          {prizeUsdValue != null && (
                            <span className="text-cyan-400 font-medium">
                              (≈ {prizeUsdValue >= 1 ? `$${prizeUsdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : prizeUsdValue >= 0.01 ? `$${prizeUsdValue.toFixed(2)}` : `$${prizeUsdValue.toFixed(4)}`})
                            </span>
                          )}
                        </span>
                      </p>
                    )}
                  </>
                )}
                <p><span className="text-gray-500">Private:</span> <span className="text-white">{isPrivate ? 'Yes' : 'No'}</span></p>
                <p><span className="text-gray-500">Table:</span> <span className="text-white">{themeKind === 'video' ? (BLACKJACK_VIDEO_BACKGROUNDS.find(b => b.id === themeId)?.label ?? themeId) : (BLACKJACK_IMAGE_BACKGROUNDS.find(b => b.id === themeId)?.label ?? themeId)}</span></p>
              </div>
              <p className="text-gray-500 text-xs">Use the steps above to change anything, then click Create below.</p>
            </section>
          )}

        </div>

        <DialogFooter className="p-3 border-t border-gray-700 flex-row gap-2 shrink-0" style={Theme.panel.base}>
          <button type="button" onClick={handleClose} className="py-2.5 px-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors">
            Cancel
          </button>
          {wizardStep > 1 && (
            <button type="button" onClick={() => { setWizardStep((s) => s - 1); setError(null); }} className="py-2.5 px-3 rounded-xl bg-gray-600 hover:bg-gray-500 text-white text-sm font-medium transition-colors">
              Back
            </button>
          )}
          {wizardStep < TOTAL_WIZARD_STEPS ? (
            <button type="button" onClick={() => { setWizardStep((s) => s + 1); setError(null); }} disabled={wizardStep === 1 && !name.trim()} className="flex-1 py-2.5 rounded-xl font-semibold text-sm bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              Next
            </button>
          ) : (
            <button type="button" onClick={() => setShowConfirm(true)} disabled={isLoading || !name.trim()} className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all ${!isLoading && name.trim() ? `${Theme.cyan.gradient.button} ${Theme.cyan.gradient.buttonHover} text-white` : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}>
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                  Creating...
                </span>
              ) : (
                'Create Blackjack Tournament'
              )}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

export default BlackjackTournamentCreator;
