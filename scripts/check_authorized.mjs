import { createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { pulsechain } from 'viem/chains';

const ESCROW = '0x52cbF18A8AE0Fd4324B045E13532d35CF05Af3e1';
const KEY = process.argv[2];

const acct = privateKeyToAccount(KEY);
console.log('Server wallet (derived from key): ', acct.address);

const ABI = [
  { name: 'authorizedServer', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { name: 'owner', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
];
const client = createPublicClient({ chain: pulsechain, transport: http('https://rpc.pulsechain.com') });

let auth, owner;
try { auth = await client.readContract({ address: ESCROW, abi: ABI, functionName: 'authorizedServer' }); }
catch (e) { console.log('authorizedServer read failed:', e.shortMessage ?? e.message); }
try { owner = await client.readContract({ address: ESCROW, abi: ABI, functionName: 'owner' }); }
catch (e) { console.log('owner read failed:', e.shortMessage ?? e.message); }

console.log('Contract authorizedServer:        ', auth);
console.log('Contract owner:                   ', owner);
console.log();
if (auth) {
  if (auth.toLowerCase() === acct.address.toLowerCase()) {
    console.log('✅ MATCH — server wallet IS authorized to call payout/cancel');
  } else {
    console.log('❌ MISMATCH — server wallet is NOT authorized');
    console.log('   Owner needs to call setAuthorizedServer(' + acct.address + ') on the contract');
  }
}
