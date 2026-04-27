import { createPublicClient, http, decodeFunctionData } from 'viem';
import { pulsechain } from 'viem/chains';
const ESCROW = '0x52cbF18A8AE0Fd4324B045E13532d35CF05Af3e1';
const txHash = process.argv[2];
const DEPOSIT_ABI = [{ name: 'depositPrizePool', inputs: [{ type: 'bytes32' },{ type: 'address' },{ type: 'uint256' }], outputs: [], stateMutability: 'nonpayable', type: 'function' }];
const ERC20 = [
  { name: 'allowance', inputs: [{type:'address'},{type:'address'}], outputs: [{type:'uint256'}], stateMutability:'view', type:'function' },
  { name: 'balanceOf', inputs: [{type:'address'}], outputs: [{type:'uint256'}], stateMutability:'view', type:'function' },
];
const POOL_ABI = [{ name: 'getPool', inputs: [{type:'bytes32'}], outputs: [{type:'address'},{type:'address'},{type:'uint256'},{type:'uint256'},{type:'uint256'},{type:'bool'}], stateMutability:'view', type:'function' }];
const client = createPublicClient({ chain: pulsechain, transport: http('https://rpc.pulsechain.com') });
const tx = await client.getTransaction({ hash: txHash });
const decoded = decodeFunctionData({ abi: DEPOSIT_ABI, data: tx.input });
const [bytes32Id, token, amount] = decoded.args;
console.log('From:', tx.from);
console.log('bytes32:', bytes32Id);
console.log('token:', token);
console.log('amount:', amount.toString());
const receipt = await client.getTransactionReceipt({ hash: txHash });
console.log('status:', receipt.status, 'block:', receipt.blockNumber.toString());
console.log('--- Pool state for that bytes32 ---');
try {
  const pool = await client.readContract({ address: ESCROW, abi: POOL_ABI, functionName: 'getPool', args: [bytes32Id] });
  console.log(' token:', pool[0], '| depositor:', pool[1], '| total:', pool[2].toString(), '| paid:', pool[3].toString());
  if (pool[0] !== '0x0000000000000000000000000000000000000000') {
    console.log(' >>> bytes32 ALREADY OCCUPIED. New deposit would revert with "Already deposited".');
  }
} catch (e) { console.log(' pool read failed:', e.shortMessage ?? e.message); }
console.log('--- Allowance + balance at block before tx ---');
try {
  const allowance = await client.readContract({ address: token, abi: ERC20, functionName: 'allowance', args: [tx.from, ESCROW], blockNumber: receipt.blockNumber - 1n });
  console.log(' allowance(from→escrow):', allowance.toString());
  if (allowance < amount) console.log(' >>> INSUFFICIENT ALLOWANCE');
} catch (e) { console.log(' allowance failed:', e.shortMessage ?? e.message); }
try {
  const bal = await client.readContract({ address: token, abi: ERC20, functionName: 'balanceOf', args: [tx.from], blockNumber: receipt.blockNumber - 1n });
  console.log(' caller balance:', bal.toString());
  if (bal < amount) console.log(' >>> INSUFFICIENT BALANCE');
} catch (e) { console.log(' balance failed:', e.shortMessage ?? e.message); }
console.log('--- eth_call replay at pre-tx block ---');
try {
  await client.call({ from: tx.from, to: ESCROW, data: tx.input, blockNumber: receipt.blockNumber - 1n });
  console.log(' replay: SUCCEEDED (?)');
} catch (e) {
  console.log(' revert reason:', e.shortMessage ?? e.message);
  if (e.cause) console.log(' cause:', e.cause.shortMessage ?? e.cause.message);
}
