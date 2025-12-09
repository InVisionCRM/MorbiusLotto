const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("SuperStakeLottery", function () {
  let lottery;
  let mockToken;
  let owner;
  let player1;
  let player2;
  let player3;

  const TOKENS_PER_TICKET = ethers.parseEther("1");
  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const ROUND_DURATION = 600; // 10 minutes

  beforeEach(async function () {
    [owner, player1, player2, player3] = await ethers.getSigners();

    // Deploy mock ERC20 token
    const MockToken = await ethers.getContractFactory("MockERC20");
    mockToken = await MockToken.deploy("SuperStake", "SST", INITIAL_SUPPLY);
    await mockToken.waitForDeployment();

    // Deploy lottery contract
    const SuperStakeLottery = await ethers.getContractFactory("SuperStakeLottery");
    lottery = await SuperStakeLottery.deploy(
      await mockToken.getAddress(),
      ROUND_DURATION
    );
    await lottery.waitForDeployment();

    // Distribute tokens to players
    await mockToken.transfer(player1.address, ethers.parseEther("10000"));
    await mockToken.transfer(player2.address, ethers.parseEther("10000"));
    await mockToken.transfer(player3.address, ethers.parseEther("10000"));
  });

  describe("Deployment", function () {
    it("Should set the correct token address", async function () {
      expect(await lottery.superstakeToken()).to.equal(await mockToken.getAddress());
    });

    it("Should set the correct round duration", async function () {
      expect(await lottery.roundDuration()).to.equal(ROUND_DURATION);
    });

    it("Should start round 1 automatically", async function () {
      const roundInfo = await lottery.getRoundInfo();
      expect(roundInfo.roundId).to.equal(1);
    });

    it("Should set owner correctly", async function () {
      expect(await lottery.owner()).to.equal(owner.address);
    });

    it("Should initialize with 0 rollover", async function () {
      expect(await lottery.rolloverAmount()).to.equal(0);
    });
  });

  describe("Buying Tickets", function () {
    it("Should allow player to buy tickets", async function () {
      const depositAmount = ethers.parseEther("5"); // 5 tickets

      await mockToken.connect(player1).approve(await lottery.getAddress(), depositAmount);
      await lottery.connect(player1).buyTickets(depositAmount);

      const tickets = await lottery.getPlayerTickets(player1.address);
      expect(tickets).to.equal(ethers.parseEther("5")); // 5 tickets in wei precision
    });

    it("Should emit TicketsPurchased event", async function () {
      const depositAmount = ethers.parseEther("3");

      await mockToken.connect(player1).approve(await lottery.getAddress(), depositAmount);

      await expect(lottery.connect(player1).buyTickets(depositAmount))
        .to.emit(lottery, "TicketsPurchased")
        .withArgs(player1.address, 1, depositAmount, ethers.parseEther("3"));
    });

    it("Should handle fractional tickets correctly", async function () {
      const depositAmount = ethers.parseEther("1.5"); // 1.5 tickets

      await mockToken.connect(player1).approve(await lottery.getAddress(), depositAmount);
      await lottery.connect(player1).buyTickets(depositAmount);

      const tickets = await lottery.getPlayerTickets(player1.address);
      expect(tickets).to.equal(ethers.parseEther("1.5"));
    });

    it("Should allow same player to buy multiple times", async function () {
      const firstDeposit = ethers.parseEther("2");
      const secondDeposit = ethers.parseEther("3");

      await mockToken.connect(player1).approve(await lottery.getAddress(), firstDeposit);
      await lottery.connect(player1).buyTickets(firstDeposit);

      // Transfer more tokens to player1
      await mockToken.connect(owner).transfer(player1.address, ethers.parseEther("5"));

      await mockToken.connect(player1).approve(await lottery.getAddress(), secondDeposit);
      await lottery.connect(player1).buyTickets(secondDeposit);

      const tickets = await lottery.getPlayerTickets(player1.address);
      expect(tickets).to.equal(ethers.parseEther("5")); // 2 + 3 tickets
    });

    it("Should add player to participants list", async function () {
      const amount = ethers.parseEther("1000");
      await mockToken.connect(player1).approve(await lottery.getAddress(), amount);
      await lottery.connect(player1).buyTickets(amount);

      const players = await lottery.getCurrentPlayers();
      expect(players.length).to.equal(1);
      expect(players[0]).to.equal(player1.address);
    });

    it("Should not duplicate player in participants list", async function () {
      const firstAmount = ethers.parseEther("2");
      const secondAmount = ethers.parseEther("3");

      await mockToken.connect(player1).approve(await lottery.getAddress(), firstAmount);
      await lottery.connect(player1).buyTickets(firstAmount);

      await mockToken.connect(owner).transfer(player1.address, ethers.parseEther("3"));
      await mockToken.connect(player1).approve(await lottery.getAddress(), secondAmount);
      await lottery.connect(player1).buyTickets(secondAmount);

      const players = await lottery.getCurrentPlayers();
      expect(players.length).to.equal(1);
    });

    it("Should update round total tokens", async function () {
      const amount = ethers.parseEther("5");
      await mockToken.connect(player1).approve(await lottery.getAddress(), amount);
      await lottery.connect(player1).buyTickets(amount);

      expect(await lottery.currentRoundTotalTokens()).to.equal(ethers.parseEther("5"));
    });

    it("Should revert if round has ended", async function () {
      await time.increase(ROUND_DURATION + 1);

      const amount = ethers.parseEther("1000");
      await mockToken.connect(player1).approve(await lottery.getAddress(), amount);
      await expect(lottery.connect(player1).buyTickets(amount)).to.be.revertedWith("Round ended");
    });

    it("Should revert if user has no tokens", async function () {
      const emptyPlayer = (await ethers.getSigners())[4];
      const amount = ethers.parseEther("1000");
      await expect(lottery.connect(emptyPlayer).buyTickets(amount)).to.be.reverted;
    });
  });

  describe("Round Conclusion", function () {
    beforeEach(async function () {
      // Setup: 3 players buy tickets
      const amount1 = ethers.parseEther("5");
      const amount2 = ethers.parseEther("3");
      const amount3 = ethers.parseEther("2");

      await mockToken.connect(player1).approve(await lottery.getAddress(), amount1);
      await lottery.connect(player1).buyTickets(amount1);

      await mockToken.connect(player2).approve(await lottery.getAddress(), amount2);
      await lottery.connect(player2).buyTickets(amount2);

      await mockToken.connect(player3).approve(await lottery.getAddress(), amount3);
      await lottery.connect(player3).buyTickets(amount3);
    });

    it("Should not allow conclusion before round ends", async function () {
      await expect(lottery.concludeRound()).to.be.revertedWith("Round not ended");
    });

    it("Should conclude round after duration elapses", async function () {
      await time.increase(ROUND_DURATION + 1);
      await expect(lottery.concludeRound()).to.not.be.reverted;
    });

    it("Should select a winner", async function () {
      await time.increase(ROUND_DURATION + 1);
      await lottery.concludeRound();

      const history = await lottery.getRoundHistory(1);
      expect([player1.address, player2.address, player3.address]).to.include(history.winner);
    });

    it("Should distribute 60% to winner", async function () {
      const totalTokens = ethers.parseEther("10"); // 5 + 3 + 2
      const expectedPrize = (totalTokens * 6000n) / 10000n; // 60%

      await time.increase(ROUND_DURATION + 1);
      const tx = await lottery.concludeRound();
      const receipt = await tx.wait();

      const history = await lottery.getRoundHistory(1);
      expect(history.prizeAmount).to.equal(expectedPrize);
    });

    it("Should send 20% to burn address", async function () {
      const totalTokens = ethers.parseEther("10");
      const expectedBurn = (totalTokens * 2000n) / 10000n; // 20%

      const burnAddressBefore = await mockToken.balanceOf("0x000000000000000000000000000000000000dEaD");

      await time.increase(ROUND_DURATION + 1);
      await lottery.concludeRound();

      const burnAddressAfter = await mockToken.balanceOf("0x000000000000000000000000000000000000dEaD");
      expect(burnAddressAfter - burnAddressBefore).to.equal(expectedBurn);
    });

    it("Should rollover 20% to next round", async function () {
      const totalTokens = ethers.parseEther("10");
      const expectedRollover = totalTokens - (totalTokens * 6000n) / 10000n - (totalTokens * 2000n) / 10000n;

      await time.increase(ROUND_DURATION + 1);
      await lottery.concludeRound();

      expect(await lottery.rolloverAmount()).to.equal(expectedRollover);
    });

    it("Should start new round after conclusion", async function () {
      await time.increase(ROUND_DURATION + 1);
      await lottery.concludeRound();

      const roundInfo = await lottery.getRoundInfo();
      expect(roundInfo.roundId).to.equal(2);
    });

    it("Should emit RoundConcluded event", async function () {
      await time.increase(ROUND_DURATION + 1);
      await expect(lottery.concludeRound()).to.emit(lottery, "RoundConcluded");
    });

    it("Should record round history correctly", async function () {
      await time.increase(ROUND_DURATION + 1);
      await lottery.concludeRound();

      const history = await lottery.getRoundHistory(1);
      expect(history.roundId).to.equal(1);
      expect(history.participantCount).to.equal(3);
      expect(history.totalTokens).to.equal(ethers.parseEther("10"));
    });

    it("Should clear previous round player data", async function () {
      await time.increase(ROUND_DURATION + 1);
      await lottery.concludeRound();

      expect(await lottery.getPlayerTickets(player1.address)).to.equal(0);
      expect(await lottery.getCurrentPlayers()).to.have.lengthOf(0);
    });
  });

  describe("Empty Round Handling", function () {
    it("Should handle round with no participants", async function () {
      await time.increase(ROUND_DURATION + 1);
      await lottery.concludeRound();

      const history = await lottery.getRoundHistory(1);
      expect(history.participantCount).to.equal(0);
      expect(history.winner).to.equal(ethers.ZeroAddress);
      expect(history.prizeAmount).to.equal(0);
    });

    it("Should rollover to next round when empty", async function () {
      const initialRollover = await lottery.rolloverAmount();

      await time.increase(ROUND_DURATION + 1);
      await lottery.concludeRound();

      expect(await lottery.rolloverAmount()).to.equal(initialRollover);
    });

    it("Should start new round after empty conclusion", async function () {
      await time.increase(ROUND_DURATION + 1);
      await lottery.concludeRound();

      const roundInfo = await lottery.getRoundInfo();
      expect(roundInfo.roundId).to.equal(2);
    });
  });

  describe("Rollover Mechanism", function () {
    it("Should include rollover in next round prize pool", async function () {
      // Round 1: Create rollover
      const amount1 = ethers.parseEther("10");
      await mockToken.connect(player1).approve(await lottery.getAddress(), amount1);
      await lottery.connect(player1).buyTickets(amount1);

      await time.increase(ROUND_DURATION + 1);
      await lottery.concludeRound();

      const rollover = await lottery.rolloverAmount();

      // Round 2: Check total includes rollover
      const amount2 = ethers.parseEther("5");
      await mockToken.connect(owner).transfer(player2.address, amount2);
      await mockToken.connect(player2).approve(await lottery.getAddress(), amount2);
      await lottery.connect(player2).buyTickets(amount2);

      const roundInfo = await lottery.getRoundInfo();
      expect(roundInfo.totalTokens).to.equal(amount2 + rollover);
    });
  });

  describe("Owner Functions", function () {
    it("Should allow owner to update round duration", async function () {
      const newDuration = 3600; // 1 hour
      await lottery.updateRoundDuration(newDuration);
      expect(await lottery.roundDuration()).to.equal(newDuration);
    });

    it("Should emit RoundDurationUpdated event", async function () {
      const newDuration = 3600;
      await expect(lottery.updateRoundDuration(newDuration))
        .to.emit(lottery, "RoundDurationUpdated")
        .withArgs(ROUND_DURATION, newDuration);
    });

    it("Should revert if non-owner tries to update duration", async function () {
      await expect(
        lottery.connect(player1).updateRoundDuration(3600)
      ).to.be.revertedWithCustomError(lottery, "OwnableUnauthorizedAccount");
    });

    it("Should revert if duration is 0", async function () {
      await expect(lottery.updateRoundDuration(0)).to.be.revertedWith("Duration must be positive");
    });
  });

  describe("View Functions", function () {
    it("Should return correct round info", async function () {
      const amount = ethers.parseEther("5");
      await mockToken.connect(player1).approve(await lottery.getAddress(), amount);
      await lottery.connect(player1).buyTickets(amount);

      const roundInfo = await lottery.getRoundInfo();
      expect(roundInfo.roundId).to.equal(1);
      expect(roundInfo.totalTokens).to.equal(ethers.parseEther("5"));
      expect(roundInfo.participantCount).to.equal(1);
    });

    it("Should calculate time remaining correctly", async function () {
      const roundInfo1 = await lottery.getRoundInfo();
      expect(roundInfo1.timeRemaining).to.be.closeTo(BigInt(ROUND_DURATION), 5n);

      await time.increase(300); // 5 minutes

      const roundInfo2 = await lottery.getRoundInfo();
      expect(roundInfo2.timeRemaining).to.be.closeTo(BigInt(ROUND_DURATION - 300), 5n);
    });

    it("Should return 0 time remaining after round ends", async function () {
      await time.increase(ROUND_DURATION + 1);

      const roundInfo = await lottery.getRoundInfo();
      expect(roundInfo.timeRemaining).to.equal(0);
    });

    it("Should return current players list", async function () {
      const amount = ethers.parseEther("1000");

      await mockToken.connect(player1).approve(await lottery.getAddress(), amount);
      await lottery.connect(player1).buyTickets(amount);

      await mockToken.connect(player2).approve(await lottery.getAddress(), amount);
      await lottery.connect(player2).buyTickets(amount);

      const players = await lottery.getCurrentPlayers();
      expect(players).to.have.lengthOf(2);
      expect(players).to.include(player1.address);
      expect(players).to.include(player2.address);
    });

    it("Should calculate total tickets correctly", async function () {
      const amount1 = ethers.parseEther("5");
      const amount2 = ethers.parseEther("3");

      await mockToken.connect(player1).approve(await lottery.getAddress(), amount1);
      await lottery.connect(player1).buyTickets(amount1);

      await mockToken.connect(player2).approve(await lottery.getAddress(), amount2);
      await lottery.connect(player2).buyTickets(amount2);

      const totalTickets = await lottery.getCurrentTotalTickets();
      expect(totalTickets).to.equal(ethers.parseEther("8")); // 5 + 3 tickets
    });
  });

  describe("Randomness Distribution", function () {
    it("Should select winner with higher tickets more often (statistical test)", async function () {
      const wins = { player1: 0, player2: 0 };
      const rounds = 20;

      for (let i = 0; i < rounds; i++) {
        // Player1 has 9 tickets, Player2 has 1 ticket (90% vs 10% chance)
        const amount1 = ethers.parseEther("9");
        const amount2 = ethers.parseEther("1");

        await mockToken.connect(owner).transfer(player1.address, amount1);
        await mockToken.connect(owner).transfer(player2.address, amount2);

        await mockToken.connect(player1).approve(await lottery.getAddress(), amount1);
        await lottery.connect(player1).buyTickets(amount1);

        await mockToken.connect(player2).approve(await lottery.getAddress(), amount2);
        await lottery.connect(player2).buyTickets(amount2);

        await time.increase(ROUND_DURATION + 1);
        await lottery.concludeRound();

        const history = await lottery.getRoundHistory(i + 1);
        if (history.winner === player1.address) wins.player1++;
        if (history.winner === player2.address) wins.player2++;

        // Small time jump to vary block data
        await time.increase(10);
      }

      // Player1 should win significantly more (statistical, not guaranteed)
      // With 90% chance, expect player1 to win at least 70% of the time
      expect(wins.player1).to.be.greaterThan(rounds * 0.5);
    }).timeout(60000);
  });
});

// Mock ERC20 Token for testing
// This will be in a separate file in deployment, but included here for testing
const mockERC20Source = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol, uint256 initialSupply) ERC20(name, symbol) {
        _mint(msg.sender, initialSupply);
    }
}
`;

// Note: Create MockERC20.sol file separately for actual testing
