# WalletConnect Cache Issue Fixes

## Problems Identified

Your application was experiencing wallet connection and approval issues due to caching problems:

1. **QueryClient Recreation** - The QueryClient was being recreated on every render, causing loss of cached wallet state
2. **Missing Storage Configuration** - No explicit storage configuration for WalletConnect/Wagmi state persistence
3. **Stale Allowance Data** - Token allowances weren't being properly refreshed after approvals

## Fixes Applied

### 1. Fixed QueryClient Instance (`app/providers.tsx`)

**Before:**
```typescript
const queryClient = new QueryClient()
```

**After:**
```typescript
const [queryClient] = useState(() => new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
}))
```

**Why:** Using `useState` ensures the QueryClient is created once and preserved across re-renders, maintaining wallet connection state.

### 2. Added Storage Configuration (`lib/wagmi-config.ts`)

Added explicit localStorage configuration with error handling:

```typescript
storage: typeof window !== 'undefined' ? {
  getItem: (key: string) => { /* with error handling */ },
  setItem: (key: string, value: string) => { /* with error handling */ },
  removeItem: (key: string) => { /* with error handling */ },
} : undefined
```

**Why:** This ensures WalletConnect state is properly persisted between sessions and handles storage errors gracefully.

### 3. Improved Allowance Refetching (`components/lottery/ticket-purchase.tsx`)

- Added `refetchInterval: 3000` to constantly check allowance
- Set `staleTime: 0` to always fetch fresh data
- Added 1-second delay after approval before refetching to allow blockchain state to update

**Why:** Ensures the UI always has the most up-to-date approval status.

### 4. Cache Management Utilities (`lib/wallet-utils.ts`)

Created utilities to handle cache corruption:

- `clearWalletConnectCache()` - Removes all WalletConnect cached data
- `isWalletConnectCacheCorrupted()` - Detects corrupted cache entries
- `resetWalletConnection()` - Full reset with page reload

### 5. Debug Component (`components/wallet-debug.tsx`)

Created a debug panel to help troubleshoot connection issues.

## How to Use

### For Normal Operation

The fixes are automatic - no changes needed. Users should experience:
- Stable wallet connections across page refreshes
- Reliable approval flow
- Proper state persistence

### For Troubleshooting

If users still experience issues, temporarily add the debug component:

```tsx
import { WalletDebug } from '@/components/wallet-debug'

// In your page component
<WalletDebug />
```

This provides:
- Connection status display
- Cache health check
- One-click cache clearing

### Manual Cache Clearing

Users can clear their WalletConnect cache by:

1. Opening browser DevTools (F12)
2. Go to Console tab
3. Run:
```javascript
// Check if cache is corrupted
localStorage.getItem('wc@2:client:0.3//session')

// Clear all WalletConnect data
Object.keys(localStorage).forEach(key => {
  if (key.startsWith('wc@2:') || key.startsWith('wagmi.')) {
    localStorage.removeItem(key)
  }
})

// Reload page
location.reload()
```

## Testing the Fixes

1. **Test Connection Persistence:**
   - Connect wallet
   - Refresh page
   - Verify wallet remains connected

2. **Test Approval Flow:**
   - Attempt to buy tickets
   - Approve tokens
   - Wait for approval confirmation
   - Verify "Buy Tickets" button becomes available (not "Approve" again)

3. **Test Cache Recovery:**
   - Add `<WalletDebug />` to your page
   - Click "Check Cache"
   - If corrupted, click "Clear Cache"
   - Reconnect wallet

## Additional Recommendations

### 1. Add Connection Recovery Hook

Consider adding automatic recovery for connection issues:

```typescript
// hooks/use-wallet-recovery.ts
export function useWalletRecovery() {
  const { isConnected, address } = useAccount()

  useEffect(() => {
    if (!isConnected && address) {
      // Connection was lost but we have an address - try to recover
      if (isWalletConnectCacheCorrupted()) {
        clearWalletConnectCache()
      }
    }
  }, [isConnected, address])
}
```

### 2. Monitor Connection Issues

Add error tracking to identify patterns:

```typescript
const { error } = useAccount()
useEffect(() => {
  if (error) {
    console.error('Wallet connection error:', error)
    // Send to error tracking service
  }
}, [error])
```

### 3. User Messaging

Consider adding a message when approval succeeds:

```typescript
if (isApproveSuccess) {
  toast.success('Approval successful! You can now purchase tickets.')
}
```

## Common Issues & Solutions

### Issue: "Wallet connects but disconnects immediately"
**Solution:** Clear WalletConnect cache using the debug panel or manually

### Issue: "Approval succeeds but still shows 'Approve' button"
**Solution:** Wait 3 seconds - the allowance refetch interval will update it automatically

### Issue: "Can't connect to wallet at all"
**Solution:**
1. Clear browser cache
2. Clear WalletConnect cache
3. Try a different browser
4. Check that MetaMask/wallet is on PulseChain network

### Issue: "Transactions fail with 'user rejected'"
**Solution:** This is normal - user declined in wallet. No cache issue.

## Files Modified

- ✅ `app/providers.tsx` - Fixed QueryClient instantiation
- ✅ `lib/wagmi-config.ts` - Added storage configuration
- ✅ `components/lottery/ticket-purchase.tsx` - Improved allowance refetching
- ✅ `lib/wallet-utils.ts` - NEW: Cache management utilities
- ✅ `components/wallet-debug.tsx` - NEW: Debug component

## Next Steps

1. Test the fixes in development
2. Deploy to production
3. Monitor for any remaining issues
4. Remove `<WalletDebug />` component after confirming fixes work
5. Consider adding the wallet recovery hook for extra resilience
