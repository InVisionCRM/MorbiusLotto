// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/*

                                   ▄▄_
                               ,▓███████▄_
                           _▄███████████████▄_
                        ▄▓██████████████████████▄_
                    ,▌█████████████▌─╩██████████████▄_
                 ▄█████████████▓"        ▀██████████████▄
             ,▓████████████▌╙               └▓█████████████▓▄
         _▌█████████████╨         ▄▄_           ╩██████████████▓▄
       ▓████████████▀         _▌██████▓▄            ▀██████████████
       ██████████▌_        ▄▓█████████████▌▄           └▓██████████
       ██████████████▄_ ▄█████████████████████▌_           ╨███████
         └▀███████████████████████████████████████▄_           ▀███
             └▀█████████████████▀      ▀█████████████▓            ╙
                 '▀█████████████▌_         ▀██████████
                     ╙▌█████████████▄_        └▀██████
                         ╙▌████████████▌▄         ╙▓██
                             ╙▌████████████▄_
                    ▌▄           ╙▀███████████▓▄
                    ████▌_           ╙▌███████████▄_
                    ████████▄_           ╙▓██████████▓▄
                    ████████████▄_     ,▄████████████████▌_
      ╒▄             '▀████████████▓▄▌██████████████████████▓▄_
      ▐██▓▄_             ╙▓████████████████████▀    ╙▓██████████▌▄
      ▐██████▓▄_             ╨█████████████▀"         ,▌███████████
      ▐██████████▌▄_            `▀██████▀          ▄▌██████████████
      └██████████████▌▄             ╙"         ╓▄████████████████▀`
         ╙▀█████████████▓▄▄                _▄▓███████████████▀"
             ╙▀█████████████▓▄_         ▄Φ███████████████▌"
                 ╙▀█████████████▓▄_ ,▄▓██████████████▓╙
                     ╙▀██████████████████████████▓▀
                         ╙▀██████████████████▓▀`
                             ╙▀▓▓▓▓▓▓▓▓▓█▓▀"
                                 ╙▀▓▓▓▀"

*/

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface IPulseXRouter {
    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);
}

/**
 * @title Roulette — European Single Zero
 * @notice On-chain European Roulette (numbers 0–36). Single-transaction instant play:
 *         player submits bets, contract spins the wheel, pays out atomically.
 * @dev Bankrolled by contract reserve. Fee structure: 5% from wagers (matches Keno/Plinko).
 *      PLS purchases route through treasury. Blockhash + multi-source entropy for RNG.
 *
 *      BET TYPES (betType enum):
 *        0  STRAIGHT    — single number (0–36),          pays 35:1
 *        1  SPLIT       — two adjacent numbers,           pays 17:1
 *        2  STREET      — three-number row,               pays 11:1
 *        3  CORNER      — four numbers sharing a corner,  pays  8:1
 *        4  LINE        — six numbers / two rows,         pays  5:1
 *        5  COLUMN      — 12 numbers (col 1/2/3),         pays  2:1
 *        6  DOZEN       — 12 numbers (1–12/13–24/25–36),  pays  2:1
 *        7  RED_BLACK   — 18 red or 18 black numbers,     pays  1:1
 *        8  EVEN_ODD    — 18 even or 18 odd numbers,      pays  1:1
 *        9  LOW_HIGH     — 1–18 (low) or 19–36 (high),    pays  1:1
 *
 *      Each bet includes a `numbers` array identifying the covered pocket(s) and
 *      a `param` field selecting a variant (e.g., column 0/1/2, dozen 0/1/2,
 *      red=0/black=1, even=0/odd=1, low=0/high=1).
 *      A single spin can carry up to MAX_BETS simultaneous bets.
 */
contract Roulette is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    uint8 public constant WHEEL_NUMBERS = 37;      // 0–36 inclusive (European)
    uint8 public constant MAX_BETS       = 15;      // max simultaneous bet positions per spin
    uint256 public constant MIN_BET      = 1 * 10**18;   // 1 MORBIUS minimum per bet
    uint256 public constant BPS_DENOM    = 10_000;

    // Standard roulette payouts (multiplier applied to individual bet wager)
    uint8 public constant PAYOUT_STRAIGHT  = 35;
    uint8 public constant PAYOUT_SPLIT     = 17;
    uint8 public constant PAYOUT_STREET    = 11;
    uint8 public constant PAYOUT_CORNER    =  8;
    uint8 public constant PAYOUT_LINE      =  5;
    uint8 public constant PAYOUT_COLUMN    =  2;
    uint8 public constant PAYOUT_DOZEN     =  2;
    uint8 public constant PAYOUT_RED_BLACK =  1;
    uint8 public constant PAYOUT_EVEN_ODD  =  1;
    uint8 public constant PAYOUT_LOW_HIGH  =  1;

    // ============ Types ============

    enum BetType {
        STRAIGHT,   // 0
        SPLIT,      // 1
        STREET,     // 2
        CORNER,     // 3
        LINE,       // 4
        COLUMN,     // 5
        DOZEN,      // 6
        RED_BLACK,  // 7
        EVEN_ODD,   // 8
        LOW_HIGH    // 9
    }

    struct Bet {
        BetType betType;
        uint8   param;    // variant selector; 0 for STRAIGHT/SPLIT/STREET/CORNER/LINE
        uint256 wager;    // individual bet wager in MORBIUS
        // For STRAIGHT/SPLIT/STREET/CORNER/LINE: the exact pocket numbers covered.
        // For outside bets (COLUMN/DOZEN/RED_BLACK/EVEN_ODD/LOW_HIGH): empty (resolved via param).
        uint8[] numbers;
    }

    struct Spin {
        address player;
        uint8   result;          // winning pocket 0–36
        uint256 totalWagered;    // sum of all bet wagers
        uint256 grossPayout;     // pre-fee payout
        uint256 netPayout;       // post-fee payout to player
        uint64  timestamp;
        bool    paidWithPLS;
        // Compact bet log — stored as parallel arrays to avoid dynamic struct arrays in storage.
        uint8   betCount;
        uint8[MAX_BETS]   betTypes;
        uint8[MAX_BETS]   betParams;
        uint256[MAX_BETS] betWagers;
        bool[MAX_BETS]    betWon;
    }

    // ============ State Variables ============

    IERC20 public immutable token;
    address public immutable wrappedPulse;
    IPulseXRouter public immutable pulseXRouter;

    uint256 public nextSpinId = 1;
    uint256 public maxBetPerSpin;      // max total wager across all bets in a single spin
    uint256 public contractReserve;    // MORBIUS available for payouts

    address public plsTreasury;

    // Fee config (5% total, same split as Keno/Plinko)
    uint256 public distributionFeeBps;   // 125 — 1.25% MORBIUS holders
    address public distributionRecipient;
    uint256 public burnFeeBps;           // 50  — 0.5% burn
    address public burnAddress;
    uint256 public platformFeeBps;       // 175 — 1.75% house
    address public platformFeeRecipient;
    uint256 public lpDistributionFeeBps; // 150 — 1.5% LP holders
    address public lpDistributionRecipient;

    uint256 public totalDistributionFeesCollected;
    uint256 public totalBurnFeesCollected;
    uint256 public totalPlatformFeesCollected;
    uint256 public totalLpDistributionFeesCollected;

    // Spin history
    mapping(uint256 => Spin) public spins;

    // Player stats
    mapping(address => uint256[]) public playerSpins;
    mapping(address => uint256) public playerTotalWagered;
    mapping(address => uint256) public playerTotalWon;
    mapping(address => uint256) public playerSpinCount;
    mapping(address => uint256) public playerWinCount;
    mapping(address => uint256) public playerBiggestWin;

    // Global stats
    uint256 public globalTotalWagered;
    uint256 public globalTotalWon;
    uint256 public globalSpinCount;

    // ============ Events ============

    event Spun(
        address indexed player,
        uint256 indexed spinId,
        uint8   result,
        uint256 totalWagered,
        uint256 grossPayout,
        uint256 netPayout,
        bool    paidWithPLS
    );
    event ContractFunded(address indexed funder, uint256 amount);
    event EmergencyWithdraw(uint256 amount);
    event MaxBetUpdated(uint256 maxBetPerSpin);
    event PlsTreasuryUpdated(address newTreasury);
    event DistributionFeeUpdated(uint256 bps, address recipient);
    event BurnFeeUpdated(uint256 bps, address burnAddr);
    event PlatformFeeUpdated(uint256 bps, address recipient);
    event LpDistributionFeeUpdated(uint256 bps, address recipient);

    // ============ Errors ============

    error NoBets();
    error TooManyBets();
    error BetWagerTooLow();
    error TotalWagerTooHigh();
    error InvalidBetNumbers();
    error InvalidBetParam();
    error InsufficientContractBalance();

    // ============ Constructor ============

    constructor(
        address token_,
        address wrappedPulse_,
        address pulseXRouter_,
        address plsTreasury_,
        address distributionRecipient_,
        address burnAddress_,
        address platformFeeRecipient_,
        address lpDistributionRecipient_
    ) Ownable(msg.sender) {
        require(token_                  != address(0), "token required");
        require(wrappedPulse_           != address(0), "wrapped PLS required");
        require(pulseXRouter_           != address(0), "router required");
        require(plsTreasury_            != address(0), "treasury required");
        require(distributionRecipient_  != address(0), "distribution recipient required");
        require(burnAddress_            != address(0), "burn address required");
        require(platformFeeRecipient_   != address(0), "platform recipient required");
        require(lpDistributionRecipient_!= address(0), "lp recipient required");

        token          = IERC20(token_);
        wrappedPulse   = wrappedPulse_;
        pulseXRouter   = IPulseXRouter(pulseXRouter_);
        plsTreasury    = plsTreasury_;

        distributionRecipient   = distributionRecipient_;
        burnAddress             = burnAddress_;
        platformFeeRecipient    = platformFeeRecipient_;
        lpDistributionRecipient = lpDistributionRecipient_;

        // 5% total fee split (matches Keno / Plinko)
        distributionFeeBps   = 125;
        burnFeeBps           = 50;
        platformFeeBps       = 175;
        lpDistributionFeeBps = 150;

        maxBetPerSpin = 500_000 * 10**18; // 500k MORBIUS default cap across all bets
    }

    // ============ Player Actions ============

    /**
     * @notice Spin the roulette wheel with MORBIUS tokens.
     * @param bets Array of bets to place (1–MAX_BETS entries).
     */
    function spin(Bet[] calldata bets) external whenNotPaused nonReentrant {
        (uint256 totalWagered, uint256 spinId) = _validateAndSpin(bets, false);
        emit Spun(msg.sender, spinId, spins[spinId].result, totalWagered, spins[spinId].grossPayout, spins[spinId].netPayout, false);
    }

    /**
     * @notice Spin the roulette wheel using native PLS. PLS sent to treasury;
     *         MORBIUS payouts pulled from treasury.
     * @param bets Array of bets to place (1–MAX_BETS entries).
     */
    function spinWithPLS(Bet[] calldata bets) external payable whenNotPaused nonReentrant {
        require(msg.value > 0, "No PLS sent");
        (uint256 totalWagered, uint256 spinId) = _validateAndSpin(bets, true);
        emit Spun(msg.sender, spinId, spins[spinId].result, totalWagered, spins[spinId].grossPayout, spins[spinId].netPayout, true);
    }

    // ============ Internal Spin Logic ============

    function _validateAndSpin(
        Bet[] calldata bets,
        bool paidWithPLS
    ) internal returns (uint256 totalWagered, uint256 spinId) {
        if (bets.length == 0) revert NoBets();
        if (bets.length > MAX_BETS) revert TooManyBets();

        // Sum and validate individual bets
        for (uint256 i = 0; i < bets.length; i++) {
            if (bets[i].wager < MIN_BET) revert BetWagerTooLow();
            _validateBet(bets[i]);
            totalWagered += bets[i].wager;
        }
        if (maxBetPerSpin > 0 && totalWagered > maxBetPerSpin) revert TotalWagerTooHigh();

        // Determine effective MORBIUS wager (PLS path converts)
        uint256 morbiusWagered = totalWagered;
        if (paidWithPLS) {
            address[] memory path = new address[](2);
            path[0] = wrappedPulse;
            path[1] = address(token);
            uint256[] memory amounts = pulseXRouter.getAmountsOut(msg.value, path);
            morbiusWagered = amounts[1];
            if (morbiusWagered < MIN_BET) revert BetWagerTooLow();

            // Forward PLS to treasury
            (bool sent, ) = plsTreasury.call{value: msg.value}("");
            require(sent, "PLS transfer failed");
        } else {
            // Pull MORBIUS from player
            token.safeTransferFrom(msg.sender, address(this), morbiusWagered);
        }

        // Collect and distribute fees from wager
        (uint256 netWagered, uint256 feeDist, uint256 feeBurn, uint256 feePlatform, uint256 feeLp) =
            _computeFees(morbiusWagered);

        _distributeFees(feeDist, feeBurn, feePlatform, feeLp, paidWithPLS);

        if (!paidWithPLS) {
            contractReserve += netWagered;
        } else {
            // Pull net wager MORBIUS from treasury into reserve
            uint256 totalFee = feeDist + feeBurn + feePlatform + feeLp;
            if (totalFee > 0) {
                token.safeTransferFrom(plsTreasury, address(this), totalFee + netWagered);
            } else {
                token.safeTransferFrom(plsTreasury, address(this), netWagered);
            }
            contractReserve += netWagered;
        }

        // Spin the wheel
        uint8 result = _spin(globalSpinCount);

        // Score all bets and sum gross payout
        // Scale each bet's wager proportionally to the net-wager ratio
        uint256 grossPayout = 0;
        uint256 feeRatio = (morbiusWagered > 0) ? netWagered * 1e18 / morbiusWagered : 0;

        // Build compact storage arrays
        spinId = nextSpinId++;
        Spin storage s = spins[spinId];
        s.player      = msg.sender;
        s.result      = result;
        s.totalWagered = morbiusWagered;
        s.timestamp   = uint64(block.timestamp);
        s.paidWithPLS = paidWithPLS;
        s.betCount    = uint8(bets.length);

        for (uint256 i = 0; i < bets.length; i++) {
            // Scale individual bet wager to net ratio
            uint256 netBetWager = bets[i].wager * feeRatio / 1e18;
            bool won = _isBetWinner(bets[i], result);
            uint256 betPayout = 0;
            if (won) {
                betPayout = netBetWager * (_payoutMultiplier(bets[i].betType) + 1);
                grossPayout += betPayout;
            }

            s.betTypes[i]  = uint8(bets[i].betType);
            s.betParams[i] = bets[i].param;
            s.betWagers[i] = bets[i].wager;
            s.betWon[i]    = won;
        }

        s.grossPayout = grossPayout;
        s.netPayout   = grossPayout;

        // Pay player if they won
        if (grossPayout > 0) {
            if (contractReserve < grossPayout) revert InsufficientContractBalance();
            contractReserve -= grossPayout;
            if (paidWithPLS) {
                token.safeTransferFrom(plsTreasury, msg.sender, grossPayout);
            } else {
                token.safeTransfer(msg.sender, grossPayout);
            }
        }

        // Update stats
        playerSpins[msg.sender].push(spinId);
        playerSpinCount[msg.sender]++;
        playerTotalWagered[msg.sender] += morbiusWagered;
        globalSpinCount++;
        globalTotalWagered += morbiusWagered;

        if (grossPayout > 0) {
            playerTotalWon[msg.sender] += grossPayout;
            playerWinCount[msg.sender]++;
            if (grossPayout > playerBiggestWin[msg.sender]) {
                playerBiggestWin[msg.sender] = grossPayout;
            }
            globalTotalWon += grossPayout;
        }
    }

    // ============ RNG ============

    /**
     * @notice Generate wheel result 0–36 using blockhash + multi-source entropy.
     *         Same approach as CryptoKeno and Plinko.
     */
    function _spin(uint256 nonce) internal view returns (uint8) {
        uint256 seed = uint256(keccak256(abi.encodePacked(
            blockhash(block.number - 1),
            block.timestamp,
            msg.sender,
            nonce,
            tx.gasprice
        )));
        return uint8(seed % WHEEL_NUMBERS); // 0–36
    }

    // ============ Bet Validation & Scoring ============

    function _validateBet(Bet calldata bet) internal pure {
        BetType t = bet.betType;

        if (t == BetType.STRAIGHT) {
            // Single number 0–36
            if (bet.numbers.length != 1) revert InvalidBetNumbers();
            if (bet.numbers[0] > 36)      revert InvalidBetNumbers();

        } else if (t == BetType.SPLIT) {
            // Two adjacent numbers; caller passes both; we verify both in [0,36]
            if (bet.numbers.length != 2) revert InvalidBetNumbers();
            if (bet.numbers[0] > 36 || bet.numbers[1] > 36) revert InvalidBetNumbers();
            if (bet.numbers[0] == bet.numbers[1])            revert InvalidBetNumbers();

        } else if (t == BetType.STREET) {
            // Three consecutive numbers in a row (e.g., 1,2,3)
            if (bet.numbers.length != 3) revert InvalidBetNumbers();
            for (uint256 i = 0; i < 3; i++) {
                if (bet.numbers[i] == 0 || bet.numbers[i] > 36) revert InvalidBetNumbers();
            }

        } else if (t == BetType.CORNER) {
            // Four numbers sharing a corner
            if (bet.numbers.length != 4) revert InvalidBetNumbers();
            for (uint256 i = 0; i < 4; i++) {
                if (bet.numbers[i] == 0 || bet.numbers[i] > 36) revert InvalidBetNumbers();
            }

        } else if (t == BetType.LINE) {
            // Six numbers (two rows of three)
            if (bet.numbers.length != 6) revert InvalidBetNumbers();
            for (uint256 i = 0; i < 6; i++) {
                if (bet.numbers[i] == 0 || bet.numbers[i] > 36) revert InvalidBetNumbers();
            }

        } else if (t == BetType.COLUMN) {
            // param: 0 = col 1 (1,4,7,...,34), 1 = col 2 (2,5,...,35), 2 = col 3 (3,6,...,36)
            if (bet.param > 2) revert InvalidBetParam();
            if (bet.numbers.length != 0) revert InvalidBetNumbers();

        } else if (t == BetType.DOZEN) {
            // param: 0 = 1-12, 1 = 13-24, 2 = 25-36
            if (bet.param > 2) revert InvalidBetParam();
            if (bet.numbers.length != 0) revert InvalidBetNumbers();

        } else if (t == BetType.RED_BLACK) {
            // param: 0 = red, 1 = black
            if (bet.param > 1) revert InvalidBetParam();
            if (bet.numbers.length != 0) revert InvalidBetNumbers();

        } else if (t == BetType.EVEN_ODD) {
            // param: 0 = even, 1 = odd
            if (bet.param > 1) revert InvalidBetParam();
            if (bet.numbers.length != 0) revert InvalidBetNumbers();

        } else {
            // LOW_HIGH — param: 0 = low (1-18), 1 = high (19-36)
            if (bet.param > 1) revert InvalidBetParam();
            if (bet.numbers.length != 0) revert InvalidBetNumbers();
        }
    }

    function _isBetWinner(Bet calldata bet, uint8 result) internal pure returns (bool) {
        BetType t = bet.betType;

        if (t == BetType.STRAIGHT) {
            return result == bet.numbers[0];

        } else if (t == BetType.SPLIT || t == BetType.STREET || t == BetType.CORNER || t == BetType.LINE) {
            for (uint256 i = 0; i < bet.numbers.length; i++) {
                if (result == bet.numbers[i]) return true;
            }
            return false;

        } else if (t == BetType.COLUMN) {
            if (result == 0) return false;
            return (result % 3) == ((bet.param + 1) % 3);

        } else if (t == BetType.DOZEN) {
            if (result == 0) return false;
            uint8 dozen = (result - 1) / 12; // 0, 1, or 2
            return dozen == bet.param;

        } else if (t == BetType.RED_BLACK) {
            if (result == 0) return false;
            return _isRed(result) == (bet.param == 0);

        } else if (t == BetType.EVEN_ODD) {
            if (result == 0) return false;
            bool isEven = (result % 2 == 0);
            return isEven == (bet.param == 0);

        } else {
            // LOW_HIGH
            if (result == 0) return false;
            bool isLow = (result <= 18);
            return isLow == (bet.param == 0);
        }
    }

    /**
     * @notice Standard European roulette red numbers.
     *         Red: 1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36
     */
    function _isRed(uint8 n) internal pure returns (bool) {
        if (n ==  1 || n ==  3 || n ==  5 || n ==  7 || n ==  9) return true;
        if (n == 12 || n == 14 || n == 16 || n == 18)             return true;
        if (n == 19 || n == 21 || n == 23 || n == 25 || n == 27)  return true;
        if (n == 30 || n == 32 || n == 34 || n == 36)             return true;
        return false;
    }

    function _payoutMultiplier(BetType t) internal pure returns (uint256) {
        if (t == BetType.STRAIGHT)  return PAYOUT_STRAIGHT;
        if (t == BetType.SPLIT)     return PAYOUT_SPLIT;
        if (t == BetType.STREET)    return PAYOUT_STREET;
        if (t == BetType.CORNER)    return PAYOUT_CORNER;
        if (t == BetType.LINE)      return PAYOUT_LINE;
        if (t == BetType.COLUMN)    return PAYOUT_COLUMN;
        if (t == BetType.DOZEN)     return PAYOUT_DOZEN;
        if (t == BetType.RED_BLACK) return PAYOUT_RED_BLACK;
        if (t == BetType.EVEN_ODD)  return PAYOUT_EVEN_ODD;
        return PAYOUT_LOW_HIGH;
    }

    // ============ Fee Helpers ============

    function _computeFees(uint256 wager)
        internal
        view
        returns (uint256 net, uint256 dist, uint256 burn, uint256 platform, uint256 lp)
    {
        dist     = wager * distributionFeeBps   / BPS_DENOM;
        burn     = wager * burnFeeBps           / BPS_DENOM;
        platform = wager * platformFeeBps       / BPS_DENOM;
        lp       = wager * lpDistributionFeeBps / BPS_DENOM;
        net      = wager - dist - burn - platform - lp;
    }

    function _distributeFees(
        uint256 feeDist,
        uint256 feeBurn,
        uint256 feePlatform,
        uint256 feeLp,
        bool fromTreasury
    ) internal {
        if (fromTreasury) {
            uint256 total = feeDist + feeBurn + feePlatform + feeLp;
            if (total > 0) token.safeTransferFrom(plsTreasury, address(this), total);
        }

        if (feeDist > 0) {
            token.safeTransfer(distributionRecipient, feeDist);
            totalDistributionFeesCollected += feeDist;
        }
        if (feeBurn > 0) {
            token.safeTransfer(burnAddress, feeBurn);
            totalBurnFeesCollected += feeBurn;
        }
        if (feePlatform > 0) {
            token.safeTransfer(platformFeeRecipient, feePlatform);
            totalPlatformFeesCollected += feePlatform;
        }
        if (feeLp > 0) {
            token.safeTransfer(lpDistributionRecipient, feeLp);
            totalLpDistributionFeesCollected += feeLp;
        }
    }

    // ============ View Helpers ============

    /**
     * @notice Fetch the last N spin IDs for a player (newest first).
     */
    function getPlayerSpins(address player, uint256 count)
        external
        view
        returns (uint256[] memory ids)
    {
        uint256[] storage allIds = playerSpins[player];
        uint256 total = allIds.length;
        uint256 n = count > total ? total : count;
        ids = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            ids[i] = allIds[total - 1 - i];
        }
    }

    /**
     * @notice Check if a number is red (view wrapper for frontend).
     */
    function isRed(uint8 n) external pure returns (bool) {
        return _isRed(n);
    }

    // ============ Owner / Admin ============

    /**
     * @notice Fund the contract reserve with MORBIUS.
     */
    function fund(uint256 amount) external onlyOwner {
        token.safeTransferFrom(msg.sender, address(this), amount);
        contractReserve += amount;
        emit ContractFunded(msg.sender, amount);
    }

    function emergencyWithdraw() external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        contractReserve = 0;
        token.safeTransfer(msg.sender, balance);
        emit EmergencyWithdraw(balance);
    }

    function setMaxBetPerSpin(uint256 max_) external onlyOwner {
        maxBetPerSpin = max_;
        emit MaxBetUpdated(max_);
    }

    function setPlsTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "zero address");
        plsTreasury = treasury_;
        emit PlsTreasuryUpdated(treasury_);
    }

    function setDistributionFee(uint256 bps_, address recipient_) external onlyOwner {
        require(recipient_ != address(0), "zero address");
        distributionFeeBps    = bps_;
        distributionRecipient = recipient_;
        emit DistributionFeeUpdated(bps_, recipient_);
    }

    function setBurnFee(uint256 bps_, address burnAddr_) external onlyOwner {
        require(burnAddr_ != address(0), "zero address");
        burnFeeBps  = bps_;
        burnAddress = burnAddr_;
        emit BurnFeeUpdated(bps_, burnAddr_);
    }

    function setPlatformFee(uint256 bps_, address recipient_) external onlyOwner {
        require(recipient_ != address(0), "zero address");
        platformFeeBps       = bps_;
        platformFeeRecipient = recipient_;
        emit PlatformFeeUpdated(bps_, recipient_);
    }

    function setLpDistributionFee(uint256 bps_, address recipient_) external onlyOwner {
        require(recipient_ != address(0), "zero address");
        lpDistributionFeeBps    = bps_;
        lpDistributionRecipient = recipient_;
        emit LpDistributionFeeUpdated(bps_, recipient_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    receive() external payable {}
}
