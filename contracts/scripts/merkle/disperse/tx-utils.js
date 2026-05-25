const { ethers } = require('ethers');

const GAS_LIMIT = 2_000_000n;
const MAX_PRIORITY_FEE = ethers.parseUnits('500000', 'gwei');

async function getTxOverrides(provider) {
  const feeData = await provider.getFeeData();
  const baseFee = feeData.gasPrice ?? ethers.parseUnits('1500000', 'gwei');
  const maxPriorityFeePerGas = MAX_PRIORITY_FEE;
  const maxFeePerGas = baseFee + maxPriorityFeePerGas;
  return {
    gasLimit: GAS_LIMIT,
    maxFeePerGas,
    maxPriorityFeePerGas,
  };
}

async function waitForReceipt(provider, hash, timeoutMs = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const receipt = await provider.getTransactionReceipt(hash);
    if (receipt) {
      if (receipt.status === 0) throw new Error(`Transaction reverted: ${hash}`);
      return receipt;
    }
    const pending = await provider.getTransaction(hash);
    if (!pending && Date.now() - start > 90000) {
      throw new Error(`Transaction not found on chain (dropped or never broadcast): ${hash}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Timed out waiting for receipt: ${hash}`);
}

async function sendContractTx(label, contract, method, args, provider, timeoutMs = 180000) {
  const fn = contract.getFunction(method);
  const runner = contract.runner;
  if (!runner) throw new Error('No signer on contract');

  for (let attempt = 1; attempt <= 3; attempt++) {
    const overrides = await getTxOverrides(provider);
    console.log(
      `  gas limit ${overrides.gasLimit.toString()}, priority ${ethers.formatUnits(overrides.maxPriorityFeePerGas, 'gwei')} gwei` +
        (attempt > 1 ? ` (retry ${attempt})` : ''),
    );
    try {
      const txReq = await fn.populateTransaction(...args, overrides);
      const tx = await runner.sendTransaction({ ...txReq, ...overrides });
      console.log(`  tx: ${tx.hash}`);
      const receipt = await waitForReceipt(provider, tx.hash, timeoutMs);
      console.log(`  confirmed block ${receipt.blockNumber} gasUsed ${receipt.gasUsed.toString()}`);
      return { tx, receipt };
    } catch (err) {
      if (attempt === 3 || !String(err.message).includes('not found on chain')) throw err;
      console.warn(`  ${label}: ${err.message} — retrying…`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  throw new Error(`Failed to send ${label} after retries`);
}

module.exports = { GAS_LIMIT, MAX_PRIORITY_FEE, getTxOverrides, waitForReceipt, sendContractTx };
