import {
  MORBIUS_TOKEN_ADDRESS,
  WPLS_TOKEN_ADDRESS,
  MORBIUS_WPLS_V1_PAIR,
  BLACKJACK_ADDRESS,
  LEGACY_BLACKJACK_ADDRESSES,
  PLINKO_ADDRESS,
  KENO_ADDRESS,
  LOTTERY_INSTANT_ADDRESS,
  BIGWHEEL_ADDRESS,
  ROULETTE_ADDRESS,
  MORBIUS_STAKING_ADDRESS,
  MORBIUS_LP_STAKING_ADDRESS,
  TOURNAMENT_PRIZE_ESCROW_ADDRESS,
  MORBIUS_TOURNAMENT_ADDRESS,
} from './contracts'

export type RevokeTarget = {
  token: `0x${string}`
  tokenLabel: string
  spender: `0x${string}`
  spenderLabel: string
  isLegacy: boolean
}

const PLP_TOKEN_ADDRESS = MORBIUS_WPLS_V1_PAIR as `0x${string}`

const ZERO = '0x0000000000000000000000000000000000000000'

function isAddress(value: string | undefined | null): value is `0x${string}` {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value) && value.toLowerCase() !== ZERO
}

type Pair = {
  token: `0x${string}`
  tokenLabel: string
  spender: string
  spenderLabel: string
  isLegacy: boolean
}

const RAW_PAIRS: Pair[] = [
  // MORBIUS approvals
  { token: MORBIUS_TOKEN_ADDRESS, tokenLabel: 'MORBIUS', spender: BLACKJACK_ADDRESS, spenderLabel: 'Blackjack', isLegacy: false },
  { token: MORBIUS_TOKEN_ADDRESS, tokenLabel: 'MORBIUS', spender: PLINKO_ADDRESS, spenderLabel: 'Plinko', isLegacy: false },
  { token: MORBIUS_TOKEN_ADDRESS, tokenLabel: 'MORBIUS', spender: KENO_ADDRESS, spenderLabel: 'Keno', isLegacy: false },
  { token: MORBIUS_TOKEN_ADDRESS, tokenLabel: 'MORBIUS', spender: LOTTERY_INSTANT_ADDRESS, spenderLabel: 'Lottery 6-of-55', isLegacy: false },
  { token: MORBIUS_TOKEN_ADDRESS, tokenLabel: 'MORBIUS', spender: BIGWHEEL_ADDRESS, spenderLabel: 'Big Wheel', isLegacy: false },
  { token: MORBIUS_TOKEN_ADDRESS, tokenLabel: 'MORBIUS', spender: ROULETTE_ADDRESS, spenderLabel: 'Roulette', isLegacy: false },
  { token: MORBIUS_TOKEN_ADDRESS, tokenLabel: 'MORBIUS', spender: MORBIUS_STAKING_ADDRESS, spenderLabel: 'MORBIUS Staking', isLegacy: false },
  { token: MORBIUS_TOKEN_ADDRESS, tokenLabel: 'MORBIUS', spender: TOURNAMENT_PRIZE_ESCROW_ADDRESS, spenderLabel: 'Tournament Prize Escrow', isLegacy: false },
  { token: MORBIUS_TOKEN_ADDRESS, tokenLabel: 'MORBIUS', spender: MORBIUS_TOURNAMENT_ADDRESS, spenderLabel: 'Tournament Manager', isLegacy: false },

  // WPLS approvals (poker tournaments / WPLS-denominated flows)
  { token: WPLS_TOKEN_ADDRESS, tokenLabel: 'WPLS', spender: TOURNAMENT_PRIZE_ESCROW_ADDRESS, spenderLabel: 'Tournament Prize Escrow', isLegacy: false },
  { token: WPLS_TOKEN_ADDRESS, tokenLabel: 'WPLS', spender: MORBIUS_TOURNAMENT_ADDRESS, spenderLabel: 'Tournament Manager', isLegacy: false },

  // PLP (MORBIUS/WPLS LP) approvals
  { token: PLP_TOKEN_ADDRESS, tokenLabel: 'PLP (MORBIUS/WPLS)', spender: MORBIUS_LP_STAKING_ADDRESS, spenderLabel: 'LP Staking', isLegacy: false },

  // Legacy spenders
  ...LEGACY_BLACKJACK_ADDRESSES.map((addr, i) => ({
    token: MORBIUS_TOKEN_ADDRESS,
    tokenLabel: 'MORBIUS',
    spender: addr,
    spenderLabel: `Blackjack (legacy${LEGACY_BLACKJACK_ADDRESSES.length > 1 ? ` ${i + 1}` : ''})`,
    isLegacy: true,
  })),
]

export const REVOKE_TARGETS: RevokeTarget[] = RAW_PAIRS
  .filter((p): p is Pair & { spender: `0x${string}` } => isAddress(p.spender))
  .map(({ token, tokenLabel, spender, spenderLabel, isLegacy }) => ({
    token,
    tokenLabel,
    spender,
    spenderLabel,
    isLegacy,
  }))
