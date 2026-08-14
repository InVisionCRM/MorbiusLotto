/**
 * /embed/[slug] — the standalone page a community-built slot machine is
 * embedded from on a third-party site via <iframe>.
 *
 * A Route Handler, not a page.tsx: the three existing branded cabinets
 * (public/green-wick-slot-lab.html etc.) are plain static shells —
 * cabinet.css + a host div + the four cabinet-*.js scripts + one
 * CabinetEngine.boot() call — and this reproduces that exact shape for a
 * server-hosted machine (defUrl -> the public GET /api/slot-machines/:slug/def
 * endpoint) instead of the static /slots/<key>.json files those three use.
 * A route handler also gives direct control over response headers, which
 * this page genuinely needs (see below) — a React page would fight that.
 *
 * Framing: this is the one page in the whole app that's SUPPOSED to be
 * iframed on someone else's origin — the opposite of the usual clickjacking
 * concern. Nothing else in this repo sets X-Frame-Options or a CSP
 * frame-ancestors today, so nothing actively blocks that yet, but if a
 * site-wide anti-framing policy is ever added, it must exclude this route.
 * We set an explicit permissive CSP here rather than depending on the
 * absence of a global policy.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiUrlOptional } from '@/lib/api-urls';

// Server-generated slugs are base64url (crypto.randomBytes(9).toString('base64url')
// in DatabaseService.createSlotMachine) — reject anything else before it
// ever reaches string interpolation into the response HTML.
const SLUG_RE = /^[A-Za-z0-9_-]{1,32}$/;

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const apiBase = getApiUrlOptional();
  if (!apiBase) {
    return new NextResponse('Embed is not configured (missing API URL).', { status: 503 });
  }

  // ?play=server — server-authoritative play credits (SIWE cookie required).
  // ?play=real   — real-money session in the machine's PRC-20 (deposits/cashouts).
  // Default stays the client-side play-money demo.
  const playParam = req.nextUrl.searchParams.get('play');
  const serverPlay = playParam === 'server' || playParam === 'real';
  const realPlay = playParam === 'real';

  const defUrl = `${apiBase}/api/slot-machines/${encodeURIComponent(slug)}/def`;
  const siweDomain = (process.env.NEXT_PUBLIC_SIWE_DOMAIN ?? 'morbius.io').trim() || 'morbius.io';

  // Real mode carries a money bar above the cabinet: SIWE sign-in gates the
  // boot, then deposit (approve → addToPrizePool → claim) and cashout run
  // through CabinetWallet against the same APIs the builder uses. Demo and
  // play-credit modes ship the exact shell they always did.
  const bootCall = `CabinetEngine.boot({
  host: '#gameHost',
  defUrl: '${escapeHtmlAttr(defUrl)}',
  key: '${escapeHtmlAttr(slug)}'${serverPlay ? `,
  serverPlay: { apiBase: '${escapeHtmlAttr(apiBase)}', slug: '${escapeHtmlAttr(slug)}'${realPlay ? ', real: true' : ''} }` : ''}
});`;

  const moneyBar = realPlay ? `
<div id="moneyBar" style="max-width:920px;margin:0 auto;padding:8px 10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;font:600 12px ui-monospace,monospace;color:#e6ecf5;background:rgba(10,16,26,.9);border-bottom:1px solid rgba(255,255,255,.08)">
  <span id="mbStatus">Checking wallet…</span>
  <button id="mbConnect" style="display:none;cursor:pointer;background:#22d3ee;color:#06222b;border:0;border-radius:6px;padding:6px 12px;font:inherit">CONNECT WALLET</button>
  <span id="mbControls" style="display:none;gap:6px;align-items:center;flex-wrap:wrap">
    <input id="mbAmount" type="text" placeholder="amount" style="width:90px;background:#0b1220;color:#e6ecf5;border:1px solid rgba(255,255,255,.15);border-radius:6px;padding:5px 8px;font:inherit"/>
    <button id="mbDeposit" style="cursor:pointer;background:#34d399;color:#052e1d;border:0;border-radius:6px;padding:6px 12px;font:inherit">DEPOSIT</button>
    <button id="mbCashout" style="cursor:pointer;background:#f59e0b;color:#2b1902;border:0;border-radius:6px;padding:6px 12px;font:inherit">CASH OUT ALL</button>
  </span>
  <span id="mbMsg" style="opacity:.85"></span>
</div>` : '';

  const moneyBarScript = realPlay ? `
<script>
(function(){
  var API='${escapeHtmlAttr(apiBase)}', SLUG='${escapeHtmlAttr(slug)}', DOMAIN='${escapeHtmlAttr(siweDomain)}';
  var W=window.CabinetWallet, info=null;
  function $(id){ return document.getElementById(id); }
  function msg(t){ $('mbMsg').textContent=t||''; }
  function status(t){ $('mbStatus').textContent=t; }
  function boot(){ bootCabinet(); $('mbControls').style.display='inline-flex'; $('mbConnect').style.display='none'; }
  function refreshBalance(){
    W.apiFetch(API,'/api/slot-machines/'+SLUG+'/session?mode=real').then(function(s){
      CabinetEngine.setBalance(s.balance);
    }).catch(function(){});
  }
  W.apiFetch(API,'/api/slot-machines/'+SLUG+'/bankroll').then(function(b){
    info=b;
    if(!b.token){ status('This machine has no betting token — real-money play unavailable.'); return; }
    status('Token: '+(b.token.symbol||'?')+(b.feeWarning?' (fee-on-transfer warning)':''));
    return W.me(API).then(function(addr){
      if(addr){ boot(); msg('Signed in as '+addr.slice(0,6)+'…'+addr.slice(-4)); }
      else{
        $('mbConnect').style.display='inline-block';
        $('mbConnect').addEventListener('click',function(){
          msg('Connecting…');
          W.siweSignIn(API, DOMAIN, 'Sign in to MORBIUS to play this machine for real. Bets leave your session balance, never your wallet directly.')
            .then(function(a){ boot(); msg('Signed in as '+a.slice(0,6)+'…'+a.slice(-4)); })
            .catch(function(e){ msg('Sign-in failed: '+(e&&e.message||e)); });
        });
      }
    });
  }).catch(function(e){ status('Could not load machine info: '+(e&&e.message||e)); });

  $('mbDeposit').addEventListener('click',function(){
    if(!info||!info.token) return;
    var human=$('mbAmount').value;
    var base;
    try{ base=W.toBaseUnits(human, info.token.decimals); }catch(e){ msg(String(e.message||e)); return; }
    W.connect().then(function(from){
      msg('1/3 approving…');
      return W.approve(from, info.token.address, info.escrowAddress, base).then(W.waitTx).then(function(){
        msg('2/3 funding the machine pool…');
        return W.fundPool(from, info.escrowAddress, info.poolId, info.token.address, base);
      }).then(function(txHash){
        return W.waitTx(txHash).then(function(){
          msg('3/3 crediting…');
          return W.apiFetch(API,'/api/slot-machines/'+SLUG+'/session/deposit',{method:'POST',body:JSON.stringify({txHash:txHash})});
        });
      });
    }).then(function(r){
      msg('Deposited — +'+r.credited+' credits');
      CabinetEngine.setBalance(r.balance);
    }).catch(function(e){ msg('Deposit failed: '+(e&&e.message||e)); refreshBalance(); });
  });

  $('mbCashout').addEventListener('click',function(){
    msg('Cashing out…');
    W.apiFetch(API,'/api/slot-machines/'+SLUG+'/session/cashout',{method:'POST',body:JSON.stringify({})})
      .then(function(r){
        msg('Cashed out '+r.cashedOut+' credits — tx '+(r.txHash?r.txHash.slice(0,12)+'…':'sent'));
        CabinetEngine.setBalance(r.balance);
      })
      .catch(function(e){ msg('Cashout failed: '+(e&&e.message||e)); refreshBalance(); });
  });
})();
</script>` : '';

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>MORBIUS Slot</title>
<link rel="stylesheet" href="/slots/cabinet.css"/>
<style>html,body{margin:0;padding:0;background:#0b0f16;}</style>
</head>
<body>
${moneyBar}
<main class="cab-scope">
<div id="gameHost"></div>
</main>
<script src="/slots/cabinet-math.js"></script>
<script src="/slots/cabinet-fx.js"></script>
<script src="/slots/cabinet-themes.js"></script>
<script src="/slots/cabinet-engine.js"></script>
${realPlay ? '<script src="/slots/cabinet-wallet.js"></script>' : ''}
<script>
function bootCabinet(){
${bootCall}
}
${realPlay ? '/* real mode: the money bar boots the cabinet after sign-in */' : 'bootCabinet();'}
</script>
${moneyBarScript}
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // No X-Frame-Options here on purpose — see file header. frame-ancestors
      // is the modern mechanism and this route needs it wide open.
      'Content-Security-Policy': "frame-ancestors *",
      'Cache-Control': 'public, max-age=60',
    },
  });
}
