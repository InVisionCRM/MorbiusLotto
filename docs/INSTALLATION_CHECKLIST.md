# Contract Interface - Installation Checklist

## ✅ Pre-Flight Checklist

### 1. Install Required Dependency
```bash
cd /Users/kyle/MORBlotto/morbius_lotto
pnpm add @radix-ui/react-checkbox
```

**Status:** ⬜ Not installed  
**Required:** ✅ Yes  
**Version:** Latest stable

---

### 2. Verify All Files Created

#### Pages
- ⬜ `/app/contracts/page.tsx` - Main contracts interface page

#### Components
- ⬜ `/components/contracts/lottery-interface.tsx` - Lottery UI (18 sections)
- ⬜ `/components/contracts/keno-interface.tsx` - Keno UI (15 sections)
- ⬜ `/components/ui/checkbox.tsx` - Checkbox component

#### Updated Files
- ⬜ `/components/lottery/header.tsx` - Added navigation links

#### Documentation
- ⬜ `/CONTRACT_INTERFACE_README.md` - Complete usage guide
- ⬜ `/CONTRACT_SETUP.md` - Setup instructions
- ⬜ `/CONTRACTS_INTERFACE_SUMMARY.md` - Implementation summary
- ⬜ `/CONTRACTS_INTERFACE_VISUAL_GUIDE.md` - Visual layout guide
- ⬜ `/INSTALLATION_CHECKLIST.md` - This file

---

### 3. Test Development Server

```bash
pnpm dev
```

**Expected Output:**
```
▲ Next.js 14.x.x
- Local: http://localhost:3000
- Ready in XXXms
```

**Status:** ⬜ Not tested  
**Required:** ✅ Yes

---

### 4. Verify Routes

#### Test Navigation
- ⬜ Visit http://localhost:3000/ (Home/Lottery page)
- ⬜ Visit http://localhost:3000/keno (Keno page)
- ⬜ Visit http://localhost:3000/contracts (Contract Interface)

#### Check Header Links
- ⬜ Click "Lottery" in header → Goes to home
- ⬜ Click "Keno" in header → Goes to /keno
- ⬜ Click "Contracts" in header → Goes to /contracts

**Status:** ⬜ Not tested  
**Required:** ✅ Yes

---

### 5. Test Wallet Connection

#### Without Wallet
- ⬜ Visit /contracts
- ⬜ See "Wallet Not Connected" warning
- ⬜ Read functions should display data
- ⬜ Write functions should show "Connect wallet" errors

#### With Wallet
- ⬜ Click "Connect" button
- ⬜ Connect MetaMask/WalletConnect
- ⬜ Warning disappears
- ⬜ Write functions become available

**Status:** ⬜ Not tested  
**Required:** ✅ Yes

---

### 6. Test Lottery Interface

#### User Actions Tab
- ⬜ "Buy Tickets (Morbius)" card displays
- ⬜ Approval section works
- ⬜ Ticket input accepts JSON
- ⬜ Buy button triggers transaction
- ⬜ "Buy Tickets for Multiple Rounds" works
- ⬜ "Buy with WPLS" works
- ⬜ "Claim Winnings" works

#### Admin Actions Tab
- ⬜ "Finalize Round" button visible
- ⬜ "Update Settings" sections work
- ⬜ Owner-only checks function

#### Statistics Tab
- ⬜ "Current Round Information" loads
- ⬜ "Your Lifetime Statistics" shows data (with wallet)
- ⬜ "Global Statistics" displays
- ⬜ "Bracket Configuration" shows percentages
- ⬜ Refresh buttons update data

**Status:** ⬜ Not tested  
**Required:** ✅ Yes

---

### 7. Test Keno Interface

#### Player Actions Tab
- ⬜ "Buy Keno Ticket" form displays
- ⬜ Add-on checkboxes work
- ⬜ Approval flow functions
- ⬜ Ticket purchase works
- ⬜ "Claim Prize" works
- ⬜ "Auto-Claim Settings" toggle works

#### Admin Actions Tab
- ⬜ "Round Management" works
- ⬜ "Paytable Configuration" updates
- ⬜ "Contract Configuration" changes apply

