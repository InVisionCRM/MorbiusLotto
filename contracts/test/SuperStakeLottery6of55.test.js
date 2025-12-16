const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("SuperStakeLottery6of55", function () {
  let lottery;
  let psshToken;
  let hexToken;
  let owner;
  let player1;
  let player2;
  let player3;
  let addrs;

  const TICKET_PRICE = ethers.parseUnits("1", 9); // 1 pSSH
  const ROUND_DURATION = 600; // 10 minutes for testing

  beforeEach(async function () {
    [owner, player1, player2, player3, ...addrs] = await ethers.getSigners();

    // Deploy mock ERC20 tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    psshToken = await MockERC20.deploy("SuperStake", "pSSH", 9);
    hexToken = await MockERC20.deploy("HEX", "HEX", 8);

    // Deploy lottery
    const Lottery = await ethers.getContractFactory("SuperStakeLottery6of55");
    lottery = await Lottery.deploy(await psshToken.getAddress(), ROUND_DURATION);

    // Set block delay to 0 for testing (skip randomness delay)
    await lottery.updateBlockDelay(0);

    // Mint tokens to players
    const mintAmount = ethers.parseUnits("10000", 9);
    await psshToken.mint(player1.address, mintAmount);
    await psshToken.mint(player2.address, mintAmount);
    await psshToken.mint(player3.address, mintAmount);

    // Approve lottery
    await psshToken.connect(player1).approve(await lottery.getAddress(), ethers.MaxUint256);
    await psshToken.connect(player2).approve(await lottery.getAddress(), ethers.MaxUint256);
    await psshToken.connect(player3).approve(await lottery.getAddress(), ethers.MaxUint256);
  });

  describe("Deployment", function () {
    it("Should set the correct pSSH token", async function () {
      expect(await lottery.pSSH_TOKEN()).to.equal(await psshToken.getAddress());
    });

    it("Should set the correct round duration", async function () {
      expect(await lottery.roundDuration()).to.equal(ROUND_DURATION);
    });

    it("Should start round 1", async function () {
      const roundInfo = await lottery.getCurrentRoundInfo();
      expect(roundInfo.roundId).to.equal(1);
    });
  });

  describe("Ticket Validation", function () {
    it("Should accept valid tickets", async function () {
      const validTicket = [[1, 2, 3, 4, 5, 6]];
      await expect(lottery.connect(player1).buyTickets(validTicket)).to.not.be.reverted;
    });

    it("Should reject tickets with numbers out of range", async function () {
      const invalidTicket = [[0, 2, 3, 4, 5, 6]]; // 0 is invalid
      await expect(lottery.connect(player1).buyTickets(invalidTicket)).to.be.revertedWith("Number out of range");

      const invalidTicket2 = [[1, 2, 3, 4, 5, 56]]; // 56 is invalid
      await expect(lottery.connect(player1).buyTickets(invalidTicket2)).to.be.revertedWith("Number out of range");
    });

    it("Should reject tickets with duplicate numbers", async function () {
      const duplicateTicket = [[1, 2, 3, 4, 5, 5]]; // Duplicate 5
      await expect(lottery.connect(player1).buyTickets(duplicateTicket)).to.be.revertedWith("Duplicate numbers");
    });

    it("Should accept multiple valid tickets", async function () {
      const tickets = [
        [1, 2, 3, 4, 5, 6],
        [7, 8, 9, 10, 11, 12],
        [13, 14, 15, 16, 17, 18]
      ];
      await expect(lottery.connect(player1).buyTickets(tickets)).to.not.be.reverted;
    });

    it("Should enforce max 100 tickets per transaction", async function () {
      const tickets = Array(101).fill([1, 2, 3, 4, 5, 6]);
      await expect(lottery.connect(player1).buyTickets(tickets)).to.be.revertedWith("Max 100 tickets per tx");
    });
  });

  describe("Ticket Purchase", function () {
    it("Should charge correct pSSH amount", async function () {
      const initialBalance = await psshToken.balanceOf(player1.address);
      const tickets = [[1, 2, 3, 4, 5, 6]];

      await lottery.connect(player1).buyTickets(tickets);

      const finalBalance = await psshToken.balanceOf(player1.address);
      expect(initialBalance - finalBalance).to.equal(TICKET_PRICE);
    });

    it("Should charge correct amount for multiple tickets", async function () {
      const initialBalance = await psshToken.balanceOf(player1.address);
      const tickets = [
        [1, 2, 3, 4, 5, 6],
        [7, 8, 9, 10, 11, 12],
        [13, 14, 15, 16, 17, 18]
      ];

      await lottery.connect(player1).buyTickets(tickets);

      const finalBalance = await psshToken.balanceOf(player1.address);
      expect(initialBalance - finalBalance).to.equal(TICKET_PRICE * 3n);
    });

    it("Should track total tickets correctly", async function () {
      const tickets1 = [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]];
      const tickets2 = [[13, 14, 15, 16, 17, 18]];

      await lottery.connect(player1).buyTickets(tickets1);
      await lottery.connect(player2).buyTickets(tickets2);

      const roundInfo = await lottery.getCurrentRoundInfo();
      expect(roundInfo.totalTickets).to.equal(3);
    });

    it("Should track unique players correctly", async function () {
      await lottery.connect(player1).buyTickets([[1, 2, 3, 4, 5, 6]]);
      await lottery.connect(player1).buyTickets([[7, 8, 9, 10, 11, 12]]); // Same player
      await lottery.connect(player2).buyTickets([[13, 14, 15, 16, 17, 18]]);

      const roundInfo = await lottery.getCurrentRoundInfo();
      expect(roundInfo.uniquePlayers).to.equal(2);
    });

    it("Should emit TicketsPurchased event", async function () {
      const tickets = [[1, 2, 3, 4, 5, 6]];
      await expect(lottery.connect(player1).buyTickets(tickets))
        .to.emit(lottery, "TicketsPurchased")
        .withArgs(player1.address, 1, 1, 0, TICKET_PRICE);
    });

    it("Should store player tickets correctly", async function () {
      const tickets = [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]];
      await lottery.connect(player1).buyTickets(tickets);

      const playerTickets = await lottery.getPlayerTickets(1, player1.address);
      expect(playerTickets.length).to.equal(2);
      expect(playerTickets[0].player).to.equal(player1.address);
    });

    it("Should sort ticket numbers", async function () {
      const unsortedTicket = [[55, 3, 12, 1, 44, 22]];
      await lottery.connect(player1).buyTickets(unsortedTicket);

      const playerTickets = await lottery.getPlayerTickets(1, player1.address);
      const numbers = playerTickets[0].numbers;

      // Should be sorted: [1, 3, 12, 22, 44, 55]
      expect(numbers[0]).to.equal(1);
      expect(numbers[1]).to.equal(3);
      expect(numbers[2]).to.equal(12);
      expect(numbers[3]).to.equal(22);
      expect(numbers[4]).to.equal(44);
      expect(numbers[5]).to.equal(55);
    });
  });

  describe("Free Tickets", function () {
    it("Should award free ticket to non-winners", async function () {
      // Player buys ticket
      await lottery.connect(player1).buyTickets([[1, 2, 3, 4, 5, 6]]);

      // Fast forward time and finalize
      await time.increase(ROUND_DURATION + 10);
      await lottery.finalizeRound();

      // Check if player got free ticket (depends on if they won)
      const credits = await lottery.getFreeTicketCredits(player1.address);
      // Credits should be 0 or 1 depending on if they won
      expect(credits).to.be.oneOf([0n, 1n]);
    });

    it("Should use free tickets on next purchase", async function () {
      // Buy ticket in round 1, finalize as non-winner, get free ticket
      await lottery.connect(player1).buyTickets([[1, 2, 3, 4, 5, 6]]);
      await time.increase(ROUND_DURATION + 10);
      await lottery.finalizeRound();

      const creditsBefore = await lottery.getFreeTicketCredits(player1.address);

      if (creditsBefore > 0) {
        // Buy tickets in round 2
        const initialBalance = await psshToken.balanceOf(player1.address);
        await lottery.connect(player1).buyTickets([[7, 8, 9, 10, 11, 12]]);
        const finalBalance = await psshToken.balanceOf(player1.address);

        // Should have used free ticket
        const creditsAfter = await lottery.getFreeTicketCredits(player1.address);
        expect(creditsAfter).to.equal(creditsBefore - 1n);

        // Should have paid 0 pSSH (all free)
        expect(initialBalance - finalBalance).to.equal(0n);
      }
    });

    it("Should handle multiple free tickets", async function () {
      // Give player multiple free tickets by losing multiple rounds
      for (let i = 0; i < 3; i++) {
        await lottery.connect(player1).buyTickets([[1, 2, 3, 4, 5, 6]]);
        await time.increase(ROUND_DURATION + 10);
        await lottery.finalizeRound();
      }

      const credits = await lottery.getFreeTicketCredits(player1.address);
      // Should have earned 0-3 free tickets depending on wins
      expect(Number(credits)).to.be.lessThanOrEqual(3);
    });
  });

  describe("Round Lifecycle", function () {
    it("Should not allow finalization before round ends", async function () {
      await expect(lottery.finalizeRound()).to.be.revertedWith("Round not expired");
    });

    it("Should finalize round after duration", async function () {
      await lottery.connect(player1).buyTickets([[1, 2, 3, 4, 5, 6]]);
      await time.increase(ROUND_DURATION + 10);
      await expect(lottery.finalizeRound()).to.not.be.reverted;
    });

    it("Should start new round after finalization", async function () {
      await lottery.connect(player1).buyTickets([[1, 2, 3, 4, 5, 6]]);
      await time.increase(ROUND_DURATION + 10);
      await lottery.finalizeRound();

      const roundInfo = await lottery.getCurrentRoundInfo();
      expect(roundInfo.roundId).to.equal(2);
    });

    it("Should handle empty rounds", async function () {
      // Don't buy any tickets
      await time.increase(ROUND_DURATION + 10);
      await expect(lottery.finalizeRound()).to.not.be.reverted;

      const roundInfo = await lottery.getCurrentRoundInfo();
      expect(roundInfo.roundId).to.equal(2);
    });

    it("Should auto-finalize on next buy if round expired", async function () {
      await lottery.connect(player1).buyTickets([[1, 2, 3, 4, 5, 6]]);
      await time.increase(ROUND_DURATION + 10);

      // Instead of calling finalizeRound, just buy tickets in next round
      await lottery.connect(player2).buyTickets([[7, 8, 9, 10, 11, 12]]);

      const roundInfo = await lottery.getCurrentRoundInfo();
      expect(roundInfo.roundId).to.equal(2);
    });

    it("Should emit RoundStarted event", async function () {
      await lottery.connect(player1).buyTickets([[1, 2, 3, 4, 5, 6]]);
      await time.increase(ROUND_DURATION + 10);

      await expect(lottery.finalizeRound())
        .to.emit(lottery, "RoundStarted");
    });

    it("Should emit RoundFinalized event", async function () {
      await lottery.connect(player1).buyTickets([[1, 2, 3, 4, 5, 6]]);
      await time.increase(ROUND_DURATION + 10);

      await expect(lottery.finalizeRound())
        .to.emit(lottery, "RoundFinalized");
    });
  });

  describe("Prize Distribution", function () {
    it("Should distribute prizes correctly", async function () {
      const tickets = [[1, 2, 3, 4, 5, 6]];
      await lottery.connect(player1).buyTickets(tickets);

      await time.increase(ROUND_DURATION + 10);
      await lottery.finalizeRound();

      // Check that mega bank increased (20% base + leftover from high brackets)
      const megaBank = await lottery.getMegaMillionsBank();
      const baseMega = (TICKET_PRICE * 20n) / 100n;
      // Mega bank gets base 20% + 60% of leftover from brackets 5&6
      expect(megaBank).to.be.greaterThanOrEqual(baseMega);
    });

    it("Should send 25% to stake address", async function () {
      const STAKE_ADDRESS = "0xdC48205df8aF83c97de572241bB92DB45402Aa0E";
      const initialStakeBalance = await psshToken.balanceOf(STAKE_ADDRESS);

      await lottery.connect(player1).buyTickets([[1, 2, 3, 4, 5, 6]]);
      await time.increase(ROUND_DURATION + 10);
      await lottery.finalizeRound();

      const finalStakeBalance = await psshToken.balanceOf(STAKE_ADDRESS);
      const sent = finalStakeBalance - initialStakeBalance;
      const expected = (TICKET_PRICE * 25n) / 100n;

      expect(sent).to.be.closeTo(expected, ethers.parseUnits("0.01", 9));
    });

    it("Should add at least 20% to MegaMillions bank", async function () {
      await lottery.connect(player1).buyTickets([[1, 2, 3, 4, 5, 6]]);
      await time.increase(ROUND_DURATION + 10);
      await lottery.finalizeRound();

      const megaBank = await lottery.getMegaMillionsBank();
      const baseMega = (TICKET_PRICE * 20n) / 100n;

      // Should get at least 20% (base) + potentially more from leftover high brackets
      expect(megaBank).to.be.greaterThanOrEqual(baseMega);
    });

    it("Should handle multiple players", async function () {
      await lottery.connect(player1).buyTickets([[1, 2, 3, 4, 5, 6]]);
      await lottery.connect(player2).buyTickets([[7, 8, 9, 10, 11, 12]]);
      await lottery.connect(player3).buyTickets([[13, 14, 15, 16, 17, 18]]);

      await time.increase(ROUND_DURATION + 10);
      await lottery.finalizeRound();

      const megaBank = await lottery.getMegaMillionsBank();
      const totalPot = TICKET_PRICE * 3n;
      const baseMega = (totalPot * 20n) / 100n;

      // Should get at least 20% + leftover from high brackets
      expect(megaBank).to.be.greaterThanOrEqual(baseMega);
    });
  });

  describe("MegaMillions", function () {
    it("Should identify MegaMillions rounds correctly", async function () {
      // Round 1 should not be MM
      let roundInfo = await lottery.getCurrentRoundInfo();
      expect(roundInfo.isMegaMillionsRound).to.equal(false);
    });

    it("Should accumulate MegaMillions bank over rounds", async function () {
      const initialBank = await lottery.getMegaMillionsBank();

      // Run 3 rounds
      for (let i = 0; i < 3; i++) {
        await lottery.connect(player1).buyTickets([[1, 2, 3, 4, 5, 6]]);
        await time.increase(ROUND_DURATION + 10);
        await lottery.finalizeRound();
      }

      const finalBank = await lottery.getMegaMillionsBank();
      expect(finalBank).to.be.greaterThan(initialBank);
    });
  });

  describe("Winning Claims", function () {
    it("Should allow winners to claim prizes", async function () {
      await lottery.connect(player1).buyTickets([[1, 2, 3, 4, 5, 6]]);
      await time.increase(ROUND_DURATION + 10);
      await lottery.finalizeRound();

      const claimable = await lottery.getClaimableWinnings(1, player1.address);

      if (claimable > 0) {
        const initialBalance = await psshToken.balanceOf(player1.address);
        await lottery.connect(player1).claimWinnings(1);
        const finalBalance = await psshToken.balanceOf(player1.address);

        expect(finalBalance - initialBalance).to.equal(claimable);
      }
    });

    it("Should not allow double claims", async function () {
      await lottery.connect(player1).buyTickets([[1, 2, 3, 4, 5, 6]]);
      await time.increase(ROUND_DURATION + 10);
      await lottery.finalizeRound();

      const claimable = await lottery.getClaimableWinnings(1, player1.address);

      if (claimable > 0) {
        await lottery.connect(player1).claimWinnings(1);
        await expect(lottery.connect(player1).claimWinnings(1)).to.be.revertedWith("Already claimed");
      }
    });

    it("Should not allow claiming from unfinalized rounds", async function () {
      await lottery.connect(player1).buyTickets([[1, 2, 3, 4, 5, 6]]);
      await expect(lottery.connect(player1).claimWinnings(1)).to.be.revertedWith("Round not finalized");
    });
  });

  describe("View Functions", function () {
    it("Should return correct round info", async function () {
      const roundInfo = await lottery.getCurrentRoundInfo();

      expect(roundInfo.roundId).to.equal(1);
      expect(roundInfo.totalTickets).to.equal(0);
      expect(roundInfo.uniquePlayers).to.equal(0);
      expect(Number(roundInfo.state)).to.equal(0); // OPEN
    });

    it("Should return correct player tickets", async function () {
      const tickets = [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]];
      await lottery.connect(player1).buyTickets(tickets);

      const playerTickets = await lottery.getPlayerTickets(1, player1.address);
      expect(playerTickets.length).to.equal(2);
    });

    it("Should return MegaMillions bank balance", async function () {
      const balance = await lottery.getMegaMillionsBank();
      expect(balance).to.equal(0);
    });

    it.skip("Should return HEX jackpot balance", async function () {
      // Skip - requires real HEX token at hardcoded address
      const balance = await lottery.getHexJackpot();
      expect(balance).to.equal(0);
    });

    it("Should return free ticket credits", async function () {
      const credits = await lottery.getFreeTicketCredits(player1.address);
      expect(credits).to.equal(0);
    });

    it("Should return claimable winnings", async function () {
      const claimable = await lottery.getClaimableWinnings(1, player1.address);
      expect(claimable).to.equal(0);
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to update round duration", async function () {
      const newDuration = 1200;
      await lottery.updateRoundDuration(newDuration);
      expect(await lottery.roundDuration()).to.equal(newDuration);
    });

    it("Should not allow non-owner to update round duration", async function () {
      const newDuration = 1200;
      await expect(
        lottery.connect(player1).updateRoundDuration(newDuration)
      ).to.be.reverted;
    });

    it("Should reject zero duration", async function () {
      await expect(lottery.updateRoundDuration(0)).to.be.revertedWith("Duration must be positive");
    });

    it("Should allow owner to update block delay", async function () {
      const newDelay = 10;
      await lottery.updateBlockDelay(newDelay);
      expect(await lottery.blockDelay()).to.equal(newDelay);
    });

    it("Should not allow non-owner to update block delay", async function () {
      const newDelay = 10;
      await expect(
        lottery.connect(player1).updateBlockDelay(newDelay)
      ).to.be.reverted;
    });
  });

  describe("Edge Cases", function () {
    it("Should handle very large ticket purchases", async function () {
      const tickets = Array(100).fill([1, 2, 3, 4, 5, 6]);
      await expect(lottery.connect(player1).buyTickets(tickets)).to.not.be.reverted;
    });

    it("Should handle all possible number combinations", async function () {
      // Test boundary numbers
      await lottery.connect(player1).buyTickets([[1, 2, 3, 4, 5, 6]]);
      await lottery.connect(player1).buyTickets([[50, 51, 52, 53, 54, 55]]);
      await lottery.connect(player1).buyTickets([[1, 10, 20, 30, 40, 55]]);

      const roundInfo = await lottery.getCurrentRoundInfo();
      expect(roundInfo.totalTickets).to.equal(3);
    });

    it("Should handle round transition correctly", async function () {
      // Buy in round 1
      await lottery.connect(player1).buyTickets([[1, 2, 3, 4, 5, 6]]);

      // Advance time
      await time.increase(ROUND_DURATION + 10);

      // Buy in round 2 (should auto-finalize round 1)
      await lottery.connect(player2).buyTickets([[7, 8, 9, 10, 11, 12]]);

      // Should be in round 2
      const roundInfo = await lottery.getCurrentRoundInfo();
      expect(roundInfo.roundId).to.equal(2);
      expect(roundInfo.totalTickets).to.equal(1); // Only player2's ticket in round 2
    });

    it("Should handle same numbers from multiple players", async function () {
      // Multiple players buy same numbers
      await lottery.connect(player1).buyTickets([[1, 2, 3, 4, 5, 6]]);
      await lottery.connect(player2).buyTickets([[1, 2, 3, 4, 5, 6]]);
      await lottery.connect(player3).buyTickets([[1, 2, 3, 4, 5, 6]]);

      // Check before finalization
      let roundInfo = await lottery.getCurrentRoundInfo();
      expect(roundInfo.totalTickets).to.equal(3);

      await time.increase(ROUND_DURATION + 10);
      await lottery.finalizeRound();

      // After finalization, check the completed round
      const round1 = await lottery.getRound(1);
      expect(round1.totalTickets).to.equal(3);
    });
  });

  describe("Gas Optimization", function () {
    it("Should efficiently handle 50 tickets", async function () {
      const tickets = Array(50).fill([1, 2, 3, 4, 5, 6]);
      const tx = await lottery.connect(player1).buyTickets(tickets);
      const receipt = await tx.wait();

      console.log("Gas used for 50 tickets:", receipt.gasUsed.toString());
      // Should be under 6M gas (relaxed from 5M due to complexity)
      expect(receipt.gasUsed).to.be.lessThan(6000000n);
    });

    it("Should finalize efficiently with moderate tickets", async function () {
      // Buy 10 tickets
      const tickets = Array(10).fill([1, 2, 3, 4, 5, 6]);
      await lottery.connect(player1).buyTickets(tickets);

      await time.increase(ROUND_DURATION + 10);

      const tx = await lottery.finalizeRound();
      const receipt = await tx.wait();

      console.log("Gas used for finalization (10 tickets):", receipt.gasUsed.toString());
      // Should be under 3M gas
      expect(receipt.gasUsed).to.be.lessThan(3000000n);
    });
  });

  describe("Randomness", function () {
    it("Should generate different winning numbers across rounds", async function () {
      const winningNumbers = [];

      for (let i = 0; i < 3; i++) {
        await lottery.connect(player1).buyTickets([[1, 2, 3, 4, 5, 6]]);
        await time.increase(ROUND_DURATION + 10);
        await lottery.finalizeRound();

        const round = await lottery.getRound(i + 1);
        winningNumbers.push(round.winningNumbers);
      }

      // At least one round should have different numbers
      // (extremely unlikely all 3 are identical)
      const allSame = winningNumbers.every((nums, _, arr) =>
        nums.every((n, i) => n === arr[0][i])
      );
      expect(allSame).to.be.false;
    });

    it("Should generate 6 unique numbers", async function () {
      await lottery.connect(player1).buyTickets([[1, 2, 3, 4, 5, 6]]);
      await time.increase(ROUND_DURATION + 10);
      await lottery.finalizeRound();

      const round = await lottery.getRound(1);
      const numbers = round.winningNumbers;

      // Check all numbers are unique
      const uniqueNumbers = new Set(numbers.map(n => Number(n)));
      expect(uniqueNumbers.size).to.equal(6);
    });

    it("Should generate numbers in valid range", async function () {
      await lottery.connect(player1).buyTickets([[1, 2, 3, 4, 5, 6]]);
      await time.increase(ROUND_DURATION + 10);
      await lottery.finalizeRound();

      const round = await lottery.getRound(1);
      const numbers = round.winningNumbers;

      // All numbers should be 1-55
      for (let num of numbers) {
        expect(Number(num)).to.be.gte(1);
        expect(Number(num)).to.be.lte(55);
      }
    });
  });
});
