import lottery from './lottery6of55-v2.json'
import type { Abi } from 'viem'

const lottery6of55V2 = lottery as { abi: Abi }

export const LOTTERY_6OF55_V2_ABI: Abi = lottery6of55V2.abi

