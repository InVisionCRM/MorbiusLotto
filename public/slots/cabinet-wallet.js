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

/* Injected EIP-1193 provider only. Worth being clear about the limit: unlike
   the app's bundled routes, which go through wagmi and therefore reach
   WalletConnect and mobile wallets too, these static pages can only see a
   wallet that injects window.ethereum. */
function eth(){ if(!window.ethereum) throw new Error('No wallet detected in this browser. Open this page in your wallet’s browser, or install an EVM wallet extension.'); return window.ethereum; }

/* The same thing as a promise. Callers attach .catch() to the value we return,
   so a *synchronous* throw in here escapes their error handling completely and
   leaves the page sitting on whatever "Connecting…" text it set beforehand. */
function ethAsync(){
  try { return Promise.resolve(eth()); } catch(err){ return Promise.reject(err); }
}

/* Run `hint` if the promise has not settled within ms. Advisory only: the
   promise is left alone, so a wallet prompt the user simply had not noticed
   still works when they get to it. */
function withSlowHint(promise, ms, hint){
  var timer=setTimeout(function(){ try{ hint(); }catch(e){} }, ms);
  function clear(){ clearTimeout(timer); }
  return promise.then(function(v){ clear(); return v; }, function(e){ clear(); throw e; });
}
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

/* A request that never answers must not read as "still working" forever. */
var API_TIMEOUT_MS=25000;
/* How long a wallet may stay silent before we tell the user to go look at it.
   Wallet prompts can legitimately sit unanswered, so this only adds a hint. */
var SLOW_WALLET_MS=12000;

function apiFetch(base, path, opts){
  opts=opts||{}; opts.credentials='include';
  if(opts.body){ opts.headers=opts.headers||{}; opts.headers['Content-Type']='application/json'; }
  var timer=null;
  if(typeof AbortController==='function' && !opts.signal){
    var ctl=new AbortController();
    opts.signal=ctl.signal;
    timer=setTimeout(function(){ ctl.abort(); }, API_TIMEOUT_MS);
  }
  return fetch(base+path, opts).then(function(r){
    if(timer) clearTimeout(timer);
    return r;
  }, function(err){
    if(timer) clearTimeout(timer);
    if(err&&err.name==='AbortError') throw new Error('The server did not respond — check your connection and try again.');
    throw err;
  }).then(function(r){
    return r.json().catch(function(){ return {}; }).then(function(body){
      if(!r.ok||body.ok===false) throw new Error((body&&body.error)||('request failed ('+r.status+')'));
      return body;
    });
  });
}

/* ── EIP-55 checksumming ──────────────────────────────────────────────────
   SIWE (EIP-4361) requires line 2 of the message to carry an EIP-55
   *checksummed* address. Wallets hand back a lowercase string from
   eth_requestAccounts, and the server parses with the `siwe` package, which
   rejects anything else outright ("line 2: invalid EIP-55 address"). The app's
   bundled routes get this for free from viem; these static pages have no
   bundler, and SubtleCrypto has no keccak, so the hash lives here.

   Keccak-256 (original padding 0x01, NOT SHA3's 0x06) over 64-bit lanes held
   as (lo, hi) 32-bit pairs, since JS bitwise ops are 32-bit. Called once per
   sign-in, so clarity beats speed. */
var KECCAK_RC = [
  [0x00000000,0x00000001],[0x00000000,0x00008082],[0x80000000,0x0000808a],[0x80000000,0x80008000],
  [0x00000000,0x0000808b],[0x00000000,0x80000001],[0x80000000,0x80008081],[0x80000000,0x00008009],
  [0x00000000,0x0000008a],[0x00000000,0x00000088],[0x00000000,0x80008009],[0x00000000,0x8000000a],
  [0x00000000,0x8000808b],[0x80000000,0x0000008b],[0x80000000,0x00008089],[0x80000000,0x00008003],
  [0x80000000,0x00008002],[0x80000000,0x00000080],[0x00000000,0x0000800a],[0x80000000,0x8000000a],
  [0x80000000,0x80008081],[0x80000000,0x00008080],[0x00000000,0x80000001],[0x80000000,0x80008008]
];
/* ρ offsets in lane order i = x + 5y. */
var KECCAK_ROT = [0,1,62,28,27,36,44,6,55,20,3,10,43,25,39,41,45,15,21,8,18,2,61,56,14];

