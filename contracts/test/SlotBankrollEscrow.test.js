const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * SlotBankrollEscrow — the slots-only bankroll vault.
 *
 * The two properties that justify a separate contract rather than reusing the
 * tournament escrow get the most attention here: pools are isolated from each
 * other, and fee-on-transfer tokens are credited at what actually arrived.
 */

const MACHINE_A = ethers.id("machine-a");
const MACHINE_B = ethers.id("machine-b");
const ZERO = ethers.ZeroHash;

describe("SlotBankrollEscrow", () => {
  let escrow, token, owner, server, creator, other, player, stranger;

  beforeEach(async () => {
    [owner, server, creator, other, player, stranger] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("TestToken");
    token = await Token.deploy();
    for (const s of [creator, other, stranger]) {
      await token.mint(s.address, ethers.parseEther("1000000"));
    }
    const Escrow = await ethers.getContractFactory("SlotBankrollEscrow");
    escrow = await Escrow.connect(owner).deploy(server.address);
  });

  const fund = async (signer, machineId, amount, tok = token) => {
    await tok.connect(signer).approve(await escrow.getAddress(), amount);
    return escrow.connect(signer).fundBankroll(machineId, await tok.getAddress(), amount);
  };

  describe("construction + admin", () => {
    it("sets the authorized server and owner", async () => {
      expect(await escrow.authorizedServer()).to.equal(server.address);
      expect(await escrow.owner()).to.equal(owner.address);
    });

    it("rejects a zero server at construction", async () => {
      const Escrow = await ethers.getContractFactory("SlotBankrollEscrow");
      await expect(Escrow.deploy(ethers.ZeroAddress)).to.be.revertedWith("Invalid server");
    });

    it("only the owner may rotate the server key", async () => {
      await expect(escrow.connect(stranger).setAuthorizedServer(other.address)).to.be.reverted;
      await expect(escrow.connect(owner).setAuthorizedServer(other.address))
        .to.emit(escrow, "AuthorizedServerChanged")
        .withArgs(server.address, other.address);
      expect(await escrow.authorizedServer()).to.equal(other.address);
    });
  });

  describe("funding", () => {
    it("credits a deposit and locks the pool's token", async () => {
      const amount = ethers.parseEther("1000");
      await expect(fund(creator, MACHINE_A, amount))
        .to.emit(escrow, "BankrollFunded")
        .withArgs(MACHINE_A, await token.getAddress(), amount, creator.address);

      const b = await escrow.getBankroll(MACHINE_A);
      expect(b.token).to.equal(await token.getAddress());
      expect(b.totalFunded).to.equal(amount);
      expect(b.totalPaidOut).to.equal(0n);
      expect(b.remaining).to.equal(amount);
      expect(b.frozen).to.equal(false);
      expect(b.createdAt).to.be.greaterThan(0n);
    });

    it("accumulates across funders", async () => {
      await fund(creator, MACHINE_A, ethers.parseEther("100"));
      await fund(other, MACHINE_A, ethers.parseEther("50"));
      expect(await escrow.available(MACHINE_A)).to.equal(ethers.parseEther("150"));
    });

    it("refuses a different token for an existing machine", async () => {
      const Token = await ethers.getContractFactory("TestToken");
      const other2 = await Token.deploy();
      await other2.mint(creator.address, ethers.parseEther("100"));
      await fund(creator, MACHINE_A, ethers.parseEther("10"));
      await expect(
        fund(creator, MACHINE_A, ethers.parseEther("10"), other2)
      ).to.be.revertedWith("Token mismatch for this machine");
    });

    it("rejects zero machine, zero token and zero amount", async () => {
      const addr = await token.getAddress();
      await token.connect(creator).approve(await escrow.getAddress(), ethers.parseEther("10"));
      await expect(
        escrow.connect(creator).fundBankroll(ZERO, addr, ethers.parseEther("1"))
      ).to.be.revertedWith("Invalid machine");
      await expect(
        escrow.connect(creator).fundBankroll(MACHINE_A, ethers.ZeroAddress, ethers.parseEther("1"))
      ).to.be.revertedWith("Invalid token");
      await expect(
        escrow.connect(creator).fundBankroll(MACHINE_A, addr, 0)
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("credits only what actually arrived from a fee-on-transfer token", async () => {
      const Fee = await ethers.getContractFactory("FeeToken");
      const fee = await Fee.deploy(500); // 5% burned in transit
      await fee.mint(creator.address, ethers.parseEther("1000"));

      const sent = ethers.parseEther("1000");
      const expected = (sent * 9500n) / 10000n;

      await expect(fund(creator, MACHINE_A, sent, fee))
        .to.emit(escrow, "BankrollFunded")
        .withArgs(MACHINE_A, await fee.getAddress(), expected, creator.address);

      // The books match the vault's real balance — never more.
      expect(await escrow.available(MACHINE_A)).to.equal(expected);
      expect(await fee.balanceOf(await escrow.getAddress())).to.equal(expected);
    });
  });

  describe("payout", () => {
    beforeEach(async () => {
      await fund(creator, MACHINE_A, ethers.parseEther("1000"));
    });

    it("pays a player and decrements the pool", async () => {
      const before = await token.balanceOf(player.address);
      await expect(escrow.connect(server).payout(MACHINE_A, player.address, ethers.parseEther("250")))
        .to.emit(escrow, "BankrollPaidOut")
        .withArgs(MACHINE_A, player.address, ethers.parseEther("250"));

      expect(await token.balanceOf(player.address)).to.equal(before + ethers.parseEther("250"));
      expect(await escrow.available(MACHINE_A)).to.equal(ethers.parseEther("750"));
    });

    it("only the authorized server may pay out", async () => {
      for (const who of [stranger, creator, owner]) {
        await expect(
          escrow.connect(who).payout(MACHINE_A, player.address, ethers.parseEther("1"))
        ).to.be.revertedWith("Not authorized server");
      }
    });

    it("cannot overdraw its own pool", async () => {
      await expect(
        escrow.connect(server).payout(MACHINE_A, player.address, ethers.parseEther("1000.1"))
      ).to.be.revertedWith("Exceeds machine bankroll");
    });

    it("cannot drain another machine's bankroll", async () => {
      // B is funded with a little; A holds a lot. A payout on B is capped at B.
      await fund(other, MACHINE_B, ethers.parseEther("10"));
      await expect(
        escrow.connect(server).payout(MACHINE_B, player.address, ethers.parseEther("500"))
      ).to.be.revertedWith("Exceeds machine bankroll");

      // B can still spend its own, and A is untouched throughout.
      await escrow.connect(server).payout(MACHINE_B, player.address, ethers.parseEther("10"));
      expect(await escrow.available(MACHINE_B)).to.equal(0n);
      expect(await escrow.available(MACHINE_A)).to.equal(ethers.parseEther("1000"));
    });

    it("rejects unknown machines, zero recipients and zero amounts", async () => {
      await expect(
        escrow.connect(server).payout(ethers.id("nope"), player.address, 1n)
      ).to.be.revertedWith("Unknown machine");
      await expect(
        escrow.connect(server).payout(MACHINE_A, ethers.ZeroAddress, 1n)
      ).to.be.revertedWith("Invalid recipient");
      await expect(
        escrow.connect(server).payout(MACHINE_A, player.address, 0)
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("has no owner-drain path", async () => {
      // The owner's only lever is the server key; the bankroll itself is not reachable.
      expect(escrow.interface.fragments.some((f) =>
        f.type === "function" && /emergency|drain|rescue/i.test(f.name || "")
      )).to.equal(false);
    });
  });

  describe("freeze", () => {
    beforeEach(async () => {
      await fund(creator, MACHINE_A, ethers.parseEther("100"));
    });

    it("blocks further funding but never payouts", async () => {
      await expect(escrow.connect(server).setFrozen(MACHINE_A, true))
        .to.emit(escrow, "BankrollFrozen")
        .withArgs(MACHINE_A, true);

      await expect(fund(creator, MACHINE_A, ethers.parseEther("1"))).to.be.revertedWith(
        "Bankroll frozen"
      );

      // Money already in can always come back out.
      await escrow.connect(server).payout(MACHINE_A, creator.address, ethers.parseEther("100"));
      expect(await escrow.available(MACHINE_A)).to.equal(0n);
    });

    it("is reversible and server-only", async () => {
      await expect(escrow.connect(stranger).setFrozen(MACHINE_A, true)).to.be.revertedWith(
        "Not authorized server"
      );
      await escrow.connect(server).setFrozen(MACHINE_A, true);
      await escrow.connect(server).setFrozen(MACHINE_A, false);
      await fund(creator, MACHINE_A, ethers.parseEther("1"));
      expect(await escrow.available(MACHINE_A)).to.equal(ethers.parseEther("101"));
    });
  });

  describe("sweepUnaccounted", () => {
    it("recovers only tokens sent in directly, never pooled funds", async () => {
      await fund(creator, MACHINE_A, ethers.parseEther("100"));
      // Someone transfers straight to the contract, bypassing fundBankroll.
      await token.connect(stranger).transfer(await escrow.getAddress(), ethers.parseEther("7"));

      const before = await token.balanceOf(owner.address);
      await escrow
        .connect(owner)
        .sweepUnaccounted(await token.getAddress(), ethers.parseEther("100"), owner.address);
      expect(await token.balanceOf(owner.address)).to.equal(before + ethers.parseEther("7"));

      // The pool is untouched and still fully payable.
      expect(await escrow.available(MACHINE_A)).to.equal(ethers.parseEther("100"));
      await escrow.connect(server).payout(MACHINE_A, player.address, ethers.parseEther("100"));
    });

    it("reverts rather than letting the owner understate what is owed", async () => {
      await fund(creator, MACHINE_A, ethers.parseEther("100"));
      // Claiming only 1 token is owed would hand the owner the other 99 —
      // the balance check has to stop it.
      await expect(
        escrow
          .connect(owner)
          .sweepUnaccounted(await token.getAddress(), ethers.parseEther("100"), owner.address)
      ).to.be.revertedWith("Nothing unaccounted");
    });

    it("is owner-only", async () => {
      await fund(creator, MACHINE_A, ethers.parseEther("100"));
      await expect(
        escrow.connect(stranger).sweepUnaccounted(await token.getAddress(), 0, stranger.address)
      ).to.be.reverted;
    });
  });
});
