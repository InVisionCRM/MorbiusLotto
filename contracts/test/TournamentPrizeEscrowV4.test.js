const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Covers the full lifecycle of TournamentPrizeEscrowV4:
 *  - deposit (happy path + double-deposit rejection)
 *  - push payouts (single + batch + auth + over-pool rejection)
 *  - pull path (set, claim, double-claim guard, double-pay guard)
 *  - cancel + reclaim
 *  - reads
 *  - admin (setAuthorizedServer)
 *
 * Uses a small ERC20 mock since OZ doesn't ship one in production deps.
 */

const ERC20_MOCK_SOURCE = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
contract TestToken is ERC20 {
  constructor() ERC20("Test", "TST") {}
  function mint(address to, uint256 amt) external { _mint(to, amt); }
}
`;

const TID_A = ethers.id("tournament-a"); // bytes32
const TID_B = ethers.id("tournament-b");

describe("TournamentPrizeEscrowV4", () => {
  let escrow, token, owner, server, creator, w1, w2, w3, stranger;

  beforeEach(async () => {
    [owner, server, creator, w1, w2, w3, stranger] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("TestToken");
    token = await Token.deploy();
    await token.mint(creator.address, ethers.parseEther("1000000"));

    const Escrow = await ethers.getContractFactory("TournamentPrizeEscrowV4");
    escrow = await Escrow.connect(owner).deploy(server.address);
  });

  // ============ Construction & admin ============

  describe("construction + admin", () => {
    it("sets owner to deployer and stores authorizedServer", async () => {
      expect(await escrow.owner()).to.equal(owner.address);
      expect(await escrow.authorizedServer()).to.equal(server.address);
    });

    it("rejects zero authorizedServer in constructor", async () => {
      const Escrow = await ethers.getContractFactory("TournamentPrizeEscrowV4");
      await expect(Escrow.deploy(ethers.ZeroAddress)).to.be.revertedWith("Invalid server");
    });

    it("owner can rotate authorizedServer", async () => {
      await escrow.connect(owner).setAuthorizedServer(stranger.address);
      expect(await escrow.authorizedServer()).to.equal(stranger.address);
    });

    it("non-owner cannot rotate authorizedServer", async () => {
      await expect(escrow.connect(stranger).setAuthorizedServer(stranger.address))
        .to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
    });

    it("rejects zero authorizedServer on rotate", async () => {
      await expect(escrow.connect(owner).setAuthorizedServer(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid server");
    });
  });

  // ============ Deposit ============

  describe("depositPrizePool", () => {
    it("transfers tokens and stores pool state", async () => {
      const amt = ethers.parseEther("100");
      await token.connect(creator).approve(escrow.target, amt);
      await escrow.connect(creator).depositPrizePool(TID_A, token.target, amt);
      expect(await token.balanceOf(escrow.target)).to.equal(amt);
      const p = await escrow.getPool(TID_A);
      expect(p.token).to.equal(token.target);
      expect(p.depositor).to.equal(creator.address);
      expect(p.totalDeposited).to.equal(amt);
      expect(p.amountPaidOut).to.equal(0n);
      expect(p.cancelled).to.equal(false);
    });

    it("emits PrizePoolDeposited", async () => {
      const amt = ethers.parseEther("100");
      await token.connect(creator).approve(escrow.target, amt);
      await expect(escrow.connect(creator).depositPrizePool(TID_A, token.target, amt))
        .to.emit(escrow, "PrizePoolDeposited")
        .withArgs(TID_A, token.target, amt, creator.address);
    });

    it("rejects double deposit at same id", async () => {
      const amt = ethers.parseEther("100");
      await token.connect(creator).approve(escrow.target, amt * 2n);
      await escrow.connect(creator).depositPrizePool(TID_A, token.target, amt);
      await expect(escrow.connect(creator).depositPrizePool(TID_A, token.target, amt))
        .to.be.revertedWith("Already deposited");
    });

    it("rejects zero amount and zero token", async () => {
      await expect(escrow.connect(creator).depositPrizePool(TID_A, token.target, 0n))
        .to.be.revertedWith("Zero amount");
      await expect(escrow.connect(creator).depositPrizePool(TID_A, ethers.ZeroAddress, 1n))
        .to.be.revertedWith("Invalid token");
    });

    it("appends to tournamentIds exactly once per deposit", async () => {
      const amt = ethers.parseEther("10");
      await token.connect(creator).approve(escrow.target, amt * 2n);
      await escrow.connect(creator).depositPrizePool(TID_A, token.target, amt);
      await escrow.connect(creator).depositPrizePool(TID_B, token.target, amt);
      expect(await escrow.getTournamentCount()).to.equal(2n);
      const ids = await escrow.getAllTournamentIds();
      expect(ids).to.deep.equal([TID_A, TID_B]);
    });
  });

  // ============ Push payouts ============

  describe("payout (single)", () => {
    beforeEach(async () => {
      const amt = ethers.parseEther("100");
      await token.connect(creator).approve(escrow.target, amt);
      await escrow.connect(creator).depositPrizePool(TID_A, token.target, amt);
    });

    it("pays a winner and emits Payout", async () => {
      await expect(escrow.connect(server).payout(TID_A, w1.address, ethers.parseEther("60")))
        .to.emit(escrow, "Payout")
        .withArgs(TID_A, w1.address, ethers.parseEther("60"));
      expect(await token.balanceOf(w1.address)).to.equal(ethers.parseEther("60"));
      const p = await escrow.getPool(TID_A);
      expect(p.amountPaidOut).to.equal(ethers.parseEther("60"));
    });

    it("zero amount no-ops silently", async () => {
      await expect(escrow.connect(server).payout(TID_A, w1.address, 0n)).to.not.be.reverted;
      expect(await token.balanceOf(w1.address)).to.equal(0n);
    });

    it("rejects unauthorized caller", async () => {
      await expect(escrow.connect(stranger).payout(TID_A, w1.address, 1n))
        .to.be.revertedWith("Not authorized server");
    });

    it("rejects exceeds pool", async () => {
      await expect(escrow.connect(server).payout(TID_A, w1.address, ethers.parseEther("101")))
        .to.be.revertedWith("Exceeds pool");
    });

    it("rejects zero winner", async () => {
      await expect(escrow.connect(server).payout(TID_A, ethers.ZeroAddress, 1n))
        .to.be.revertedWith("Invalid winner");
    });

    it("rejects payout on a cancelled pool", async () => {
      await escrow.connect(server).cancelTournament(TID_A);
      await expect(escrow.connect(server).payout(TID_A, w1.address, 1n))
        .to.be.revertedWith("Cancelled");
    });

    it("rejects payout on a non-existent pool", async () => {
      await expect(escrow.connect(server).payout(TID_B, w1.address, 1n))
        .to.be.revertedWith("No pool");
    });
  });

  describe("payoutMultiple", () => {
    beforeEach(async () => {
      const amt = ethers.parseEther("100");
      await token.connect(creator).approve(escrow.target, amt);
      await escrow.connect(creator).depositPrizePool(TID_A, token.target, amt);
    });

    it("pays multiple winners atomically in one tx", async () => {
      const winners = [w1.address, w2.address, w3.address];
      const amounts = [ethers.parseEther("50"), ethers.parseEther("30"), ethers.parseEther("20")];
      await escrow.connect(server).payoutMultiple(TID_A, winners, amounts);
      expect(await token.balanceOf(w1.address)).to.equal(ethers.parseEther("50"));
      expect(await token.balanceOf(w2.address)).to.equal(ethers.parseEther("30"));
      expect(await token.balanceOf(w3.address)).to.equal(ethers.parseEther("20"));
      expect((await escrow.getPool(TID_A)).amountPaidOut).to.equal(ethers.parseEther("100"));
    });

    it("rejects mismatched array lengths", async () => {
      await expect(escrow.connect(server).payoutMultiple(TID_A, [w1.address], []))
        .to.be.revertedWith("Length mismatch");
    });

    it("rejects empty array", async () => {
      await expect(escrow.connect(server).payoutMultiple(TID_A, [], []))
        .to.be.revertedWith("Empty");
    });

    it("rejects sum exceeding pool", async () => {
      await expect(escrow.connect(server).payoutMultiple(
        TID_A,
        [w1.address, w2.address],
        [ethers.parseEther("60"), ethers.parseEther("60")],
      )).to.be.revertedWith("Exceeds pool");
    });

    it("rejects unauthorized caller", async () => {
      await expect(escrow.connect(stranger).payoutMultiple(TID_A, [w1.address], [1n]))
        .to.be.revertedWith("Not authorized server");
    });

    it("zero amounts inside batch are skipped without revert", async () => {
      await escrow.connect(server).payoutMultiple(
        TID_A, [w1.address, w2.address], [ethers.parseEther("10"), 0n],
      );
      expect(await token.balanceOf(w1.address)).to.equal(ethers.parseEther("10"));
      expect(await token.balanceOf(w2.address)).to.equal(0n);
    });
  });

  // ============ Pull path ============

  describe("setUnclaimedShares + claim", () => {
    beforeEach(async () => {
      const amt = ethers.parseEther("100");
      await token.connect(creator).approve(escrow.target, amt);
      await escrow.connect(creator).depositPrizePool(TID_A, token.target, amt);
    });

    it("server sets shares; winners pull them via claim()", async () => {
      await escrow.connect(server).setUnclaimedShares(
        TID_A, [w1.address, w2.address], [ethers.parseEther("60"), ethers.parseEther("40")],
      );
      expect(await escrow.unclaimedOf(TID_A, w1.address)).to.equal(ethers.parseEther("60"));
      expect(await escrow.unclaimedOf(TID_A, w2.address)).to.equal(ethers.parseEther("40"));

      await expect(escrow.connect(w1).claim(TID_A))
        .to.emit(escrow, "Claimed")
        .withArgs(TID_A, w1.address, ethers.parseEther("60"));
      expect(await token.balanceOf(w1.address)).to.equal(ethers.parseEther("60"));
      expect(await escrow.unclaimedOf(TID_A, w1.address)).to.equal(0n);
      expect((await escrow.getPool(TID_A)).amountPaidOut).to.equal(ethers.parseEther("60"));
    });

    it("rejects setUnclaimedShares whose sum exceeds remaining", async () => {
      await expect(escrow.connect(server).setUnclaimedShares(
        TID_A, [w1.address, w2.address], [ethers.parseEther("70"), ethers.parseEther("40")],
      )).to.be.revertedWith("Shares exceed remaining");
    });

    it("setUnclaimedShares reduces remaining sum after a prior partial push", async () => {
      // Push 60 first; 40 left in the pool.
      await escrow.connect(server).payout(TID_A, w1.address, ethers.parseEther("60"));
      // Then setting 41 should fail.
      await expect(escrow.connect(server).setUnclaimedShares(
        TID_A, [w2.address], [ethers.parseEther("41")],
      )).to.be.revertedWith("Shares exceed remaining");
      // 40 is fine.
      await escrow.connect(server).setUnclaimedShares(
        TID_A, [w2.address], [ethers.parseEther("40")],
      );
      await escrow.connect(w2).claim(TID_A);
      expect(await token.balanceOf(w2.address)).to.equal(ethers.parseEther("40"));
    });

    it("idempotent overwrite: re-calling replaces prior amounts", async () => {
      await escrow.connect(server).setUnclaimedShares(
        TID_A, [w1.address], [ethers.parseEther("10")],
      );
      await escrow.connect(server).setUnclaimedShares(
        TID_A, [w1.address], [ethers.parseEther("25")],
      );
      expect(await escrow.unclaimedOf(TID_A, w1.address)).to.equal(ethers.parseEther("25"));
    });

    it("double claim rejected", async () => {
      await escrow.connect(server).setUnclaimedShares(TID_A, [w1.address], [ethers.parseEther("5")]);
      await escrow.connect(w1).claim(TID_A);
      await expect(escrow.connect(w1).claim(TID_A)).to.be.revertedWith("Nothing to claim");
    });

    it("non-winner cannot claim", async () => {
      await escrow.connect(server).setUnclaimedShares(TID_A, [w1.address], [ethers.parseEther("5")]);
      await expect(escrow.connect(w2).claim(TID_A)).to.be.revertedWith("Nothing to claim");
    });

    it("guards against double-pay if a push already drained the pool", async () => {
      // Server records 100 claimable for w1, then pushes 100 to w2 instead. w1's claim should revert.
      await escrow.connect(server).setUnclaimedShares(TID_A, [w1.address], [ethers.parseEther("100")]);
      await escrow.connect(server).payout(TID_A, w2.address, ethers.parseEther("100"));
      await expect(escrow.connect(w1).claim(TID_A)).to.be.revertedWith("Exceeds pool");
    });

    it("rejects setUnclaimedShares on cancelled pool", async () => {
      await escrow.connect(server).cancelTournament(TID_A);
      await expect(escrow.connect(server).setUnclaimedShares(
        TID_A, [w1.address], [1n],
      )).to.be.revertedWith("Cancelled");
    });

    it("rejects unauthorized caller for setUnclaimedShares", async () => {
      await expect(escrow.connect(stranger).setUnclaimedShares(
        TID_A, [w1.address], [1n],
      )).to.be.revertedWith("Not authorized server");
    });
  });

  // ============ Cancel + reclaim ============

  describe("cancel + reclaim", () => {
    beforeEach(async () => {
      const amt = ethers.parseEther("100");
      await token.connect(creator).approve(escrow.target, amt);
      await escrow.connect(creator).depositPrizePool(TID_A, token.target, amt);
    });

    it("server cancels; creator reclaims remaining", async () => {
      await expect(escrow.connect(server).cancelTournament(TID_A))
        .to.emit(escrow, "TournamentCancelled").withArgs(TID_A, creator.address);
      expect((await escrow.getPool(TID_A)).cancelled).to.equal(true);

      const balBefore = await token.balanceOf(creator.address);
      await expect(escrow.connect(creator).creatorReclaim(TID_A))
        .to.emit(escrow, "CreatorReclaimed").withArgs(TID_A, creator.address, ethers.parseEther("100"));
      expect(await token.balanceOf(creator.address)).to.equal(balBefore + ethers.parseEther("100"));
    });

    it("creator cannot reclaim before cancel", async () => {
      await expect(escrow.connect(creator).creatorReclaim(TID_A)).to.be.revertedWith("Not cancelled");
    });

    it("non-creator cannot reclaim even after cancel", async () => {
      await escrow.connect(server).cancelTournament(TID_A);
      await expect(escrow.connect(stranger).creatorReclaim(TID_A)).to.be.revertedWith("Not creator");
    });

    it("double cancel rejected", async () => {
      await escrow.connect(server).cancelTournament(TID_A);
      await expect(escrow.connect(server).cancelTournament(TID_A)).to.be.revertedWith("Already cancelled");
    });

    it("payoutRemainderTo sweeps unclaimed to a recipient", async () => {
      await escrow.connect(server).payout(TID_A, w1.address, ethers.parseEther("70"));
      await expect(escrow.connect(server).payoutRemainderTo(TID_A, stranger.address))
        .to.emit(escrow, "RemainderReclaimed").withArgs(TID_A, stranger.address, ethers.parseEther("30"));
      expect(await token.balanceOf(stranger.address)).to.equal(ethers.parseEther("30"));
    });

    it("payoutRemainderTo rejects on cancelled pool (creator path takes over)", async () => {
      await escrow.connect(server).cancelTournament(TID_A);
      await expect(escrow.connect(server).payoutRemainderTo(TID_A, stranger.address))
        .to.be.revertedWith("Cancelled");
    });
  });

  // ============ Reads ============

  describe("read helpers", () => {
    it("getRemainingBalance is 0 for unknown id", async () => {
      expect(await escrow.getRemainingBalance(TID_B)).to.equal(0n);
    });

    it("getRemainingBalance reflects payouts", async () => {
      const amt = ethers.parseEther("100");
      await token.connect(creator).approve(escrow.target, amt);
      await escrow.connect(creator).depositPrizePool(TID_A, token.target, amt);
      await escrow.connect(server).payout(TID_A, w1.address, ethers.parseEther("75"));
      expect(await escrow.getRemainingBalance(TID_A)).to.equal(ethers.parseEther("25"));
    });
  });
});