#### Statistics Tab
- ⬜ "Current Round Information" loads
- ⬜ "Your Keno Statistics" shows data
- ⬜ "Global Keno Statistics" displays
- ⬜ "Progressive Jackpot Stats" loads

**Status:** ⬜ Not tested  
**Required:** ✅ Yes

---

### 8. Test Tooltips

#### Verify Tooltips Display
- ⬜ Hover over any [?] icon
- ⬜ Tooltip appears with description
- ⬜ Examples are shown
- ⬜ Notes are included
- ⬜ Tooltip closes on mouse out

**Test At Least 3 Different Tooltips:**
- ⬜ Buy Tickets tooltip
- ⬜ Claim Winnings tooltip
- ⬜ Statistics tooltip

**Status:** ⬜ Not tested  
**Required:** ✅ Yes

---

### 9. Test Responsive Design

#### Desktop (1920x1080)
- ⬜ Layout looks good
- ⬜ Cards display properly
- ⬜ Navigation works
- ⬜ Forms are usable

#### Tablet (768x1024)
- ⬜ Layout adapts
- ⬜ Cards stack appropriately
- ⬜ Touch targets adequate

#### Mobile (375x667)
- ⬜ Single column layout
- ⬜ Navigation accessible
- ⬜ Forms usable
- ⬜ Buttons touch-friendly

**Status:** ⬜ Not tested  
**Required:** ✅ Yes

---

### 10. Test Error Handling

#### Form Validation
- ⬜ Empty inputs show errors
- ⬜ Invalid JSON shows errors
- ⬜ Out-of-range values rejected
- ⬜ Missing wallet shows errors

#### Transaction Errors
- ⬜ Insufficient balance caught
- ⬜ Missing approval caught
- ⬜ Network errors handled
- ⬜ User rejection handled

**Status:** ⬜ Not tested  
**Required:** ✅ Yes

---

### 11. Verify Contract Integration

#### Check Contract Addresses
- ⬜ LOTTERY_ADDRESS is correct
- ⬜ KENO_ADDRESS is correct
- ⬜ MORBIUS_TOKEN_ADDRESS is correct
- ⬜ WPLS_TOKEN_ADDRESS is correct

#### Verify ABIs
- ⬜ LOTTERY_6OF55_V2_ABI imports correctly
- ⬜ KENO_ABI imports correctly
- ⬜ ERC20_ABI imports correctly

#### Test Read Functions
- ⬜ getCurrentRoundInfo() works
- ⬜ getMegaMillionsBank() works
- ⬜ getPlayerStats() works
- ⬜ getGlobalStats() works

**Status:** ⬜ Not tested  
**Required:** ✅ Yes

---

### 12. Performance Check

#### Initial Load
- ⬜ Page loads in < 3 seconds
- ⬜ No console errors
- ⬜ No TypeScript errors
- ⬜ No missing imports

#### Data Fetching
- ⬜ Stats load within 2 seconds
- ⬜ Refresh buttons work quickly
- ⬜ No infinite loading states

#### Transactions
- ⬜ Transaction submission < 1 second
- ⬜ Confirmation tracking works
- ⬜ Success/error messages display

**Status:** ⬜ Not tested  
**Required:** ✅ Yes

---

### 13. Browser Compatibility

#### Chrome/Edge
- ⬜ Page renders correctly
- ⬜ Wallet connects
- ⬜ Transactions work

#### Firefox
- ⬜ Page renders correctly
- ⬜ Wallet connects
- ⬜ Transactions work

#### Safari
- ⬜ Page renders correctly
- ⬜ Wallet connects
- ⬜ Transactions work

#### Mobile Browsers
- ⬜ iOS Safari works
- ⬜ Chrome Mobile works

**Status:** ⬜ Not tested  
**Required:** ⚠️ Recommended

---

### 14. Security Checks

#### User Safety
- ⬜ Approval amounts are clear
- ⬜ Transaction details visible before signing
- ⬜ Warning for owner-only functions
- ⬜ No hardcoded private keys

#### Data Validation
- ⬜ Input sanitization works
- ⬜ BigInt conversion safe
- ⬜ Array bounds checked
- ⬜ Address validation present

**Status:** ⬜ Not checked  
**Required:** ✅ Yes

---

### 15. Documentation Review

