const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('MorbiusBatchDisperse', () => {
  async function fixture() {
    const [owner, alice, bob, stranger] = await ethers.getSigners();
    const Token = await ethers.getContractFactory('TestToken');
    const token = await Token.deploy();
    await token.waitForDeployment();
    await token.mint(owner.address, ethers.parseEther('1000000'));
    const Disperse = await ethers.getContractFactory('MorbiusBatchDisperse');
    const disperse = await Disperse.deploy();
    await disperse.waitForDeployment();
    return { owner, alice, bob, stranger, token, disperse };
  }

  it('disperseFromOwner sends correct amounts', async () => {
    const { owner, alice, bob, token, disperse } = await fixture();
    const a1 = ethers.parseEther('10');
    const a2 = ethers.parseEther('20');
    await token.connect(owner).approve(await disperse.getAddress(), a1 + a2);

    await expect(
      disperse.connect(owner).disperseFromOwner(
        94,
        await token.getAddress(),
        [alice.address, bob.address],
        [a1, a2],
      ),
    )
      .to.emit(disperse, 'BatchDispersed')
      .withArgs(94, await token.getAddress(), owner.address, 2, a1 + a2);

    expect(await token.balanceOf(alice.address)).to.equal(a1);
    expect(await token.balanceOf(bob.address)).to.equal(a2);
  });

  it('disperseFromBalance uses contract balance', async () => {
    const { owner, alice, bob, token, disperse } = await fixture();
    const amount = ethers.parseEther('5');
    await token.transfer(await disperse.getAddress(), amount);
    await disperse.connect(owner).disperseFromBalance(
      1,
      await token.getAddress(),
      [alice.address, bob.address],
      [ethers.parseEther('2'), ethers.parseEther('3')],
    );
    expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther('2'));
    expect(await token.balanceOf(bob.address)).to.equal(ethers.parseEther('3'));
  });

  it('rejects non-owner', async () => {
    const { stranger, alice, token, disperse } = await fixture();
    await expect(
      disperse.connect(stranger).disperseFromOwner(
        1,
        await token.getAddress(),
        [alice.address],
        [1n],
      ),
    ).to.be.reverted;
  });

  it('rejects length mismatch and zero amount', async () => {
    const { owner, alice, token, disperse } = await fixture();
    await expect(
      disperse.connect(owner).disperseFromOwner(
        1,
        await token.getAddress(),
        [alice.address],
        [1n, 2n],
      ),
    ).to.be.revertedWith('length mismatch');

    await expect(
      disperse.connect(owner).disperseFromOwner(
        1,
        await token.getAddress(),
        [alice.address],
        [0n],
      ),
    ).to.be.revertedWith('zero amount');
  });

  it('disperseFromOwner handles 239 recipients in one tx (holder epoch scale)', async () => {
    const { owner, token, disperse } = await fixture();
    const n = 239;
    const recipients = [];
    const amounts = [];
    let total = 0n;
    for (let i = 0; i < n; i++) {
      const wallet = ethers.Wallet.createRandom().connect(owner.provider);
      recipients.push(wallet.address);
      const amt = BigInt(i + 1) * 10n ** 12n; // dust per wallet
      amounts.push(amt);
      total += amt;
    }
    await token.mint(owner.address, total);
    await token.connect(owner).approve(await disperse.getAddress(), total);

    const tx = await disperse.connect(owner).disperseFromOwner(
      94,
      await token.getAddress(),
      recipients,
      amounts,
    );
    const receipt = await tx.wait();
    expect(receipt.status).to.equal(1);
    expect(await token.balanceOf(recipients[0])).to.equal(amounts[0]);
    expect(await token.balanceOf(recipients[n - 1])).to.equal(amounts[n - 1]);
  });
});