function keccakF(lo, hi){
  var cLo=new Array(5), cHi=new Array(5), dLo=new Array(5), dHi=new Array(5);
  var bLo=new Array(25), bHi=new Array(25);
  var r,x,y,i;
  for(r=0;r<24;r++){
    /* θ */
    for(x=0;x<5;x++){
      cLo[x]=lo[x]^lo[x+5]^lo[x+10]^lo[x+15]^lo[x+20];
      cHi[x]=hi[x]^hi[x+5]^hi[x+10]^hi[x+15]^hi[x+20];
    }
    for(x=0;x<5;x++){
      var x1=(x+1)%5, x4=(x+4)%5;
      var rl=((cLo[x1]<<1)|(cHi[x1]>>>31))|0, rh=((cHi[x1]<<1)|(cLo[x1]>>>31))|0;
      dLo[x]=cLo[x4]^rl; dHi[x]=cHi[x4]^rh;
    }
    for(i=0;i<25;i++){ lo[i]^=dLo[i%5]; hi[i]^=dHi[i%5]; }
    /* ρ + π : B[y, 2x+3y] = rot(A[x, y], ROT[x + 5y]) */
    for(y=0;y<5;y++) for(x=0;x<5;x++){
      var src=x+5*y, n=KECCAK_ROT[src], dst=y+5*((2*x+3*y)%5);
      var al=lo[src], ah=hi[src], nl, nh, m;
      if(n===0){ nl=al; nh=ah; }
      else if(n<32){ nl=((al<<n)|(ah>>>(32-n)))|0; nh=((ah<<n)|(al>>>(32-n)))|0; }
      else if(n===32){ nl=ah; nh=al; }
      else { m=n-32; nl=((ah<<m)|(al>>>(32-m)))|0; nh=((al<<m)|(ah>>>(32-m)))|0; }
      bLo[dst]=nl; bHi[dst]=nh;
    }
    /* χ */
    for(y=0;y<5;y++) for(x=0;x<5;x++){
      var k=x+5*y, k1=(x+1)%5+5*y, k2=(x+2)%5+5*y;
      lo[k]=bLo[k]^((~bLo[k1])&bLo[k2]);
      hi[k]=bHi[k]^((~bHi[k1])&bHi[k2]);
    }
    /* ι */
    hi[0]^=KECCAK_RC[r][0]; lo[0]^=KECCAK_RC[r][1];
  }
}

/** Keccak-256 over a byte array; returns 32 bytes. */
function keccak256(bytes){
  var lo=new Array(25), hi=new Array(25), i;
  for(i=0;i<25;i++){ lo[i]=0; hi[i]=0; }
  var RATE=136, len=bytes.length;                 // 1088-bit rate = 17 lanes
  var padded=Math.ceil((len+1)/RATE)*RATE;
  var buf=new Uint8Array(padded);
  buf.set(bytes);
  buf[len]^=0x01;                                 // Keccak padding, not SHA3
  buf[padded-1]^=0x80;
  for(var off=0; off<padded; off+=RATE){
    for(var l=0;l<17;l++){
      var b=off+l*8;
      lo[l]^=(buf[b]|(buf[b+1]<<8)|(buf[b+2]<<16)|(buf[b+3]<<24));
      hi[l]^=(buf[b+4]|(buf[b+5]<<8)|(buf[b+6]<<16)|(buf[b+7]<<24));
    }
    keccakF(lo,hi);
  }
  var out=new Uint8Array(32);
  for(var j=0;j<4;j++){
    out[j*8]=lo[j]&0xff;        out[j*8+1]=(lo[j]>>>8)&0xff;
    out[j*8+2]=(lo[j]>>>16)&0xff; out[j*8+3]=(lo[j]>>>24)&0xff;
    out[j*8+4]=hi[j]&0xff;      out[j*8+5]=(hi[j]>>>8)&0xff;
    out[j*8+6]=(hi[j]>>>16)&0xff; out[j*8+7]=(hi[j]>>>24)&0xff;
  }
  return out;
}

/** Lowercase (or any-case) address → EIP-55 checksummed form. */
function toChecksumAddress(addr){
  var raw=String(addr==null?'':addr).trim().replace(/^0x/i,'').toLowerCase();
  if(!/^[0-9a-f]{40}$/.test(raw)) throw new Error('Not a valid wallet address: '+addr);
  var hash=keccak256(new TextEncoder().encode(raw)), out='0x';
  for(var i=0;i<40;i++){
    var nibble=(i%2===0)?(hash[i>>1]>>4):(hash[i>>1]&0x0f);
    out+=(nibble>=8)?raw.charAt(i).toUpperCase():raw.charAt(i);
  }
  return out;
}

/** Connect the wallet; returns the selected address, EIP-55 checksummed.
    Silent: wallets hand back the account already authorised for this origin
    without prompting. Right for follow-up calls that must come FROM the
    account already signed in (funding, deposits) — see connectWithPicker for
    the sign-in case. */
