require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    pulsechain: {
      url: "https://rpc.pulsechain.com",
      chainId: 369,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      timeout: 120000,
      gas: 8000000,
      gasPrice: 500000000000000, // 500,000 gwei for PulseChain
    },
    pulsechainTestnet: {
      url: "https://rpc.v4.testnet.pulsechain.com",
      chainId: 943,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      pulsechain: "0", // PulseScan doesn't require API key
      pulsechainTestnet: "0",
    },
    customChains: [
      {
        network: "pulsechain",
        chainId: 369,
        urls: {
          apiURL: "https://api.scan.pulsechain.com/api",
          browserURL: "https://scan.pulsechain.com",
        },
      },
      {
        network: "pulsechainTestnet",
        chainId: 943,
        urls: {
          apiURL: "https://api.scan.v4.testnet.pulsechain.com/api",
          browserURL: "https://scan.v4.testnet.pulsechain.com",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  sourcify: {
    enabled: true,
  },
};
