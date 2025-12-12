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
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function getAmountsIn(
        uint256 amountOut,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);
}

interface IWrappedPulse is IERC20 {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}

interface IRandomProvider {
    function requestRandomness(uint256 roundId) external returns (bytes32);
}

/**
 * @title Crypto Keno (Bankrolled 20-of-80 Club Keno style)
 * @notice On-chain 20-of-80 Keno with 1-10 spots, consecutive draws, multiplier and Bulls-Eye add-ons, bankrolled payout caps.
 * @dev Mirrors keno-logic.md: numbers 1..80, draw 20 unique; players choose spots, wager per draw, optional add-ons, multi-draw tickets.
 *      Progressive is removed for MVP; payouts come from per-round bankroll built from ticket net proceeds (post-fee).
 */
contract CryptoKeno is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    uint8 public constant NUMBERS = 80;
    uint8 public constant DRAWN = 20;
    uint8 public constant PLUS3_DRAWN = 3;
    uint8 public constant MIN_SPOT = 1;
    uint16 public constant ADDON_MULTIPLIER = 1 << 0;
    uint16 public constant ADDON_BULLSEYE = 1 << 1;
    uint16 public constant ADDON_PLUS3 = 1 << 2;
    uint16 public constant ADDON_PROGRESSIVE = 1 << 3;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    // ============ Enums ============

    enum RoundState {
        OPEN,
        CLOSED,
        FINALIZED
    }

    // ============ Structs ============

    struct Round {
        uint256 id;
        uint64 startTime;
        uint64 endTime;
        RoundState state;
        bytes32 requestId; // Optional VRF/adapter request id
        bytes32 randomSeed; // Final randomness used for draws
        uint8 bullsEyeIndex;
        uint8 bullsEyeNumber;
        uint8[DRAWN] winningNumbers;
        uint8[PLUS3_DRAWN] plus3Numbers; // 3 additional numbers for Plus 3 add-on
        uint256 drawnMultiplier; // Round-level multiplier outcome for multiplier add-on (unused when multiplier disabled)
        uint256 totalBaseWager;
        uint256 poolBalance; // Available bankroll for this round's payouts
        uint256 totalMultiplierAddon;
        uint256 totalBullsEyeAddon;
        uint256 totalPlus3Addon;
        uint256 totalProgressiveAddon;
        uint256[] progressiveWinners; // Ticket IDs that won progressive this round
    }

    struct Ticket {
        address player;
        uint64 firstRoundId;
        uint8 draws; // Total draws purchased for this ticket
        uint8 spotSize;
        uint16 addons; // Bitmask of enabled add-ons
        uint8 drawsRemaining;
        uint256 wagerPerDraw;
        uint256 numbersBitmap; // Packed set of chosen numbers (bit i represents number i+1)
    }

    // ============ State Variables ============

    IERC20 public immutable token;
    IWrappedPulse public immutable wrappedPulse;
    IPulseXRouter public immutable pulseXRouter;
    uint8 public immutable maxSpot; // Configurable upper bound, default 10
    uint256 public roundDuration; // Seconds per draw cadence
    uint256 public currentRoundId;
    uint256 public nextTicketId = 1;
    uint256 public feeBps; // Protocol fee on gross ticket cost
    address public feeRecipient;
    IRandomProvider public randomnessProvider; // Optional VRF/adapter
    uint256 public maxWagerPerDraw; // owner-configured cap to bound liability
    uint256 public multiplierCostPerDraw;
    uint256 public bullsEyeCostPerDraw;
    uint256 public progressiveCostPerDraw;
    uint256[] public multiplierValues;
    uint256[] public multiplierWeights; // Sum defines distribution

    // Pulse Progressive Jackpot
    uint256 public progressivePool;        // Current jackpot amount
    uint256 public progressiveBaseSeed;    // Reset value after win
    uint256 public progressiveFeeBps;      // % of progressive fee that goes to pool (e.g., 8500 = 85%)
    uint256 public progressiveTotalCollected; // Lifetime contributions
    uint256 public progressiveTotalPaid;      // Lifetime payouts
    uint256 public progressiveWinCount;       // Number of jackpot wins
    uint256 public lastProgressiveWinRound;   // Round ID of last win

    // Paytable: paytable[spot][hits] = multiplier
    mapping(uint8 => uint256[16]) public paytable; // Support up to spotSize <= 15 if desired
    // Bulls-Eye paytable mirrors base structure
    mapping(uint8 => uint256[16]) public bullsEyePaytable;

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => Ticket) public tickets;
    mapping(uint256 => uint256[]) public ticketsByRound; // roundId => ticketIds participating in that draw
    mapping(uint256 => mapping(uint256 => bool)) public claimed; // roundId => ticketId => claimed
    mapping(uint256 => bytes32) public committedHash; // For commit-reveal seeds
    mapping(uint256 => bytes32) public revealedSeed; // Revealed seed value (preimage)

    // Player Statistics
    mapping(address => uint256[]) public playerTickets; // player => all their ticket IDs
    mapping(address => uint256) public playerTotalWagered; // Lifetime wagered
    mapping(address => uint256) public playerTotalWon; // Lifetime winnings
    mapping(address => uint256) public playerTicketCount; // Total tickets bought
    mapping(address => uint256) public playerWinCount; // Total winning claims

    // Global Statistics
    uint256 public globalTotalWagered;
    uint256 public globalTotalWon;
    uint256 public globalTicketCount;

    // Burn accumulator
    uint256 public burnThreshold = 100_000 * 1e18; // 100k token threshold
    uint256 public pendingBurnToken;

    // Auto-claim feature
    mapping(address => bool) public autoClaimEnabled;

    // Claim deadline
    uint256 public constant CLAIM_DEADLINE = 180 days;

    // ============ Events ============

    event RoundStarted(uint256 indexed roundId, uint64 startTime, uint64 endTime);
    event TicketPurchased(
        address indexed player,
        uint256 indexed ticketId,
        uint256 indexed firstRoundId,
        uint8 draws,
        uint8 spotSize,
        uint16 addons,
        uint256 wagerPerDraw,
        uint256 grossCost
    );
    event RoundClosed(uint256 indexed roundId);
    event RoundRandomnessRequested(uint256 indexed roundId, bytes32 requestId);
    event RandomnessCommitted(uint256 indexed roundId, bytes32 commitment);
    event RandomnessRevealed(uint256 indexed roundId, bytes32 seed);
    event RoundFinalized(
        uint256 indexed roundId,
        uint8[DRAWN] winningNumbers,
        uint8 bullsEyeIndex,
        uint256 multiplierOutcome
    );
    event PrizeClaimed(
        uint256 indexed roundId,
        uint256 indexed ticketId,
        address indexed player,
        uint256 basePrize,
        uint256 bullsEyePrize,
        uint256 multiplierApplied,
        uint256 paidPrize
    );
    event PrizeShortfall(uint256 indexed roundId, uint256 indexed ticketId, uint256 owed, uint256 paid);
    event PaytableUpdated(uint8 spotSize, uint8 hits, uint256 multiplier);
    event BullsEyePaytableUpdated(uint8 spotSize, uint8 hits, uint256 multiplier);
    event MultiplierDistributionUpdated(uint256[] values, uint256[] weights);
    event AddonCostsUpdated(uint256 multiplierCost, uint256 bullsEyeCost);
    event FeeUpdated(uint256 feeBps, address recipient);
    event RandomnessProviderUpdated(address provider);
    event RoundDurationUpdated(uint256 newDuration);
    event MaxWagerUpdated(uint256 maxWagerPerDraw);
    event AutoClaimEnabled(address indexed player, bool enabled);
    event AutoClaimProcessed(uint256 indexed roundId, uint256 indexed ticketId, address indexed player, uint256 prize);
    event ProgressiveWon(
        uint256 indexed roundId,
        uint256 indexed ticketId,
        address indexed player,
        uint256 jackpotAmount,
        uint256 shareAmount
    );
    event ProgressivePoolUpdated(uint256 newAmount, uint256 totalCollected);
    event ProgressiveConfigUpdated(uint256 baseSeed, uint256 costPerDraw, uint256 feeBps);
    event BurnExecuted(uint256 amount);
    event BurnThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);

    // ============ Errors ============

    error InvalidSpotSize();
    error InvalidNumbers();
    error RoundNotOpen();
    error RoundNotFinalized();
    error AlreadyClaimed();
    error InvalidAddonFlags();
    error RoundStillActive();
    error RandomnessNotReady();
    error RoundAlreadyFinalized();
    error ZeroWeightDistribution();
    error WagerTooHigh();
    error ClaimExpired();

    // ============ Constructor ============

    constructor(
        address token_,
        uint8 maxSpot_,
        uint256 roundDuration_,
        uint256 feeBps_,
        address feeRecipient_,
        uint256 /* progressiveBaseSeed_ */, // kept for signature compatibility
        address wrappedPulse_,
        address pulseXRouter_
    ) Ownable(msg.sender) {
        require(token_ != address(0), "token required");
        require(feeRecipient_ != address(0), "fee recipient required");
        require(maxSpot_ >= MIN_SPOT && maxSpot_ <= 20, "maxSpot bounds");
        require(wrappedPulse_ != address(0), "wrapped PLS required");
        require(pulseXRouter_ != address(0), "router required");
        token = IERC20(token_);
        wrappedPulse = IWrappedPulse(wrappedPulse_);
        pulseXRouter = IPulseXRouter(pulseXRouter_);
        maxSpot = maxSpot_;
        roundDuration = roundDuration_; // configurable cadence
        feeBps = feeBps_;
        feeRecipient = feeRecipient_;
        maxWagerPerDraw = 0.001 ether; // lower default cap for testing; adjust via setter post-deploy
        // Default add-on pricing: multiplier ~0.0005, Bulls-Eye ~0.00025 (18-dec WPLS assumed)
        multiplierCostPerDraw = 0.0005 ether;
        bullsEyeCostPerDraw = 0.00025 ether;

        // Pulse Progressive defaults
        progressiveCostPerDraw = 0.001 ether; // 1 token per draw
        progressiveBaseSeed = 100_000 ether; // 100k tokens starting jackpot
        progressivePool = progressiveBaseSeed; // Initialize pool
        progressiveFeeBps = 8500; // 85% to pool, 15% to protocol

        _initDefaultPaytables();
        _initDefaultMultiplierDistribution();
        _startFirstRound();
    }

    // ============ Modifiers ============

    modifier onlyExistingRound(uint256 roundId) {
        require(rounds[roundId].id != 0, "round missing");
        _;
    }

    // ============ External Admin ============

    function setPaytable(uint8 spotSize, uint8 hits, uint256 multiplier_) external onlyOwner {
        require(spotSize >= MIN_SPOT && spotSize <= maxSpot, "spot out of range");
        require(hits <= spotSize, "hits out of range");
        paytable[spotSize][hits] = multiplier_;
        emit PaytableUpdated(spotSize, hits, multiplier_);
    }

    function setBullsEyePaytable(uint8 spotSize, uint8 hits, uint256 multiplier_) external onlyOwner {
        require(spotSize >= MIN_SPOT && spotSize <= maxSpot, "spot out of range");
        require(hits <= spotSize, "hits out of range");
        bullsEyePaytable[spotSize][hits] = multiplier_;
        emit BullsEyePaytableUpdated(spotSize, hits, multiplier_);
    }

    function setMultiplierDistribution(uint256[] calldata values, uint256[] calldata weights) external onlyOwner {
        require(values.length == weights.length, "length mismatch");
        uint256 totalWeight;
        for (uint256 i = 0; i < weights.length; i++) {
            totalWeight += weights[i];
        }
        if (totalWeight == 0) revert ZeroWeightDistribution();
        multiplierValues = values;
        multiplierWeights = weights;
        emit MultiplierDistributionUpdated(values, weights);
    }

    function setAddonCosts(uint256 multiplierCost, uint256 bullsEyeCost) external onlyOwner {
        multiplierCostPerDraw = multiplierCost;
        bullsEyeCostPerDraw = bullsEyeCost;
        emit AddonCostsUpdated(multiplierCost, bullsEyeCost);
    }

    function setFee(uint256 feeBps_, address recipient) external onlyOwner {
        require(recipient != address(0), "recipient required");
        require(feeBps_ <= BPS_DENOMINATOR, "fee too high");
        feeBps = feeBps_;
        feeRecipient = recipient;
        emit FeeUpdated(feeBps_, recipient);
    }

    function setRandomnessProvider(address provider) external onlyOwner {
        randomnessProvider = IRandomProvider(provider);
        emit RandomnessProviderUpdated(provider);
    }

    function setRoundDuration(uint256 newDuration) external onlyOwner {
        roundDuration = newDuration;
        emit RoundDurationUpdated(newDuration);
    }

    function setMaxWagerPerDraw(uint256 maxWager) external onlyOwner {
        maxWagerPerDraw = maxWager;
        emit MaxWagerUpdated(maxWager);
    }

    function setProgressiveConfig(
        uint256 baseSeed,
        uint256 costPerDraw,
        uint256 feeBps_
    ) external onlyOwner {
        require(feeBps_ <= BPS_DENOMINATOR, "fee too high");
        progressiveBaseSeed = baseSeed;
        progressiveCostPerDraw = costPerDraw;
        progressiveFeeBps = feeBps_;
        emit ProgressiveConfigUpdated(baseSeed, costPerDraw, feeBps_);
    }

    function seedProgressivePool(uint256 amount) external onlyOwner {
        token.safeTransferFrom(msg.sender, address(this), amount);
        progressivePool += amount;
        emit ProgressivePoolUpdated(progressivePool, progressiveTotalCollected);
    }

    function startNextRound() external whenNotPaused onlyOwner {
        _finalizeIfExpired(currentRoundId);

        uint256 nextRoundId = currentRoundId + 1;

        // Check if next round already exists (from multi-draw tickets)
        if (rounds[nextRoundId].id != 0) {
            // Round exists but may be uninitialized (timestamps = 0)
            // Fix the timestamps if they're not set
            if (rounds[nextRoundId].startTime == 0) {
                uint64 start = uint64(block.timestamp);
                rounds[nextRoundId].startTime = start;
                rounds[nextRoundId].endTime = uint64(block.timestamp + roundDuration);
            }
            currentRoundId = nextRoundId;
            emit RoundStarted(nextRoundId, rounds[nextRoundId].startTime, rounds[nextRoundId].endTime);
        } else {
            // Round doesn't exist, create it
            _startNewRound(nextRoundId, block.timestamp);
        }
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function withdrawBankroll(uint256 amount, address to) external onlyOwner nonReentrant {
        require(to != address(0), "zero address");
        token.safeTransfer(to, amount);
    }

    /**
     * @notice Reclaim unclaimed prizes from expired rounds back to contract pool
     * @param roundId Round to reclaim from
     */
    function reclaimExpiredPrizes(uint256 roundId) external onlyOwner nonReentrant onlyExistingRound(roundId) {
        Round storage roundInfo = rounds[roundId];
        require(roundInfo.state == RoundState.FINALIZED, "not finalized");
        require(block.timestamp > roundInfo.endTime + CLAIM_DEADLINE, "not expired");

        // Unclaimed prizes remain in poolBalance, nothing to do
        // This function exists for transparency and potential future enhancements
    }

    // ============ Player Actions ============

    /**
     * @notice Buy a ticket for the given round and consecutive draws.
     * @param roundId Round to start playing.
     * @param numbers Player picks (length == spotSize, unique ints in [1,80]).
     * @param spotSize Number of spots (1-10).
     * @param draws Number of consecutive draws (e.g. 1-20).
     * @param addons Bitmask of enabled add-ons (Multiplier, Bulls-Eye).
     * @param wagerPerDraw Base wager per draw.
     */
    function buyTicket(
        uint256 roundId,
        uint8[] calldata numbers,
        uint8 spotSize,
        uint8 draws,
        uint16 addons,
        uint256 wagerPerDraw
    ) external whenNotPaused nonReentrant onlyExistingRound(roundId) {
        roundId = _ensureOpenRound(roundId);
        if (spotSize < MIN_SPOT || spotSize > maxSpot) revert InvalidSpotSize();
        if (draws == 0) revert InvalidNumbers();
        if (maxWagerPerDraw > 0 && wagerPerDraw > maxWagerPerDraw) revert WagerTooHigh();
        _ensureFutureRounds(roundId, draws);
        _validateAddonFlags(addons);

        uint256 numbersBitmap = _packNumbers(numbers, spotSize);

        uint256 addonCostPerDraw = _addonCost(addons, wagerPerDraw);
        uint256 grossPerDraw = wagerPerDraw + addonCostPerDraw;
        uint256 feePerDraw = (grossPerDraw * feeBps) / BPS_DENOMINATOR;
        uint256 netPerDraw = grossPerDraw - feePerDraw;
        uint256 gross = grossPerDraw * draws;
        uint256 fee = feePerDraw * draws;
        uint256 net = netPerDraw * draws;

        _accrueBurn(fee);
        token.safeTransferFrom(msg.sender, address(this), net);

        uint256 ticketId = nextTicketId++;
        tickets[ticketId] = Ticket({
            player: msg.sender,
            firstRoundId: uint64(roundId),
            draws: draws,
            spotSize: spotSize,
            addons: addons,
            drawsRemaining: draws,
            wagerPerDraw: wagerPerDraw,
            numbersBitmap: numbersBitmap
        });

        // Track participation per round for claims/analytics
        for (uint256 i = 0; i < draws; i++) {
            uint256 rid = roundId + i;
            ticketsByRound[rid].push(ticketId);
            Round storage r = rounds[rid];
            r.totalBaseWager += wagerPerDraw;
            if ((addons & ADDON_MULTIPLIER) != 0) {
                r.totalMultiplierAddon += multiplierCostPerDraw;
            }
            if ((addons & ADDON_BULLSEYE) != 0) {
                r.totalBullsEyeAddon += bullsEyeCostPerDraw;
            }
            if ((addons & ADDON_PLUS3) != 0) {
                r.totalPlus3Addon += wagerPerDraw; // Plus 3 costs same as base wager (doubles it)
            }
            if ((addons & ADDON_PROGRESSIVE) != 0) {
                r.totalProgressiveAddon += progressiveCostPerDraw;
                // Add portion to progressive pool
                uint256 toPool = (progressiveCostPerDraw * progressiveFeeBps) / BPS_DENOMINATOR;
                progressivePool += toPool;
                progressiveTotalCollected += toPool;
            }
            r.poolBalance += netPerDraw;
        }

        // Update player statistics
        playerTickets[msg.sender].push(ticketId);
        playerTicketCount[msg.sender]++;
        playerTotalWagered[msg.sender] += gross;

        // Update global statistics
        globalTicketCount++;
        globalTotalWagered += gross;

        emit TicketPurchased(
            msg.sender,
            ticketId,
            roundId,
            draws,
            spotSize,
            addons,
            wagerPerDraw,
            gross
        );
    }

    /**
     * @notice Buy a ticket using native PLS (wraps to WPLS then swaps to the game token)
     * @dev Uses router getAmountsIn to determine required WPLS for the gross cost, refunds any excess PLS.
     */
    function buyTicketWithPLS(
        uint256 roundId,
        uint8[] calldata numbers,
        uint8 spotSize,
        uint8 draws,
        uint16 addons,
        uint256 wagerPerDraw
    ) external payable whenNotPaused nonReentrant onlyExistingRound(roundId) {
        roundId = _ensureOpenRound(roundId);
        if (spotSize < MIN_SPOT || spotSize > maxSpot) revert InvalidSpotSize();
        if (draws == 0) revert InvalidNumbers();
        if (maxWagerPerDraw > 0 && wagerPerDraw > maxWagerPerDraw) revert WagerTooHigh();
        _ensureFutureRounds(roundId, draws);
        _validateAddonFlags(addons);

        uint256 numbersBitmap = _packNumbers(numbers, spotSize);

        uint256 addonCostPerDraw = _addonCost(addons, wagerPerDraw);
        uint256 grossPerDraw = wagerPerDraw + addonCostPerDraw;
        uint256 feePerDraw = (grossPerDraw * feeBps) / BPS_DENOMINATOR;
        uint256 netPerDraw = grossPerDraw - feePerDraw;
        uint256 gross = grossPerDraw * draws;
        uint256 fee = feePerDraw * draws;
        address[] memory path = new address[](2);
        path[0] = address(wrappedPulse);
        path[1] = address(token);
        uint256[] memory amountsIn = pulseXRouter.getAmountsIn(gross, path);
        uint256 wplsNeeded = amountsIn[0];

        require(msg.value >= wplsNeeded, "Insufficient PLS");

        wrappedPulse.deposit{value: wplsNeeded}();
        wrappedPulse.approve(address(pulseXRouter), wplsNeeded);

        uint256 tokenBefore = token.balanceOf(address(this));

        pulseXRouter.swapExactTokensForTokens(
            wplsNeeded,
            0, // allow any output; enforce below
            path,
            address(this),
            block.timestamp + 300
        );

        uint256 tokenReceived = token.balanceOf(address(this)) - tokenBefore;
        require(tokenReceived >= gross, "Swap underfunded");

        if (msg.value > wplsNeeded) {
            payable(msg.sender).transfer(msg.value - wplsNeeded);
        }

        if (fee > 0) {
            _accrueBurn(fee);
        }

        uint256 ticketId = nextTicketId++;
        tickets[ticketId] = Ticket({
            player: msg.sender,
            firstRoundId: uint64(roundId),
            draws: draws,
            spotSize: spotSize,
            addons: addons,
            drawsRemaining: draws,
            wagerPerDraw: wagerPerDraw,
            numbersBitmap: numbersBitmap
        });

        // Track participation per round for claims/analytics
        for (uint256 i = 0; i < draws; i++) {
            uint256 rid = roundId + i;
            ticketsByRound[rid].push(ticketId);
            Round storage r = rounds[rid];
            r.totalBaseWager += wagerPerDraw;
            if ((addons & ADDON_MULTIPLIER) != 0) {
                r.totalMultiplierAddon += multiplierCostPerDraw;
            }
            if ((addons & ADDON_BULLSEYE) != 0) {
                r.totalBullsEyeAddon += bullsEyeCostPerDraw;
            }
            if ((addons & ADDON_PLUS3) != 0) {
                r.totalPlus3Addon += wagerPerDraw; // Plus 3 costs same as base wager (doubles it)
            }
            if ((addons & ADDON_PROGRESSIVE) != 0) {
                r.totalProgressiveAddon += progressiveCostPerDraw;
                // Add portion to progressive pool
                uint256 toPool = (progressiveCostPerDraw * progressiveFeeBps) / BPS_DENOMINATOR;
                progressivePool += toPool;
                progressiveTotalCollected += toPool;
            }
            r.poolBalance += netPerDraw;
        }

        // Update player statistics
        playerTickets[msg.sender].push(ticketId);
        playerTicketCount[msg.sender]++;
        playerTotalWagered[msg.sender] += gross;

        // Update global statistics
        globalTicketCount++;
        globalTotalWagered += gross;

        emit TicketPurchased(
            msg.sender,
            ticketId,
            roundId,
            draws,
            spotSize,
            addons,
            wagerPerDraw,
            gross
        );
    }

    // ============ Round Lifecycle ============

    function finalizeRound(uint256 roundId) external whenNotPaused nonReentrant onlyExistingRound(roundId) {
        Round storage roundInfo = rounds[roundId];
        if (roundInfo.state == RoundState.FINALIZED) revert RoundAlreadyFinalized();
        if (block.timestamp < roundInfo.endTime) revert RoundStillActive();
        _finalizeRoundInternal(roundId, roundInfo);
    }

    function fulfillRandomness(uint256 roundId, bytes32 randomSeed) external {
        if (msg.sender != address(randomnessProvider)) revert RandomnessNotReady();
        Round storage roundInfo = rounds[roundId];
        require(roundInfo.state != RoundState.FINALIZED, "round done");
        roundInfo.randomSeed = randomSeed;
        _materializeResults(roundId);
    }

    function commitRandom(uint256 roundId, bytes32 commitment) external onlyOwner onlyExistingRound(roundId) {
        committedHash[roundId] = commitment;
        emit RandomnessCommitted(roundId, commitment);
    }

    function revealRandom(uint256 roundId, bytes32 seed) external onlyOwner onlyExistingRound(roundId) {
        require(committedHash[roundId] == keccak256(abi.encodePacked(seed)), "commit mismatch");
        revealedSeed[roundId] = seed;
        emit RandomnessRevealed(roundId, seed);
    }

    // ============ Claims ============

    function claim(uint256 roundId, uint256 ticketId) external whenNotPaused nonReentrant onlyExistingRound(roundId) {
        _processClaimInternal(roundId, ticketId, msg.sender);
    }

    /**
     * @notice Distribute progressive jackpot to winners after round is finalized
     * @dev Can be called by anyone, only works once per round with winners
     */
    function distributeProgressive(uint256 roundId) external whenNotPaused nonReentrant onlyExistingRound(roundId) {
        Round storage roundInfo = rounds[roundId];
        require(roundInfo.state == RoundState.FINALIZED, "not finalized");
        require(roundInfo.progressiveWinners.length > 0, "no winners");

        uint256 totalJackpot = progressivePool;
        uint256 winnerCount = roundInfo.progressiveWinners.length;
        uint256 sharePerWinner = totalJackpot / winnerCount;

        // Pay each winner their share
        for (uint256 i = 0; i < winnerCount; i++) {
            uint256 ticketId = roundInfo.progressiveWinners[i];
            Ticket storage ticket = tickets[ticketId];

            token.safeTransfer(ticket.player, sharePerWinner);

            playerTotalWon[ticket.player] += sharePerWinner;
            globalTotalWon += sharePerWinner;

            emit ProgressiveWon(roundId, ticketId, ticket.player, totalJackpot, sharePerWinner);
        }

        // Reset progressive pool to base seed
        progressiveTotalPaid += totalJackpot;
        progressiveWinCount++;
        lastProgressiveWinRound = roundId;
        progressivePool = progressiveBaseSeed;

        // Clear winners array to prevent double-payment
        delete roundInfo.progressiveWinners;

        emit ProgressivePoolUpdated(progressivePool, progressiveTotalCollected);
    }

    // ============ Views ============

    function getRound(uint256 roundId) external view returns (Round memory) {
        return rounds[roundId];
    }

    function getTicket(uint256 ticketId) external view returns (Ticket memory) {
        return tickets[ticketId];
    }

    function addonCost(uint16 addons, uint256 wagerPerDraw) external view returns (uint256) {
        _validateAddonFlags(addons);
        return _addonCost(addons, wagerPerDraw);
    }

    // ============ Player Statistics Views ============

    /**
     * @notice Get comprehensive statistics for a player
     * @param player Address of the player
     * @return totalWagered Total amount wagered lifetime
     * @return totalWon Total amount won lifetime
     * @return ticketCount Total tickets purchased
     * @return winCount Total winning claims
     * @return winRateBps Win rate in basis points (10000 = 100%)
     * @return netPnL Net profit/loss (can be negative, cast to int256)
     */
    function getPlayerStats(address player)
        external
        view
        returns (
            uint256 totalWagered,
            uint256 totalWon,
            uint256 ticketCount,
            uint256 winCount,
            uint256 winRateBps,
            int256 netPnL
        )
    {
        totalWagered = playerTotalWagered[player];
        totalWon = playerTotalWon[player];
        ticketCount = playerTicketCount[player];
        winCount = playerWinCount[player];
        winRateBps = ticketCount > 0 ? (winCount * 10000) / ticketCount : 0;
        netPnL = int256(totalWon) - int256(totalWagered);
    }

    /**
     * @notice Get global statistics
     */
    function getGlobalStats()
        external
        view
        returns (
            uint256 totalWagered,
            uint256 totalWon,
            uint256 ticketCount,
            uint256 activeRoundId
        )
    {
        return (globalTotalWagered, globalTotalWon, globalTicketCount, currentRoundId);
    }

    /**
     * @notice Get all ticket IDs for a player with pagination
     * @param player Player address
     * @param offset Starting index
     * @param limit Maximum number of results
     */
    function getPlayerTickets(
        address player,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory) {
        uint256[] storage allTickets = playerTickets[player];
        if (offset >= allTickets.length) {
            return new uint256[](0);
        }

        uint256 end = offset + limit;
        if (end > allTickets.length) {
            end = allTickets.length;
        }

        uint256 resultLength = end - offset;
        uint256[] memory result = new uint256[](resultLength);

        for (uint256 i = 0; i < resultLength; i++) {
            result[i] = allTickets[offset + i];
        }

        return result;
    }

    /**
     * @notice Get all player tickets (use with caution for players with many tickets)
     */
    function getAllPlayerTickets(address player) external view returns (uint256[] memory) {
        return playerTickets[player];
    }

    /**
     * @notice Check if a ticket is a winner for a specific round
     * @param ticketId Ticket ID
     * @param roundId Round ID
     * @return isWinner Whether the ticket won
     * @return prize Prize amount (0 if not a winner)
     */
    function isWinningTicket(uint256 ticketId, uint256 roundId)
        external
        view
        returns (bool isWinner, uint256 prize)
    {
        Round storage roundInfo = rounds[roundId];
        if (roundInfo.state != RoundState.FINALIZED) {
            return (false, 0);
        }

        Ticket storage ticket = tickets[ticketId];
        if (!_ticketCoversRound(ticket, roundId)) {
            return (false, 0);
        }

        bool hasPlus3 = (ticket.addons & ADDON_PLUS3) != 0;
        (uint256 hits, bool hasBullsEye) = _scoreTicket(
            ticket.numbersBitmap,
            roundInfo.winningNumbers,
            roundInfo.plus3Numbers,
            roundInfo.bullsEyeNumber,
            hasPlus3
        );

        uint256 basePrize = ticket.wagerPerDraw * paytable[ticket.spotSize][hits];
        uint256 bullsEyePrize = 0;
        if (hasBullsEye && (ticket.addons & ADDON_BULLSEYE) != 0) {
            bullsEyePrize = ticket.wagerPerDraw * bullsEyePaytable[ticket.spotSize][hits];
        }

        prize = basePrize + bullsEyePrize;

        if ((ticket.addons & ADDON_MULTIPLIER) != 0 && prize > 0) {
            uint256 multiplierApplied = roundInfo.drawnMultiplier == 0 ? 1 : roundInfo.drawnMultiplier;
            prize = prize * multiplierApplied;
        }

        isWinner = prize > 0;
    }

    /**
     * @notice Get unclaimed winnings for a player across all their tickets
     * @param player Player address
     * @return totalUnclaimed Total unclaimed prize amount
     */
    function getPlayerUnclaimedWinnings(address player) external view returns (uint256 totalUnclaimed) {
        uint256[] storage tickets_ = playerTickets[player];

        for (uint256 i = 0; i < tickets_.length; i++) {
            uint256 ticketId = tickets_[i];
            Ticket storage ticket = tickets[ticketId];

            // Check each round this ticket covers
            for (uint256 j = 0; j < ticket.draws; j++) {
                uint256 roundId = uint256(ticket.firstRoundId) + j;
                Round storage roundInfo = rounds[roundId];

                if (roundInfo.state == RoundState.FINALIZED && !claimed[roundId][ticketId]) {
                    bool hasPlus3 = (ticket.addons & ADDON_PLUS3) != 0;
                    (uint256 hits, bool hasBullsEye) = _scoreTicket(
                        ticket.numbersBitmap,
                        roundInfo.winningNumbers,
                        roundInfo.plus3Numbers,
                        roundInfo.bullsEyeNumber,
                        hasPlus3
                    );

                    uint256 basePrize = ticket.wagerPerDraw * paytable[ticket.spotSize][hits];
                    uint256 bullsEyePrize = 0;
                    if (hasBullsEye && (ticket.addons & ADDON_BULLSEYE) != 0) {
                        bullsEyePrize = ticket.wagerPerDraw * bullsEyePaytable[ticket.spotSize][hits];
                    }

                    uint256 prize = basePrize + bullsEyePrize;

                    if ((ticket.addons & ADDON_MULTIPLIER) != 0 && prize > 0) {
                        uint256 multiplierApplied = roundInfo.drawnMultiplier == 0 ? 1 : roundInfo.drawnMultiplier;
                        prize = prize * multiplierApplied;
                    }

                    totalUnclaimed += prize;
                }
            }
        }
    }

    /**
     * @notice Get multiple rounds at once for efficient frontend loading
     */
    function getRounds(uint256[] calldata roundIds) external view returns (Round[] memory) {
        Round[] memory results = new Round[](roundIds.length);
        for (uint256 i = 0; i < roundIds.length; i++) {
            results[i] = rounds[roundIds[i]];
        }
        return results;
    }

    /**
     * @notice Get multiple tickets at once
     */
    function getTickets(uint256[] calldata ticketIds) external view returns (Ticket[] memory) {
        Ticket[] memory results = new Ticket[](ticketIds.length);
        for (uint256 i = 0; i < ticketIds.length; i++) {
            results[i] = tickets[ticketIds[i]];
        }
        return results;
    }

    /**
     * @notice Get Pulse Progressive jackpot stats
     */
    function getProgressiveStats()
        external
        view
        returns (
            uint256 currentPool,
            uint256 baseSeed,
            uint256 costPerDraw,
            uint256 totalCollected,
            uint256 totalPaid,
            uint256 winCount,
            uint256 lastWinRound
        )
    {
        return (
            progressivePool,
            progressiveBaseSeed,
            progressiveCostPerDraw,
            progressiveTotalCollected,
            progressiveTotalPaid,
            progressiveWinCount,
            lastProgressiveWinRound
        );
    }

    // ============ Auto-Claim Feature ============

    /**
     * @notice Enable or disable auto-claim for the caller
     * @param enabled True to enable auto-claim
     */
    function setAutoClaim(bool enabled) external {
        autoClaimEnabled[msg.sender] = enabled;
        emit AutoClaimEnabled(msg.sender, enabled);
    }

    /**
     * @notice Batch claim multiple tickets at once
     * @param roundIds Array of round IDs
     * @param ticketIds Array of ticket IDs (must match roundIds length)
     */
    function claimMultiple(uint256[] calldata roundIds, uint256[] calldata ticketIds)
        external
        whenNotPaused
        nonReentrant
    {
        require(roundIds.length == ticketIds.length, "length mismatch");
        require(roundIds.length > 0, "empty arrays");

        for (uint256 i = 0; i < roundIds.length; i++) {
            _processClaimInternal(roundIds[i], ticketIds[i], msg.sender);
        }
    }

    // ============ Internal Logic ============

    function _finalizeRoundInternal(uint256 roundId, Round storage roundInfo) internal {
        if (roundInfo.state == RoundState.FINALIZED) return;
        if (roundInfo.state == RoundState.OPEN) {
            roundInfo.state = RoundState.CLOSED;
            emit RoundClosed(roundId);
        }
        if (roundInfo.randomSeed == bytes32(0)) {
            // VRF/provider path
            if (address(randomnessProvider) != address(0) && roundInfo.requestId == bytes32(0)) {
                roundInfo.requestId = randomnessProvider.requestRandomness(roundId);
                emit RoundRandomnessRequested(roundId, roundInfo.requestId);
                revert RandomnessNotReady();
            }
            // Commit-reveal path
            if (committedHash[roundId] != bytes32(0) && revealedSeed[roundId] != bytes32(0)) {
                roundInfo.randomSeed = revealedSeed[roundId];
            } else {
                // Blockhash fallback
                roundInfo.randomSeed = keccak256(
                    abi.encodePacked(blockhash(block.number - 1), roundId, roundInfo.totalBaseWager, ticketsByRound[roundId].length)
                );
            }
        }
        _materializeResults(roundId);
    }

    function _finalizeIfExpired(uint256 roundId) internal {
        Round storage r = rounds[roundId];
        if (r.id == 0 || r.state == RoundState.FINALIZED) return;
        if (block.timestamp < r.endTime) return;
        _finalizeRoundInternal(roundId, r);
    }

    function _ensureOpenRound(uint256 requestedRoundId) internal returns (uint256) {
        if (rounds[requestedRoundId].id == 0) {
            _ensureFutureRounds(requestedRoundId, 1);
        }
        _finalizeIfExpired(requestedRoundId);
        Round storage r = rounds[requestedRoundId];
        if (r.state == RoundState.OPEN && block.timestamp < r.endTime) {
            return requestedRoundId;
        }

        uint256 nextId = currentRoundId;
        if (rounds[nextId].id == 0) {
            nextId = requestedRoundId;
        }
        _finalizeIfExpired(nextId);
        if (rounds[nextId].state == RoundState.OPEN && block.timestamp < rounds[nextId].endTime) {
            return nextId;
        }
        nextId = nextId + 1;
        _startNewRound(nextId, block.timestamp);
        return nextId;
    }

    function _startFirstRound() internal {
        currentRoundId = 1;
        uint64 start = uint64(block.timestamp);
        uint64 end = uint64(block.timestamp + roundDuration);
        rounds[currentRoundId] = Round({
            id: currentRoundId,
            startTime: start,
            endTime: end,
            state: RoundState.OPEN,
            requestId: bytes32(0),
            randomSeed: bytes32(0),
            bullsEyeIndex: 0,
            bullsEyeNumber: 0,
            winningNumbers: _emptyWinning(),
            plus3Numbers: _emptyPlus3(),
            drawnMultiplier: 0,
            totalBaseWager: 0,
            poolBalance: 0,
            totalMultiplierAddon: 0,
            totalBullsEyeAddon: 0,
            totalPlus3Addon: 0,
            totalProgressiveAddon: 0,
            progressiveWinners: new uint256[](0)
        });
        emit RoundStarted(currentRoundId, start, end);
    }

    function _ensureFutureRounds(uint256 startingRoundId, uint8 draws) internal {
        for (uint256 i = 0; i < draws; i++) {
            uint256 rid = startingRoundId + i;
            if (rounds[rid].id == 0) {
                uint256 prevEnd = rounds[rid - 1].endTime;
                uint64 start = uint64(prevEnd < block.timestamp ? block.timestamp : prevEnd);
                uint64 end = uint64(uint256(start) + roundDuration);
                rounds[rid] = Round({
                    id: rid,
                    startTime: start,
                    endTime: end,
                    state: RoundState.OPEN,
                    requestId: bytes32(0),
                    randomSeed: bytes32(0),
                    bullsEyeIndex: 0,
                    bullsEyeNumber: 0,
                    winningNumbers: _emptyWinning(),
                    plus3Numbers: _emptyPlus3(),
                    drawnMultiplier: 0,
                    totalBaseWager: 0,
                    poolBalance: 0,
                    totalMultiplierAddon: 0,
                    totalBullsEyeAddon: 0,
                    totalPlus3Addon: 0,
                    totalProgressiveAddon: 0,
                    progressiveWinners: new uint256[](0)
                });
                emit RoundStarted(rid, start, end);
            }
        }
        // DO NOT update currentRoundId here - only update it when rounds are finalized
        // This prevents the round from jumping ahead when multi-draw tickets are purchased
    }

    function _startNewRound(uint256 newRoundId, uint256 startTime) internal {
        uint64 start = uint64(startTime);
        uint64 end = uint64(startTime + roundDuration);
        rounds[newRoundId] = Round({
            id: newRoundId,
            startTime: start,
            endTime: end,
            state: RoundState.OPEN,
            requestId: bytes32(0),
            randomSeed: bytes32(0),
            bullsEyeIndex: 0,
            bullsEyeNumber: 0,
            winningNumbers: _emptyWinning(),
            plus3Numbers: _emptyPlus3(),
            drawnMultiplier: 0,
            totalBaseWager: 0,
            poolBalance: 0,
            totalMultiplierAddon: 0,
            totalBullsEyeAddon: 0,
            totalPlus3Addon: 0,
            totalProgressiveAddon: 0,
            progressiveWinners: new uint256[](0)
        });
        currentRoundId = newRoundId;
        emit RoundStarted(newRoundId, start, end);
    }

    // ============ Burn Accumulator ============

    function _accrueBurn(uint256 amount) private {
        if (amount == 0) return;
        pendingBurnToken += amount;
        if (pendingBurnToken >= burnThreshold) {
            _flushBurn();
        }
    }

    function _flushBurn() private {
        uint256 amount = pendingBurnToken;
        if (amount == 0) return;
        pendingBurnToken = 0;
        token.safeTransfer(address(0x000000000000000000000000000000000000dEaD), amount);
        emit BurnExecuted(amount);
    }

    /**
     * @notice Manually flush the burn accumulator when threshold is met
     */
    function flushBurn() external nonReentrant {
        require(pendingBurnToken >= burnThreshold, "Below threshold");
        _flushBurn();
    }

    /**
     * @notice Update burn threshold (owner)
     */
    function updateBurnThreshold(uint256 newThreshold) external onlyOwner {
        require(newThreshold > 0, "Threshold must be > 0");
        uint256 old = burnThreshold;
        burnThreshold = newThreshold;
        emit BurnThresholdUpdated(old, newThreshold);
    }

    function _materializeResults(uint256 roundId) internal {
        Round storage roundInfo = rounds[roundId];
        require(roundInfo.randomSeed != bytes32(0), "seed missing");
        if (roundInfo.state == RoundState.FINALIZED) return;

        uint256 seed = uint256(roundInfo.randomSeed);
        uint8[DRAWN] memory winning = _drawNumbers(seed);
        roundInfo.winningNumbers = winning;
        roundInfo.bullsEyeIndex = uint8(seed % DRAWN);
        roundInfo.bullsEyeNumber = winning[roundInfo.bullsEyeIndex];
        roundInfo.drawnMultiplier = _drawMultiplier(seed);

        // Draw Plus 3 numbers (drawn from remaining numbers not in the original 20)
        roundInfo.plus3Numbers = _drawPlus3Numbers(seed, winning);

        roundInfo.state = RoundState.FINALIZED;
        emit RoundFinalized(roundId, winning, roundInfo.bullsEyeIndex, roundInfo.drawnMultiplier);

        // Process auto-claims for eligible tickets (gas-limited)
        _processAutoClaims(roundId);
    }

    function _processAutoClaims(uint256 roundId) internal {
        uint256[] storage ticketsInRound = ticketsByRound[roundId];
        uint256 gasLimit = 200000; // Reserve gas for finalization completion

        for (uint256 i = 0; i < ticketsInRound.length && gasleft() > gasLimit; i++) {
            uint256 ticketId = ticketsInRound[i];
            Ticket storage ticket = tickets[ticketId];

            if (autoClaimEnabled[ticket.player] && !claimed[roundId][ticketId]) {
                // Silently skip if auto-claim fails (don't revert entire finalization)
                try this._safeProcessClaim(roundId, ticketId, ticket.player) {
                    // Success - event emitted in _safeProcessClaim
                } catch {
                    // Failed auto-claim, player can manually claim later
                }
            }
        }
    }

    function _safeProcessClaim(uint256 roundId, uint256 ticketId, address player) external {
        require(msg.sender == address(this), "internal only");
        _processClaimInternal(roundId, ticketId, player);
        emit AutoClaimProcessed(roundId, ticketId, player, 0);
    }

    function _processClaimInternal(uint256 roundId, uint256 ticketId, address caller) internal {
        Round storage roundInfo = rounds[roundId];
        if (roundInfo.state != RoundState.FINALIZED) revert RoundNotFinalized();

        // Check claim deadline
        if (block.timestamp > roundInfo.endTime + CLAIM_DEADLINE) revert ClaimExpired();

        Ticket storage ticket = tickets[ticketId];
        require(ticket.player == caller, "not owner");
        if (!_ticketCoversRound(ticket, roundId)) revert RoundNotFinalized();
        if (claimed[roundId][ticketId]) revert AlreadyClaimed();

        claimed[roundId][ticketId] = true;
        if (ticket.drawsRemaining > 0) {
            ticket.drawsRemaining -= 1;
        }

        bool hasPlus3 = (ticket.addons & ADDON_PLUS3) != 0;
        (uint256 hits, bool hasBullsEye) = _scoreTicket(
            ticket.numbersBitmap,
            roundInfo.winningNumbers,
            roundInfo.plus3Numbers,
            roundInfo.bullsEyeNumber,
            hasPlus3
        );
        uint256 basePrize = ticket.wagerPerDraw * paytable[ticket.spotSize][hits];
        uint256 bullsEyePrize = 0;
        if (hasBullsEye && (ticket.addons & ADDON_BULLSEYE) != 0) {
            bullsEyePrize = ticket.wagerPerDraw * bullsEyePaytable[ticket.spotSize][hits];
        }
        uint256 totalPrize = basePrize + bullsEyePrize;
        uint256 multiplierApplied = 1;
        if ((ticket.addons & ADDON_MULTIPLIER) != 0 && totalPrize > 0) {
            multiplierApplied = roundInfo.drawnMultiplier == 0 ? 1 : roundInfo.drawnMultiplier;
            totalPrize = totalPrize * multiplierApplied;
        }

        uint256 paid = _payoutFromPool(roundInfo, ticketId, totalPrize);

        // Check for Pulse Progressive win
        // Win condition: 9+ hits on 9/10-spot game with progressive add-on
        if ((ticket.addons & ADDON_PROGRESSIVE) != 0 && ticket.spotSize >= 9 && hits >= 9) {
            roundInfo.progressiveWinners.push(ticketId);
        }

        // Update player statistics if won
        if (paid > 0) {
            playerTotalWon[ticket.player] += paid;
            playerWinCount[ticket.player]++;
            globalTotalWon += paid;
        }

        emit PrizeClaimed(roundId, ticketId, ticket.player, basePrize, bullsEyePrize, multiplierApplied, paid);
    }

    function _drawNumbers(uint256 seed) internal pure returns (uint8[DRAWN] memory result) {
        // Partial Fisher-Yates to get 20 unique numbers from 1..80
        uint8[NUMBERS] memory pool;
        for (uint8 i = 0; i < NUMBERS; i++) {
            pool[i] = i + 1;
        }
        uint256 randomSeed = seed;
        for (uint8 i = 0; i < DRAWN; i++) {
            uint256 swapIndex = i + (uint256(keccak256(abi.encode(randomSeed, i))) % (NUMBERS - i));
            uint8 temp = pool[i];
            pool[i] = pool[swapIndex];
            pool[swapIndex] = temp;
            result[i] = pool[i];
        }
    }

    function _drawMultiplier(uint256 seed) internal view returns (uint256) {
        if (multiplierValues.length == 0) {
            // Default distribution from the README if unset
            uint256 roll = uint256(keccak256(abi.encode(seed, "multiplier"))) % 100;
            if (roll < 60) return 1;
            if (roll < 85) return 2;
            if (roll < 95) return 3;
            if (roll < 99) return 5;
            return 10;
        }
        uint256 totalWeight;
        for (uint256 i = 0; i < multiplierWeights.length; i++) {
            totalWeight += multiplierWeights[i];
        }
        uint256 rnd = uint256(keccak256(abi.encode(seed, "multiplier-custom"))) % totalWeight;
        uint256 cumulative;
        for (uint256 i = 0; i < multiplierValues.length; i++) {
            cumulative += multiplierWeights[i];
            if (rnd < cumulative) {
                return multiplierValues[i];
            }
        }
        return multiplierValues[multiplierValues.length - 1];
    }

    function _drawPlus3Numbers(uint256 seed, uint8[DRAWN] memory alreadyDrawn)
        internal
        pure
        returns (uint8[PLUS3_DRAWN] memory result)
    {
        // Draw 3 additional numbers from the 60 numbers NOT in the original 20
        // First create a bitmap of already drawn numbers for quick lookup
        uint256 drawnBitmap = 0;
        for (uint8 i = 0; i < DRAWN; i++) {
            drawnBitmap |= (uint256(1) << (alreadyDrawn[i] - 1));
        }

        // Create pool of remaining 60 numbers
        uint8[NUMBERS - DRAWN] memory remainingPool;
        uint8 poolIndex = 0;
        for (uint8 n = 1; n <= NUMBERS; n++) {
            if ((drawnBitmap & (uint256(1) << (n - 1))) == 0) {
                remainingPool[poolIndex++] = n;
            }
        }

        // Use Fisher-Yates to select 3 numbers from the remaining pool
        uint256 randomSeed = uint256(keccak256(abi.encode(seed, "plus3")));
        for (uint8 i = 0; i < PLUS3_DRAWN; i++) {
            uint256 swapIndex = i + (uint256(keccak256(abi.encode(randomSeed, i))) % (NUMBERS - DRAWN - i));
            uint8 temp = remainingPool[i];
            remainingPool[i] = remainingPool[swapIndex];
            remainingPool[swapIndex] = temp;
            result[i] = remainingPool[i];
        }
    }

    function _scoreTicket(
        uint256 numbersBitmap,
        uint8[DRAWN] memory winning,
        uint8[PLUS3_DRAWN] memory plus3Numbers,
        uint8 bullsEyeNumber,
        bool hasPlus3Addon
    ) internal pure returns (uint256 hits, bool hasBullsEye) {
        // Score hits from the base 20 winning numbers
        for (uint8 i = 0; i < DRAWN; i++) {
            uint8 n = winning[i];
            if ((numbersBitmap & (uint256(1) << (n - 1))) != 0) {
                hits++;
                if (n == bullsEyeNumber) {
                    hasBullsEye = true;
                }
            }
        }

        // If Plus 3 is enabled, add hits from the 3 additional numbers
        if (hasPlus3Addon) {
            for (uint8 i = 0; i < PLUS3_DRAWN; i++) {
                uint8 n = plus3Numbers[i];
                if ((numbersBitmap & (uint256(1) << (n - 1))) != 0) {
                    hits++;
                }
            }
        }
    }

    function _payoutFromPool(Round storage roundInfo, uint256 ticketId, uint256 owed) internal returns (uint256 paid) {
        if (owed == 0) return 0;
        uint256 available = roundInfo.poolBalance;
        if (available == 0) {
            emit PrizeShortfall(roundInfo.id, ticketId, owed, 0);
            return 0;
        }
        paid = owed <= available ? owed : available;
        roundInfo.poolBalance = available - paid;
        token.safeTransfer(tickets[ticketId].player, paid);
        if (paid < owed) {
            emit PrizeShortfall(roundInfo.id, ticketId, owed, paid);
        }
    }

    function _ticketCoversRound(Ticket memory ticket, uint256 roundId) internal pure returns (bool) {
        if (roundId < ticket.firstRoundId) return false;
        uint256 lastRound = uint256(ticket.firstRoundId) + ticket.draws - 1;
        return roundId <= lastRound;
    }

    function _packNumbers(uint8[] calldata numbers, uint8 spotSize) internal pure returns (uint256 bitmap) {
        if (numbers.length != spotSize) revert InvalidNumbers();
        for (uint256 i = 0; i < numbers.length; i++) {
            uint8 n = numbers[i];
            if (n == 0 || n > NUMBERS) revert InvalidNumbers();
            uint256 bit = uint256(1) << (n - 1);
            if ((bitmap & bit) != 0) revert InvalidNumbers();
            bitmap |= bit;
        }
    }

    function _validateAddonFlags(uint16 addons) internal pure {
        uint16 allowed = ADDON_MULTIPLIER | ADDON_BULLSEYE | ADDON_PLUS3 | ADDON_PROGRESSIVE;
        if ((addons | allowed) != allowed) revert InvalidAddonFlags();
    }

    function _addonCost(uint16 addons, uint256 wagerPerDraw) internal view returns (uint256 cost) {
        if ((addons & ADDON_MULTIPLIER) != 0) {
            cost += multiplierCostPerDraw;
        }
        if ((addons & ADDON_BULLSEYE) != 0) {
            cost += bullsEyeCostPerDraw;
        }
        if ((addons & ADDON_PLUS3) != 0) {
            cost += wagerPerDraw; // Plus 3 doubles the wager (costs same as base wager)
        }
        if ((addons & ADDON_PROGRESSIVE) != 0) {
            cost += progressiveCostPerDraw;
        }
    }

    function _emptyWinning() internal pure returns (uint8[DRAWN] memory arr) {
        for (uint8 i = 0; i < DRAWN; i++) {
            arr[i] = 0;
        }
    }

    function _emptyPlus3() internal pure returns (uint8[PLUS3_DRAWN] memory arr) {
        for (uint8 i = 0; i < PLUS3_DRAWN; i++) {
            arr[i] = 0;
        }
    }

    // ============ Default Configuration ============

    function _initDefaultPaytables() internal {
        // Base paytable (spot size => hits => multiplier)
        // Based on authentic Club Keno prize structure

        // 1-SPOT GAME
        paytable[1][1] = 2;

        // 2-SPOT GAME
        paytable[2][2] = 11;

        // 3-SPOT GAME
        paytable[3][3] = 27;
        paytable[3][2] = 2;

        // 4-SPOT GAME
        paytable[4][4] = 72;
        paytable[4][3] = 5;
        paytable[4][2] = 1;

        // 5-SPOT GAME
        paytable[5][5] = 410;
        paytable[5][4] = 18;
        paytable[5][3] = 2;

        // 6-SPOT GAME
        paytable[6][6] = 1100;
        paytable[6][5] = 57;
        paytable[6][4] = 7;
        paytable[6][3] = 1;

        // 7-SPOT GAME
        paytable[7][7] = 2000;
        paytable[7][6] = 100;
        paytable[7][5] = 11;
        paytable[7][4] = 5;
        paytable[7][3] = 1;

        // 8-SPOT GAME
        paytable[8][8] = 10000;
        paytable[8][7] = 300;
        paytable[8][6] = 50;
        paytable[8][5] = 15;
        paytable[8][4] = 2;

        // 9-SPOT GAME
        paytable[9][9] = 25000;
        paytable[9][8] = 2000;
        paytable[9][7] = 100;
        paytable[9][6] = 20;
        paytable[9][5] = 5;
        paytable[9][4] = 2;

        // 10-SPOT GAME
        paytable[10][10] = 100000;
        paytable[10][9] = 5000;
        paytable[10][8] = 500;
        paytable[10][7] = 50;
        paytable[10][6] = 10;
        paytable[10][5] = 2;
        paytable[10][0] = 5;  // Special: Zero hits consolation prize

        // Bulls-Eye paytable (bonus when Bulls-Eye number is hit)
        // Scaled at ~3x base payouts for balanced enhancement

        // 1-SPOT BULLS-EYE
        bullsEyePaytable[1][1] = 6;  // 3x of base 2

        // 2-SPOT BULLS-EYE
        bullsEyePaytable[2][2] = 33;  // 3x of base 11

        // 3-SPOT BULLS-EYE
        bullsEyePaytable[3][3] = 81;  // 3x of base 27
        bullsEyePaytable[3][2] = 6;   // 3x of base 2

        // 4-SPOT BULLS-EYE
        bullsEyePaytable[4][4] = 216;  // 3x of base 72
        bullsEyePaytable[4][3] = 15;   // 3x of base 5
        bullsEyePaytable[4][2] = 3;    // 3x of base 1

        // 5-SPOT BULLS-EYE
        bullsEyePaytable[5][5] = 1230;  // 3x of base 410
        bullsEyePaytable[5][4] = 54;    // 3x of base 18
        bullsEyePaytable[5][3] = 6;     // 3x of base 2

        // 6-SPOT BULLS-EYE
        bullsEyePaytable[6][6] = 3300;  // 3x of base 1100
        bullsEyePaytable[6][5] = 171;   // 3x of base 57
        bullsEyePaytable[6][4] = 21;    // 3x of base 7
        bullsEyePaytable[6][3] = 3;     // 3x of base 1

        // 7-SPOT BULLS-EYE
        bullsEyePaytable[7][7] = 6000;  // 3x of base 2000
        bullsEyePaytable[7][6] = 300;   // 3x of base 100
        bullsEyePaytable[7][5] = 33;    // 3x of base 11
        bullsEyePaytable[7][4] = 15;    // 3x of base 5
        bullsEyePaytable[7][3] = 3;     // 3x of base 1

        // 8-SPOT BULLS-EYE
        bullsEyePaytable[8][8] = 30000;  // 3x of base 10000
        bullsEyePaytable[8][7] = 900;    // 3x of base 300
        bullsEyePaytable[8][6] = 150;    // 3x of base 50
        bullsEyePaytable[8][5] = 45;     // 3x of base 15
        bullsEyePaytable[8][4] = 6;      // 3x of base 2

        // 9-SPOT BULLS-EYE
        bullsEyePaytable[9][9] = 75000;  // 3x of base 25000
        bullsEyePaytable[9][8] = 6000;   // 3x of base 2000
        bullsEyePaytable[9][7] = 300;    // 3x of base 100
        bullsEyePaytable[9][6] = 60;     // 3x of base 20
        bullsEyePaytable[9][5] = 15;     // 3x of base 5
        bullsEyePaytable[9][4] = 6;      // 3x of base 2

        // 10-SPOT BULLS-EYE
        bullsEyePaytable[10][10] = 300000;  // 3x of base 100000
        bullsEyePaytable[10][9] = 15000;    // 3x of base 5000
        bullsEyePaytable[10][8] = 1500;     // 3x of base 500
        bullsEyePaytable[10][7] = 150;      // 3x of base 50
        bullsEyePaytable[10][6] = 30;       // 3x of base 10
        bullsEyePaytable[10][5] = 6;        // 3x of base 2
        bullsEyePaytable[10][0] = 15;       // 3x of base 5 (zero hits bonus)
    }

    function _initDefaultMultiplierDistribution() internal {
        // Mirrors README example: 1x 60%, 2x 25%, 3x 10%, 5x 4%, 10x 1%.
        uint256[] memory values = new uint256[](5);
        uint256[] memory weights = new uint256[](5);
        values[0] = 1;
        values[1] = 2;
        values[2] = 3;
        values[3] = 5;
        values[4] = 10;
        weights[0] = 60;
        weights[1] = 25;
        weights[2] = 10;
        weights[3] = 4;
        weights[4] = 1;
        multiplierValues = values;
        multiplierWeights = weights;
    }
}
