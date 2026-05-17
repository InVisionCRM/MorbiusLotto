const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Side-by-side gas comparison: V5 (deployed) vs V6 (proposed).
 * Informational only — does not assert thresholds.
 */

const TID_A = ethers.id("tournament-a");
const TID_B = ethers.id("tournament-b");

describe("Tournament escrow V5 vs V6 — gas comparison", () => {
  let token, v5, v6, server, creator, w1;

  beforeEach(async () => {
    [, server, creator, w1] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("TestToken");
    token = await Token.deploy();
    await token.mint(creator.address, ethers.parseEther("1000000"));
    await token.mint(w1.address, ethers.parseEther("1000000"));

    const V5 = await ethers.getContractFactory("TournamentPrizeEscrowV5");
    v5 = await V5.deploy(server.address);
    const V6 = await ethers.getContractFactory("TournamentPrizeEscrowV6");
    v6 = await V6.deploy(server.address);
  });

  it("depositPrizePool (fresh)", async () => {
    const amt = ethers.parseEther("100");
    await token.connect(creator).approve(v5.target, amt);
    await token.connect(creator).approve(v6.target, amt);
    const r5 = await (await v5.connect(creator).depositPrizePool(TID_A, token.target, amt)).wait();
    const r6 = await (await v6.connect(creator).depositPrizePool(TID_A, token.target, amt)).wait();
    const delta = r5.gasUsed - r6.gasUsed;
    const pct = (Number(delta) * 100) / Number(r5.gasUsed);
    console.log(`    depositPrizePool  V5: ${r5.gasUsed}  V6: ${r6.gasUsed}  saved: ${delta} (${pct.toFixed(1)}%)`);
    expect(r6.gasUsed).to.be.lessThan(r5.gasUsed);
  });

  it("addToPrizePool (fresh — first buy-in)", async () => {
    const amt = ethers.parseEther("50");
    await token.connect(w1).approve(v5.target, amt);
    await token.connect(w1).approve(v6.target, amt);
    const r5 = await (await v5.connect(w1).addToPrizePool(TID_A, token.target, amt)).wait();
    const r6 = await (await v6.connect(w1).addToPrizePool(TID_A, token.target, amt)).wait();
    const delta = r5.gasUsed - r6.gasUsed;
    const pct = (Number(delta) * 100) / Number(r5.gasUsed);
    console.log(`    addToPrizePool    V5: ${r5.gasUsed}  V6: ${r6.gasUsed}  saved: ${delta} (${pct.toFixed(1)}%)  [fresh]`);
    expect(r6.gasUsed).to.be.lessThan(r5.gasUsed);
  });

  it("addToPrizePool (top-up — subsequent buy-in)", async () => {
    const amt = ethers.parseEther("50");
    await token.connect(w1).approve(v5.target, amt * 4n);
    await token.connect(w1).approve(v6.target, amt * 4n);
    // seed both with one prior add
    await v5.connect(w1).addToPrizePool(TID_A, token.target, amt);
    await v6.connect(w1).addToPrizePool(TID_A, token.target, amt);
    // now measure the top-up
    const r5 = await (await v5.connect(w1).addToPrizePool(TID_A, token.target, amt)).wait();
    const r6 = await (await v6.connect(w1).addToPrizePool(TID_A, token.target, amt)).wait();
    const delta = r5.gasUsed - r6.gasUsed;
    const pct = (Number(delta) * 100) / Number(r5.gasUsed);
    console.log(`    addToPrizePool    V5: ${r5.gasUsed}  V6: ${r6.gasUsed}  saved: ${delta} (${pct.toFixed(1)}%)  [top-up]`);
    expect(r6.gasUsed).to.be.lessThanOrEqual(r5.gasUsed);
  });

  it("payout (single winner)", async () => {
    const amt = ethers.parseEther("100");
    await token.connect(creator).approve(v5.target, amt);
    await token.connect(creator).approve(v6.target, amt);
    await v5.connect(creator).depositPrizePool(TID_A, token.target, amt);
    await v6.connect(creator).depositPrizePool(TID_A, token.target, amt);
    const r5 = await (await v5.connect(server).payout(TID_A, w1.address, ethers.parseEther("10"))).wait();
    const r6 = await (await v6.connect(server).payout(TID_A, w1.address, ethers.parseEther("10"))).wait();
    const delta = Number(r5.gasUsed) - Number(r6.gasUsed);
    const pct = (delta * 100) / Number(r5.gasUsed);
    console.log(`    payout            V5: ${r5.gasUsed}  V6: ${r6.gasUsed}  saved: ${delta} (${pct.toFixed(1)}%)`);
  });
});
