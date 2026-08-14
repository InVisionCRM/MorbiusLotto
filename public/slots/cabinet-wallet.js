/* ─────────────────────────────────────────────────────────────────────────
   cabinet-wallet.js — vanilla wallet helpers for the community-slots pages
   (the slot builder's community panel and the /embed/[slug] money bar).

   These are static HTML pages, not bundled React routes, so there is no
   wagmi here — just window.ethereum, hand-encoded calldata for the two
   calls this flow needs, and the same /api/auth/* SIWE contract the rest
   of the site uses (server/src/routes/auth.routes.ts). A session created
   here is the same morb_session cookie the app uses everywhere.

   Funding mirrors the poker escrow buy-in exactly
   (components/poker/tournament/EscrowBuyInJoinPanel.tsx):
     1. approve(escrow, amount) on the token
     2. addToPrizePool(poolId, token, amount) on the Tournament Prize Escrow
   The pool id and escrow address come from the machine's public
   /bankroll endpoint — clients never derive them locally.
   ───────────────────────────────────────────────────────────────────────── */
(function(){
'use strict';

/* Function selectors — keccak-derived once, fixed by the ABI:
     approve(address,uint256)                 = 0x095ea7b3  (ERC-20 standard)
     addToPrizePool(bytes32,address,uint256)  = 0x55aa3f69  (escrow V5/V6)   */
var SEL_APPROVE = '0x095ea7b3';
var SEL_ADD_TO_PRIZE_POOL = '0x55aa3f69';
var PULSECHAIN_ID_HEX = '0x171'; // 369

function eth(){ if(!window.ethereum) throw new Error('No wallet found — install MetaMask or another EVM wallet.'); return window.ethereum; }
function pad32(hexNo0x){ return hexNo0x.replace(/^0x/,'').padStart(64,'0'); }
function encAddress(addr){ return pad32(addr.toLowerCase()); }
function encUint(v){ return pad32(BigInt(v).toString(16)); }
function utf8ToHex(str){ var b=new TextEncoder().encode(str),h='0x'; for(var i=0;i<b.length;i++)h+=b[i].toString(16).padStart(2,'0'); return h; }

/** "1.5" tokens at 18 decimals → "1500000000000000000" (base-unit string). */
function toBaseUnits(human, decimals){
  var s=String(human).trim();
  if(!/^\d+(\.\d+)?$/.test(s)) throw new Error('Enter a plain number, e.g. 1.5');
  var parts=s.split('.'), whole=parts[0], frac=parts[1]||'';
  if(frac.length>decimals) frac=frac.slice(0,decimals);
  while(frac.length<decimals) frac+='0';
  var v=BigInt(whole)*(10n**BigInt(decimals))+BigInt(frac||'0');
  if(v<=0n) throw new Error('Amount must be greater than zero');
  return v.toString();
}
/** Base-unit string → human display with up to 4 decimal places. */
function fromBaseUnits(base, decimals){
  var v=BigInt(base), d=10n**BigInt(decimals);
  var whole=v/d, frac=v%d;
  var fs=frac.toString().padStart(decimals,'0').slice(0,4).replace(/0+$/,'');
  return whole.toString()+(fs?'.'+fs:'');
}

function apiFetch(base, path, opts){
  opts=opts||{}; opts.credentials='include';
  if(opts.body){ opts.headers=opts.headers||{}; opts.headers['Content-Type']='application/json'; }
  return fetch(base+path, opts).then(function(r){
    return r.json().catch(function(){ return {}; }).then(function(body){
      if(!r.ok||body.ok===false) throw new Error((body&&body.error)||('request failed ('+r.status+')'));
      return body;
    });
  });
}

/** Connect the wallet; returns the selected address. */
function connect(){
  return eth().request({method:'eth_requestAccounts'}).then(function(accounts){
    var a=accounts&&accounts[0];
    if(!a) throw new Error('No account returned by wallet');
    return a;
  });
}

/** Already signed in? Resolves the session address or null. */
function me(apiBase){
  return apiFetch(apiBase,'/api/auth/me').then(function(r){ return r.address; }).catch(function(){ return null; });
}

/** Full SIWE sign-in against the site's auth routes. Returns the address. */
function siweSignIn(apiBase, domain, statement){
  var address;
  return connect().then(function(a){
    address=a;
    return apiFetch(apiBase,'/api/auth/nonce');
  }).then(function(n){
    var message=domain+' wants you to sign in with your Ethereum account:\n'+address+
      '\n\n'+statement+'\n\n'+
      'URI: '+location.origin+'\nVersion: 1\nChain ID: 369\nNonce: '+n.nonce+'\nIssued At: '+new Date().toISOString();
    return eth().request({method:'personal_sign',params:[utf8ToHex(message),address]}).then(function(signature){
      return apiFetch(apiBase,'/api/auth/verify',{method:'POST',body:JSON.stringify({message:message,signature:signature})});
    });
  }).then(function(r){ return r.address||address; });
}

/** Send a raw contract call from `from`; resolves the tx hash. */
function sendTx(from, to, data){
  return eth().request({method:'eth_sendTransaction',params:[{from:from,to:to,data:data,chainId:PULSECHAIN_ID_HEX}]});
}

function approve(from, token, spender, amountBaseUnits){
  return sendTx(from, token, SEL_APPROVE+encAddress(spender)+encUint(amountBaseUnits));
}

function fundPool(from, escrow, poolIdBytes32, token, amountBaseUnits){
  return sendTx(from, escrow, SEL_ADD_TO_PRIZE_POOL+pad32(poolIdBytes32)+encAddress(token)+encUint(amountBaseUnits));
}

/** Poll for the receipt; resolves on success, rejects on revert/timeout. */
function waitTx(hash, timeoutMs){
  var deadline=Date.now()+(timeoutMs||120000);
  return new Promise(function(resolve,reject){
    (function poll(){
      eth().request({method:'eth_getTransactionReceipt',params:[hash]}).then(function(r){
        if(r&&r.status==='0x1') return resolve(r);
        if(r&&r.status==='0x0') return reject(new Error('Transaction reverted on-chain'));
        if(Date.now()>deadline) return reject(new Error('Timed out waiting for the transaction — check your wallet'));
        setTimeout(poll, 2500);
      }).catch(function(){ setTimeout(poll, 2500); });
    })();
  });
}

window.CabinetWallet={
  connect:connect, me:me, siweSignIn:siweSignIn,
  approve:approve, fundPool:fundPool, waitTx:waitTx,
  toBaseUnits:toBaseUnits, fromBaseUnits:fromBaseUnits,
  apiFetch:apiFetch,
};
})();
