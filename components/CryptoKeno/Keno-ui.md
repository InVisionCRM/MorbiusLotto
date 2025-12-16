# On-Chain Club Keno – UI Sketches

---

## 1. Monitor-Style Home Screen (Live Draw View)

**Purpose:** Mimic the bar/retail Keno monitor. Shows last/next draw, big board, invite to buy.

+----------------------------------------------------------+
|  [LOGO]  ON-CHAIN CLUB KENO             [Connect Wallet] |
+----------------------------------------------------------+
|  NEXT DRAW: Round #4821          Starts in: 00:01:12     |
|  Draws every 3 minutes                                  |
+----------------------------------------------------------+
|  CURRENT JACKPOTS                                        |
|  Main pool:      124,560 TOKEN                           |
|  Multiplier:     Up to 10x (opt-in)                      |
|  Progressive "The Pot":  812,340 TOKEN                   |
+----------------------------------------------------------+
|  LAST DRAW: #4820                                        |
|  Numbers (20/80):                                        |
|   03  07  11  14  19  22  25  29  31  34                 |
|   40  42  47  50  53  57  61  68  72  79                 |
+----------------------------------------------------------+
|  [ Buy Tickets for next draw ]   [ My Tickets ]          |
+----------------------------------------------------------+
|  Activity:                                               |
|  - 10-spot jackpot last hit: Round #4788 (250,000 TOKEN) |
|  - Latest progressive win: 512,000 TOKEN (The Pot)       |
+----------------------------------------------------------+

---

## 2. Ticket Builder – Basic (Spot + Wager + Numbers)

**Purpose:** Simple entry form: pick spot size, picks, wager, draws.

