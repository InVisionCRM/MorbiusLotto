import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { pulsechain } from 'viem/chains';

const ESCROW = '0x52cbF18A8AE0Fd4324B045E13532d35CF05Af3e1';
const ABI = [
  { name: 'payout', inputs: [{type:'bytes32'},{type:'address'},{type:'uint256'}], outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { name: 'authorizedServer', inputs: [], outputs: [{type:'address'}], stateMutability: 'view', type: 'function' },
];

const KEY = process.argv[2];
const account = privateKeyToAccount(KEY);
const publicClient = createPublicClient({ chain: pulsechain, transport: http('https://rpc.pulsechain.com') });

const onChainAuth = await publicClient.readContract({ address: ESCROW, abi: ABI, functionName: 'authorizedServer' });
console.log('On-chain authorizedServer:', onChainAuth);
console.log('Caller (key derives to):  ', account.address);
console.log('Match:', onChainAuth.toLowerCase() === account.address.toLowerCase());

// Use simulateContract which properly uses `from`
try {
  const result = await publicClient.simulateContract({
    account,
    address: ESCROW,
    abi: ABI,
    functionName: 'payout',
    args: ['0xb0c1b5775e9d813c8fa38948b7b45759f1f14a673633b735107c20612e94d829', '0xedee8515897281ccf27999a121a90d76e3cde016', 475000000000000000000n],
  });
  console.log('simulateContract OK:', result);
} catch (e) {
  console.log('simulateContract FAILED:');
  console.log('  ', e.shortMessage ?? e.message);
}
