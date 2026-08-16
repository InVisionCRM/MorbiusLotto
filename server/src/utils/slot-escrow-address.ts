/**
 * SlotBankrollEscrow deployment lookup.
 *
 * Unlike the tournament escrow helper this has NO baked-in fallback address.
 * Slot bankrolls are a separate contract with a separate deployment, and
 * guessing an address here would point real creator money at the wrong place.
 * Until it is deployed and configured, this returns null and the callers gate
 * real-money features off — free play is unaffected.
 *
 *   SLOT_BANKROLL_ESCROW_ADDRESS             (server)
 *   NEXT_PUBLIC_SLOT_BANKROLL_ESCROW_ADDRESS (build, for the browser)
 */
export function getSlotBankrollEscrowAddress(): `0x${string}` | null {
  const raw =
    (typeof process !== 'undefined' && process.env.SLOT_BANKROLL_ESCROW_ADDRESS) ||
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SLOT_BANKROLL_ESCROW_ADDRESS) ||
    '';
  const t = String(raw).trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(t)) return t.toLowerCase() as `0x${string}`;
  return null;
}

/** True once the contract is deployed and configured. */
export function isSlotEscrowConfigured(): boolean {
  return getSlotBankrollEscrowAddress() !== null;
}