+---------------------- BUY TICKETS (#4821) ----------------------+
|  STEP 1 – Choose your SPOT (how many numbers)                   |
|   [1] [2] [3] [4] [5] [6] [7] [8] [9] [10]                      |
|   Selected: 8-Spot                                              |
+-----------------------------------------------------------------+
|  STEP 2 – Choose your numbers (1–80, 8 unique)                  |
|  [ Number grid 1..80, clickable, selected numbers highlighted ] |
|                                                                 |
|   Selected: 03, 07, 13, 17, 23, 27, 33, 37                      |
|   [ Quick Pick ] [ Clear ]                                      |
+-----------------------------------------------------------------+
|  STEP 3 – Wager per draw & consecutive draws                    |
|   Wager per draw: [  1 TOKEN v]                                 |
|   Draws: [ 1 ] [ 5 ] [10] [20] Custom: [  3 ]                   |
+-----------------------------------------------------------------+
|  STEP 4 – Add-ons                                               |
|   ( ) Multiplier (extra x1 wager, up to 10x prizes)             |
|   ( ) Bulls-Eye (extra x1 wager, bigger hits on special ball)   |
|   ( ) Progressive "The Pot" (+1 TOKEN / draw)                   |
+-----------------------------------------------------------------+
|  Summary:                                                       |
|   Spot: 8   | Numbers: 8   | Draws: 5                           |
|   Base wager: 1 TOKEN x 5 draws = 5 TOKEN                       |
|   Add-ons: Multiplier + Pot = +10 TOKEN                         |
|   Total: 15 TOKEN                                               |
+-----------------------------------------------------------------+
|  [ Cancel ]                                      [ Confirm Buy ]|
+-----------------------------------------------------------------+

---

## 3. Multi-Ticket “Playslip” View

**Purpose:** Let players build many lines like a paper keno slip.

+---------------------- MULTI-TICKET PLAYSLIP --------------------+
|  Mode: [ **Playslip** ] [ Quick Auto ]                          |
+-----------------------------------------------------------------+
|  Global settings:                                                |
|    Spot: [10]   Wager per draw: [ 1 TOKEN ]  Draws: [ 10 ]      |
|    Apply to all new lines                                       |
+-----------------------------------------------------------------+
|  Line | Numbers (10 unique)                  | Options          |
|   #1  | 03 07 13 17 23 27 33 37 71 77        | [QP] [Clear]     |
|   #2  | __ __ __ __ __ __ __ __ __ __        | [QP] [Clear]     |
|   #3  | __ __ __ __ __ __ __ __ __ __        | [QP] [Clear]     |
|   #4  | ...                                  |                  |
+-----------------------------------------------------------------+
|  [ + Add 5 lines ]      [ Fill all with Quick Pick ]            |
+-----------------------------------------------------------------+
|  Totals:                                                       |
|   Lines: 10    | Draws: 10    | Base Cost: 100 TOKEN            |
|   Multiplier: (x2 cost) [ ]   Bulls-Eye [ ]   Pot [x]           |
|   Estimated max win this ticket:  1,000,000+ TOKEN              |
+-----------------------------------------------------------------+
|  [ Back ]                                          [ Buy Now ]  |
+-----------------------------------------------------------------+

---

## 4. “My Plays” – Current & Upcoming

**Purpose:** Show your active tickets across coming draws, like paper ticket but digital.

+--------------------------- MY PLAYS ----------------------------+
|  Tabs: [ Active ] [ History ] [ Progressive ]                   |
+-----------------------------------------------------------------+
|  ACTIVE DRAWS                                                   |
|  Round #4821 – starts in 00:01:12                               |
|   - Ticket A: 8-Spot, Numbers: 03 07 13 17 23 27 33 37          |
|     Draws left: 5   | Wager: 1 TOKEN   | Multiplier: ON         |
|   - Ticket B: 4-Spot, Quick Pick #1                             |
|     Draws left: 1   | Wager: 5 TOKEN   | Pot: ON                |
+-----------------------------------------------------------------+
|  Round #4822 – queued                                           |
|   - Ticket C: 10-Spot, 20 draws (auto)                          |
+-----------------------------------------------------------------+
|  [ View details ]  [ Cancel future draws (if allowed) ]         |
+-----------------------------------------------------------------+

---

## 5. Draw Result Modal – “Did I Hit?”

**Purpose:** After a draw, show your hits clearly.

+---------------------- ROUND #4820 RESULTS ----------------------+
|  Draw time: 12:34:00  |  20 numbers drawn                       |
|  Winning numbers (20/80):                                       |
|   03 07 11 14 19 22 25 29 31 34                                 |
|   40 42 47 50 53 57 61 68 72 79                                 |
+-----------------------------------------------------------------+
|  YOUR TICKETS IN THIS DRAW                                      |
|  Ticket A: 8-Spot: 03 07 13 17 23 27 33 37                      |
|    Hits: 2  (03, 07) → pays as 2/8 bracket                      |
|    Prize: 1.5 TOKEN (multiplier 3x applied)                     |
|  Ticket B: 4-Spot: 05 10 15 20                                  |
|    Hits: 0 → no prize (earns free-play credit if you want this) |
+-----------------------------------------------------------------+
|  Prize summary:                                                 |
|   Total won this draw: 1.5 TOKEN                                |
|   Multiplier: 3x (for Multiplier tickets only)                  |
+-----------------------------------------------------------------+
|  [ Claim / Auto-claim settings ]    [ Close ]                   |
+-----------------------------------------------------------------+

---

## 6. Odds & Payouts Info Panel

**Purpose:** Educate players about spot choices & prize tiers.

+---------------------- ODDS & PAY TABLE -------------------------+
|  Tabs: [ 1-Spot ] [ 4-Spot ] [ 8-Spot ] [ 10-Spot ]             |
+-----------------------------------------------------------------+
|  10-SPOT PAY TABLE (20/80 Keno style)                           |
|  Hits | Example payout (x Wager)                                |
|   10  | 10,000x                                                 |
|    9  | 1,000x                                                  |
|    8  | 100x                                                    |
|    7  | 20x                                                     |
|    6  | 5x                                                      |
|    5  | 2x                                                      |
|   <5  | 0x (or small consolation if you want)                   |
+-----------------------------------------------------------------+
|  Odds (approx, per draw):                                      |
|   - Hit any 1 of your 10: relatively common                     |
|   - Hit all 10: ~1 in 8–9 million (rare)                        |
|   - House edge (across all spots): ~X% (displayed)              |
+-----------------------------------------------------------------+
|  [ Full math & fairness docs ]                                  |
+-----------------------------------------------------------------+

---

## 7. Add-ons Config – Multiplier / Bulls-Eye / Progressive

**Purpose:** Central place to explain & toggle add-ons.

+---------------------- ADD-ONS CENTER ---------------------------+
|  MULTIPLIER                                                    |
|   - Cost: doubles your base wager per draw                     |
|   - Multiplier drawn each round: 1x, 2x, 3x, 5x, 10x           |
|   - Applies only to winning tickets with Multiplier ON         |
|   [ ON/OFF toggle per ticket / globally ]                       |
+-----------------------------------------------------------------+
|  BULLS-EYE                                                     |
|   - One of the 20 winning numbers is marked as Bulls-Eye       |
|   - If you hit it AND you bought Bulls-Eye, your payout jumps  |
|   - Cost: +1x base wager                                       |
|   [ ON/OFF toggle ]                                            |
+-----------------------------------------------------------------+
|  PROGRESSIVE "THE POT"                                        |
|   - Extra +1 TOKEN per draw joins a growing pool               |
|   - Special condition: match all 9 bonus numbers to win it     |
|   - Current Pot: 812,340 TOKEN                                 |
|   [ ON/OFF toggle ]                                            |
+-----------------------------------------------------------------+
|  [ Back to Buy Tickets ]                                       |
+-----------------------------------------------------------------+

---

## 8. Mobile Keno Board (Responsive)

**Purpose:** Show how this compresses nicely on phone.

+------------------------------+
|  CLUB KENO (Round #4821)     |
|  Time left: 00:01:12         |
|  Pot: 124,560 TOKEN          |
+------------------------------+
| [ Buy Ticket ]               |
+------------------------------+
| SPOT: [ 8 v ] Wager: [1]     |
| Draws: [10]                  |
+------------------------------+
| Pick 8 numbers 1–80:         |
| [  1][  2][  3][  4][  5]    |
| [  6][  7][  8][  9][ 10]    |
| ... scroll ... up to 80      |
+------------------------------+
| Selected: 03 07 13 17 23 ... |
+------------------------------+
| [ Quick Pick ] [ Clear ]     |
+------------------------------+
| Total: 10 TOKEN (no add-ons) |
| [ Cancel ]  [ Buy ]          |
+------------------------------+

---

## 9. Live Draw Animation / History Panel

**Purpose:** Let users visually watch draws, including history.

+------------------------ LIVE DRAW -------------------------------+
|  Round #4821 – LIVE (00:00:04)                                  |
|  [Animated balls dropping / numbers lighting up on 1–80 grid]   |
|  Drawn:  03  07  11  14  19  22  ...                            |
+-----------------------------------------------------------------+
|  YOUR IMPACT                                                    |
|  - Your active tickets: 3                                       |
|  - Hits so far this draw:                                       |
|     Ticket A: 2 hits                                            |
|     Ticket B: 0 hits                                            |
+-----------------------------------------------------------------+
|  [Switch to Next Draw countdown]  [View past draws]             |
+-----------------------------------------------------------------+

---

## 10. Operator / Analytics Dashboard

**Purpose:** Internally see total volume, round stats, pool sizes.

+----------------- KENO OPERATOR DASHBOARD ----------------------+
|  Network: [Your Chain]   Contract: 0x...                       |
+----------------------------------------------------------------+
|  LIVE                                                          |
|   Current Round: #4821  | Time left: 00:01:12                  |
|   Tickets sold this round:  3,412                              |
|   Volume this round:  68,240 TOKEN                             |
|   Est. total payouts:  ~52,000 TOKEN                           |
+----------------------------------------------------------------+
|  POOLS                                                         |
|   - Main prize pool:   1,240,000 TOKEN                         |
|   - Progressive "The Pot": 812,340 TOKEN                       |
|   - Multiplier fund:   94,000 TOKEN                            |
|   - Protocol fees (lifetime): 2,100,000 TOKEN                  |
+----------------------------------------------------------------+
|  RECENT ROUNDS                                                 |
|   #4820  – jackpot: 200k TOKEN, progressive: no                |
|   #4819  – no jackpot, progressive +15k TOKEN                  |
|   #4818  – progressive hit: 540k TOKEN                         |
+----------------------------------------------------------------+
|  [ Export CSV ]  [ Pause game ]  [ Adjust paytables ]          |
+----------------------------------------------------------------+
