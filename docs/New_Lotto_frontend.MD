# SuperStake Lottery – Frontend Sketches

Below are 10 rough layout sketches for key screens / variations.
They’re not pixel-perfect — they’re blueprints for your designer & dev.

---

## 1. Hero Dashboard (Round Overview)

**Purpose:** Landing screen showing current round, pot size, time left, and quick access to “Buy Tickets”.

**Sketch:**

+--------------------------------------------------------+
|  [Logo SUPERSTAKE LOTTERY]        [Connect Wallet]     |
+--------------------------------------------------------+
|  ROUND #128                         NETWORK: Pulse     |
|  Time left: 00:07:32 [███████-----]                    |
+--------------------------------------------------------+
|  [ Current Pot ]      [ MegaMillions Bank ]           |
|   254,310 pSSH         1,203,990 pSSH                |
|  ≈ $123,456            Next Mega: Round #165         |
+--------------------------------------------------------+
|  [ HEX Overlay Bank ]                                 |
|   3,210,000 HEX (triggers on 6/6 match)               |
+--------------------------------------------------------+
|  [ Buy Tickets ]   [ View My Tickets ]  [ How it Works]|
+--------------------------------------------------------+
|  Recent winners                                         |
|  - Round #127: 2x Bracket 4, 16x Bracket 2            |
|  - Round #126: MegaMillions jackpot (pSSH + HEX)      |
+--------------------------------------------------------+
|  Footer: Links / Docs / Audit / Socials               |
+--------------------------------------------------------+

---

## 2. Connect Wallet + Network Guard

**Purpose:** A modal that emphasizes safety, network, and what permissions are needed.
Web3 UX patterns stress transparency around wallet actions and networks.   

**Sketch:**

+---------------- CONNECT WALLET ----------------+
|  1. Select wallet                             |
|   ( ) MetaMask                                |
|   ( ) Rabby                                   |
|   ( ) WalletConnect                           |
|                                               |
|  2. Confirm network                           |
|   - You are on: PulseChain Mainnet ✅          |
|                                               |
|  3. Permission summary                        |
|   - Read your address                         |
|   - Request signatures for ticket purchases   |
|   - Does NOT move funds without your tx 👍    |
|                                               |
| [Cancel]                          [Connect]   |
+-----------------------------------------------+

---

## 3. Buy Tickets – Simple Number Picker

**Purpose:** Core ticket-buy flow. Inspired by lottery ticket grids / Powerball-style slips.   

**Sketch:**