function connect(){
  return ethAsync().then(function(e){ return e.request({method:'eth_requestAccounts'}); })
  .then(function(accounts){
    var a=accounts&&accounts[0];
    if(!a) throw new Error('No account returned by wallet');
    return toChecksumAddress(a);
  });
}

function isUserRejection(err){ return !!err && err.code===4001; }

/* Errors that must stop the flow rather than be retried around: the user said
   no (4001), or the wallet already has a prompt open (-32002) — retrying that
   one just stacks a second request behind the first. Anything else is treated
   as "this wallet cannot do it", since wallets vary in how they report an
   unimplemented method. */
function isFatalWalletError(err){ return !!err && (err.code===4001 || err.code===-32002); }

/** The account list a wallet just granted, if it names exactly one. */
function singleGrantedAccount(perms){
  if(!Array.isArray(perms)) return null;
  for(var i=0;i<perms.length;i++){
    var caveats=perms[i]&&perms[i].caveats;
    if(!Array.isArray(caveats)) continue;
    for(var j=0;j<caveats.length;j++){
      var v=caveats[j]&&caveats[j].value;
      if(Array.isArray(v)&&v.length===1&&typeof v[0]==='string') return v[0];
    }
  }
  return null;
}

/** Connect, making the wallet ask WHICH account first.
    Whoever signs in owns the machines they save and is the address a
    bankroll withdrawal pays out to, so silently reusing "whatever account
    this origin was connected with once" is the wrong default here — an
    owner's deployer wallet can end up owning a machine they never meant it
    to. wallet_requestPermissions (EIP-2255) is the standard way to ask for a
    fresh account grant; wallets that implement it show their account picker.
    It is optional, so anything that does not implement it falls through to the
    plain connect rather than blocking sign-in — no wallet is assumed here. A
    rejection is the user saying no, so that is passed on, not worked around. */
function connectWithPicker(){
  return ethAsync()
    .then(function(e){ return e.request({method:'wallet_requestPermissions',params:[{eth_accounts:{}}]}); })
    .then(function(perms){
      var picked=singleGrantedAccount(perms);
      return picked ? toChecksumAddress(picked) : connect();
    }, function(err){
      if(isFatalWalletError(err)) throw err;
      return connect();
    });
}

/** Wallet error → something a player can act on. */
function walletError(err){
  if(isUserRejection(err)) return new Error('Cancelled in your wallet.');
  if(err&&err.code===-32002) return new Error('Your wallet already has a request open — finish it there first.');
  return (err instanceof Error) ? err : new Error((err&&err.message)||String(err));
}

/** Already signed in? Resolves the session address or null. */
function me(apiBase){
  return apiFetch(apiBase,'/api/auth/me').then(function(r){ return r.address; }).catch(function(){ return null; });
}

/** Full SIWE sign-in against the site's auth routes. Returns the address.
    Asks which account to use rather than assuming — the signer becomes the
    machine owner and the bankroll payout address. */
function siweSignIn(apiBase, domain, statement, onStep){
  var step=(typeof onStep==='function')?onStep:function(){};
  var address;
  /* Everything runs inside the chain so a synchronous throw (no wallet
     installed, say) surfaces through the caller's .catch() instead of
     escaping it and stranding the page mid-"Connecting…". */
  return Promise.resolve().then(function(){
    step('wallet');
    return withSlowHint(connectWithPicker(), SLOW_WALLET_MS, function(){ step('wallet-slow'); });
  }).then(function(a){
    address=a;
    step('nonce');
    return apiFetch(apiBase,'/api/auth/nonce');
  }).then(function(n){
    var message=domain+' wants you to sign in with your Ethereum account:\n'+address+
      '\n\n'+statement+'\n\n'+
      'URI: '+location.origin+'\nVersion: 1\nChain ID: 369\nNonce: '+n.nonce+'\nIssued At: '+new Date().toISOString();
    step('sign');
    var signing=ethAsync().then(function(e){
      return e.request({method:'personal_sign',params:[utf8ToHex(message),address]});
    });
    return withSlowHint(signing, SLOW_WALLET_MS, function(){ step('sign-slow'); }).then(function(signature){
      step('verify');
      return apiFetch(apiBase,'/api/auth/verify',{method:'POST',body:JSON.stringify({message:message,signature:signature})});
    });
  }).then(function(r){ return r.address||address; },
          function(err){ throw walletError(err); });
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
  connect:connect, connectWithPicker:connectWithPicker, me:me, siweSignIn:siweSignIn,
  approve:approve, fundPool:fundPool, waitTx:waitTx,
  toBaseUnits:toBaseUnits, fromBaseUnits:fromBaseUnits,
  toChecksumAddress:toChecksumAddress, apiFetch:apiFetch,
};
})();