#### Read Documentation
- ⬜ CONTRACT_INTERFACE_README.md reviewed
- ⬜ CONTRACT_SETUP.md reviewed
- ⬜ CONTRACTS_INTERFACE_SUMMARY.md reviewed
- ⬜ CONTRACTS_INTERFACE_VISUAL_GUIDE.md reviewed

#### Verify Examples
- ⬜ Example JSON formats work
- ⬜ Example values are realistic
- ⬜ Instructions are clear

**Status:** ⬜ Not reviewed  
**Required:** ⚠️ Recommended

---

## 🚀 Quick Start Commands

### 1. Install Dependencies
```bash
cd /Users/kyle/MORBlotto/morbius_lotto
pnpm add @radix-ui/react-checkbox
```

### 2. Start Dev Server
```bash
pnpm dev
```

### 3. Open Browser
```
http://localhost:3000/contracts
```

### 4. Connect Wallet
- Click "Connect" in header
- Select MetaMask or WalletConnect
- Approve connection

### 5. Test a Function
**Example: View Statistics (No wallet required)**
1. Go to Statistics tab
2. View current round info
3. Click refresh to update

**Example: Buy Tickets (Wallet required)**
1. Go to User Actions tab
2. Approve 1000 Morbius
3. Enter: `[[1,2,3,4,5,6]]`
4. Click "Buy Tickets"
5. Confirm in wallet

---

## 📋 Common Issues & Solutions

### Issue: Checkbox component error
**Solution:**
```bash
pnpm add @radix-ui/react-checkbox
```

### Issue: TypeScript errors
**Solution:**
```bash
pnpm install
```

### Issue: Wallet won't connect
**Solution:**
1. Check network is PulseChain
2. Try refreshing page
3. Clear browser cache
4. Try different wallet

### Issue: Transactions failing
**Solution:**
1. Check token approval
2. Verify wallet balance
3. Ensure correct network
4. Try lower gas limit

### Issue: Data not loading
**Solution:**
1. Check contract addresses in `/lib/contracts.ts`
2. Verify network connection
3. Click refresh buttons
4. Check browser console for errors

---

## ✨ Success Criteria

### Must Have (Before Using in Production)
- ✅ All dependencies installed
- ✅ No console errors
- ✅ Wallet connection works
- ✅ At least one read function tested
- ✅ At least one write function tested
- ✅ Documentation reviewed

### Should Have (For Full Confidence)
- ✅ All sections tested
- ✅ Tooltips verified
- ✅ Responsive design checked
- ✅ Error handling tested
- ✅ Multiple browsers tested

### Nice to Have (For Polish)
- ✅ Mobile thoroughly tested
- ✅ All tooltips reviewed
- ✅ Performance optimized
- ✅ User feedback collected

---

## 📞 Support

### If You Encounter Issues:

1. **Check Console**
   - Open browser DevTools (F12)
   - Look for errors in Console tab
   - Note any red error messages

2. **Verify Setup**
   - Confirm all files were created
   - Check dependency installation
   - Verify contract addresses

3. **Review Documentation**
   - CONTRACT_INTERFACE_README.md
   - CONTRACT_SETUP.md
   - CONTRACTS_INTERFACE_VISUAL_GUIDE.md

4. **Test with Small Amounts**
   - Use minimal token amounts
   - Test on one function first
   - Verify results on block explorer

---

## 🎉 Completion

Once all checkboxes are marked:
- ⬜ Contract interface is ready for use
- ⬜ All functions tested and working
- ⬜ Documentation read and understood
- ⬜ Ready for production deployment

**Date Completed:** _______________

**Tested By:** _______________

**Notes:**
_____________________________________
_____________________________________
_____________________________________

---

## Next Steps After Installation

### Immediate
1. ✅ Test with small amounts
2. ✅ Verify all tooltips
3. ✅ Check responsive design
4. ✅ Test error handling

### Short Term
- [ ] Add transaction history
- [ ] Add CSV export
- [ ] Add more analytics
- [ ] Add batch operations

### Long Term
- [ ] Mobile app integration
- [ ] Advanced admin dashboard
- [ ] Automated testing suite
- [ ] Multi-language support

---

**Good luck with your contract interface! 🚀**




