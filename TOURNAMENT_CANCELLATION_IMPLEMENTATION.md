# Tournament Cancellation & Creator Reclaim Implementation

## Summary

This implementation adds:
1. **Cancellation Mechanism**: Creators can cancel tournaments that haven't started
2. **Creator Reclaim Function**: Creators can reclaim funds from cancelled tournaments
3. **Enhanced Escrow Contract**: New V2 contract with better oversight functions

## ⚠️ IMPORTANT: Contract Redeployment Required

**You need to redeploy the escrow contract** because:
- The new contract stores additional data (creator address, deposit timestamp, cancelled flag)
- The new contract has new functions for cancellation and creator reclaim
- The new contract has enhanced read functions for oversight

## Files Created/Modified

### New Files:
1. `contracts/contracts/TournamentPrizeEscrowV2.sol` - Enhanced escrow contract
2. `server/src/abi/tournament-prize-escrow-v2.ts` - ABI for V2 contract
3. `TOURNAMENT_CANCELLATION_IMPLEMENTATION.md` - This file

### Modified Files:
1. `server/src/services/tournament.service.ts` - Added `cancelTournament()` and `creatorReclaimFunds()` methods
2. `server/src/utils/escrow-payout.ts` - Added `cancelTournamentInEscrow()` function

## New Contract Features (V2)

### Storage Enhancements:
- `depositor` - Address of who deposited funds (creator)
- `depositedAt` - Block timestamp when funds were deposited
- `cancelled` - Boolean flag for cancelled tournaments
- `tournamentIds[]` - Array tracking all tournament IDs for enumeration

### New Functions:

#### Write Functions:
- `cancelTournament(bytes32 tournamentId)` - Server-only: Marks tournament as cancelled
- `creatorReclaim(bytes32 tournamentId)` - Creator-only: Reclaims funds from cancelled tournament

#### Read Functions (for oversight):
- `getPool()` - Enhanced to return depositor, timestamp, and cancelled status
- `getRemainingBalance()` - Get remaining balance for a tournament
- `getTournamentCount()` - Total number of tournaments
- `getTournamentId(uint256 index)` - Get tournament ID by index
- `getAllTournamentIds()` - Get all tournament IDs (use pagination in frontend)
- `getPoolsBatch(bytes32[] tournamentIds)` - Batch query multiple pools
- `getActivePools()` - Get all active (non-cancelled, with balance) pools
- `getPoolsByDepositor(address)` - Get all pools for a specific creator
- `getTotalValueLocked(address token)` - Get TVL for a specific token
- `getEscrowSummary()` - Get overall statistics

## Backend Implementation

### New Service Methods:

#### `cancelTournament(tournamentId, cancellerAddress)`
- Verifies canceller is the creator
- Checks tournament hasn't started (no games played)
- Refunds buy-ins to all players
- Marks tournament as cancelled in database
- Calls escrow contract to mark as cancelled

#### `creatorReclaimFunds(tournamentId, creatorAddress)`
- Verifies caller is creator
- Verifies tournament is cancelled
- Verifies tournament uses custom prize token
- Returns instructions for creator to call contract directly (requires their signature)

## Next Steps

### ✅ 1. Deploy New Contract - COMPLETED
- Contract deployed at: `0x52cbF18A8AE0Fd4324B045E13532d35CF05Af3e1`
- Verified on PulseScan: https://scan.pulsechain.com/address/0x52cbF18A8AE0Fd4324B045E13532d35CF05Af3e1#code
- Old V1 contract: `0x1051CAA460e6DC739583dC2b611C8E3AB37fc543` (kept for reference)

### ✅ 2. Update Environment Variables - COMPLETED
- Updated `server/.env`: `TOURNAMENT_PRIZE_ESCROW_ADDRESS=0x52cbF18A8AE0Fd4324B045E13532d35CF05Af3e1`
- Updated `.env`: `NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS=0x52cbF18A8AE0Fd4324B045E13532d35CF05Af3e1`
- Backend code updated to use V2 ABI with backwards compatibility

### ✅ 3. Update Backend Code - COMPLETED
- Updated `escrow-payout.ts` to use V2 ABI when calling new functions
- Updated `escrow-status.ts` to read new fields (depositor, depositedAt, cancelled) with backwards compatibility
- Added WebSocket/HTTP endpoints for cancellation and reclaim
- Created `escrow-oversight.ts` utility for admin dashboard

### ✅ 4. Add Frontend UI - COMPLETED
- Created `TournamentCancelReclaim` component with cancel/reclaim buttons
- Integrated into `TournamentBrowser` expanded card view
- Integrated into `CreatorTournamentList` with expandable actions
- Uses Theme system for consistent styling

### ✅ 5. Add Admin Dashboard - COMPLETED
- Created `AdminEscrowTab` component with escrow oversight
- Added escrow tab to admin page
- Shows summary statistics, pool listings, filters
- Uses Theme system for consistent styling

### 5. Migration Considerations
- **Old tournaments**: Will remain in old contract
- **New tournaments**: Use new V2 contract
- Consider migrating old tournaments or keeping both contracts active

## API Endpoints to Add

### Cancel Tournament
```
POST /api/tournaments/:tournamentId/cancel
Body: { cancellerAddress: string }
```

### Creator Reclaim Funds
```
POST /api/tournaments/:tournamentId/reclaim
Body: { creatorAddress: string }
Note: Returns instructions for direct contract call
```

### Get Escrow Overview (Admin)
```
GET /api/admin/escrow/summary
GET /api/admin/escrow/pools?depositor=0x...&token=0x...
GET /api/admin/escrow/tournament/:tournamentId
```

## Security Considerations

1. **Cancellation**: Only creator can cancel, and only before games start
2. **Reclaim**: Only creator (depositor) can reclaim, requires their signature
3. **Server Functions**: `cancelTournament()` in contract is server-only
4. **Refunds**: Buy-ins are automatically refunded when tournament is cancelled

## Testing Checklist

- [ ] Deploy V2 contract
- [ ] Test tournament creation with custom prize token
- [ ] Test cancellation before games start
- [ ] Test cancellation after games start (should fail)
- [ ] Test creator reclaim from cancelled tournament
- [ ] Test non-creator trying to cancel (should fail)
- [ ] Test non-creator trying to reclaim (should fail)
- [ ] Test refund of buy-ins on cancellation
- [ ] Test oversight read functions
- [ ] Test batch queries for performance

## Notes

- Creator reclaim requires the creator to call the contract directly from their wallet (for security)
- The backend can provide instructions/helpers, but the actual transaction must be signed by the creator
- Consider adding a frontend helper component that generates the transaction for the creator to sign
