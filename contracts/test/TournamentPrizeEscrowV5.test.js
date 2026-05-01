const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * TournamentPrizeEscrowV5 = V4 + addToPrizePool.
 */

const TID_A = ethers.id("tournament-a");
const TID_B = ethers.id("tournament-b");

describe("TournamentPrizeEscrowV5", () => {
  let escrow, token, owner, server, creator, w1, w2, w3, stranger;

  beforeEach(async () => {
    [owner, server, creator, w1, w2, w3, stranger] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("TestToken");
    token = await Token.deploy();
    await token.mint(creator.address, ethers.parseEther("1000000"));
    await token.mint(w1.address, ethers.parseEther("1000000"));
    await token.mint(w2.address, ethers.parseEther("1000000"));
    await token.mint(w3.address, ethers.parseEther("1000000"));

    const Escrow = await ethers.getContractFactory("TournamentPrizeEscrowV5");
    escrow = await Escrow.connect(owner).deploy(server.address);
  });

  describe("construction + admin", () => {
    it("sets owner to deployer and stores authorizedServer", async () => {
      expect(await escrow.owner()).to.equal(owner.address);
      expect(await escrow.authorizedServer()).to.equal(server.address);
    });

    it("rejects zero authorizedServer in constructor", async () => {
      const Escrow = await ethers.getContractFactory("TournamentPrizeEscrowV5");
      await expect(Escrow.deploy(ethers.ZeroAddress)).to.be.revertedWith("Invalid server");
    });
  });

  describe("depositPrizePool", () => {
    it("transfers tokens and stores pool state (depositor = creator)", async () => {
      const amt = ethers.parseEther("100");
      await token.connect(creator).approve(escrow.target, amt);
      await escrow.connect(creator).depositPrizePool(TID_A, token.target, amt);
      const p = await escrow.getPool(TID_A);
      expect(p.depositor).to.equal(creator.address);
      expect(p.totalDeposited).to.equal(amt);
    });

    it("rejects double deposit at same id", async () => {
      const amt = ethers.parseEther("100");
      await token.connect(creator).approve(escrow.target, amt * 2n);
      await escrow.connect(creator).depositPrizePool(TID_A, token.target, amt);
      await expect(escrow.connect(creator).depositPrizePool(TID_A, token.target, amt))
        .to.be.revertedWith("Already deposited");
    });
  });

  describe("addToPrizePool", () => {
    it("initializes pool with depositor zero and allows multiple adds", async () => {
      const a = ethers.parseEther("10");
      const b = ethers.parseEther("25");
      await token.connect(w1).approve(escrow.target, a + b);
      await expect(escrow.connect(w1).addToPrizePool(TID_A, token.target, a))
        .to.emit(escrow, "PrizePoolAdded")
        .withArgs(TID_A, token.target, a, w1.address);
      let p = await escrow.getPool(TID_A);
      expect(p.token).to.equal(token.target);
      expect(p.depositor).to.equal(ethers.ZeroAddress);
      expect(p.totalDeposited).to.equal(a);

      await escrow.connect(w1).addToPrizePool(TID_A, token.target, b);
      p = await escrow.getPool(TID_A);
      expect(p.totalDeposited).to.equal(a + b);
      expect(await token.balanceOf(escrow.target)).to.equal(a + b);
    });

    it("second player adds with same token", async () => {
      const a = ethers.parseEther("10");
      const b = ethers.parseEther("15");
      await token.connect(w1).approve(escrow.target, a);
      await token.connect(w2).approve(escrow.target, b);
      await escrow.connect(w1).addToPrizePool(TID_A, token.target, a);
      await escrow.connect(w2).addToPrizePool(TID_A, token.target, b);
      const p = await escrow.getPool(TID_A);
      expect(p.totalDeposited).to.equal(a + b);
      expect(p.depositor).to.equal(ethers.ZeroAddress);
    });

    it("rejects token mismatch on subsequent add", async () => {
      const Token2 = await ethers.getContractFactory("TestToken");
      const token2 = await Token2.deploy();
      await token2.mint(w1.address, ethers.parseEther("1000"));
      const a = ethers.parseEther("10");
      await token.connect(w1).approve(escrow.target, a);
      await escrow.connect(w1).addToPrizePool(TID_A, token.target, a);
      await token2.connect(w1).approve(escrow.target, a);
      await expect(
        escrow.connect(w1).addToPrizePool(TID_A, token2.target, a),
      ).to.be.revertedWith("Token mismatch");
    });

    it("addToPrizePool after depositPrizePool increases total (overlay)", async () => {
      const d = ethers.parseEther("100");
      const a = ethers.parseEther("5");
      await token.connect(creator).approve(escrow.target, d + a);
      await escrow.connect(creator).depositPrizePool(TID_A, token.target, d);
      await escrow.connect(creator).addToPrizePool(TID_A, token.target, a);
      const p = await escrow.getPool(TID_A);
      expect(p.totalDeposited).to.equal(d + a);
      expect(p.depositor).to.equal(creator.address);
    });

    it("depositPrizePool rejects if addToPrizePool initialized first", async () => {
      const a = ethers.parseEther("10");
      await token.connect(w1).approve(escrow.target, a);
      await escrow.connect(w1).addToPrizePool(TID_A, token.target, a);
      await token.connect(creator).approve(escrow.target, ethers.parseEther("5"));
      await expect(
        escrow.connect(creator).depositPrizePool(TID_A, token.target, ethers.parseEther("5")),
      ).to.be.revertedWith("Already deposited");
    });

    it("rejects add when cancelled", async () => {
      const a = ethers.parseEther("10");
      await token.connect(w1).approve(escrow.target, a * 2n);
      await escrow.connect(w1).addToPrizePool(TID_A, token.target, a);
      await escrow.connect(server).cancelTournament(TID_A);
      await expect(
        escrow.connect(w1).addToPrizePool(TID_A, token.target, a),
      ).to.be.revertedWith("Cancelled");
    });
  });

  describe("buy-in refund then cancel", () => {
    it("payoutMultiple refunds then cancel leaves nothing for creatorReclaim", async () => {
      const buy = ethers.parseEther("50");
      await token.connect(w1).approve(escrow.target, buy);
      await token.connect(w2).approve(escrow.target, buy);
      await escrow.connect(w1).addToPrizePool(TID_A, token.target, buy);
      await escrow.connect(w2).addToPrizePool(TID_A, token.target, buy);

      await escrow.connect(server).payoutMultiple(
        TID_A,
        [w1.address, w2.address],
        [buy, buy],
      );
      const mid = await escrow.getPool(TID_A);
      expect(mid.amountPaidOut).to.equal(buy * 2n);

      await escrow.connect(server).cancelTournament(TID_A);
      await expect(escrow.connect(w1).creatorReclaim(TID_A)).to.be.revertedWith("Not creator");
      expect(await escrow.getRemainingBalance(TID_A)).to.equal(0n);
    });
  });

  describe("payout (single) — funded via deposit", () => {
    beforeEach(async () => {
      const amt = ethers.parseEther("100");
      await token.connect(creator).approve(escrow.target, amt);
      await escrow.connect(creator).depositPrizePool(TID_A, token.target, amt);
    });

    it("pays a winner", async () => {
      const before = await token.balanceOf(w1.address);
      await escrow.connect(server).payout(TID_A, w1.address, ethers.parseEther("60"));
      expect(await token.balanceOf(w1.address)).to.equal(before + ethers.parseEther("60"));
    });
  });

  describe("cancel + reclaim (freeroll depositor)", () => {
    beforeEach(async () => {
      const amt = ethers.parseEther("100");
      await token.connect(creator).approve(escrow.target, amt);
      await escrow.connect(creator).depositPrizePool(TID_A, token.target, amt);
    });

    it("server cancels; creator reclaims remaining", async () => {
      await escrow.connect(server).cancelTournament(TID_A);
      await expect(escrow.connect(creator).creatorReclaim(TID_A))
        .to.emit(escrow, "CreatorReclaimed").withArgs(TID_A, creator.address, ethers.parseEther("100"));
    });
  });
});
