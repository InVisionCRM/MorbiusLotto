const { expect } = require('chai');
const { ethers } = require('hardhat');

const WPLS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';
const E = (n) => ethers.parseEther(String(n));

describe('BlackjackVault', () => {
  async function fixture() {
    const [owner, player, morbiusTreasury, plsTreasury, stranger] = await ethers.getSigners();

    const Token = await ethers.getContractFactory('TestToken');
    const morb = await Token.deploy();
    await morb.waitForDeployment();

    const Router = await ethers.getContractFactory('MockPulseXRouter');
    const router = await Router.deploy(1000); // 1 PLS -> 1000 MORBIUS
    await router.waitForDeployment();

    const Vault = await ethers.getContractFactory('BlackjackVault');
    const vault = await Vault.deploy(
      owner.address,
      await morb.getAddress(),
      WPLS,
      await router.getAddress(),
      morbiusTreasury.address,
      plsTreasury.address
    );
    await vault.waitForDeployment();

    return { owner, player, morbiusTreasury, plsTreasury, stranger, morb, router, vault };
  }

  describe('MORBIUS deposits', () => {
    it('forwards straight to the treasury, emits DepositMORBIUS, and holds zero', async () => {
      const { player, morbiusTreasury, morb, vault } = await fixture();
      const vaultAddr = await vault.getAddress();
      await morb.mint(player.address, E(500));
      await morb.connect(player).approve(vaultAddr, E(500));

      await expect(vault.connect(player).depositMORBIUS(E(500)))
        .to.emit(vault, 'DepositMORBIUS')
        .withArgs(player.address, E(500));

      expect(await morb.balanceOf(morbiusTreasury.address)).to.equal(E(500));
      expect(await morb.balanceOf(vaultAddr)).to.equal(0n);
    });

    it('reverts below MIN_DEPOSIT', async () => {
      const { player, morb, vault } = await fixture();
      await morb.mint(player.address, E(1));
      await morb.connect(player).approve(await vault.getAddress(), E(1));
      await expect(vault.connect(player).depositMORBIUS(E('0.5'))).to.be.revertedWith('Deposit too small');
    });

    it('is blocked while paused and works again after unpause', async () => {
      const { owner, player, morb, vault } = await fixture();
      await morb.mint(player.address, E(2));
      await morb.connect(player).approve(await vault.getAddress(), E(2));

      await vault.connect(owner).pause();
      await expect(vault.connect(player).depositMORBIUS(E(1))).to.be.revertedWithCustomError(vault, 'EnforcedPause');

      await vault.connect(owner).unpause();
      await expect(vault.connect(player).depositMORBIUS(E(1))).to.emit(vault, 'DepositMORBIUS');
    });
  });

  describe('PLS deposits', () => {
    it('forwards PLS to treasury, emits Deposit with MORBIUS-equivalent, and holds zero', async () => {
      const { player, plsTreasury, vault } = await fixture();
      const vaultAddr = await vault.getAddress();
      const before = await ethers.provider.getBalance(plsTreasury.address);

      await expect(vault.connect(player).deposit({ value: E(2) }))
        .to.emit(vault, 'Deposit')
        .withArgs(player.address, E(2000), E(2)); // 2 PLS * 1000 = 2000 MORBIUS

      expect(await ethers.provider.getBalance(plsTreasury.address)).to.equal(before + E(2));
      expect(await ethers.provider.getBalance(vaultAddr)).to.equal(0n);
    });

    it('reverts below MIN_DEPOSIT', async () => {
      const { player, vault } = await fixture();
      await expect(vault.connect(player).deposit({ value: E('0.5') })).to.be.revertedWith('Deposit too small');
    });

    it('reverts a bare PLS transfer (forces use of deposit())', async () => {
      const { player, vault } = await fixture();
      await expect(player.sendTransaction({ to: await vault.getAddress(), value: E(1) })).to.be.revertedWith(
        'Use deposit() to add funds'
      );
    });
  });

  describe('anti-trap rescue hatch', () => {
    it('lets the owner recover stray ERC20 sent directly to the contract', async () => {
      const { owner, stranger, morb, vault } = await fixture();
      const vaultAddr = await vault.getAddress();
      await morb.mint(vaultAddr, E(123)); // simulate a stray transfer

      await expect(
        vault.connect(stranger).rescueTokens(await morb.getAddress(), stranger.address, E(123))
      ).to.be.revertedWithCustomError(vault, 'OwnableUnauthorizedAccount');

      await vault.connect(owner).rescueTokens(await morb.getAddress(), owner.address, E(123));
      expect(await morb.balanceOf(vaultAddr)).to.equal(0n);
      expect(await morb.balanceOf(owner.address)).to.equal(E(123));
    });
  });

  describe('admin', () => {
    it('setMorbiusTreasury / setPlsTreasury are owner-only and update state', async () => {
      const { owner, stranger, vault } = await fixture();
      await expect(vault.connect(stranger).setMorbiusTreasury(stranger.address)).to.be.revertedWithCustomError(
        vault,
        'OwnableUnauthorizedAccount'
      );
      await vault.connect(owner).setMorbiusTreasury(stranger.address);
      expect(await vault.morbiusTreasury()).to.equal(stranger.address);

      await vault.connect(owner).setPlsTreasury(stranger.address);
      expect(await vault.plsTreasury()).to.equal(stranger.address);
    });

    it('rejects zero-address treasuries', async () => {
      const { owner, vault } = await fixture();
      await expect(vault.connect(owner).setMorbiusTreasury(ethers.ZeroAddress)).to.be.revertedWith('Invalid treasury');
    });
  });

  describe('constructor', () => {
    it('rejects zero addresses', async () => {
      const [owner, , morbiusTreasury, plsTreasury] = await ethers.getSigners();
      const Vault = await ethers.getContractFactory('BlackjackVault');
      const router = await (await ethers.getContractFactory('MockPulseXRouter')).deploy(1000);
      const morb = await (await ethers.getContractFactory('TestToken')).deploy();
      await expect(
        Vault.deploy(owner.address, ethers.ZeroAddress, WPLS, await router.getAddress(), morbiusTreasury.address, plsTreasury.address)
      ).to.be.revertedWith('Invalid MORBIUS');
      await expect(
        Vault.deploy(owner.address, await morb.getAddress(), WPLS, await router.getAddress(), ethers.ZeroAddress, plsTreasury.address)
      ).to.be.revertedWith('Invalid MORBIUS treasury');
    });
  });
});