+------------------ BUY TICKETS (Round #128) -------------------+
|  Time left: 00:07:32                                          |
|  Ticket price: 10 pSSH                                        |
+---------------------------------------------------------------+
|  Select your numbers (1–55), 6 unique per ticket              |
|                                                               |
|  Ticket #1: [  7] [ 12] [ 19] [ 27] [ 34] [ 42]              |
|             ^click to change each number                      |
|                                                               |
|  [ + Add Ticket ]   [ Quick Pick ] [ Clear All ]              |
+---------------------------------------------------------------+
|  Summary                                                      |
|   Tickets: 3        x 10 pSSH = 30 pSSH                       |
|   Bulk discount: 5%                                           |
|   Total cost: 28.5 pSSH                                       |
|                                                               |
|  Balance: 1,204 pSSH  |  Wallet: 0xAbc...123                  |
+---------------------------------------------------------------+
| [ Cancel ]                                    [ Confirm Buy ] |
+---------------------------------------------------------------+

---

## 4. Advanced Buy – Multi-Ticket Grid (Power User View)

**Purpose:** Let degens quickly spam many combinations, similar to a lottery playslip with multiple lines.   

**Sketch:**

+------------ ADVANCED TICKET ENTRY (Round #128) -------------+
|  Mode: [ Standard ] [ **Grid** ]                            |
+-------------------------------------------------------------+
|  Rows: [10]          [ + Add 5 Rows ]                       |
+-------------------------------------------------------------+
|  # |  n1  n2  n3  n4  n5  n6       |  Tools                |
|  1 | [  1][  2][  3][  4][  5][  6]| [QP] [Copy↓] [Clear]  |
|  2 | [  7][  8][  9][ 10][ 11][ 12]| [QP] [Copy↓] [Clear]  |
|  3 | [ 13][ 14][ 15][ 16][ 17][ 18]| [QP] [Copy↓] [Clear]  |
|  . |  ...                          |                        |
| 10 | [  ?][  ?][  ?][  ?][  ?][  ?]| [QP] [Copy↓] [Clear]  |
+-------------------------------------------------------------+
|  [ Fill All with Quick Pick ]    [ Validate Uniqueness ]    |
+-------------------------------------------------------------+
|  Tickets: 10   | Cost: 100 pSSH   | Discount: 10%           |
|  Total: 90 pSSH                                            |
+-------------------------------------------------------------+
| [ Back ]                                      [ Confirm ]   |
+-------------------------------------------------------------+

---

## 5. “My Tickets” – Current & Past Rounds

**Purpose:** Trust & transparency. Show what they bought, when, and claim status.
Patterns from real lottery & Web3 apps: visible history and status indicators.   

**Sketch:**

+--------------------- MY TICKETS -----------------------------+
|  Tabs: [ Current Round ] [ History ] [ Free Tickets ]        |
+--------------------------------------------------------------+
|  CURRENT ROUND: #128                                         |
|  Status: OPEN – waiting for draw                             |
+--------------------------------------------------------------+
|  Ticket   Numbers                 Free?   Potential bracket   |
|  #1       07 12 19 27 34 42       No      1–6                |
|  #2       03 11 15 21 30 55       No      1–6                |
|  #3       02 14 22 33 41 49       Yes     (Free ticket)      |
+--------------------------------------------------------------+
|  Total paid: 20 pSSH   |  Free tickets used: 1               |
+--------------------------------------------------------------+
|  HISTORY (collapsed list)                                    |
|  - Round #127  [Results] [Claimed]                           |
|    Bracket 3 win: +85 pSSH, Free ticket reset.               |
|  - Round #126  [Results] [Expired]                           |
+--------------------------------------------------------------+

---

## 6. Results Modal – “Did I Win?” Checker

**Purpose:** After round finalization, users want instant clarity: did I win and how much?  

**Sketch:**

+------------------ ROUND #127 RESULTS -------------------+
|  Winning numbers:   07  12  19  27  34  42              |
|  Pot: 220,000 pSSH   |  HEX overlay: 0 (no 6/6 hit)     |
+---------------------------------------------------------+
|  Your tickets:                                       v  |
|  Ticket #1: 07 12 19 27 34 42  ->  Matches: 6  -> B6   |
|             Prize: 55,000 pSSH                         |
|  Ticket #2: 03 11 15 21 30 55  ->  Matches: 0  -> Loss |
|             Earned free ticket next round ✅            |
+---------------------------------------------------------+
|  Bracket breakdown:                                    |
|  - B6: 1 winner, each 25% of pot                       |
|  - B5: 3 winners, 10% of pot split                      |
|  - B4: 12 winners, 8% of pot split                      |
|  ...                                                   |
+---------------------------------------------------------+
| [View All Winners]                     [Close]          |
+---------------------------------------------------------+

---

## 7. MegaMillions Countdown Screen

**Purpose:** Build hype around the every-55th-round MegaMillions event using the Mega pSSH bank.   

**Sketch:**

+---------------- MEGAMILLIONS COUNTDOWN ----------------+
|  Next Mega Round: #165                                |
|  Current Round: #128                                  |
|  Rounds remaining: 37                                 |
+--------------------------------------------------------+
|  MegaMillions Bank (pSSH):                            |
|  [██████████----------]  1,203,990 pSSH               |
|  Estimated jackpot (if today): ≈ $X,XXX,XXX           |
+--------------------------------------------------------+
|  HEX overlay bank:                                    |
|  3,210,000 HEX (triggers on any 6/6 hit)              |
+--------------------------------------------------------+
|  How Mega works:                                      |
|  - Every round: 20% of pot → Mega bank                |
|  - Extra from unused high brackets 5–6                |
|  - On round #165: bank dumps into B5 & B6 pools       |
+--------------------------------------------------------+
|  [ Set Reminder ]  [ Share ]  [ Buy Tickets Now ]      |
+--------------------------------------------------------+

---

## 8. “How It Works” Explainer Page

**Purpose:** Education + trust. Explain token flows, odds, and HEX overlay in a simple layout.
Web3 UX best practices say: clear explanation of how funds move.   

**Sketch:**

+------------------- HOW IT WORKS -----------------------+
|  Sections:                                            |
|  [ Overview ] [ Prize Brackets ] [ Token Flows ]      |
|  [ HEX Overlay ] [ MegaMillions ] [ Security ]        |
+--------------------------------------------------------+
|  OVERVIEW                                             |
|  - Choose 6 unique numbers from 1–55                  |
|  - Rounds every day                                   |
|  - On-chain, verifiable draws                         |
+--------------------------------------------------------+
|  TOKEN FLOWS (infographic)                            |
|  +--------------+    +----------------------+         |
|  | You (pSSH)   | -> | SuperStake Lottery  |         |
|  +--------------+    +----------------------+         |
|                         | 55% winners                 |
|                         | 25% SuperStake stake addr  |
|                         | 20% MegaMillions bank      |
+--------------------------------------------------------+
|  HEX OVERLAY                                           |
|  - Contract accrues HEX over time                      |
|  - First 6/6 match detonates 70% to winners           |
|  - Remaining 30% → SuperStake HEX stake               |
+--------------------------------------------------------+
|  [ Read Full Docs ]                                   |
+--------------------------------------------------------+

---

## 9. Mobile Ticket Picker (Responsive View)

**Purpose:** Show how the number picker compresses nicely on mobile.

**Sketch (mobile portrait):**

+--------------------------+
| SUPERSTAKE LOTTERY       |
| Round #128  00:07:32     |
+--------------------------+
| Pot: 254,310 pSSH        |
| Mega: 1,203,990 pSSH     |
+--------------------------+
| [ Buy Tickets ]          |
+--------------------------+
| BUY TICKET               |
| Select 6 numbers 1–55    |
|                          |
|  [ 07 ] [ 12 ] [ 19 ]    |
|  [ 27 ] [ 34 ] [ 42 ]    |
|                          |
|  [ Edit numbers ]        |
|  [ Quick Pick ]          |
+--------------------------+
| Cost: 10 pSSH            |
| [ Cancel ] [ Confirm ]   |
+--------------------------+

(on extra screen)

+--------------------------+
| Number selector          |
+--------------------------+
| 1  2  3  4  5  6  7  8   |
| 9 10 11 12 13 14 15 16   |
| ... up to 55             |
+--------------------------+
| [Back]           [Select]|
+--------------------------+

---

## 10. Admin / Operator Panel (Internal Only)

**Purpose:** Simple internal view for you to monitor rounds, pots, and state (even if you never expose this externally).

**Sketch:**

+------------------- OPERATOR DASHBOARD -----------------+
|  Network: PulseChain Mainnet   |  Contract: 0x...abc   |
+--------------------------------------------------------+
|  Current Round: #128 (OPEN)                            |
|  - Start: 2025-12-01 12:00                             |
|  - End:   2025-12-01 12:10                             |
|  - Tickets sold: 1,204                                 |
|  - Pot: 254,310 pSSH                                   |
+--------------------------------------------------------+
|  Controls (for debugging/testing):                     |
|  [ Simulate Finalize ]  [ View Drawn Numbers ]         |
+--------------------------------------------------------+
|  Banks:                                                |
|  - Mega pSSH Bank: 1,203,990 pSSH                      |
|  - HEX Bank: 3,210,000 HEX                             |
|  - Free Ticket Reserve: 12,340 pSSH                    |
+--------------------------------------------------------+
|  Recent rounds:                                        |
|  #127  CLAIMABLE  B6 hit? Yes (HEX paid)               |
|  #126  CLAIMABLE  B6 hit? No                           |
+--------------------------------------------------------+
