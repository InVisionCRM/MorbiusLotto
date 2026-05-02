/**
 * PulseChain smoke: deployed TournamentPrizeEscrow V5 is reachable and readable.
 *
 * Loads PRIVATE_KEY from repo root `.env` or `server/.env` (same keys many devs already use).
 *
 * Run from repo root:
 *   cd contracts && npx hardhat test test/TournamentPrizeEscrowV5.pulsechain.smoke.test.js --network pulsechain
 *
 * Requires:
 *   - PRIVATE_KEY in env (unlocks signer; also used by hardhat.config `pulsechain.accounts`)
 *   - Optional: TOURNAMENT_PRIZE_ESCROW_ADDRESS (defaults to lib/contracts.ts production default)
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
require("dotenv").config({ path: path.join(__dirname, "../../server/.env") });

const { expect } = require("chai");
const { ethers } = require("hardhat");

const DEFAULT_ESCROW = "0xA54da628C54d2C9885a537f18dc9c22856510eDf";

const escrowAbi = [
  "function authorizedServer() view returns (address)",
  "function getPool(bytes32) view returns (tuple(address token, address depositor, uint256 totalDeposited, uint256 amountPaidOut, uint256 depositedAt, bool cancelled))",
];

const skipPulsechain =
  !process.env.PRIVATE_KEY ||
  process.env.PRIVATE_KEY === "0x" ||
  String(process.env.PRIVATE_KEY).length < 66;

(skipPulsechain ? describe.skip : describe)(
  "TournamentPrizeEscrowV5 — PulseChain deployed smoke",
  function () {
    it("has bytecode at configured address and exposes authorizedServer + empty pool", async () => {
      const escrowAddr = process.env.TOURNAMENT_PRIZE_ESCROW_ADDRESS?.trim() || DEFAULT_ESCROW;
      const code = await ethers.provider.getCode(escrowAddr);
      expect(code, "no contract bytecode at escrow address").to.not.equal("0x");

      const escrow = new ethers.Contract(escrowAddr, escrowAbi, ethers.provider);
      const server = await escrow.authorizedServer();
      expect(server).to.not.equal(ethers.ZeroAddress);

      const tid = ethers.id("smoke-unused-tournament-bytes32");
      const p = await escrow.getPool(tid);
      expect(p.token).to.equal(ethers.ZeroAddress);
      expect(p.totalDeposited).to.equal(0n);
    });

    it("signer from PRIVATE_KEY can submit a trivial call (balance / chain)", async () => {
      const [signer] = await ethers.getSigners();
      expect(signer.address).to.match(/^0x[a-fA-F0-9]{40}$/);
      const net = await ethers.provider.getNetwork();
      expect(Number(net.chainId)).to.equal(369);
    });
  },
);
