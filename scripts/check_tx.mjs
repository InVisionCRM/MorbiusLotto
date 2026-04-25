import { createPublicClient, http, decodeFunctionData } from 'viem';
import { pulsechain } from 'viem/chains';

const ESCROW = '0x52cbF18A8AE0Fd4324B045E13532d35CF05Af3e1';
const txHash = process.argv[2];

const ABI_DEPOSIT = [{
  name: 'depositPrizePool',
  inputs: [
    { name: 'tournamentId', type: 'bytes32' },
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
  outputs: [],
  stateMutability: 'nonpayable',
  type: 'function',
}];

const client = createPublicClient({ chain: pulsechain, transport: http('https://rpc.pulsechain.com') });
const tx = await client.getTransaction({ hash: txHash });
const receipt = await client.getTransactionReceipt({ hash: txHash });
console.log('From:    ', tx.from);
console.log('To:      ', tx.to);
console.log('Status:  ', receipt.status);
console.log('Block:   ', receipt.blockNumber.toString());
const decoded = decodeFunctionData({ abi: ABI_DEPOSIT, data: tx.input });
console.log('Function:', decoded.functionName);
console.log('  tournamentId (bytes32):', decoded.args[0]);
console.log('  token:                 ', decoded.args[1]);
console.log('  amount:                ', decoded.args[2].toString());
