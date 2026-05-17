const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * TournamentPrizeEscrowV6 — gas-optimized successor to V5.
 *
 * Behavioral parity tests mirror V5 (same revert messages, same getPool shape).
 * V6-specific additions: packed-struct read sanity + `*WithPermit` entrypoints.
 */

const TID_A = ethers.id("tournament-a");
const TID_B = ethers.id("tournament-b");

describe("TournamentPrizeEscrowV6", () => {
  let escrow, token, owner, server, creator, w1, w2, w3, stranger;

  beforeEach(async () => {
    [owner, server, creator, w1, w2, w3, stranger] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("TestToken");
    token = await Token.deploy();
    await token.mint(creator.address, ethers.parseEther("1000000"));
    await token.mint(w1.address, ethers.parseEther("1000000"));
    await token.mint(w2.address, ethers.parseEther("1000000"));
    await token.mint(w3.address, ethers.parseEther("1000000"));

    const Escrow = await ethers.getContractFactory("TournamentPrizeEscrowV6");
    escrow = await Escrow.connect(owner).deploy(server.address);
  });

  describe("construction + admin", () => {
    it("sets owner to deployer and stores authorizedServer", async () => {
      expect(await escrow.owner()).to.equal(owner.address);
      expect(await escrow.authorizedServer()).to.equal(server.address);
    });

    it("rejects zero authorizedServer in constructor", async () => {
      const Escrow = await ethers.getContractFactory("TournamentPrizeEscrowV6");
      await expect(Escrow.deploy(ethers.ZeroAddress)).to.be.revertedWith("Invalid server");
    });
  });

  describe("depositPrizePool", () => {
    it("transfers tokens and stores pool state (depositor = creator)", async () => {
      const amt = ethers.parseEther("100");
      await token.connect(creator).approve(escrow.target, amt);
      await escrow.connect(creator).depositPrizePool(TID_A, token.target, amt);
      const p = await escrow.getPool(TID_A);
      expect(p.token).to.equal(token.target);
      expect(p.depositor).to.equal(creator.address);
      expect(p.totalDeposited).to.equal(amt);
      expect(p.amountPaidOut).to.equal(0n);
      expect(p.cancelled).to.equal(false);
      expect(p.depositedAt).to.be.greaterThan(0n);
    });

    it("rejects double deposit at same id", async () => {
      const amt = ethers.parseEther("100");
      await token.connect(creator).approve(escrow.target, amt * 2n);
      await escrow.connect(creator).depositPrizePool(TID_A, token.target, amt);
      await expect(escrow.connect(creator).depositPrizePool(TID_A, token.target, amt))
        .to.be.revertedWith("Already deposited");
    });

    it("rejects amount > uint128.max", async () => {
      const tooBig = (1n << 128n); // exactly 2^128, exceeds uint128.max
      await expect(
        escrow.connect(creator).depositPrizePool(TID_A, token.target, tooBig),
      ).to.be.revertedWith("Amount too large");
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

    it("rejects per-add amount > uint128.max", async () => {
      const tooBig = (1n << 128n);
      await expect(
        escrow.connect(w1).addToPrizePool(TID_A, token.target, tooBig),
      ).to.be.revertedWith("Amount too large");
    });
  });

  describe("payout (single)", () => {
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

    it("rejects unauthorized callers", async () => {
      await expect(
        escrow.connect(stranger).payout(TID_A, w1.address, ethers.parseEther("1")),
      ).to.be.revertedWith("Not authorized server");
    });

    it("rejects payout exceeding pool", async () => {
      await expect(
        escrow.connect(server).payout(TID_A, w1.address, ethers.parseEther("101")),
      ).to.be.revertedWith("Exceeds pool");
    });
  });

  describe("payoutMultiple", () => {
    beforeEach(async () => {
      const amt = ethers.parseEther("100");
      await token.connect(creator).approve(escrow.target, amt);
      await escrow.connect(creator).depositPrizePool(TID_A, token.target, amt);
    });

    it("distributes amounts as wei (not percentages)", async () => {
      await escrow.connect(server).payoutMultiple(
        TID_A,
        [w1.address, w2.address, w3.address],
        [ethers.parseEther("50"), ethers.parseEther("30"), ethers.parseEther("20")],
      );
      expect(await token.balanceOf(w1.address)).to.equal(ethers.parseEther("1000050"));
      expect(await token.balanceOf(w2.address)).to.equal(ethers.parseEther("1000030"));
      expect(await token.balanceOf(w3.address)).to.equal(ethers.parseEther("1000020"));
      const p = await escrow.getPool(TID_A);
      expect(p.amountPaidOut).to.equal(ethers.parseEther("100"));
    });
  });

  describe("pull payouts (claim path)", () => {
    beforeEach(async () => {
      const amt = ethers.parseEther("100");
      await token.connect(creator).approve(escrow.target, amt);
      await escrow.connect(creator).depositPrizePool(TID_A, token.target, amt);
    });

    it("server sets shares; winners claim independently", async () => {
      await escrow.connect(server).setUnclaimedShares(
        TID_A,
        [w1.address, w2.address],
        [ethers.parseEther("40"), ethers.parseEther("60")],
      );
      expect(await escrow.unclaimedOf(TID_A, w1.address)).to.equal(ethers.parseEther("40"));

      const before = await token.balanceOf(w1.address);
      await escrow.connect(w1).claim(TID_A);
      expect(await token.balanceOf(w1.address)).to.equal(before + ethers.parseEther("40"));
      expect(await escrow.unclaimedOf(TID_A, w1.address)).to.equal(0n);

      await expect(escrow.connect(w1).claim(TID_A)).to.be.revertedWith("Nothing to claim");
    });
  });

  describe("cancel + creator reclaim (freeroll depositor)", () => {
    beforeEach(async () => {
      const amt = ethers.parseEther("100");
      await token.connect(creator).approve(escrow.target, amt);
      await escrow.connect(creator).depositPrizePool(TID_A, token.target, amt);
    });

    it("server cancels; creator reclaims remaining", async () => {
      await escrow.connect(server).cancelTournament(TID_A);
      await expect(escrow.connect(creator).creatorReclaim(TID_A))
        .to.emit(escrow, "CreatorReclaimed")
        .withArgs(TID_A, creator.address, ethers.parseEther("100"));
    });

    it("non-creator cannot reclaim", async () => {
      await escrow.connect(server).cancelTournament(TID_A);
      await expect(escrow.connect(stranger).creatorReclaim(TID_A)).to.be.revertedWith("Not creator");
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

  // ============ V6-specific: permit entrypoints ============

  describe("*WithPermit (EIP-2612)", () => {
    let permitToken;

    beforeEach(async () => {
      const PT = await ethers.getContractFactory("TestPermitToken");
      permitToken = await PT.deploy();
      await permitToken.mint(creator.address, ethers.parseEther("1000"));
      await permitToken.mint(w1.address, ethers.parseEther("1000"));
    });

    async function signPermit(signer, owner, spender, value, deadline) {
      const nonce = await permitToken.nonces(owner);
      const name = await permitToken.name();
      const network = await ethers.provider.getNetwork();
      const domain = {
        name,
        version: "1",
        chainId: network.chainId,
        verifyingContract: permitToken.target,
      };
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const message = { owner, spender, value, nonce, deadline };
      const sig = await signer.signTypedData(domain, types, message);
      return ethers.Signature.from(sig);
    }

    it("depositPrizePoolWithPermit deposits in a single tx", async () => {
      const amt = ethers.parseEther("42");
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const sig = await signPermit(creator, creator.address, escrow.target, amt, deadline);

      await escrow
        .connect(creator)
        .depositPrizePoolWithPermit(TID_A, permitToken.target, amt, deadline, sig.v, sig.r, sig.s);

      const p = await escrow.getPool(TID_A);
      expect(p.token).to.equal(permitToken.target);
      expect(p.depositor).to.equal(creator.address);
      expect(p.totalDeposited).to.equal(amt);
      expect(await permitToken.balanceOf(escrow.target)).to.equal(amt);
    });

    it("addToPrizePoolWithPermit tops up an existing pool", async () => {
      const a = ethers.parseEther("10");
      const b = ethers.parseEther("15");
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const sigA = await signPermit(w1, w1.address, escrow.target, a, deadline);
      await escrow
        .connect(w1)
        .addToPrizePoolWithPermit(TID_A, permitToken.target, a, deadline, sigA.v, sigA.r, sigA.s);

      const sigB = await signPermit(w1, w1.address, escrow.target, b, deadline);
      await escrow
        .connect(w1)
        .addToPrizePoolWithPermit(TID_A, permitToken.target, b, deadline, sigB.v, sigB.r, sigB.s);

      const p = await escrow.getPool(TID_A);
      expect(p.totalDeposited).to.equal(a + b);
      expect(p.depositor).to.equal(ethers.ZeroAddress);
    });

    it("reverts if permit deadline expired", async () => {
      const amt = ethers.parseEther("1");
      const deadline = 1; // long expired
      const sig = await signPermit(creator, creator.address, escrow.target, amt, deadline);
      await expect(
        escrow
          .connect(creator)
          .depositPrizePoolWithPermit(TID_A, permitToken.target, amt, deadline, sig.v, sig.r, sig.s),
      ).to.be.reverted; // OZ ERC2612ExpiredSignature
    });
  });

  // ============ V6-specific: gas snapshot ============

  describe("gas snapshot (informational)", () => {
    it("logs gas for depositPrizePool (fresh) and addToPrizePool (top-up)", async () => {
      const amt = ethers.parseEther("100");
      await token.connect(creator).approve(escrow.target, amt * 4n);

      const txDeposit = await escrow.connect(creator).depositPrizePool(TID_A, token.target, amt);
      const rDeposit = await txDeposit.wait();
      console.log("    depositPrizePool (fresh) gas:", rDeposit.gasUsed.toString());

      const txAdd = await escrow.connect(creator).addToPrizePool(TID_A, token.target, amt);
      const rAdd = await txAdd.wait();
      console.log("    addToPrizePool   (top-up) gas:", rAdd.gasUsed.toString());

      const txNew = await escrow.connect(creator).addToPrizePool(TID_B, token.target, amt);
      const rNew = await txNew.wait();
      console.log("    addToPrizePool   (fresh)  gas:", rNew.gasUsed.toString());
    });
  });
});
